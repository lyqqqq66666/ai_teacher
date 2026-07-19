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
    if (!MF || !demo?.questions) return [];
    return demo.questions.map((q) =>
      MF.createDualArchiveQuestion({
        ...q,
        stemLatex: q.stemLatex,
        answerLatex: q.answerLatex,
        options: q.options,
        steps: q.steps,
        pageId: q.pageId,
        pagePath: q.pagePath,
        bbox: q.bbox,
        answerPageId: q.answerPageId,
        answerNo: q.no,
        matchScore: q.conf ?? 0.85,
        matchSource: q.matchSource || "keybook",
        confirmed: false,
      })
    );
  }

  /**
   * 从题库字段兼容旧 bankOf 结构
   */
  function toLegacyBank(dualList) {
    return (dualList || []).map((q) => ({
      id: q.qid,
      no: q.no,
      type: q.type,
      maxScore: q.maxScore,
      knowledge: q.knowledge || [],
      stem: q.standard?.stemLatex || "",
      answer: q.standard?.answerLatex || "",
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
   * 页内框选叠层 HTML（相对容器定位）
   */
  function renderPageWithBBoxes(page, questions, activeQid) {
    const qs = (questions || []).filter((q) => (q.archive?.pageId || q.pageId) === page.id);
    const boxes = qs
      .map((q) => {
        const b = q.archive?.bbox || q.bbox;
        if (!b) return "";
        const active = (q.qid || q.id) === activeQid ? "active" : "";
        const low = (q.conf ?? 1) < 0.8 ? "low" : "";
        return `<button type="button" class="bbox-hit ${active} ${low}" data-qid="${q.qid || q.id}"
          style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;"
          title="第 ${q.no} 题"></button>`;
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

  global.MathPipeline = {
    ROLE_LABEL,
    buildDualQuestions,
    toLegacyBank,
    alignQuestionsToAnswers,
    runHsMathDemo,
    renderPageWithBBoxes,
    inferRole,
  };
})(window);
