/**
 * 希沃智教π · 混拍照片自动整理
 * ------------------------------------------------------------
 * 目标：老师一次导入「题目 + 答案册 + 学生作业」混在一起的照片，
 * 自动整理出一次批改任务模板（题目页 / 答案页 / 学生作业页），
 * 无需手工分栏上传。
 *
 * 流水线（可解释、可纠错）：
 *  1) 时间切会话  —— 拍摄间隔 ≥ sessionGapSec 视为换了一批
 *  2) 页角色分类  —— blank | answer_key | student_work
 *  3) 课文/题指纹 —— 单元、课时、篇目关键词
 *  4) 题目↔答案对齐 —— 指纹 Jaccard + 单元加权
 *  5) 生成任务模板 —— 供向导确认（低置信可人工改角色）
 */
(function (global) {
  const LESSON_LEXICON = [
    { id: "u1_l1", key: "中国人民站起来了", name: "第一单元 · 中国人民站起来了", unit: "第一单元" },
    { id: "u1_l2", key: "大战中的插曲", name: "第一单元 · 大战中的插曲", unit: "第一单元" },
    { id: "u1_l3", key: "长征胜利万岁", name: "第一单元 · 长征胜利万岁", unit: "第一单元" },
    { id: "u1_l4", key: "红岩", name: "第一单元 · 红岩（节选）", unit: "第一单元" },
    { id: "u2_l1", key: "论语", name: "第二单元 · 《论语》十二章", unit: "第二单元" },
    { id: "u2_l2", key: "大学之道", name: "第二单元 · 大学之道", unit: "第二单元" },
    { id: "u2_l3", key: "人皆有不忍人之心", name: "第二单元 · 人皆有不忍人之心", unit: "第二单元" },
    { id: "u2_l4", key: "述而不作", name: "第二单元 · 述而不作（拓展）", unit: "第二单元" },
    { id: "u2_l5", key: "五石之瓠", name: "第二单元 · 五石之瓠", unit: "第二单元" },
    { id: "u2_l6", key: "左光斗", name: "第二单元 · 左光斗", unit: "第二单元" },
  ];

  const ANSWER_KEYS = [
    "参考答案",
    "标准答案",
    "答案与解析",
    "答案解析",
    "【答案】",
    "【解析】",
    "参考译文",
    "点拨",
  ];
  const BLANK_KEYS = [
    "学习目标",
    "课前篇",
    "晨读篇",
    "知识整合",
    "单元人文主题",
    "作者简介",
    "作品背景",
    "主题阅读",
  ];
  const WORK_KEYS = ["研读任务", "阅读训练", "素养篇", "课外篇", "多维探究"];
  const FLAG_KEYS = [
    ...ANSWER_KEYS,
    ...BLANK_KEYS,
    ...WORK_KEYS,
    "第一单元",
    "第二单元",
    "第三单元",
    "第1课时",
    "第2课时",
    "第3课时",
    "下列",
    "正确的一项",
    "不正确",
    "A.",
    "B.",
    "C.",
    "D.",
    "作文",
  ];

  function uid(prefix = "pg") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function countMatches(text, keys) {
    let n = 0;
    for (const k of keys) if (text.includes(k)) n += 1;
    return n;
  }

  function countOccurrences(text, word) {
    if (!word) return 0;
    let c = 0;
    let i = 0;
    while ((i = text.indexOf(word, i)) !== -1) {
      c += 1;
      i += word.length;
    }
    return c;
  }

  function extractFlags(text) {
    return FLAG_KEYS.filter((k) => text.includes(k));
  }

  function extractUnit(text) {
    const m = text.match(/第[一二三四五六七八九十\d]+单元/);
    return m ? m[0] : "";
  }

  function extractLessons(text) {
    return LESSON_LEXICON.filter((l) => text.includes(l.key)).map((l) => ({
      id: l.id,
      key: l.key,
      name: l.name,
      unit: l.unit,
    }));
  }

  function questionNumHints(text) {
    const m = text.match(/[（(]?\d{1,2}[）).、．]/g);
    return m ? m.length : 0;
  }

  function fingerprintOf(page) {
    const ids = (page.lessons || []).map((l) => l.id);
    if (ids.length) return [...new Set(ids)];
    if (page.unit) return [page.unit];
    return [page.id];
  }

  function jaccard(a, b) {
    const A = new Set(a || []);
    const B = new Set(b || []);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((x) => {
      if (B.has(x)) inter += 1;
    });
    return inter / (A.size + B.size - inter);
  }

  /**
   * 对单页 OCR 文本做特征抽取 + 角色打分
   * @param {{id?, name?, text?, capturedAt?, src?, lastModified?}} page
   */
  function analyzePage(page) {
    const text = String(page.text || "");
    const flags = extractFlags(text);
    const unit = extractUnit(text);
    const lessons = extractLessons(text);
    const qnum = questionNumHints(text);
    const dianbo = countOccurrences(text, "点拨");

    let ansScore = 0;
    for (const k of ANSWER_KEYS) {
      if (k === "点拨") continue;
      if (text.includes(k)) ansScore += 3;
    }
    if (dianbo >= 1) ansScore += 2;
    if (dianbo >= 3) ansScore += 4;
    if (text.includes("答案与解析") || text.includes("参考答案")) ansScore += 2;

    const blankHits = countMatches(text, BLANK_KEYS);
    const workHits = countMatches(text, WORK_KEYS);

    let role = "question_blank";
    let conf = 0.55;

    if (ansScore >= 6) {
      role = "answer_key";
      conf = Math.min(0.98, 0.7 + ansScore / 40);
    } else if (blankHits >= 2 && workHits === 0) {
      role = "question_blank";
      conf = 0.82;
    } else if (workHits >= 1 && blankHits <= 1) {
      // 研读/训练页更可能是学生作答区（可含手写）
      role = "student_work";
      conf = 0.68;
    } else if (blankHits >= 1) {
      role = "question_blank";
      conf = 0.72;
    } else if (qnum >= 6 && text.length < 1600) {
      role = "student_work";
      conf = 0.6;
    }

    const out = {
      id: page.id || uid("pg"),
      name: page.name || page.id || "page",
      src: page.src || page.path || "",
      path: page.path || page.src || "",
      text,
      capturedAt: page.capturedAt || null,
      lastModified: page.lastModified || null,
      flags,
      unit,
      lessons,
      qnum,
      chars: text.length,
      ansScore,
      blankHits,
      workHits,
      role,
      roleConf: Number(conf.toFixed(2)),
      fingerprint: [],
      session: 1,
      gapPrev: 0,
    };
    out.fingerprint = fingerprintOf(out);
    return out;
  }

  /**
   * 按拍摄时间切会话（大间隔 = 老师换了一批材料，例如做完学生卷再拍答案册）
   */
  function segmentSessions(pages, sessionGapSec = 45) {
    const sorted = [...pages].sort((a, b) => {
      const ta = Date.parse(a.capturedAt || a.lastModified || 0) || 0;
      const tb = Date.parse(b.capturedAt || b.lastModified || 0) || 0;
      if (ta !== tb) return ta - tb;
      return String(a.name).localeCompare(String(b.name));
    });
    let session = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        sorted[i].gapPrev = 0;
        sorted[i].session = 1;
        continue;
      }
      const ta = Date.parse(sorted[i - 1].capturedAt || sorted[i - 1].lastModified || 0) || 0;
      const tb = Date.parse(sorted[i].capturedAt || sorted[i].lastModified || 0) || 0;
      const gap = ta && tb ? (tb - ta) / 1000 : 0;
      sorted[i].gapPrev = gap;
      if (gap >= sessionGapSec) session += 1;
      sorted[i].session = session;
    }
    return sorted;
  }

  /**
   * 会话级角色修正：若某会话内多数页高 ansScore，整段标为答案册
   */
  function refineRolesBySession(pages) {
    const by = {};
    pages.forEach((p) => {
      (by[p.session] ||= []).push(p);
    });
    Object.values(by).forEach((group) => {
      const ansLike = group.filter((p) => p.ansScore >= 4 || p.role === "answer_key");
      const ratio = ansLike.length / group.length;
      // 答案册通常整段连拍：会话内过半像答案 → 整段归为答案册
      if (ratio >= 0.5 && group.length >= 3) {
        group.forEach((p) => {
          p.role = "answer_key";
          p.roleConf = Math.max(p.roleConf, p.ansScore >= 4 ? 0.95 : 0.86);
          p.roleReason = (p.roleReason || "") + "session_answer_majority;";
        });
      }
    });
    return pages;
  }

  /**
   * 将答案页对齐到最相近的题目/课文页
   */
  function pairAnswersToQuestions(pages) {
    const questions = pages.filter((p) => p.role !== "answer_key");
    const answers = pages.filter((p) => p.role === "answer_key");
    return answers.map((ap) => {
      let best = null;
      let bestScore = 0;
      for (const qp of questions) {
        let s = jaccard(ap.fingerprint, qp.fingerprint);
        if (ap.unit && ap.unit === qp.unit) s += 0.15;
        // 同会话降权：答案册通常另一次连拍
        if (ap.session === qp.session) s -= 0.05;
        if (s > bestScore) {
          bestScore = s;
          best = qp;
        }
      }
      return {
        answerPageId: ap.id,
        questionPageId: best?.id || null,
        score: Number(bestScore.toFixed(3)),
        answerLessons: (ap.lessons || []).map((l) => l.name),
        questionLessons: (best?.lessons || []).map((l) => l.name),
      };
    });
  }

  function pickTemplatePages(pages, { maxBlank = 8, maxAnswer = 14, maxWork = 8 } = {}) {
    const blank = pages.filter((p) => p.role === "question_blank");
    const work = pages.filter((p) => p.role === "student_work");
    const answers = pages.filter((p) => p.role === "answer_key");

    // 优先：带学习目标 / 课前结构的空白页，覆盖不同课文
    const blankSorted = [...blank].sort((a, b) => {
      const sa = a.blankHits * 2 + (a.lessons?.length || 0);
      const sb = b.blankHits * 2 + (b.lessons?.length || 0);
      return sb - sa;
    });
    const seenFp = new Set();
    const blankPick = [];
    for (const p of blankSorted) {
      const fp = (p.fingerprint || []).join("|") || p.id;
      if (seenFp.has(fp) && blankPick.length >= Math.min(4, maxBlank)) continue;
      seenFp.add(fp);
      blankPick.push(p);
      if (blankPick.length >= maxBlank) break;
    }
    for (const p of blankSorted) {
      if (blankPick.length >= maxBlank) break;
      if (!blankPick.includes(p)) blankPick.push(p);
    }

    return {
      blankPages: blankPick.slice(0, maxBlank),
      answerPages: answers.slice(0, maxAnswer),
      workPages: (work.length ? work : blank.slice(2)).slice(0, maxWork),
    };
  }

  /**
   * 主入口
   * @param {Array} rawPages - {id,name,text,capturedAt,src,path,lastModified}
   * @param {object} opts
   */
  function matchMixedBatch(rawPages, opts = {}) {
    const sessionGapSec = opts.sessionGapSec ?? 45;
    let pages = (rawPages || []).map(analyzePage);
    pages = segmentSessions(pages, sessionGapSec);
    pages = refineRolesBySession(pages);
    // 重新指纹（角色修正后 lessons 不变）
    pages.forEach((p) => {
      p.fingerprint = fingerprintOf(p);
    });

    const pairs = pairAnswersToQuestions(pages);
    const picked = pickTemplatePages(pages, opts);
    const summary = {
      total: pages.length,
      question_blank: pages.filter((p) => p.role === "question_blank").length,
      student_work: pages.filter((p) => p.role === "student_work").length,
      answer_key: pages.filter((p) => p.role === "answer_key").length,
      sessions: pages.reduce((m, p) => Math.max(m, p.session || 1), 1),
      lowConfidence: pages.filter((p) => (p.roleConf || 0) < 0.7).length,
    };

    const titleLessons = [
      ...new Set(
        pages
          .flatMap((p) => p.lessons || [])
          .map((l) => l.name)
          .filter(Boolean)
      ),
    ].slice(0, 3);

    return {
      pages,
      pairs,
      summary,
      taskTemplate: {
        title:
          titleLessons.length > 0
            ? `高中语文 · ${titleLessons[0].replace(/^.*?·\s*/, "")}等批改`
            : "混拍自动整理 · 批改任务",
        mode: picked.answerPages.length ? "with_answer" : "no_answer",
        blankPages: picked.blankPages,
        answerPages: picked.answerPages,
        workPages: picked.workPages,
        notes:
          "由混拍照片自动整理：时间切会话 → 版式/关键词分角色 → 课文指纹对齐题目与答案。低置信页请点选修正。",
      },
    };
  }

  /**
   * 演示：用预标注 OCR 文本跑通同一算法（无需浏览器实时 OCR）
   */
  function matchFromDemoCorpus(corpus) {
    const pages = (corpus.pages || []).map((p) => ({
      id: p.id,
      name: p.file || p.id,
      text: p.text || p.ocrText || "",
      capturedAt: p.capturedAt,
      path: p.path,
      src: p.path,
      // 若 corpus 已有人工/预计算角色，仍重跑算法；可选 seed
      _seedRole: p.role,
      _seedFlags: p.flags,
    }));
    // 若没有全文，用 flags + lessons 拼伪 OCR，保证 demo 可跑
    pages.forEach((p, i) => {
      if (p.text && p.text.length > 40) return;
      const seed = corpus.pages[i] || {};
      const bits = [];
      (seed.flags || []).forEach((f) => bits.push(f));
      (seed.lessons || []).forEach((l) => bits.push(l.key || l.name || ""));
      if (seed.unit) bits.push(seed.unit);
      if (seed.role === "answer_key") bits.push("参考答案", "点拨", "点拨", "点拨", "答案与解析");
      if (seed.role === "student_work") bits.push("研读任务", "1.", "2.", "3.");
      if (seed.role === "question_blank") bits.push("学习目标", "课前篇", "晨读篇");
      p.text = bits.filter(Boolean).join("\n");
    });
    const result = matchMixedBatch(pages, { sessionGapSec: corpus.sessionGapSec || 45 });
    // 对齐 path
    result.pages.forEach((p) => {
      const src = (corpus.pages || []).find((x) => x.id === p.id);
      if (src?.path) {
        p.path = src.path;
        p.src = src.path;
      }
    });
    result.taskTemplate.blankPages = result.taskTemplate.blankPages.map(enrichPath);
    result.taskTemplate.answerPages = result.taskTemplate.answerPages.map(enrichPath);
    result.taskTemplate.workPages = result.taskTemplate.workPages.map(enrichPath);
    function enrichPath(pg) {
      return {
        ...pg,
        path: pg.path || pg.src,
        src: pg.src || pg.path,
      };
    }
    result.corpusMeta = {
      subject: corpus.subject,
      name: corpus.name,
      source: corpus.source,
    };
    return result;
  }

  /** 老师手动改角色后，重新生成模板 */
  function rebuildTemplateFromPages(pages, opts) {
    const cloned = pages.map((p) => ({ ...p, fingerprint: fingerprintOf(p) }));
    const pairs = pairAnswersToQuestions(cloned);
    const picked = pickTemplatePages(cloned, opts);
    return {
      pages: cloned,
      pairs,
      summary: {
        total: cloned.length,
        question_blank: cloned.filter((p) => p.role === "question_blank").length,
        student_work: cloned.filter((p) => p.role === "student_work").length,
        answer_key: cloned.filter((p) => p.role === "answer_key").length,
        sessions: cloned.reduce((m, p) => Math.max(m, p.session || 1), 1),
        lowConfidence: cloned.filter((p) => (p.roleConf || 0) < 0.7).length,
      },
      taskTemplate: {
        title: "混拍整理 · 批改任务",
        mode: picked.answerPages.length ? "with_answer" : "no_answer",
        blankPages: picked.blankPages,
        answerPages: picked.answerPages,
        workPages: picked.workPages,
        notes: "已根据老师修正的角色重新生成模板。",
      },
    };
  }

  const roleLabel = {
    question_blank: "题目/空白页",
    student_work: "学生作业",
    answer_key: "答案册",
  };

  global.PageMatcher = {
    LESSON_LEXICON,
    analyzePage,
    segmentSessions,
    matchMixedBatch,
    matchFromDemoCorpus,
    rebuildTemplateFromPages,
    roleLabel,
    jaccard,
  };
})(window);
