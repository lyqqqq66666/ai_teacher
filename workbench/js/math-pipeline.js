/**
 * 高中数学 · 四能力演示管线
 * ------------------------------------------------------------
 * 1. 题目识别框选（预标注 bbox + 页内叠框）
 * 2. 题目标准字符化（双存档：LaTeX + 原图）
 * 3. 智能题目答案制作（答案册对齐 / AI 起草）
 * 4. 乱序照片题答对应（页角色 + 卷指纹 + 题号）
 */
(function (global) {
  const ROLE_LABEL = {
    lecture: "讲义/听课",
    exam: "检测卷/题目",
    answer_key: "答案册",
    unknown: "未识别",
  };

  /**
   * 将 DEMO 预标注题转为双存档结构
   */
  function buildDualQuestions(demo) {
    const MF = global.MathFormat;
    const QS = global.QuestionSplit;
    if (!MF || !demo?.questions) return [];
    const duals = demo.questions.map((q) =>
      MF.createDualArchiveQuestion({
        ...q,
        stemLatex: q.stemLatex,
        answerLatex: q.answerLatex,
        options: q.options,
        steps: q.steps,
        pageId: q.pageId,
        pagePath: q.pagePath,
        bbox: q.bbox,
        quad: q.quad,
        regions: q.regions,
        layout: q.layout,
        answerPageId: q.answerPageId,
        answerNo: q.no,
        matchScore: q.conf ?? 0.85,
        matchSource: q.matchSource || "keybook",
        confirmed: false,
      })
    );
    // 按页归一化几何：整页横条自动改双栏槽位；多 region 保留
    if (QS) {
      const byPage = {};
      duals.forEach((q) => {
        const pid = q.archive?.pageId || q.pageId || "_";
        (byPage[pid] || (byPage[pid] = [])).push(q);
      });
      Object.values(byPage).forEach((pageQs) => {
        const hints = {
          twoColumn:
            pageQs.length >= 8 ||
            pageQs.some((q) => q.archive?.layout === "two_col"),
        };
        QS.normalizePageQuestions(pageQs, hints).forEach(({ q, geo }) => {
          if (!geo?.bbox && !geo?.quad) return;
          if (geo.bbox) q.archive.bbox = geo.bbox;
          if (geo.quad) q.archive.quad = geo.quad;
          q.archive.regions = geo.regions;
          q.archive.layout = geo.layout;
          q.archive.splitSource = geo.source;
        });
      });
    }
    return duals;
  }

  /**
   * 从题库字段兼容旧 bankOf 结构
   */
  function toLegacyBank(dualList) {
    return (dualList || []).map((q) => ({
      id: q.qid,
      qid: q.qid,
      no: q.no,
      type: q.type,
      maxScore: q.maxScore,
      knowledge: q.knowledge || [],
      stem: q.standard?.stemLatex || "",
      stemLatex: q.standard?.stemLatex || "",
      answer: q.standard?.answerLatex || "",
      answerLatex: q.standard?.answerLatex || "",
      options: q.standard?.options || [],
      pagePath: q.archive?.pagePath || q.pagePath || "",
      pageId: q.archive?.pageId || q.pageId || "",
      bbox: q.archive?.bbox || q.bbox || null,
      quad: q.archive?.quad || q.quad || null,
      regions: q.archive?.regions || q.regions || null,
      layout: q.archive?.layout || q.layout || "",
      rubric: (q.standard?.steps || []).map((s) => ({
        step: s.text || s.step || "",
        score: s.score ?? 0,
      })),
      dual: q,
    }));
  }

  /**
   * Demo 级「乱序」：打乱页序后按角色/指纹重排
   */
  function shuffleInPlace(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 页角色推断（Demo：优先用标注真值；否则关键词）
   */
  function inferRole(page) {
    if (page.role) return { role: page.role, conf: page.role === "unknown" ? 0.4 : 0.95 };
    const text = `${page.title || ""} ${(page.fingerprint || []).join(" ")}`;
    if (/答案|1\.[A-D]|所以/.test(text)) return { role: "answer_key", conf: 0.8 };
    if (/检测|试卷|选择题|解答题/.test(text)) return { role: "exam", conf: 0.85 };
    if (/课时|线面|距离|讲义/.test(text)) return { role: "lecture", conf: 0.75 };
    return { role: "unknown", conf: 0.3 };
  }

  /**
   * 题号对齐：检测卷题 → 答案册同 paperId + 同 no
   */
  function alignQuestionsToAnswers(questions, answerIndex) {
    const index = answerIndex || [];
    return (questions || []).map((q) => {
      const paperId = q.paperId || q.match?.paperId;
      const hit = index.find(
        (a) =>
          String(a.no) === String(q.no) &&
          (!paperId || !a.paperId || a.paperId === paperId)
      );
      const next = { ...q };
      if (!next.match) next.match = {};
      if (hit) {
        next.match.answerPageId = hit.answerPageId;
        next.match.answerNo = hit.no;
        next.match.score = 0.92;
        next.match.source = "keybook";
        if (hit.key && next.standard && !next.standard.answerLatex) {
          next.standard.answerLatex = `$\\text{${hit.key}}$`;
        }
      } else if (next.match.source !== "ai") {
        next.match.source = next.match.source || "ai";
        next.match.score = next.match.score ?? 0.55;
      }
      return next;
    });
  }

  /**
   * 运行高中数学完整演示管线
   * @returns {{ pages, questions, dualQuestions, legacyBank, summary, matchTable }}
   */
  function runHsMathDemo(options = {}) {
    const demo = global.HS_MATH_DEMO;
    if (!demo) {
      return { error: "HS_MATH_DEMO 未加载" };
    }

    // 1) 页级：模拟乱序导入后重新分类
    let pages = (demo.pages || []).map((p) => {
      const inf = inferRole(p);
      return {
        ...p,
        role: inf.role,
        roleConf: inf.conf,
        roleLabel: ROLE_LABEL[inf.role] || inf.role,
      };
    });
    if (options.shuffle !== false) {
      pages = shuffleInPlace(pages);
    }

    // 按角色归组（演示「乱序→整理」）
    const byRole = { lecture: [], exam: [], answer_key: [], unknown: [] };
    pages.forEach((p) => {
      (byRole[p.role] || byRole.unknown).push(p);
    });

    // 2) 框选 + 字符化
    let dualQuestions = buildDualQuestions(demo);

    // 3) 智能制答：答案册对齐；无命中保持 AI 稿
    dualQuestions = alignQuestionsToAnswers(dualQuestions, demo.answerIndex);

    // 模式 B：强制走 AI 制答标记
    if (options.mode === "no_answer") {
      dualQuestions = dualQuestions.map((q) => ({
        ...q,
        match: {
          ...q.match,
          source: "ai",
          answerPageId: null,
          score: 0.6,
        },
      }));
    }

    // 4) 对齐表
    const matchTable = dualQuestions.map((q) => ({
      qid: q.qid,
      no: q.no,
      pageId: q.archive?.pageId,
      answerPageId: q.match?.answerPageId,
      source: q.match?.source,
      score: q.match?.score,
      stemPreview: (q.standard?.stemLatex || "").slice(0, 40),
    }));

    const summary = {
      totalPages: pages.length,
      lecture: byRole.lecture.length,
      exam: byRole.exam.length,
      answer_key: byRole.answer_key.length,
      questions: dualQuestions.length,
      keybookMatched: dualQuestions.filter((q) => q.match?.source === "keybook").length,
      aiDrafted: dualQuestions.filter((q) => q.match?.source === "ai").length,
      lowConf: dualQuestions.filter((q) => (q.conf ?? 1) < 0.8).length,
    };

    return {
      demo,
      pages,
      byRole,
      dualQuestions,
      legacyBank: toLegacyBank(dualQuestions),
      matchTable,
      summary,
      // 任务模板路径
      blankPaths: byRole.exam.map((p) => p.path).concat(byRole.lecture.map((p) => p.path)),
      answerPaths: byRole.answer_key.map((p) => p.path),
    };
  }

  /**
   * 相对 0~1 的题目框扩边（偏完整：题号/选项不易被切）
   */
  function expandBBox(bbox, opts = {}) {
    const QS = global.QuestionSplit;
    if (QS?.expandBox) return QS.expandBox(bbox, opts);
    if (!bbox || typeof bbox.x !== "number") return null;
    const w0 = Number(bbox.w);
    const h0 = Number(bbox.h);
    if (!(w0 > 0) || !(h0 > 0)) return null;
    const padX = opts.padX ?? 0.03;
    const padY = opts.padY ?? 0.03;
    const minW = opts.minW ?? 0;
    const minH = opts.minH ?? 0;
    const cx = bbox.x + w0 / 2;
    const cy = bbox.y + h0 / 2;
    let w = Math.min(1, w0 + padX * 2);
    let h = Math.min(1, h0 + padY * 2);
    if (minW > 0) w = Math.max(w, Math.min(1, minW));
    if (minH > 0) h = Math.max(h, Math.min(1, minH));
    let x = Math.max(0, Math.min(1 - w, cx - w / 2));
    let y = Math.max(0, Math.min(1 - h, cy - h / 2));
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    return { x, y, w, h };
  }

  /** 四边形叠层按钮：AABB 定位 + clip-path 成四边形 */
  function renderQuadHit(q, activeQid, geo) {
    const b = geo?.bbox || q.archive?.bbox || q.bbox;
    if (!b) return "";
    const active = (q.qid || q.id) === activeQid ? "active" : "";
    const low = (q.conf ?? 1) < 0.8 ? "low" : "";
    const quad = geo?.quad || q.archive?.quad || q.quad;
    let clip = "";
    if (quad && global.QuestionSplit?.normalizeQuadPoints) {
      const pts = global.QuestionSplit.normalizeQuadPoints(quad);
      if (pts && b.w > 0 && b.h > 0) {
        const poly = pts
          .map(([x, y]) => {
            const px = ((x - b.x) / b.w) * 100;
            const py = ((y - b.y) / b.h) * 100;
            return `${px.toFixed(1)}% ${py.toFixed(1)}%`;
          })
          .join(", ");
        clip = `clip-path:polygon(${poly});`;
      }
    }
    return `<button type="button" class="bbox-hit bbox-hit-quad ${active} ${low}" data-qid="${
      q.qid || q.id
    }"
      style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;${clip}"
      title="第 ${q.no} 题"></button>`;
  }

  /**
   * 页内框选叠层 HTML（支持四边形）
   */
  function renderPageWithBBoxes(page, questions, activeQid) {
    const QS = global.QuestionSplit;
    const qs = (questions || []).filter((q) => (q.archive?.pageId || q.pageId) === page.id);
    const boxes = qs
      .map((q) => {
        const geo = QS
          ? QS.normalizeQuestionGeometry(q, qs, { twoColumn: qs.length >= 6 })
          : { bbox: q.archive?.bbox || q.bbox, quad: q.archive?.quad || q.quad };
        return renderQuadHit(q, activeQid, geo);
      })
      .join("");
    return `
      <div class="bbox-page" data-page="${page.id}">
        <img src="${page.path}" alt="${page.id}" loading="lazy" />
        <div class="bbox-layer">${boxes}</div>
        <div class="bbox-page-cap">
          <strong>${page.id}</strong>
          <span class="tag">${page.roleLabel || ROLE_LABEL[page.role] || page.role}</span>
          <span class="small muted">${page.title || ""}</span>
        </div>
      </div>`;
  }

  /**
   * 当前题「按 bbox 裁切」预览 + 同页上下文（高亮本题）
   * 同页多题时只放大本题区域，不再堆整卷多页。
   */
  function renderActiveQuestionCrop(activeQ, pages, questions) {
    if (!activeQ) {
      return `<div class="empty-hint">请选择左侧题目</div>`;
    }
    const QS = global.QuestionSplit;
    const pageId = activeQ.archive?.pageId || activeQ.pageId || "";
    const pagePath = activeQ.archive?.pagePath || activeQ.pagePath || "";
    const page =
      (pages || []).find((p) => p.id === pageId) ||
      (pages || []).find((p) => p.path === pagePath) ||
      null;
    const src = page?.path || pagePath;
    if (!src) {
      return `<div class="empty-hint">第 ${activeQ.no} 题无原图路径</div>`;
    }
    const siblings = (questions || []).filter(
      (q) => (q.archive?.pageId || q.pageId) === pageId
    );
    // 归一化：纠正整页横条 / 展开多 region
    const geo = QS
      ? QS.normalizeQuestionGeometry(activeQ, siblings, {
          twoColumn:
            siblings.length >= 8 ||
            activeQ.archive?.layout === "two_col" ||
            siblings.some((q) => q.archive?.layout === "two_col"),
        })
      : {
          bbox: activeQ.archive?.bbox || activeQ.bbox,
          regions: activeQ.archive?.regions || [],
          layout: activeQ.archive?.layout || "",
        };
    const rawB = geo.bbox;
    // 完整度：预览 CSS 裁切也偏松
    const region = expandBBox(rawB, {
      padX: 0.03,
      padY: 0.03,
      minW: 0,
      minH: 0,
    });
    const multi = (geo.regions || []).length > 1;
    const hasQuad = !!(geo.quad || geo.regions?.[0]?.quad);
    const sibHits = siblings
      .map((q) => {
        const g = QS
          ? QS.normalizeQuestionGeometry(q, siblings, {
              twoColumn: siblings.length >= 6,
            })
          : { bbox: q.archive?.bbox || q.bbox, quad: q.archive?.quad || q.quad };
        return renderQuadHit(q, activeQ.qid, g);
      })
      .join("");

    const layoutTag =
      geo.layout === "two_col"
        ? "双栏"
        : geo.layout === "multi_region"
          ? "多区拼接"
          : geo.layout === "single_col"
            ? "单栏"
            : "框选";
    const shapeTag = hasQuad ? "四边形" : "矩形";

    const cropBlock = region
      ? (() => {
          const aspect = Math.max(0.14, Math.min(1.8, region.h / Math.max(0.05, region.w)));
          const zoomW = 100 / region.w;
          const zoomH = 100 / region.h;
          return `
          <div class="q-crop-card">
            <div class="q-crop-label">本题区域（${layoutTag} · ${shapeTag}${
              multi ? ` · ${geo.regions.length} 块拼接` : " · 完整裁切"
            }）</div>
            <div class="q-crop-viewport" style="--aspect:${aspect};">
              <img class="q-crop-img" src="${src}" alt="第 ${activeQ.no} 题"
                data-crop-src="${src}"
                data-crop-qid="${activeQ.qid || ""}"
                style="width:${zoomW}%;height:${zoomH}%;left:${(-region.x / region.w) * 100}%;top:${
                  (-region.y / region.h) * 100
                }%;" />
            </div>
            <div class="q-crop-meta small muted">
              第 ${activeQ.no} 题 · ${pageId || "—"} · ${layoutTag}/${shapeTag}
              ${
                rawB
                  ? ` · 约 ${(rawB.w * 100).toFixed(0)}%×${(rawB.h * 100).toFixed(0)}%（含完整度扩边）`
                  : ""
              }
              ${multi ? " · 跨区同一题将竖向拼接各块" : ""}
            </div>
          </div>`;
        })()
      : `<div class="empty-hint">第 ${activeQ.no} 题暂无框选几何，无法裁切</div>`;

    return `
      <div class="q-crop-stage" data-active-qid="${activeQ.qid || ""}">
        ${cropBlock}
        <div class="q-crop-context">
          <div class="q-crop-label">同页上下文 · 点击其它框可切换（双栏不跨栏切）</div>
          <div class="bbox-page bbox-page-context" data-page="${pageId}">
            <img src="${src}" alt="${pageId}" loading="lazy" />
            <div class="bbox-layer">${sibHits}</div>
            <div class="bbox-page-cap">
              <strong>${pageId || "page"}</strong>
              <span class="tag">${page?.roleLabel || ROLE_LABEL[page?.role] || ""}</span>
              <span class="small muted">${page?.title || ""} · 共 ${siblings.length} 题 · ${layoutTag}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  global.MathPipeline = {
    ROLE_LABEL,
    buildDualQuestions,
    toLegacyBank,
    alignQuestionsToAnswers,
    runHsMathDemo,
    renderPageWithBBoxes,
    renderActiveQuestionCrop,
    expandBBox,
    inferRole,
  };
})(window);
