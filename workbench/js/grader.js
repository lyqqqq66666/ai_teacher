/**
 * 批改引擎（前端演示版）
 * - 根据学科题库 + 上传页数生成可展示的批改结果
 * - 模式 A：有标准答案 → 置信度偏高
 * - 模式 B：无答案册、AI 起草标准 → 更多待复核
 */
window.Grader = (() => {
  const STATUS = ["correct", "partial", "wrong"];

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function pick(arr, i) {
    return arr[i % arr.length];
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /** 默认学生池 */
  function defaultStudents() {
    return [
      { id: "s01", name: "陈思远", no: "01" },
      { id: "s02", name: "李雨桐", no: "08" },
      { id: "s03", name: "王浩然", no: "15" },
      { id: "s04", name: "张婉清", no: "22" },
      { id: "s05", name: "刘子轩", no: "29" },
      { id: "s06", name: "赵一诺", no: "33" },
    ];
  }

  /**
   * 将批量图片按「每生 pagesPerStudent 页」切分，并绑定学生
   */
  function assignPagesToStudents(images, students, pagesPerStudent = 2) {
    const list = images.slice();
    const groups = [];
    let i = 0;
    let si = 0;
    while (i < list.length) {
      const stu = students[si % students.length];
      const pages = list.slice(i, i + pagesPerStudent);
      if (!pages.length) break;
      groups.push({
        studentId: stu.id,
        name: stu.name,
        no: stu.no,
        pages,
      });
      i += pagesPerStudent;
      si += 1;
    }
    return groups;
  }

  /**
   * 题干框识别（演示）
   * ------------------------------------------------------------
   * 在作答原图上为每道题估计一个「题干区域」矩形（相对坐标 0~1）。
   * 规则示意：
   *  - 识别范围 ≈ 一整道题的题干带（题号锚点下方的正文区域）
   *  - 框落在题干竖直中段（略收边距，模拟检测器输出）
   *  - 多题按页内纵向堆叠；题多时自动分页
   * 若题库已有 dual.archive.bbox（高中数学预标注），优先使用。
   */
  function estimateStemBBoxes(questionBank, pageCount = 1) {
    const n = Math.max(1, questionBank.length);
    const pages = Math.max(1, pageCount);
    // 每页最多容纳的题干框数
    const perPage = Math.max(1, Math.ceil(n / pages));
    return questionBank.map((q, idx) => {
      // 预标注优先（数学双存档）
      const dualBox = q.dual?.archive?.bbox || q.bbox;
      if (dualBox && typeof dualBox.x === "number") {
        return {
          qid: q.id,
          no: q.no,
          pageIndex: 0,
          bbox: {
            x: dualBox.x,
            y: dualBox.y,
            w: dualBox.w,
            h: dualBox.h,
          },
          source: "prelabel",
          conf: q.dual?.conf ?? q.conf ?? 0.9,
        };
      }

      const pageIndex = Math.min(pages - 1, Math.floor(idx / perPage));
      const localIdx = idx % perPage;
      const slotH = 0.78 / perPage; // 页内可用高度（留页眉页脚）
      const top = 0.12 + localIdx * slotH;
      // 题干带：取该槽位中部偏上（题号后正文），再略收左右边距
      const stemPadX = 0.06 + (hashStr(String(q.id)) % 5) * 0.004;
      const stemPadY = slotH * 0.12;
      const h = Math.min(0.22, slotH * 0.72);
      const y = top + stemPadY;
      const w = 0.88 - stemPadX * 0.5;
      const x = stemPadX;
      return {
        qid: q.id,
        no: q.no,
        pageIndex,
        bbox: {
          x: Number(x.toFixed(4)),
          y: Number(y.toFixed(4)),
          w: Number(w.toFixed(4)),
          h: Number(h.toFixed(4)),
        },
        source: "stem_detect",
        conf: 0.82 + (hashStr(String(q.no)) % 12) / 100,
      };
    });
  }

  /**
   * 把题干框写入批改 item（幂等：已有 bbox 则跳过）
   */
  function attachStemBBoxes(items, questionBank, pageCount = 1) {
    const map = {};
    estimateStemBBoxes(questionBank, pageCount).forEach((b) => {
      map[b.qid] = b;
    });
    return (items || []).map((it) => {
      if (it.bbox && typeof it.bbox.x === "number") return it;
      const hit = map[it.qid];
      if (!hit) return it;
      return {
        ...it,
        bbox: hit.bbox,
        pageIndex: hit.pageIndex,
        stemDetect: {
          source: hit.source,
          conf: hit.conf,
          label: `题干 · 第 ${hit.no} 题`,
        },
        evidence: hit.source === "prelabel"
          ? `题 ${hit.no} 题干框（预标注）`
          : `题 ${hit.no} 题干框 · 页内识别`,
      };
    });
  }

  function gradeItem(q, seed, mode) {
    const h = hashStr(`${seed}:${q.id}`);
    const roll = h % 100;
    // 模式 B 略多 partial/wrong，强制更多复核
    const thresholds =
      mode === "no_answer"
        ? { correct: 40, partial: 75 }
        : { correct: 55, partial: 85 };

    let status;
    if (roll < thresholds.correct) status = "correct";
    else if (roll < thresholds.partial) status = "partial";
    else status = "wrong";

    let score;
    if (status === "correct") score = q.maxScore;
    else if (status === "partial") score = Math.max(1, Math.round(q.maxScore * (0.4 + (h % 40) / 100)));
    else score = Math.max(0, Math.round(q.maxScore * ((h % 30) / 100)));

    const confBase = mode === "no_answer" ? 0.72 : 0.86;
    const confidence = clamp(confBase + ((h % 20) - 10) / 100, 0.55, 0.98);

    const steps = (q.rubric || []).map((r, idx) => {
      if (status === "correct") return { text: r.step, ok: true, score: r.score };
      if (status === "wrong") {
        const ok = idx === 0 && score > 0;
        return {
          text: r.step,
          ok,
          score: ok ? Math.min(r.score, score) : 0,
          reason: ok ? undefined : "与参考标准不一致",
        };
      }
      // partial: 最后一步常错
      const ok = idx < (q.rubric.length - 1) || score >= q.maxScore * 0.8;
      return {
        text: r.step,
        ok,
        score: ok ? r.score : Math.max(0, Math.floor(r.score / 2)),
        reason: ok ? undefined : "部分步骤缺失或未最简/未答全",
      };
    });

    // 对齐总分
    const stepSum = steps.reduce((a, b) => a + (b.score || 0), 0);
    if (stepSum !== score && steps.length) {
      steps[steps.length - 1].score = clamp(
        steps[steps.length - 1].score + (score - stepSum),
        0,
        q.rubric[q.rubric.length - 1].score
      );
    }

    const errorPool = {
      correct: null,
      partial: pick(["约分遗漏", "过程不完整", "答句不规范", "关键词不全", "审题偏差"], h),
      wrong: pick(["通分错误", "题意理解偏差", "建模失败", "关键情节遗漏", "计算错误"], h + 3),
    };

    const ocrPool = {
      correct: "识别完整，与参考一致",
      partial: "主要内容可识别，存在局部模糊/漏写",
      wrong: "作答与参考差异较大，或关键步骤缺失",
    };

    const needReview =
      mode === "no_answer" ||
      confidence < 0.8 ||
      status !== "correct" ||
      q.type.includes("作") ||
      q.type.includes("简答") ||
      q.type.includes("仿写") ||
      q.type.includes("应用");

    return {
      qid: q.id,
      score,
      maxScore: q.maxScore,
      status,
      confidence: Number(confidence.toFixed(2)),
      ocr: ocrPool[status],
      evidence: `题 ${q.no} 作答区域`,
      steps,
      comment: buildComment(q, status, errorPool[status]),
      needReview: !!needReview && status !== "correct" ? true : confidence < 0.78,
      errorType: errorPool[status],
    };
  }

  function buildComment(q, status, err) {
    if (status === "correct") return `第 ${q.no} 题掌握扎实，过程清楚。`;
    if (status === "partial") return `第 ${q.no} 题部分得分：${err || "请补全关键步骤"}。`;
    return `第 ${q.no} 题需订正：${err || "请对照评分标准重做"}。`;
  }

  function summarizeStudent(items, name) {
    const total = items.reduce((a, b) => a + b.score, 0);
    const max = items.reduce((a, b) => a + b.maxScore, 0);
    const weaks = items
      .filter((i) => i.status !== "correct")
      .map((i) => i.errorType)
      .filter(Boolean);
    const unique = [...new Set(weaks)].slice(0, 3);
    const rate = max ? total / max : 0;
    let comment;
    if (rate >= 0.9) comment = `${name} 整体完成度高，可适当挑战拓展题。`;
    else if (rate >= 0.7) comment = `${name} 基础尚可，建议针对薄弱点做小步专练。`;
    else comment = `${name} 需优先关注，建议先回归题意理解与基础步骤。`;
    return { totalScore: total, maxScore: max, weakPoints: unique.length ? unique : ["细节审题"], comment };
  }

  /**
   * 生成整次任务批改结果
   * @param {object} task
   * @param {object[]} questionBank
   * @param {object[]} studentGroups - {studentId,name,no,pages:[{src,name}]}
   */
  function gradeTask(task, questionBank, studentGroups) {
    const submissions = {};
    studentGroups.forEach((g, idx) => {
      let items = questionBank.map((q) =>
        gradeItem(q, `${task.id}:${g.studentId}:${q.id}`, task.mode)
      );
      // 题干框：按该生作答页数分页堆叠
      items = attachStemBBoxes(items, questionBank, Math.max(1, g.pages?.length || 1));
      const sum = summarizeStudent(items, g.name);
      submissions[g.studentId] = {
        studentId: g.studentId,
        name: g.name,
        no: g.no,
        pages: g.pages.map((p) => p.src),
        pageMeta: g.pages,
        totalScore: sum.totalScore,
        maxScore: sum.maxScore,
        status: items.some((i) => i.needReview) ? "review" : "done",
        items,
        weakPoints: sum.weakPoints,
        comment: sum.comment,
      };
    });
    return submissions;
  }

  function buildAnalytics(task, submissions, questionBank) {
    const list = Object.values(submissions);
    if (!list.length) {
      return {
        avgScore: 0,
        avgRate: 0,
        focusStudents: [],
        hardQuestions: [],
        knowledge: [],
        commonErrors: [],
        teachingAdvice: ["暂无提交"],
        feishuSummary: "暂无数据",
      };
    }
    const avgScore = list.reduce((a, s) => a + s.totalScore, 0) / list.length;
    const avgRate = list.reduce((a, s) => a + s.totalScore / s.maxScore, 0) / list.length;

    const focusStudents = list
      .slice()
      .sort((a, b) => a.totalScore / a.maxScore - b.totalScore / b.maxScore)
      .slice(0, 3)
      .map((s) => ({
        id: s.studentId,
        name: s.name,
        score: s.totalScore,
        reason: (s.weakPoints || []).join(" / ") || "得分偏低",
      }));

    const hardQuestions = questionBank.map((q) => {
      let wrong = 0;
      list.forEach((s) => {
        const it = s.items.find((i) => i.qid === q.id);
        if (it && it.status !== "correct") wrong += 1;
      });
      const wrongRate = wrong / list.length;
      const sample = list
        .map((s) => s.items.find((i) => i.qid === q.id))
        .find((i) => i && i.errorType);
      return {
        qid: q.id,
        no: q.no,
        title: q.stem.slice(0, 24) + (q.stem.length > 24 ? "…" : ""),
        wrongRate,
        error: sample?.errorType || "过程不完整",
      };
    }).sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 3);

    const knMap = {};
    questionBank.forEach((q) => {
      (q.knowledge || []).forEach((k) => {
        if (!knMap[k]) knMap[k] = { name: k, ok: 0, all: 0 };
      });
    });
    list.forEach((s) => {
      s.items.forEach((it) => {
        const q = questionBank.find((x) => x.id === it.qid);
        (q?.knowledge || []).forEach((k) => {
          knMap[k].all += 1;
          if (it.status === "correct") knMap[k].ok += 1;
        });
      });
    });
    const knowledge = Object.values(knMap).map((k) => ({
      name: k.name,
      mastery: k.all ? k.ok / k.all : 0,
    }));

    const errCount = {};
    list.forEach((s) =>
      s.items.forEach((it) => {
        if (it.errorType) errCount[it.errorType] = (errCount[it.errorType] || 0) + 1;
      })
    );
    const commonErrors = Object.entries(errCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([e]) => e);

    const modeLabel = task.mode === "no_answer" ? "模式B·AI标准" : "模式A·答案册";
    const teachingAdvice = [
      hardQuestions[0]
        ? `讲评优先：第 ${hardQuestions[0].no} 题（失分率 ${Math.round(hardQuestions[0].wrongRate * 100)}%）`
        : "按序讲评失分题",
      commonErrors[0] ? `针对共性错因「${commonErrors[0]}」做 8 分钟专练` : "巩固基础步骤",
      task.mode === "no_answer"
        ? "本次标准由 AI 起草，讲评时同步校准评分口径"
        : "按答案册口径统一给分，抽查过程分边界项",
    ];

    const feishuSummary = `【${task.className || "班级"}·${task.subjectName}·${modeLabel}】均分 ${avgScore.toFixed(
      1
    )}（得分率 ${Math.round(avgRate * 100)}%）。提交 ${list.length} 人。需优先关注：${focusStudents
      .map((f) => f.name)
      .join("、")}。高频错因：${commonErrors.join("、") || "—"}。建议讲评：${hardQuestions
      .map((q) => `题${q.no}`)
      .join("、")}。`;

    return {
      avgScore: Number(avgScore.toFixed(1)),
      avgRate,
      focusStudents,
      hardQuestions,
      knowledge,
      commonErrors,
      teachingAdvice,
      feishuSummary,
    };
  }

  /**
   * 模式 B：根据题库生成「AI 参考答案」草稿
   */
  function generateAnswersFromQuestions(questionBank, subjectMeta) {
    const presets = subjectMeta?.noAnswerMode?.generatedAnswers || [];
    return questionBank.map((q) => {
      const hit = presets.find((p) => p.no === q.no);
      return {
        no: q.no,
        title: `${q.type}`,
        answer: hit?.answer || q.answer,
        process: hit?.process || (q.rubric || []).map((r) => r.step).join(" → "),
      };
    });
  }

  return {
    uid,
    defaultStudents,
    assignPagesToStudents,
    gradeTask,
    buildAnalytics,
    generateAnswersFromQuestions,
    estimateStemBBoxes,
    attachStemBBoxes,
  };
})();
