(() => {
  const D = window.DEMO_DATA;
  const G = window.Grader;
  const STORAGE_KEY = "seewo_pi_tasks_v1";
  const CLASS_KEY = "seewo_pi_classes_v1";

  /** 全量图片（含 base64）放内存，避免 localStorage 配额把确认按钮打挂 */
  const imageBlobStore = new Map(); // id -> src
  /** 会话内完整任务副本（含可展示的 src） */
  let memoryTasks = [];

  const state = {
    nav: "grade", // grade | dashboard
    gradeTab: "wizard", // wizard | review | tasks
    wizardStep: 1, // 1模式学科 2导入题目 3答案/标准 4确认任务 5上传作业 6批改结果
    draft: null, // current draft task being created
    activeTaskId: null,
    reviewStudentId: null,
    activeQid: null,
    overrides: {},
    lightbox: { open: false, list: [], index: 0, title: "" },
    processing: false,
    activeClassId: null,
    classModalOpen: false,
  };

  /* ========== 班级 / 名单 ========== */
  function defaultClasses() {
    const roster = G.defaultStudents().map((s, i) => ({
      id: s.id,
      no: s.no,
      name: s.name,
      conf: 1,
      source: "default",
    }));
    // 实拍名单：丽江小学推荐市外报名表（30 人）
    const ljStudents =
      typeof window.LJ_ROSTER?.toClassStudents === "function"
        ? window.LJ_ROSTER.toClassStudents()
        : [];
    const list = [
      {
        id: "c_5_3",
        name: "五年级 3 班",
        grade: "五年级",
        teacher: D.meta.teacher,
        students: roster,
      },
      {
        id: "c_5_1",
        name: "五年级 1 班",
        grade: "五年级",
        teacher: D.meta.teacher,
        students: [
          { id: "a01", no: "01", name: "周子墨", conf: 1, source: "default" },
          { id: "a02", no: "02", name: "吴佳宁", conf: 1, source: "default" },
          { id: "a03", no: "03", name: "郑浩宇", conf: 1, source: "default" },
          { id: "a04", no: "04", name: "冯思琪", conf: 1, source: "default" },
          { id: "a05", no: "05", name: "陈俊杰", conf: 1, source: "default" },
        ],
      },
      {
        id: "c_6_2",
        name: "六年级 2 班",
        grade: "六年级",
        teacher: D.meta.teacher,
        students: [
          { id: "b01", no: "01", name: "黄一凡", conf: 1, source: "default" },
          { id: "b02", no: "02", name: "林晓萱", conf: 1, source: "default" },
          { id: "b03", no: "03", name: "何宇航", conf: 1, source: "default" },
        ],
      },
    ];
    if (ljStudents.length) {
      list.unshift({
        id: window.LJ_ROSTER.id || "c_lj_2016",
        name: window.LJ_ROSTER.name || "丽江小学 · 市外报名名单",
        grade: window.LJ_ROSTER.grade || "小学",
        teacher: D.meta.teacher,
        school: window.LJ_ROSTER.school,
        note: window.LJ_ROSTER.note,
        students: ljStudents,
      });
    }
    return list;
  }

  function loadClasses() {
    try {
      const raw = JSON.parse(localStorage.getItem(CLASS_KEY) || "null");
      if (raw && Array.isArray(raw.list) && raw.list.length) {
        let list = raw.list;
        // 若本地缓存没有实拍丽江名单，合并进去（不覆盖用户已改班级）
        const ljId = window.LJ_ROSTER?.id || "c_lj_2016";
        if (window.LJ_ROSTER && !list.some((c) => c.id === ljId)) {
          const lj = defaultClasses().find((c) => c.id === ljId);
          if (lj) {
            list = [lj, ...list];
            if (!state.activeClassId) state.activeClassId = ljId;
            saveClasses(list);
          }
        }
        if (!state.activeClassId) state.activeClassId = raw.activeId || list[0].id;
        return list;
      }
    } catch (_) {}
    const list = defaultClasses();
    state.activeClassId = list[0].id;
    saveClasses(list);
    return list;
  }

  function saveClasses(list) {
    localStorage.setItem(
      CLASS_KEY,
      JSON.stringify({ activeId: state.activeClassId, list })
    );
  }

  function getClasses() {
    return loadClasses();
  }

  function getActiveClass() {
    const list = getClasses();
    return list.find((c) => c.id === state.activeClassId) || list[0];
  }

  function setActiveClass(id) {
    state.activeClassId = id;
    const list = getClasses();
    saveClasses(list);
    updateClassSwitcher();
    // 同步当前草稿/任务班级名与名单
    const cls = getActiveClass();
    if (state.draft) {
      state.draft.className = cls.name;
      state.draft.students = cls.students.map((s) => ({
        id: s.id,
        name: s.name,
        no: normalizeStudentNo(s.no),
      }));
    }
  }

  function updateClassSwitcher() {
    const cls = getActiveClass();
    const nameEl = $("#class-switcher-name");
    const countEl = $("#class-switcher-count");
    if (nameEl) nameEl.textContent = cls?.name || "—";
    if (countEl) countEl.textContent = `${cls?.students?.length || 0} 人`;
  }

  /**
   * 规范化学号：有则保留（去空白），无则空字符串（不编造）
   */
  function normalizeStudentNo(raw) {
    if (raw == null) return "";
    return String(raw).trim();
  }

  /**
   * 模拟「拍照识别名单」
   * 规则：
   *  1. 素材里识别到学号 → 写入 no
   *  2. 素材没有学号 → no 留空（不自动编 01、02）
   *  结果均可在表格里手动改学号/姓名
   *
   * @param {string} fileName
   * @param {{ forceHasNo?: boolean, forceNoNo?: boolean }} [opts]
   */
  function mockRosterOcrFromImage(fileName = "", opts = {}) {
    const nameHint = String(fileName || "").toLowerCase();
    // 丽江实拍名单 / 回执号表：素材含编号 → 带学号
    const looksLikeLj =
      /lj|丽江|回执|3130|报名|推荐/.test(fileName || "") ||
      /lj|lijang|roster_with_no|with[_-]?no|有学号/.test(nameHint);
    // 明确无学号样例
    const forceEmptyNo =
      opts.forceNoNo === true ||
      /无学号|no[_-]?no|without[_-]?no|only[_-]?name/.test(nameHint);
    const hasStudentNo =
      opts.forceHasNo === true || (looksLikeLj && !forceEmptyNo);

    // 有学号素材：优先用丽江 30 人实拍表
    if (hasStudentNo && window.LJ_ROSTER?.students?.length) {
      return window.LJ_ROSTER.students.map((s, i) => ({
        id: G.uid("stu"),
        no: normalizeStudentNo(s.no),
        name: s.name,
        conf: i === 3 || i === 17 ? 0.62 : 0.94 - (i % 7) * 0.01,
        source: "ocr",
        noFromOcr: true,
        gender: s.gender,
        receipt: s.receipt,
      }));
    }

    // 无学号素材：仅姓名（演示手工补学号）
    const namesOnly = [
      "陈思远",
      "李雨桐",
      "王浩然",
      "张婉清",
      "刘子轩",
      "赵一诺",
      "孙启明",
      "周子涵",
      "吴雨泽",
      "郑雅琴",
    ];
    // 故意 1～2 个易错名，方便演示手动改正
    return namesOnly.map((nm, i) => {
      let name = nm;
      let conf = 0.9 - (i % 5) * 0.03;
      if (i === 3) {
        name = "张晚清";
        conf = 0.61;
      }
      if (i === 6) {
        name = "孙启朋";
        conf = 0.58;
      }
      return {
        id: G.uid("stu"),
        no: "", // 素材无学号 → 留空
        name,
        conf: Number(conf.toFixed(2)),
        source: "ocr",
        noFromOcr: false,
      };
    });
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function rememberImage(img) {
    if (!img) return img;
    if (img.id && img.src) imageBlobStore.set(img.id, img.src);
    return img;
  }

  function rememberImages(list) {
    (list || []).forEach(rememberImage);
    return list;
  }

  function resolveImageSrc(img) {
    if (!img) return "";
    if (img.src && !String(img.src).startsWith("pending:")) return img.src;
    if (img.id && imageBlobStore.has(img.id)) return imageBlobStore.get(img.id);
    if (img.samplePath) return img.samplePath;
    return img.src || "";
  }

  function hydrateImage(img) {
    if (!img) return img;
    const src = resolveImageSrc(img);
    return { ...img, src };
  }

  function hydrateImages(list) {
    return (list || []).map(hydrateImage);
  }

  function slimImage(img) {
    if (!img) return img;
    rememberImage(img);
    // 样例图只存路径，不写 base64
    if (img.samplePath || img.fromSample) {
      return {
        id: img.id,
        name: img.name,
        order: img.order,
        fromSample: true,
        samplePath: img.samplePath || img.src,
        src: img.samplePath || img.src,
      };
    }
    // 用户上传：src 放内存，持久化只留占位（刷新后需重新上传）
    const isData = typeof img.src === "string" && img.src.startsWith("data:");
    return {
      id: img.id,
      name: img.name,
      order: img.order,
      size: img.size,
      src: isData ? `pending:${img.id}` : img.src,
      hasBlob: isData,
    };
  }

  function slimImages(list) {
    return (list || []).map(slimImage);
  }

  function slimTask(task) {
    if (!task) return task;
    const submissions = {};
    Object.entries(task.submissions || {}).forEach(([sid, sub]) => {
      submissions[sid] = {
        ...sub,
        pages: (sub.pages || []).map((p, i) => {
          // pages 可能是 string src，或需从 pageMeta 恢复
          if (typeof p === "string") {
            if (p.startsWith("data:")) {
              const id = `${task.id}_${sid}_p${i}`;
              imageBlobStore.set(id, p);
              return `pending:${id}`;
            }
            return p;
          }
          return slimImage(p);
        }),
        pageMeta: slimImages(sub.pageMeta || []),
      };
    });
    return {
      ...task,
      questionPages: slimImages(task.questionPages),
      answerPages: slimImages(task.answerPages),
      workPages: slimImages(task.workPages),
      submissions,
      // aiAnswers / analytics 已是文本，可原样保存
    };
  }

  function hydrateTask(task) {
    if (!task) return task;
    const submissions = {};
    Object.entries(task.submissions || {}).forEach(([sid, sub]) => {
      const pageMeta = hydrateImages(sub.pageMeta || []);
      let pages = (sub.pages || []).map((p, i) => {
        if (typeof p === "string") {
          if (p.startsWith("pending:") && imageBlobStore.has(p.slice(8))) {
            return imageBlobStore.get(p.slice(8));
          }
          return p;
        }
        return resolveImageSrc(p);
      });
      // 若 pages 丢失，用 pageMeta
      if (pageMeta.length && pages.every((p) => !p || String(p).startsWith("pending:"))) {
        pages = pageMeta.map((m) => m.src);
      }
      submissions[sid] = { ...sub, pages, pageMeta };
    });
    return {
      ...task,
      questionPages: hydrateImages(task.questionPages),
      answerPages: hydrateImages(task.answerPages),
      workPages: hydrateImages(task.workPages),
      submissions,
    };
  }

  function loadTasks() {
    // 优先内存（含完整可展示图）
    if (memoryTasks.length) return memoryTasks.map((t) => hydrateTask(t));
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      memoryTasks = raw.map((t) => hydrateTask(t));
      return memoryTasks;
    } catch {
      return [];
    }
  }

  function saveTasks(tasks) {
    // 内存始终保留完整任务
    memoryTasks = tasks.map((t) => hydrateTask(JSON.parse(JSON.stringify(slimTask(t)))));
    // 再尽量写入 localStorage（失败也不阻断流程）
    try {
      const slim = tasks.map(slimTask);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (e) {
      console.warn("localStorage 写入失败（可能超出配额），任务仍保存在本次会话内存中", e);
      try {
        // 再试一次：去掉作业大图，只留元数据
        const lighter = tasks.map((t) => {
          const s = slimTask(t);
          return {
            ...s,
            workPages: (s.workPages || []).map((w) => ({
              id: w.id,
              name: w.name,
              samplePath: w.samplePath,
              fromSample: w.fromSample,
              src: w.samplePath || w.src,
            })),
          };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lighter));
      } catch (e2) {
        console.warn("localStorage 二次写入仍失败", e2);
      }
    }
  }

  function getTasks() {
    return loadTasks();
  }

  function upsertTask(task) {
    // 先记住所有图
    rememberImages(task.questionPages);
    rememberImages(task.answerPages);
    rememberImages(task.workPages);
    Object.values(task.submissions || {}).forEach((sub) => {
      rememberImages(sub.pageMeta);
      (sub.pages || []).forEach((p, i) => {
        if (typeof p === "string" && p.startsWith("data:")) {
          imageBlobStore.set(`${task.id}_${sub.studentId}_p${i}`, p);
        }
      });
    });

    const full = hydrateTask(task);
    const tasks = loadTasks();
    const i = tasks.findIndex((t) => t.id === full.id);
    if (i >= 0) tasks[i] = full;
    else tasks.unshift(full);
    saveTasks(tasks);
    return full;
  }

  function getActiveTask() {
    const tasks = loadTasks();
    if (state.activeTaskId) {
      return tasks.find((t) => t.id === state.activeTaskId) || tasks[0] || null;
    }
    return tasks[0] || null;
  }

  function subjectMeta(id) {
    return D.subjects[id] || D.subjects.math;
  }

  function bankOf(id) {
    // 高中数学：优先用当前草稿的双存档题库（公式字符化结果）
    if (id === "hs_math" && state.draft?.dualQuestions?.length) {
      return (
        window.MathPipeline?.toLegacyBank(state.draft.dualQuestions) ||
        D.questionBanks.hs_math ||
        []
      );
    }
    if (id === "hs_math" && window.HS_MATH_DEMO && window.MathPipeline) {
      try {
        const built = window.MathPipeline.buildDualQuestions(window.HS_MATH_DEMO);
        return window.MathPipeline.toLegacyBank(built);
      } catch (_) {}
    }
    return D.questionBanks[id] || [];
  }

  function modeLabel(mode) {
    return mode === "no_answer" ? "模式 B · 无答案 AI 出标准" : "模式 A · 有标准答案";
  }

  function statusBadge(status) {
    const map = {
      draft: ["pending", "草稿"],
      confirmed: ["partial", "已确认"],
      grading: ["review", "批改中"],
      done: ["ok", "已完成"],
    };
    const [cls, text] = map[status] || ["pending", status];
    return `<span class="badge ${cls}">${text}</span>`;
  }

  function readFilesAsImages(fileList) {
    const files = [...fileList].filter((f) => /image\//.test(f.type) || /\.(heic|jpg|jpeg|png|webp)$/i.test(f.name));
    return Promise.all(
      files.map(
        (file, idx) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const img = {
                id: G.uid("img"),
                name: file.name,
                src: reader.result,
                size: file.size,
                order: idx,
              };
              rememberImage(img);
              resolve(img);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
  }

  async function loadSampleImages(paths) {
    const out = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      // 样例直接用 URL，不再转 base64（省内存、也避免存盘爆掉）
      const img = {
        id: G.uid("smp"),
        name: path.split("/").pop(),
        src: path,
        size: 0,
        order: i,
        fromSample: true,
        samplePath: path,
      };
      rememberImage(img);
      out.push(img);
    }
    return out;
  }

  function openLightbox(list, index = 0, title = "预览") {
    state.lightbox = { open: true, list, index, title };
    renderLightbox();
  }

  function renderLightbox() {
    const root = $("#lightbox-root");
    if (!state.lightbox.open) {
      root.innerHTML = "";
      return;
    }
    const { list, index, title } = state.lightbox;
    const item = list[index];
    const src = typeof item === "string" ? item : item.src;
    root.innerHTML = `
      <div class="lightbox">
        <div class="lightbox-backdrop" data-close="1"></div>
        <div class="lightbox-panel" role="dialog" aria-modal="true">
          <div class="lightbox-toolbar">
            <div>
              <strong>${title}</strong>
              <span class="small muted"> ${index + 1}/${list.length}</span>
            </div>
            <div class="lightbox-actions">
              <button type="button" class="btn" data-lb="prev">上一张</button>
              <button type="button" class="btn" data-lb="next">下一张</button>
              <button type="button" class="btn" data-lb="close">关闭</button>
            </div>
          </div>
          <div class="lightbox-stage"><img src="${src}" alt="preview" /></div>
        </div>
      </div>`;
    root.querySelector("[data-close]").onclick = () => {
      state.lightbox.open = false;
      renderLightbox();
    };
    root.querySelector('[data-lb="close"]').onclick = () => {
      state.lightbox.open = false;
      renderLightbox();
    };
    root.querySelector('[data-lb="prev"]').onclick = () => {
      state.lightbox.index = (index - 1 + list.length) % list.length;
      renderLightbox();
    };
    root.querySelector('[data-lb="next"]').onclick = () => {
      state.lightbox.index = (index + 1) % list.length;
      renderLightbox();
    };
  }

  function thumbGrid(images, opts = {}) {
    if (!images?.length) {
      return `<div class="empty-hint">${opts.empty || "尚未导入图片"}</div>`;
    }
    return `
      <div class="sample-grid sample-grid-lg">
        ${images
          .map(
            (img, i) => `
          <figure class="zoom-fig" data-lb-i="${i}">
            <div class="zoom-thumb">
              <img src="${img.src}" alt="${img.name || i}" loading="lazy" />
              <span class="zoom-hint">放大</span>
            </div>
            <figcaption>${opts.caption?.(img, i) || img.name || `图 ${i + 1}`}</figcaption>
            ${
              opts.removable
                ? `<button type="button" class="thumb-remove" data-rm="${img.id}" title="移除">×</button>`
                : ""
            }
          </figure>`
          )
          .join("")}
      </div>`;
  }

  function bindThumbs(root, images, onRemove) {
    $$(".zoom-fig", root).forEach((fig) => {
      fig.addEventListener("click", (e) => {
        if (e.target.closest("[data-rm]")) return;
        openLightbox(images, Number(fig.dataset.lbI), "图片预览");
      });
    });
    if (onRemove) {
      $$("[data-rm]", root).forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onRemove(btn.dataset.rm);
        });
      });
    }
  }

  function newDraft(partial = {}) {
    const subjectId = partial.subjectId || "math";
    const meta = subjectMeta(subjectId);
    const cls = getActiveClass();
    return {
      id: G.uid("task"),
      subjectId,
      subjectName: meta.name,
      fullName: meta.fullName,
      className: cls?.name || D.meta.className,
      classId: cls?.id,
      teacher: D.meta.teacher,
      mode: partial.mode || "with_answer", // with_answer | no_answer
      title: partial.title || `${meta.name}作业批改`,
      status: "draft",
      createdAt: new Date().toISOString(),
      questionPages: [],
      answerPages: [],
      aiAnswers: [],
      rubricReady: false,
      ocrReady: false,
      confirmedAt: null,
      workPages: [],
      submissions: {},
      analytics: null,
      students: (cls?.students || G.defaultStudents()).map((s) => ({
        id: s.id,
        name: s.name,
        no: normalizeStudentNo(s.no),
      })),
      pagesPerStudent: 2,
    };
  }

  function ensureDraft() {
    if (!state.draft) state.draft = newDraft();
    return state.draft;
  }

  function updatePills() {
    const task = getActiveTask() || state.draft;
    const modePill = $("#mode-pill");
    const taskPill = $("#task-pill");
    if (modePill) modePill.textContent = task ? modeLabel(task.mode).replace(" · ", " ") : "模式 —";
    if (taskPill) {
      if (!task) taskPill.textContent = "无任务";
      else if (task.status === "draft") taskPill.textContent = "草稿中";
      else taskPill.textContent = task.title || task.subjectName;
    }
  }

  function setNav(nav, gradeTab) {
    state.nav = nav === "dashboard" ? "dashboard" : "grade";
    if (gradeTab) state.gradeTab = gradeTab;

    $$(".side-nav button[data-nav]").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === state.nav);
    });
    $$(".panel").forEach((p) => p.classList.remove("active"));

    if (state.nav === "dashboard") {
      $("#panel-dashboard")?.classList.add("active");
      $("#page-title").textContent = "数据看板";
      $("#page-sub").textContent = "班级学情、薄弱点、讲评建议与飞书同步摘要。";
      updatePills();
      updateClassSwitcher();
      renderDashboard();
      return;
    }

    // 改作业
    $("#panel-grade")?.classList.add("active");
    const titles = {
      wizard: [
        "改作业",
        "一步一事：选模式 → 导题目 → 设标准 → 确认 → 上传 → 看结果。右上角可切换班级。",
      ],
      review: ["批改复核", "一次看一名学生：原图 + 分题得分；可改分。"],
      tasks: ["任务列表", "本班已保存任务；可继续上传或复核。"],
    };
    const tab = state.gradeTab || "wizard";
    const [t, s] = titles[tab] || titles.wizard;
    $("#page-title").textContent = t;
    $("#page-sub").textContent = s;
    updatePills();
    updateClassSwitcher();

    $$(".grade-tab").forEach((b) => b.classList.toggle("active", b.dataset.gradeTab === tab));
    $$(".grade-view").forEach((v) => v.classList.remove("active"));
    $(`#grade-view-${tab}`)?.classList.add("active");

    if (tab === "wizard") renderWizard();
    if (tab === "review") renderReview();
    if (tab === "tasks") renderTasks();
  }

  /** 兼容旧调用：把旧 panel 名映射到新导航 */
  function setPanel(name) {
    const map = {
      home: ["grade", "wizard"],
      wizard: ["grade", "wizard"],
      review: ["grade", "review"],
      tasks: ["grade", "tasks"],
      analytics: ["dashboard", null],
      samples: ["grade", "wizard"],
      grade: ["grade", state.gradeTab || "wizard"],
      dashboard: ["dashboard", null],
    };
    const [nav, tab] = map[name] || ["grade", "wizard"];
    setNav(nav, tab || undefined);
  }

  function renderDashboard() {
    renderAnalyticsInto($("#dashboard-body"));
  }

  async function quickDemo(subjectId, mode) {
    state.processing = true;
    toast("正在导入样例并生成批改…");
    try {
      const meta = subjectMeta(subjectId);
      const draft = newDraft({ subjectId, mode });
      draft.questionPages = await loadSampleImages(meta.blankPages.slice(0, 3));
      draft.ocrReady = true;
      if (mode === "with_answer") {
        draft.answerPages = await loadSampleImages(meta.answerPages.slice(0, 2));
      } else {
        draft.aiAnswers = G.generateAnswersFromQuestions(bankOf(subjectId), meta);
      }
      draft.rubricReady = true;
      draft.status = "confirmed";
      draft.confirmedAt = new Date().toISOString();
      draft.title = `${meta.name} · ${mode === "no_answer" ? "模式B" : "模式A"} 演示任务`;

      // work pages from capture queue samples
      const workPaths = [];
      const queue = D.captureQueue[subjectId] || [];
      queue.forEach((q) => q.pages.forEach((p) => workPaths.push(p)));
      // pad with extra samples if needed
      if (workPaths.length < 4) {
        const all = meta.blankPages.concat(meta.answerPages);
        all.forEach((p) => {
          if (workPaths.length < 6) workPaths.push(p);
        });
      }
      draft.workPages = await loadSampleImages(workPaths.slice(0, 6));
      runGrading(draft);
      state.draft = null;
      state.activeTaskId = draft.id;
      state.reviewStudentId = Object.keys(draft.submissions)[0] || null;
      toast("演示任务已生成，正在打开批改结果");
      setPanel("review");
    } catch (e) {
      console.error(e);
      toast("演示失败，请用本地服务器打开（python3 -m http.server）");
    } finally {
      state.processing = false;
    }
  }

  function runGrading(task) {
    const bank = bankOf(task.subjectId);
    const groups = G.assignPagesToStudents(task.workPages, task.students, task.pagesPerStudent || 2);
    task.submissions = G.gradeTask(task, bank, groups);
    task.analytics = G.buildAnalytics(task, task.submissions, bank);
    task.status = "done";
    task.gradedAt = new Date().toISOString();
    upsertTask(task);
    return task;
  }

  /* ========== WIZARD ========== */

  /** 模式 B / 未点「生成标准」时，进入确认页自动补全，避免按钮被灰掉 */
  function ensureStandards(draft, { silent = false } = {}) {
    if (!draft.questionPages?.length) return false;
    const bank = bankOf(draft.subjectId);
    const meta = subjectMeta(draft.subjectId);
    draft.ocrReady = true;
    if (draft.mode === "no_answer") {
      if (!draft.aiAnswers?.length) {
        draft.aiAnswers = G.generateAnswersFromQuestions(bank, meta);
        if (!silent) toast("已自动根据题目生成 AI 参考答案与判题标准");
      }
    }
    draft.rubricReady = true;
    return true;
  }

  const WIZARD_STEPS = [
    { id: 1, short: "模式", label: "选择模式与学科" },
    { id: 2, short: "题目", label: "导入题目页" },
    { id: 3, short: "标准", label: "答案与判题标准" },
    { id: 4, short: "确认", label: "确认批改任务" },
    { id: 5, short: "上传", label: "上传同学作业" },
    { id: 6, short: "结果", label: "批改结果" },
  ];

  function canEnterWizardStep(n, draft) {
    const d = draft || state.draft || {};
    if (n <= 1) return true;
    if (n === 2) return true;
    if (n === 3) {
      if (!d.questionPages?.length) return { ok: false, msg: "请先导入题目页" };
      return true;
    }
    if (n === 4) {
      if (!d.questionPages?.length) return { ok: false, msg: "请先导入题目页" };
      return true;
    }
    if (n === 5) {
      if (d.status === "draft") return { ok: false, msg: "请先确认并生成批改任务" };
      return true;
    }
    if (n === 6) {
      const task = getTasks().find((t) => t.id === d.id) || d;
      if (!Object.keys(task.submissions || {}).length) {
        return { ok: false, msg: "请先上传作业并完成批改" };
      }
      return true;
    }
    return true;
  }

  function goWizardStep(n) {
    const draft = ensureDraft();
    const gate = canEnterWizardStep(n, draft);
    if (gate && gate.ok === false) {
      toast(gate.msg);
      return false;
    }
    if (n >= 3 && draft.questionPages?.length) {
      ensureStandards(draft, { silent: true });
    }
    state.wizardStep = n;
    renderWizard();
    return true;
  }

  function setWizardFooter(footer, { hint, actionsHtml }) {
    if (!footer) return;
    footer.innerHTML = `
      <div class="wizard-footer-inner">
        <div class="wizard-footer-hint small muted">${hint || ""}</div>
        <div class="wizard-footer-actions">${actionsHtml || ""}</div>
      </div>`;
  }

  function renderWizard() {
    const root = $("#grade-view-wizard");
    if (!root) return;
    const draft = ensureDraft();
    let step = Number(state.wizardStep) || 1;
    if (step < 1 || step > 6) step = 1;
    state.wizardStep = step;

    if (step >= 3 && draft.questionPages.length) {
      ensureStandards(draft, { silent: true });
    }

    root.innerHTML = `
      <div class="wizard-shell">
        <div class="wizard-scroll">
          <div class="wizard-progress" role="navigation" aria-label="批改步骤">
            ${WIZARD_STEPS.map((s, i) => {
              const st = step === s.id ? "active" : step > s.id ? "done" : "";
              return `
              ${i ? `<div class="wizard-progress-line ${step > s.id - 1 ? "on" : ""}"></div>` : ""}
              <button type="button" class="wiz-dot ${st}" data-step="${s.id}" title="${s.label}">
                <span class="wiz-dot-num">${step > s.id ? "✓" : s.id}</span>
                <span class="wiz-dot-label">${s.short}</span>
              </button>`;
            }).join("")}
          </div>
          <div class="wizard-step-title">
            <span class="wizard-step-kicker">第 ${step} / 6 步</span>
            <h3>${WIZARD_STEPS[step - 1].label}</h3>
          </div>
          <div id="wizard-body" class="wizard-focus"></div>
        </div>
        <div class="wizard-footer" id="wizard-footer"></div>
      </div>
    `;

    $$("[data-step]", root).forEach((b) => {
      b.addEventListener("click", () => goWizardStep(Number(b.dataset.step)));
    });

    const body = $("#wizard-body");
    const footer = $("#wizard-footer");
    const renderers = {
      1: renderWizardStep1,
      2: renderWizardStep2,
      3: renderWizardStep3,
      4: renderWizardStep4,
      5: renderWizardStep5,
      6: renderWizardStep6,
    };
    (renderers[step] || renderWizardStep1)(body, draft, footer);
  }

  /* —— 混拍自动整理（题目/答案/作业一次导入） —— */
  function pageObjFromPath(path, name) {
    return {
      id: G.uid("img"),
      name: name || path.split("/").pop(),
      src: path,
      samplePath: path,
      fromSample: true,
    };
  }

  function applyMatchResultToDraft(result, subjectId = "hs_chinese") {
    const meta = subjectMeta(subjectId);
    const tpl = result.taskTemplate || {};
    const draft = newDraft({
      subjectId,
      mode: tpl.mode === "no_answer" ? "no_answer" : "with_answer",
    });
    draft.title = tpl.title || `${meta.name} · 混拍整理任务`;
    draft.questionPages = rememberImages(
      (tpl.blankPages || []).map((p) => pageObjFromPath(p.path || p.src, p.name || p.id))
    );
    draft.answerPages = rememberImages(
      (tpl.answerPages || []).map((p) => pageObjFromPath(p.path || p.src, p.name || p.id))
    );
    draft.workPages = rememberImages(
      (tpl.workPages || []).map((p) => pageObjFromPath(p.path || p.src, p.name || p.id))
    );
    draft.ocrReady = draft.questionPages.length > 0;
    draft.mixedMatch = {
      summary: result.summary,
      pairs: result.pairs,
      pages: result.pages,
      notes: tpl.notes,
    };
    ensureStandards(draft, { silent: true });
    state.draft = draft;
    state.matchResult = result;
    updatePills();
    return draft;
  }

  function runHsChineseMixedDemo() {
    if (!window.PageMatcher || !window.HS_CHINESE_CORPUS) {
      toast("匹配引擎未加载");
      return null;
    }
    toast("正在整理 44 页混拍照片…");
    const corpus = window.HS_CHINESE_CORPUS;
    // 给 matcher 用 ocrText 字段
    const prepared = {
      ...corpus,
      pages: (corpus.pages || []).map((p) => ({
        ...p,
        text: p.ocrText || p.text || "",
      })),
    };
    const result = window.PageMatcher.matchFromDemoCorpus(prepared);
    applyMatchResultToDraft(result, "hs_chinese");
    toast(
      `整理完成：题目 ${result.summary.question_blank} · 作业 ${result.summary.student_work} · 答案 ${result.summary.answer_key}`
    );
    return result;
  }

  /**
   * 高中数学四能力一键演示
   * 框选 → 标准字符化（双存档）→ 智能制答 → 乱序题答对齐
   */
  function runHsMathFourFeatureDemo(mode) {
    const MP = window.MathPipeline;
    const MF = window.MathFormat;
    if (!MP || !window.HS_MATH_DEMO) {
      toast("高中数学演示数据未加载");
      return null;
    }
    if (!MF) {
      toast("公式字符化模块未加载");
      return null;
    }
    toast("正在跑通：框选 · 字符化 · 制答 · 乱序对齐…");
    const pipe = MP.runHsMathDemo({
      shuffle: true,
      mode: mode === "no_answer" ? "no_answer" : "with_answer",
    });
    if (pipe.error) {
      toast(pipe.error);
      return null;
    }

    const draft = newDraft({
      subjectId: "hs_math",
      mode: mode === "no_answer" ? "no_answer" : "with_answer",
    });
    draft.title = "高中数学 · 章末检测（四能力演示）";
    draft.questionPages = rememberImages(
      (pipe.blankPaths || []).map((p) => pageObjFromPath(p))
    );
    draft.answerPages = rememberImages(
      (pipe.answerPaths || []).map((p) => pageObjFromPath(p))
    );
    draft.ocrReady = true;
    draft.rubricReady = true;
    draft.dualQuestions = pipe.dualQuestions;
    draft.mathPipeline = {
      pages: pipe.pages,
      summary: pipe.summary,
      matchTable: pipe.matchTable,
      byRole: pipe.byRole,
    };
    draft.aiAnswers = (pipe.dualQuestions || []).map((q) => ({
      no: q.no,
      title: `第 ${q.no} 题`,
      answer: q.standard?.answerLatex || "",
      process: (q.standard?.steps || []).map((s) => s.text).join("；"),
      source: q.match?.source || "ai",
    }));
    ensureStandards(draft, { silent: true });
    state.draft = draft;
    state.mathPipeResult = pipe;
    state.activeMathQid = pipe.dualQuestions[0]?.qid || null;
    updatePills();
    toast(
      `完成：${pipe.summary.questions} 题 · 答案册对齐 ${pipe.summary.keybookMatched} · AI 制答 ${pipe.summary.aiDrafted}`
    );
    return pipe;
  }

  /** 四能力结果：框选页 + 双存档题卡 + 对齐表 */
  function renderMathPipelineReview(root, draft, footer) {
    const MP = window.MathPipeline;
    const MF = window.MathFormat;
    const pipe = state.mathPipeResult || draft.mathPipeline;
    if (!pipe || !MF || !MP) {
      root.innerHTML = `<div class="card focus-card"><div class="card-bd empty-hint">暂无高中数学演示结果</div></div>`;
      return;
    }
    const questions = draft.dualQuestions || pipe.dualQuestions || [];
    const pages = pipe.pages || [];
    const s = pipe.summary || {};
    let activeQid = state.activeMathQid || questions[0]?.qid;
    const activeQ = questions.find((q) => q.qid === activeQid) || questions[0];
    if (activeQ) activeQid = activeQ.qid;
    state.activeMathQid = activeQid;

    // 仅展示含框选的考试/讲义页
    const examPages = pages.filter((p) => p.role === "exam" || p.role === "lecture");
    const answerPages = pages.filter((p) => p.role === "answer_key");

    root.innerHTML = `
      <div class="card focus-card math-pipe-card">
        <div class="card-bd">
          <p class="focus-lead">四能力一次演示：①页角色/乱序整理 ②框选切题 ③标准字符化（可改 LaTeX）④答案册/AI 制答对齐。左侧原图存档，右侧公式预览。</p>
          <div class="confirm-summary">
            <div class="confirm-chip"><span>总页（乱序后）</span><strong>${s.totalPages || pages.length}</strong></div>
            <div class="confirm-chip"><span>检测卷</span><strong>${s.exam || 0}</strong></div>
            <div class="confirm-chip"><span>答案册</span><strong>${s.answer_key || 0}</strong></div>
            <div class="confirm-chip"><span>讲义</span><strong>${s.lecture || 0}</strong></div>
            <div class="confirm-chip"><span>识别题目</span><strong>${s.questions || questions.length}</strong></div>
            <div class="confirm-chip"><span>答案册对齐</span><strong>${s.keybookMatched || 0}</strong></div>
            <div class="confirm-chip"><span>AI 制答</span><strong>${s.aiDrafted || 0}</strong></div>
          </div>

          <div class="math-cap-tabs mt-16" id="math-cap-tabs">
            <button type="button" class="math-cap-tab active" data-cap="bbox">① 框选</button>
            <button type="button" class="math-cap-tab" data-cap="char">② 字符化确认</button>
            <button type="button" class="math-cap-tab" data-cap="answer">③ 智能制答</button>
            <button type="button" class="math-cap-tab" data-cap="align">④ 题答对齐</button>
          </div>

          <div class="math-cap-panel" id="math-cap-bbox">
            <div class="section-label-row mt-12">
              <div class="small muted">点选框选区域或题号列表，联动高亮</div>
            </div>
            <div class="math-bbox-layout mt-8">
              <div class="math-q-list">
                ${questions
                  .map(
                    (q) => `
                  <button type="button" class="math-q-item ${q.qid === activeQid ? "active" : ""} ${
                      (q.conf ?? 1) < 0.8 ? "low" : ""
                    }" data-qid="${q.qid}">
                    <strong>第 ${q.no} 题</strong>
                    <span class="tag">${q.type}</span>
                    <span class="small muted">${q.archive?.pageId || ""} · ${Math.round(
                      (q.conf ?? 0) * 100
                    )}%</span>
                  </button>`
                  )
                  .join("")}
              </div>
              <div class="math-bbox-stage" id="math-bbox-stage">
                ${examPages
                  .map((p) => MP.renderPageWithBBoxes(p, questions, activeQid))
                  .join("") || `<div class="empty-hint">无检测页</div>`}
              </div>
            </div>
          </div>

          <div class="math-cap-panel hidden" id="math-cap-char">
            <div class="mt-12" id="math-dual-card-host"></div>
            <div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn primary" id="btn-confirm-q">确认本题字符化</button>
              <button type="button" class="btn" id="btn-prev-q">上一题</button>
              <button type="button" class="btn" id="btn-next-q">下一题</button>
            </div>
          </div>

          <div class="math-cap-panel hidden" id="math-cap-answer">
            <div class="generated-answers mt-12 focus-scroll">
              ${questions
                .map((q) => {
                  const src = q.match?.source === "keybook" ? "答案册" : "AI 起草";
                  const badge = q.match?.source === "keybook" ? "ok" : "review";
                  return `
                  <div class="gen-answer-card">
                    <header>
                      <strong>第 ${q.no} 题 · ${q.type}</strong>
                      <span class="badge ${badge}">${src}</span>
                    </header>
                    <div class="math-inline-preview">${MF.renderMathText(
                      q.standard?.answerLatex || "（无）"
                    )}</div>
                    <div class="small muted mt-8">过程：${(q.standard?.steps || [])
                      .map((st) => st.text)
                      .join("；")}</div>
                  </div>`;
                })
                .join("")}
            </div>
          </div>

          <div class="math-cap-panel hidden" id="math-cap-align">
            <div class="match-algo-note mt-12 small muted">
              算法示意：乱序页 → 角色（讲义/检测/答案）→ 卷指纹 paperId → 题号对齐答案册；未命中走 AI 制答。
            </div>
            <div class="match-page-list mt-12">
              ${pages
                .map(
                  (p) => `
                <div class="match-page-row ${p.roleConf < 0.7 ? "low" : ""}">
                  <div class="match-thumb">${
                    p.path ? `<img src="${p.path}" alt="" loading="lazy" />` : ""
                  }</div>
                  <div class="match-meta">
                    <strong>${p.id}</strong>
                    <div class="small muted">${p.title || ""}</div>
                    <div class="small muted">置信 ${Math.round((p.roleConf || 0) * 100)}%</div>
                  </div>
                  <div class="match-role-btns">
                    <span class="role-chip active">${p.roleLabel || p.role}</span>
                  </div>
                </div>`
                )
                .join("")}
            </div>
            <div class="section-mini mt-16">题号 ↔ 答案页</div>
            <div class="align-table mt-8">
              <div class="align-head"><span>题号</span><span>题目页</span><span>答案页</span><span>来源</span><span>分</span></div>
              ${(pipe.matchTable || [])
                .map(
                  (row) => `
                <div class="align-row">
                  <span>${row.no}</span>
                  <span>${row.pageId || "—"}</span>
                  <span>${row.answerPageId || "—"}</span>
                  <span>${row.source === "keybook" ? "答案册" : "AI"}</span>
                  <span>${row.score != null ? Math.round(row.score * 100) + "%" : "—"}</span>
                </div>`
                )
                .join("")}
            </div>
            ${
              answerPages.length
                ? `<div class="small muted mt-12">答案册页：${answerPages
                    .map((p) => p.id)
                    .join("、")}</div>`
                : ""
            }
          </div>
        </div>
      </div>`;

    function showCap(name) {
      $$(".math-cap-tab", root).forEach((b) =>
        b.classList.toggle("active", b.dataset.cap === name)
      );
      ["bbox", "char", "answer", "align"].forEach((k) => {
        const el = root.querySelector(`#math-cap-${k}`);
        if (el) el.classList.toggle("hidden", k !== name);
      });
      if (name === "char") mountActiveDual();
    }

    function mountActiveDual() {
      const host = root.querySelector("#math-dual-card-host");
      const q = questions.find((x) => x.qid === state.activeMathQid) || questions[0];
      if (!host || !q) return;
      MF.mountQuestionCard(host, q, { editable: true });
      MF.bindEditableCard(host, q, () => {
        draft.dualQuestions = questions;
      });
    }

    function selectQ(qid) {
      state.activeMathQid = qid;
      // 刷新框选 active 态与列表
      $$(".math-q-item", root).forEach((b) =>
        b.classList.toggle("active", b.dataset.qid === qid)
      );
      $$(".bbox-hit", root).forEach((b) =>
        b.classList.toggle("active", b.dataset.qid === qid)
      );
      const capChar = root.querySelector("#math-cap-char");
      if (capChar && !capChar.classList.contains("hidden")) mountActiveDual();
    }

    $$(".math-cap-tab", root).forEach((b) => {
      b.onclick = () => showCap(b.dataset.cap);
    });
    $$(".math-q-item", root).forEach((b) => {
      b.onclick = () => selectQ(b.dataset.qid);
    });
    $$(".bbox-hit", root).forEach((b) => {
      b.onclick = () => selectQ(b.dataset.qid);
    });

    const btnConfirm = root.querySelector("#btn-confirm-q");
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        const q = questions.find((x) => x.qid === state.activeMathQid);
        if (q?.standard) {
          q.standard.confirmed = true;
          toast(`第 ${q.no} 题标准字符化已确认（原图存档保留）`);
          mountActiveDual();
        }
      };
    }
    const idxOf = () => questions.findIndex((x) => x.qid === state.activeMathQid);
    root.querySelector("#btn-prev-q")?.addEventListener("click", () => {
      const i = idxOf();
      if (i > 0) {
        selectQ(questions[i - 1].qid);
        mountActiveDual();
      }
    });
    root.querySelector("#btn-next-q")?.addEventListener("click", () => {
      const i = idxOf();
      if (i < questions.length - 1) {
        selectQ(questions[i + 1].qid);
        mountActiveDual();
      }
    });

    setWizardFooter(footer, {
      hint: "确认后写入题目/答案页并进入「答案与判题标准」；双存档已挂在草稿上",
      actionsHtml: `
        <button class="btn" id="btn-back-math">返回</button>
        <button class="btn primary" id="btn-apply-math">采用并继续</button>`,
    });

    $("#btn-back-math").onclick = () => {
      state.wizardStep = 1;
      state._showMathReview = false;
      renderWizard();
    };
    $("#btn-apply-math").onclick = () => {
      draft.dualQuestions = questions;
      draft.mathPipeline = pipe;
      state._showMathReview = false;
      state.wizardStep = 3;
      toast("已写入高中数学任务：双存档题库 + 对齐结果");
      renderWizard();
    };
  }

  function renderMatchReview(root, draft, footer) {
    const M = window.PageMatcher;
    const result = state.matchResult;
    if (!result) {
      root.innerHTML = `<div class="card focus-card"><div class="card-bd empty-hint">暂无混拍结果</div></div>`;
      return;
    }
    const pages = result.pages || [];
    const s = result.summary || {};
    const roleLabel = M?.roleLabel || {
      question_blank: "题目页",
      student_work: "学生作业",
      answer_key: "答案册",
    };

    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <p class="focus-lead">系统已把混拍照片分成三类。可点标签改角色，再生成任务模板。</p>
          <div class="confirm-summary">
            <div class="confirm-chip"><span>总页数</span><strong>${s.total || pages.length}</strong></div>
            <div class="confirm-chip"><span>题目/空白</span><strong>${s.question_blank || 0}</strong></div>
            <div class="confirm-chip"><span>学生作业</span><strong>${s.student_work || 0}</strong></div>
            <div class="confirm-chip"><span>答案册</span><strong>${s.answer_key || 0}</strong></div>
            <div class="confirm-chip"><span>拍摄会话</span><strong>${s.sessions || 1}</strong></div>
            <div class="confirm-chip"><span>低置信</span><strong>${s.lowConfidence || 0}</strong></div>
          </div>
          <div class="match-algo-note mt-12 small muted">
            算法：时间切会话（≥45s）→ 关键词/版式分角色 → 课文指纹对齐题目与答案。
          </div>
          <div class="match-page-list mt-16">
            ${pages
              .map((p) => {
                const thumb = p.path || p.src || "";
                const lessons = (p.lessons || []).map((l) => l.name || l.key).join(" · ");
                return `
                <div class="match-page-row ${p.roleConf < 0.7 ? "low" : ""}" data-pid="${p.id}">
                  <div class="match-thumb">${
                    thumb ? `<img src="${thumb}" alt="" loading="lazy" />` : ""
                  }</div>
                  <div class="match-meta">
                    <strong>${p.name || p.id}</strong>
                    <div class="small muted">${p.unit || "未识别单元"}${lessons ? " · " + lessons : ""}</div>
                    <div class="small muted">会话 ${p.session || 1} · 置信 ${Math.round((p.roleConf || 0) * 100)}%</div>
                  </div>
                  <div class="match-role-btns">
                    ${["question_blank", "student_work", "answer_key"]
                      .map(
                        (r) => `
                      <button type="button" class="role-chip ${p.role === r ? "active" : ""}" data-pid="${p.id}" data-role="${r}">
                        ${roleLabel[r] || r}
                      </button>`
                      )
                      .join("")}
                  </div>
                </div>`;
              })
              .join("")}
          </div>
        </div>
      </div>`;

    setWizardFooter(footer, {
      hint: "确认分类后，将写入题目 / 答案 / 作业并进入标准步骤",
      actionsHtml: `
        <button class="btn" id="btn-back-match">返回</button>
        <button class="btn primary" id="btn-apply-match">采用并继续</button>`,
    });

    $$(".role-chip", root).forEach((b) => {
      b.onclick = () => {
        const pid = b.dataset.pid;
        const role = b.dataset.role;
        const page = pages.find((x) => x.id === pid);
        if (!page) return;
        page.role = role;
        page.roleConf = 1;
        const rebuilt = M.rebuildTemplateFromPages(pages);
        state.matchResult = { ...result, ...rebuilt, pages };
        renderMatchReview(root, draft, footer);
      };
    });

    $("#btn-back-match").onclick = () => {
      state.wizardStep = 1;
      state._showMatchReview = false;
      renderWizard();
    };
    $("#btn-apply-match").onclick = () => {
      const rebuilt = M.rebuildTemplateFromPages(pages);
      applyMatchResultToDraft(rebuilt, draft.subjectId || "hs_chinese");
      state._showMatchReview = false;
      state.wizardStep = 3;
      toast("已写入任务模板，请核对答案与标准");
      renderWizard();
    };
  }

  /* —— 第 1 步：只选模式 + 学科 —— */
  function renderWizardStep1(root, draft, footer) {
    if (state._showMathReview && (state.mathPipeResult || draft.mathPipeline)) {
      renderMathPipelineReview(root, draft, footer);
      return;
    }
    if (state._showMatchReview && state.matchResult) {
      renderMatchReview(root, draft, footer);
      return;
    }
    const meta = subjectMeta(draft.subjectId);
    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <p class="focus-lead">先选批改方式与学科。若题目和答案混在一起拍，可用下方「混拍一键整理」或「高中数学四能力」演示。</p>

          <div class="mixed-import-card">
            <div>
              <strong>混拍一键整理 / 四能力演示</strong>
              <p class="small muted" style="margin:6px 0 0">
                语文：题目+答案+作业自动分类。数学：框选、公式字符化、智能制答、乱序题答对齐。
              </p>
            </div>
            <div class="mixed-import-actions">
              <button type="button" class="btn primary" id="btn-mixed-hs">演示：高中语文 44 页</button>
              <button type="button" class="btn primary" id="btn-mixed-math">演示：高中数学四能力</button>
              <button type="button" class="btn" id="btn-mixed-info">算法说明</button>
            </div>
          </div>

          <div class="focus-section mt-16">
            <div class="focus-section-label">批改模式</div>
            <div class="setup-mode-bar">
              <button type="button" class="mode-card ${draft.mode === "with_answer" ? "active" : ""}" data-mode="with_answer">
                <strong>模式 A · 有标准答案</strong>
                <span>稍后导入答案册，AI 辅助生成判题标准</span>
              </button>
              <button type="button" class="mode-card ${draft.mode === "no_answer" ? "active" : ""}" data-mode="no_answer">
                <strong>模式 B · 无答案也能批</strong>
                <span>只导题目，由 AI 起草参考答案与过程分</span>
              </button>
            </div>
          </div>

          <div class="focus-section">
            <div class="focus-section-label">学科</div>
            <div class="setup-subject-bar">
              ${Object.values(D.subjects)
                .map(
                  (s) => `
                <button type="button" class="subject-pill ${draft.subjectId === s.id ? "active" : ""}" data-sid="${s.id}">
                  <span class="subject-pill-name">${s.name}</span>
                  <span class="subject-pill-meta">${s.questionCount} 题样例</span>
                </button>`
                )
                .join("")}
            </div>
            <p class="small muted mt-12" style="margin-bottom:0">${meta.description}</p>
          </div>
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: `${modeLabel(draft.mode)} · ${draft.subjectName} · ${draft.className || "当前班级"}`,
      actionsHtml: `<button class="btn primary" id="btn-next">下一步：导入题目</button>`,
    });

    $$("[data-mode]", root).forEach((b) => {
      b.onclick = () => {
        draft.mode = b.dataset.mode;
        if (draft.mode === "no_answer") draft.answerPages = [];
        else draft.aiAnswers = [];
        draft.rubricReady = false;
        toast(modeLabel(draft.mode));
        updatePills();
        renderWizard();
      };
    });
    $$("[data-sid]", root).forEach((b) => {
      b.onclick = () => {
        const sid = b.dataset.sid;
        if (sid === draft.subjectId) return;
        state.draft = newDraft({ subjectId: sid, mode: draft.mode });
        toast(`已切换学科：${subjectMeta(sid).name}`);
        renderWizard();
      };
    });
    $("#btn-next").onclick = () => goWizardStep(2);

    $("#btn-mixed-hs").onclick = () => {
      const result = runHsChineseMixedDemo();
      if (!result) return;
      state._showMatchReview = true;
      state._showMathReview = false;
      renderWizard();
    };
    $("#btn-mixed-math").onclick = () => {
      const pipe = runHsMathFourFeatureDemo(draft.mode);
      if (!pipe) return;
      state._showMathReview = true;
      state._showMatchReview = false;
      renderWizard();
    };
    $("#btn-mixed-info").onclick = () => {
      toast(
        "语文：时间切会话→角色→指纹。数学：乱序角色→框选→KaTeX 双存档→答案册/AI 对齐。"
      );
    };
  }

  /* —— 第 2 步：只导入题目 —— */
  function renderWizardStep2(root, draft, footer) {
    const meta = subjectMeta(draft.subjectId);
    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <p class="focus-lead">上传空白题目 / 练习册页。答案册放到下一步再处理。</p>
          <div class="upload-zone upload-zone-wide" id="zone-questions">
            <strong>题目页（必填）</strong>
            <p class="small muted">支持多选 · 当前学科：${meta.name}</p>
            <input type="file" id="file-questions" accept="image/*" multiple hidden />
            <div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="btn primary" id="btn-pick-q">选择图片上传</button>
              <button type="button" class="btn" id="btn-sample-q">导入样例题目</button>
              <button type="button" class="btn" id="btn-ai-page" ${
                draft.questionPages.length ? "" : "disabled"
              }>AI 识别题干框</button>
            </div>
          </div>
          <div class="mt-16">
            <div class="section-label-row">
              <div class="small muted">已导入 ${draft.questionPages.length} 张</div>
              ${
                draft.vlPageResult
                  ? `<span class="badge ok">VL 已识别 ${
                      (draft.vlPageResult.questions || []).length
                    } 题</span>`
                  : ""
              }
            </div>
            <div class="mt-8" id="q-thumbs">${thumbGrid(draft.questionPages, {
              removable: true,
              caption: (_, i) => `题目 ${i + 1}`,
              empty: "还没有题目页",
            })}</div>
            <div id="ai-page-result" class="ai-page-result ${
              draft.vlPageResult ? "" : "hidden"
            }"></div>
          </div>
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: draft.questionPages.length
        ? `已导入 ${draft.questionPages.length} 张题目`
        : "请至少导入 1 张题目页",
      actionsHtml: `
        <button class="btn" id="btn-back">上一步</button>
        <button class="btn primary" id="btn-next" ${draft.questionPages.length ? "" : "disabled"}>下一步：答案与标准</button>`,
    });

    $("#btn-pick-q").onclick = () => $("#file-questions").click();
    $("#file-questions").onchange = async (e) => {
      const imgs = await readFilesAsImages(e.target.files);
      draft.questionPages = draft.questionPages.concat(imgs);
      draft.ocrReady = draft.questionPages.length > 0;
      toast(`已导入 ${imgs.length} 张题目页`);
      renderWizard();
    };
    $("#btn-sample-q").onclick = async () => {
      toast("正在导入样例题目…");
      const imgs = await loadSampleImages(meta.blankPages);
      draft.questionPages = imgs;
      draft.ocrReady = true;
      toast(`已导入 ${imgs.length} 张样例题目`);
      renderWizard();
    };

    // 展示已有 VL 结果摘要
    const resultEl = $("#ai-page-result");
    if (resultEl && draft.vlPageResult) {
      const qs = draft.vlPageResult.questions || [];
      resultEl.innerHTML = `
        <strong>AI 题干识别（${draft.vlPageResult.model || "qwen-vl"}）</strong>
        <div class="small muted mt-8">角色：${draft.vlPageResult.pageRole || "—"} · 点击右侧可对照原图框选（批改复核也会用这些框）</div>
        <ul style="margin:8px 0 0;padding-left:18px">
          ${qs
            .map(
              (q) =>
                `<li><strong>第 ${q.no || "?"} 题</strong> ${q.type || ""} · 置信 ${Math.round(
                  (q.confidence || 0) * 100
                )}%<br/><span class="muted">${(q.stemText || "").slice(0, 80)}${
                  (q.stemText || "").length > 80 ? "…" : ""
                }</span></li>`
            )
            .join("")}
        </ul>`;
    }

    $("#btn-ai-page")?.addEventListener("click", async () => {
      if (!draft.questionPages.length) {
        toast("请先导入题目页");
        return;
      }
      const AI = window.AIClient;
      if (!AI) {
        toast("AI 客户端未加载");
        return;
      }
      toast("正在用通义千问 VL 识别第一页题干…");
      try {
        await AI.health();
      } catch (_) {
        toast("本机 AI 代理未启动：python3 server/proxy.py");
        return;
      }
      try {
        const page = draft.questionPages[0];
        const src = resolveImageSrc(page);
        let result;
        if (src.startsWith("data:")) {
          result = await AI.recognizePage(src);
        } else {
          // 同源样例 URL
          result = await AI.recognizePageFromUrl(src);
        }
        draft.vlPageResult = result;
        draft.ocrReady = true;
        // 把识别框挂到 draft，供后续批改/双存档使用
        draft.vlStemBoxes = (result.questions || []).map((q, i) => ({
          qid: `vl_${i}_${q.no || i}`,
          no: q.no,
          type: q.type,
          stem: q.stemText,
          bbox: q.bbox,
          conf: q.confidence,
          pageIndex: 0,
        }));
        toast(`识别到 ${(result.questions || []).length} 道题干，可继续下一步`);
        renderWizard();
      } catch (err) {
        console.error(err);
        toast(`题干识别失败：${err.message || err}`);
      }
    });

    bindThumbs($("#q-thumbs"), draft.questionPages, (id) => {
      draft.questionPages = draft.questionPages.filter((x) => x.id !== id);
      draft.ocrReady = draft.questionPages.length > 0;
      renderWizard();
    });
    $("#btn-back").onclick = () => goWizardStep(1);
    $("#btn-next").onclick = () => {
      if (!draft.questionPages.length) {
        toast("请先导入至少 1 张题目页");
        return;
      }
      goWizardStep(3);
    };
  }

  /* —— 第 3 步：答案册 或 AI 标准（按模式，不混题库全文） —— */
  function renderWizardStep3(root, draft, footer) {
    ensureStandards(draft, { silent: true });
    const meta = subjectMeta(draft.subjectId);
    const bank = bankOf(draft.subjectId);
    const isB = draft.mode === "no_answer";
    const isMath = draft.subjectId === "hs_math" && draft.dualQuestions?.length;
    const MF = window.MathFormat;

    // 高中数学：在本步展示双存档题卡 + 答案来源
    if (isMath && MF) {
      const qs = draft.dualQuestions;
      root.innerHTML = `
        <div class="card focus-card">
          <div class="card-bd">
            <p class="focus-lead">请老师确认「标准字符化」与参考答案。左侧为原始图片存档（框选区），右侧为可渲染公式；修改 LaTeX 不影响原图存档。</p>
            <div class="confirm-summary">
              <div class="confirm-chip"><span>题目数</span><strong>${qs.length}</strong></div>
              <div class="confirm-chip"><span>答案页</span><strong>${draft.answerPages.length}</strong></div>
              <div class="confirm-chip"><span>已确认</span><strong>${
                qs.filter((q) => q.standard?.confirmed).length
              }</strong></div>
              <div class="confirm-chip"><span>模式</span><strong>${isB ? "B·AI" : "A·答案册"}</strong></div>
            </div>
            <div class="math-q-list horizontal mt-16" id="math-step3-list">
              ${qs
                .map(
                  (q, i) => `
                <button type="button" class="math-q-item ${
                  (state.activeMathQid || qs[0].qid) === q.qid ? "active" : ""
                }" data-qid="${q.qid}" data-i="${i}">
                  <strong>第 ${q.no} 题</strong>
                  ${q.standard?.confirmed ? '<span class="badge ok">已确认</span>' : '<span class="badge review">待确认</span>'}
                </button>`
                )
                .join("")}
            </div>
            <div class="mt-12" id="math-step3-card"></div>
            ${
              !isB
                ? `<div class="mt-16">
                    <div class="small muted">答案册缩略图（${draft.answerPages.length}）</div>
                    <div class="mt-8">${thumbGrid(draft.answerPages, {
                      removable: false,
                      caption: (_, i) => `答案 ${i + 1}`,
                      empty: "无答案页",
                    })}</div>
                  </div>`
                : ""
            }
          </div>
        </div>`;

      const mount = () => {
        const q =
          qs.find((x) => x.qid === state.activeMathQid) || qs[0];
        state.activeMathQid = q?.qid;
        const host = root.querySelector("#math-step3-card");
        if (!host || !q) return;
        MF.mountQuestionCard(host, q, { editable: true });
        MF.bindEditableCard(host, q, () => {});
      };
      mount();
      $$("#math-step3-list .math-q-item", root).forEach((b) => {
        b.onclick = () => {
          state.activeMathQid = b.dataset.qid;
          $$("#math-step3-list .math-q-item", root).forEach((x) =>
            x.classList.toggle("active", x.dataset.qid === b.dataset.qid)
          );
          mount();
        };
      });

      setWizardFooter(footer, {
        hint: "确认字符化后进入任务确认；原图存档始终保留",
        actionsHtml: `
          <button class="btn" id="btn-back">上一步</button>
          <button class="btn" id="btn-confirm-all-math">全部标记已确认</button>
          <button class="btn primary" id="btn-next">下一步：确认任务</button>`,
      });
      $("#btn-back").onclick = () => goWizardStep(2);
      $("#btn-confirm-all-math").onclick = () => {
        qs.forEach((q) => {
          if (q.standard) q.standard.confirmed = true;
        });
        toast("全部题目标准字符化已确认");
        renderWizard();
      };
      $("#btn-next").onclick = () => {
        ensureStandards(draft, { silent: true });
        goWizardStep(4);
      };
      return;
    }

    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          ${
            isB
              ? `
            <p class="focus-lead">模式 B：根据已导入题目，生成 AI 参考答案草稿。本步只核对标准，不上传作业。</p>
            <div class="notice-box">
              <strong>AI 已为 ${bank.length} 道题准备草稿</strong>
              <ul>
                <li>仅供参考，确认任务时表示老师采纳当前标准。</li>
                <li>低置信 / 主观题之后仍会进入人工复核。</li>
              </ul>
            </div>
            <div class="mt-16">
              <div class="section-label-row">
                <div class="small muted">参考答案摘要（可滚动）</div>
                <span class="badge ${draft.aiAnswers.length ? "ok" : "pending"}">${
                  draft.aiAnswers.length ? "已生成" : "生成中"
                }</span>
              </div>
              <div class="generated-answers mt-8 focus-scroll">
                ${
                  draft.aiAnswers.length
                    ? draft.aiAnswers
                        .map(
                          (a) => `
                  <div class="gen-answer-card">
                    <header><strong>第 ${a.no} 题</strong><span class="badge review">AI</span></header>
                    <p>${a.answer}</p>
                  </div>`
                        )
                        .join("")
                    : `<div class="empty-hint">点击下方按钮生成</div>`
                }
              </div>
            </div>`
              : `
            <p class="focus-lead">模式 A：可选导入答案册。不导入也可继续，由 AI 结合题库生成判题标准。</p>
            <div class="upload-zone upload-zone-wide" id="zone-answers">
              <strong>答案册（可选）</strong>
              <p class="small muted">导入后可提高判分置信度 · ${meta.name}</p>
              <input type="file" id="file-answers" accept="image/*" multiple hidden />
              <div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
                <button type="button" class="btn primary" id="btn-pick-a">选择答案图片</button>
                <button type="button" class="btn" id="btn-sample-a">导入样例答案</button>
              </div>
            </div>
            <div class="mt-16">
              <div class="section-label-row">
                <div class="small muted">已导入答案 ${draft.answerPages.length} 张</div>
                <span class="badge ${draft.rubricReady ? "ok" : "pending"}">${
                  draft.rubricReady ? "标准就绪" : "待就绪"
                }</span>
              </div>
              <div class="mt-8" id="a-thumbs">${thumbGrid(draft.answerPages, {
                removable: true,
                caption: (_, i) => `答案 ${i + 1}`,
                empty: "未导入答案册（可跳过）",
              })}</div>
            </div>`
          }
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: isB
        ? draft.aiAnswers.length
          ? `AI 草稿 ${draft.aiAnswers.length} 题 · 下一步确认任务`
          : "请生成 AI 参考答案"
        : draft.answerPages.length
          ? `答案 ${draft.answerPages.length} 张 · 标准已就绪`
          : "答案册可选，可直接下一步",
      actionsHtml: `
        <button class="btn" id="btn-back">上一步</button>
        ${
          isB
            ? `<button class="btn" id="btn-regen">重新生成 AI 标准</button>`
            : `<button class="btn" id="btn-ai-standard">生成 / 刷新判题标准</button>`
        }
        <button class="btn primary" id="btn-next">下一步：确认任务</button>`,
    });

    if (isB) {
      $("#btn-regen").onclick = () => {
        draft.aiAnswers = [];
        draft.rubricReady = false;
        ensureStandards(draft);
        toast("已重新生成 AI 参考答案与判题标准");
        renderWizard();
      };
    } else {
      $("#btn-pick-a").onclick = () => $("#file-answers").click();
      $("#file-answers").onchange = async (e) => {
        const imgs = await readFilesAsImages(e.target.files);
        draft.answerPages = draft.answerPages.concat(imgs);
        ensureStandards(draft, { silent: true });
        toast(`已导入 ${imgs.length} 张答案页`);
        renderWizard();
      };
      $("#btn-sample-a").onclick = async () => {
        const imgs = await loadSampleImages(meta.answerPages);
        draft.answerPages = imgs;
        ensureStandards(draft, { silent: true });
        toast(`已导入 ${imgs.length} 张样例答案`);
        renderWizard();
      };
      bindThumbs($("#a-thumbs"), draft.answerPages, (id) => {
        draft.answerPages = draft.answerPages.filter((x) => x.id !== id);
        renderWizard();
      });
      $("#btn-ai-standard").onclick = () => {
        ensureStandards(draft);
        toast("已生成判题标准");
        renderWizard();
      };
    }

    $("#btn-back").onclick = () => goWizardStep(2);
    $("#btn-next").onclick = () => {
      ensureStandards(draft, { silent: true });
      goWizardStep(4);
    };
  }

  /* —— 第 4 步：精简确认 —— */
  function renderWizardStep4(root, draft, footer) {
    if (draft.questionPages.length) ensureStandards(draft, { silent: true });
    const bank = bankOf(draft.subjectId);
    const canConfirm = draft.questionPages.length > 0;
    const answerSrc =
      draft.mode === "no_answer"
        ? `AI 草稿 ${draft.aiAnswers.length || bank.length} 题`
        : draft.answerPages.length
          ? `答案册 ${draft.answerPages.length} 张`
          : "题库默认参考";

    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <p class="focus-lead">核对摘要后生成任务。确认后才可上传同学作业。</p>
          <div class="confirm-fields">
            <label class="confirm-field">
              <span class="muted small">任务名称</span>
              <input class="text-input" id="task-title" value="${draft.title}" />
            </label>
          </div>
          <div class="confirm-summary mt-16">
            <div class="confirm-chip"><span>学科</span><strong>${draft.subjectName}</strong></div>
            <div class="confirm-chip"><span>模式</span><strong>${modeLabel(draft.mode)}</strong></div>
            <div class="confirm-chip"><span>班级</span><strong>${draft.className}</strong></div>
            <div class="confirm-chip"><span>题目</span><strong>${draft.questionPages.length} 张 · ${bank.length} 题</strong></div>
            <div class="confirm-chip"><span>答案来源</span><strong>${answerSrc}</strong></div>
            <div class="confirm-chip"><span>学生</span><strong>${(draft.students || []).length} 人</strong></div>
          </div>
          <div class="notice-box mt-16">
            <strong>确认即表示</strong>
            <ul>
              <li>生成<strong>一次</strong>批改任务，进入上传作业。</li>
              <li>模式 B 的 AI 答案视为已采纳草稿。</li>
              <li>主观题与低置信结果仍会进入复核。</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: canConfirm
        ? "确认后进入上传作业"
        : "请先返回导入题目",
      actionsHtml: `
        <button class="btn" id="btn-back">上一步</button>
        <button class="btn primary" id="btn-confirm-task" ${canConfirm ? "" : "disabled"}>确认并生成任务</button>`,
    });

    const goBack = () => goWizardStep(3);
    const confirmTask = () => {
      try {
        if (!draft.questionPages.length) {
          toast("请先导入题目");
          return;
        }
        ensureStandards(draft, { silent: true });
        draft.title = ($("#task-title")?.value || "").trim() || draft.title;
        draft.status = "confirmed";
        draft.confirmedAt = new Date().toISOString();
        draft.rubricReady = true;
        const toSave = {
          ...draft,
          submissions: {},
          workPages: draft.workPages || [],
          analytics: null,
          vlPageResult: draft.vlPageResult || null,
          vlStemBoxes: draft.vlStemBoxes || null,
        };
        upsertTask(toSave);
        state.draft = draft;
        state.activeTaskId = draft.id;
        updatePills();
        toast("任务已生成，请上传同学作业");
        goWizardStep(5);
      } catch (err) {
        console.error(err);
        toast("生成任务失败：" + (err?.message || String(err)));
      }
    };

    $("#btn-back").onclick = goBack;
    $("#btn-confirm-task").onclick = confirmTask;
    if (footer) {
      footer.onclick = (e) => {
        const t = e.target.closest("button");
        if (!t) return;
        if (t.id === "btn-back") goBack();
        if (t.id === "btn-confirm-task") confirmTask();
      };
    }
  }

  /* —— 第 5 步：只上传作业 —— */
  function renderWizardStep5(root, draft, footer) {
    let task = getTasks().find((t) => t.id === draft.id) || draft;
    const nWork = (task.workPages || []).length;

    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <p class="focus-lead">上传本班同学作业。批改结果在下一步查看。</p>
          <div class="confirm-summary" style="margin-bottom:16px">
            <div class="confirm-chip"><span>任务</span><strong>${task.title}</strong></div>
            <div class="confirm-chip"><span>每生页数</span><strong>${task.pagesPerStudent || 2}</strong></div>
            <div class="confirm-chip"><span>已上传</span><strong>${nWork} 页</strong></div>
          </div>
          <div class="upload-zone upload-zone-wide" id="zone-work">
            <strong>批量上传作业图片</strong>
            <p class="muted small">支持多选，按每生页数自动归属学生。</p>
            <input type="file" id="file-work" accept="image/*" multiple hidden />
            <div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="btn primary" id="btn-pick-work">选择作业图片</button>
              <button type="button" class="btn" id="btn-sample-work">导入样例作业</button>
            </div>
          </div>
          <div class="mt-16">
            <div class="section-label-row">
              <div class="small muted">待批改（${nWork}）</div>
              <button type="button" class="btn" id="btn-clear-work" ${nWork ? "" : "disabled"}>清空</button>
            </div>
            <div class="mt-8" id="work-thumbs">${thumbGrid(task.workPages || [], {
              removable: true,
              caption: (_, i) => `作业 ${i + 1}`,
              empty: "还没有作业图片",
            })}</div>
          </div>
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: nWork ? `已上传 ${nWork} 页，可开始批改` : "请上传作业或导入样例",
      actionsHtml: `
        <button class="btn" id="btn-back">上一步</button>
        <button class="btn primary" id="btn-grade-footer" ${nWork ? "" : "disabled"}>开始批改</button>`,
    });

    draft.workPages = task.workPages || [];
    draft.submissions = task.submissions || {};
    draft.analytics = task.analytics;
    draft.status = task.status;

    bindThumbs($("#work-thumbs"), draft.workPages, (id) => {
      draft.workPages = draft.workPages.filter((x) => x.id !== id);
      task.workPages = draft.workPages;
      task.submissions = {};
      task.analytics = null;
      if (task.status === "done") task.status = "confirmed";
      draft.submissions = {};
      upsertTask(task);
      renderWizard();
    });

    $("#btn-pick-work").onclick = () => $("#file-work").click();
    $("#file-work").onchange = async (e) => {
      const imgs = await readFilesAsImages(e.target.files);
      draft.workPages = (draft.workPages || []).concat(imgs);
      task.workPages = draft.workPages;
      task.submissions = {};
      task.analytics = null;
      task.status = "confirmed";
      upsertTask(task);
      toast(`已添加 ${imgs.length} 张作业`);
      renderWizard();
    };

    $("#btn-sample-work").onclick = async () => {
      toast("正在导入样例作业…");
      const meta = subjectMeta(task.subjectId);
      const paths = [];
      (D.captureQueue[task.subjectId] || []).forEach((q) => q.pages.forEach((p) => paths.push(p)));
      if (paths.length < 4) {
        meta.blankPages.concat(meta.answerPages).forEach((p) => {
          if (paths.length < 6) paths.push(p);
        });
      }
      const imgs = await loadSampleImages(paths.slice(0, 6));
      draft.workPages = imgs;
      task.workPages = imgs;
      upsertTask(task);
      toast(`已导入 ${imgs.length} 张样例作业`);
      renderWizard();
    };

    $("#btn-clear-work").onclick = () => {
      draft.workPages = [];
      task.workPages = [];
      task.submissions = {};
      task.analytics = null;
      task.status = "confirmed";
      upsertTask(task);
      renderWizard();
    };

    $("#btn-back").onclick = () => goWizardStep(4);
    $("#btn-grade-footer").onclick = () => {
      if (!(task.workPages || []).length) {
        toast("请先上传作业图片");
        return;
      }
      toast("正在批改…");
      Object.assign(task, {
        mode: draft.mode,
        title: draft.title,
        questionPages: draft.questionPages,
        answerPages: draft.answerPages,
        aiAnswers: draft.aiAnswers,
      });
      runGrading(task);
      state.draft = task;
      state.activeTaskId = task.id;
      state.reviewStudentId = Object.keys(task.submissions)[0] || null;
      toast(`批改完成：${Object.keys(task.submissions).length} 名学生`);
      goWizardStep(6);
    };
  }

  /* —— 第 6 步：只看结果 —— */
  function renderWizardStep6(root, draft, footer) {
    let task = getTasks().find((t) => t.id === draft.id) || draft;
    const nSub = Object.keys(task.submissions || {}).length;
    const nWork = (task.workPages || []).length;

    if (!nSub) {
      root.innerHTML = `
        <div class="card focus-card"><div class="card-bd">
          <div class="empty-hint">还没有批改结果。</div>
          <p class="small muted mt-12" style="text-align:center">请先上传作业并完成批改。</p>
        </div></div>`;
      setWizardFooter(footer, {
        hint: nWork ? "已有作业页，可返回上传步批改" : "暂无数据",
        actionsHtml: `
          <button class="btn" id="btn-back">返回上传</button>
          <button class="btn primary" id="btn-grade-now" ${nWork ? "" : "disabled"}>开始批改</button>`,
      });
      $("#btn-back").onclick = () => goWizardStep(5);
      $("#btn-grade-now").onclick = () => {
        if (!nWork) return;
        state.wizardStep = 5;
        renderWizard();
        setTimeout(() => $("#btn-grade-footer")?.click(), 50);
      };
      return;
    }

    root.innerHTML = `
      <div class="card focus-card">
        <div class="card-bd">
          <div class="result-banner">
            <div>
              <strong>批改完成</strong>
              <p class="muted small" style="margin:4px 0 0">
                ${nSub} 名学生 · 均分 ${task.analytics?.avgScore ?? "—"} · ${task.title}
              </p>
            </div>
          </div>
          <div class="mt-16">
            <div class="small muted">成绩一览</div>
            <table class="table mt-8">
              <thead><tr><th>学生</th><th>学号</th><th>得分</th><th>状态</th></tr></thead>
              <tbody>
                ${Object.values(task.submissions)
                  .map(
                    (s) => `
                  <tr>
                    <td>${s.name}</td>
                    <td>${s.no || "—"}</td>
                    <td>${s.totalScore}/${s.maxScore}</td>
                    <td>${s.status === "review" ? "待复核" : "完成"}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    setWizardFooter(footer, {
      hint: `批改完成 · ${nSub} 人 · 均分 ${task.analytics?.avgScore ?? "—"}`,
      actionsHtml: `
        <button class="btn" id="btn-back">返回上传</button>
        <button class="btn" id="btn-goto-analytics">学情报告</button>
        <button class="btn primary" id="btn-goto-review">逐题复核</button>`,
    });

    $("#btn-back").onclick = () => goWizardStep(5);
    $("#btn-goto-review").onclick = () => {
      state.activeTaskId = task.id;
      state.reviewStudentId = Object.keys(task.submissions)[0] || null;
      setPanel("review");
    };
    $("#btn-goto-analytics").onclick = () => {
      state.activeTaskId = task.id;
      setPanel("analytics");
    };
  }

  /* ========== TASKS ========== */
  function renderTasks() {
    const root = $("#grade-view-tasks");
    if (!root) return;
    const tasks = getTasks();
    root.innerHTML = `
      <div class="card">
        <div class="card-hd">
          <h3>本地批改任务</h3>
          <button class="btn primary" data-go="wizard">新建导入</button>
        </div>
        <div class="card-bd">
          ${
            tasks.length
              ? `<div class="list">${tasks
                  .map(
                    (t) => `
                <div class="list-item">
                  <header>
                    <strong>${t.title}</strong>
                    ${statusBadge(t.status)}
                  </header>
                  <div class="small muted">
                    ${t.subjectName} · ${modeLabel(t.mode)} · 题目 ${t.questionPages?.length || 0} 页 ·
                    作业 ${t.workPages?.length || 0} 页 · 结果 ${Object.keys(t.submissions || {}).length} 人
                  </div>
                  <div class="small muted">创建于 ${new Date(t.createdAt).toLocaleString()}</div>
                  <div class="mt-8" style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn" data-continue="${t.id}">继续上传</button>
                    <button class="btn primary" data-review="${t.id}" ${
                      Object.keys(t.submissions || {}).length ? "" : "disabled"
                    }>批改复核</button>
                    <button class="btn" data-analytics="${t.id}" ${
                      t.analytics ? "" : "disabled"
                    }>学情</button>
                    <button class="btn" data-del="${t.id}">删除</button>
                  </div>
                </div>`
                  )
                  .join("")}</div>`
              : `<div class="empty-hint">暂无任务。<button class="btn primary mt-12" data-go="wizard">去导入一次批改</button></div>`
          }
        </div>
      </div>
    `;
    $$("[data-go]", root).forEach((b) => b.addEventListener("click", () => {
      state.wizardStep = 1;
      state.draft = newDraft();
      setPanel("wizard");
    }));
    $$("[data-continue]", root).forEach((b) =>
      b.addEventListener("click", () => {
        const t = getTasks().find((x) => x.id === b.dataset.continue);
        state.draft = JSON.parse(JSON.stringify(t));
        state.activeTaskId = t.id;
        // draft→第1步；已确认未批改→上传；已有结果→结果页
        if (t.status === "draft") state.wizardStep = 1;
        else if (Object.keys(t.submissions || {}).length) state.wizardStep = 6;
        else state.wizardStep = 5;
        setPanel("wizard");
      })
    );
    $$("[data-review]", root).forEach((b) =>
      b.addEventListener("click", () => {
        state.activeTaskId = b.dataset.review;
        const t = getActiveTask();
        state.reviewStudentId = Object.keys(t?.submissions || {})[0] || null;
        setPanel("review");
      })
    );
    $$("[data-analytics]", root).forEach((b) =>
      b.addEventListener("click", () => {
        state.activeTaskId = b.dataset.analytics;
        setPanel("analytics");
      })
    );
    $$("[data-del]", root).forEach((b) =>
      b.addEventListener("click", () => {
        const tasks = getTasks().filter((t) => t.id !== b.dataset.del);
        saveTasks(tasks);
        if (state.activeTaskId === b.dataset.del) state.activeTaskId = null;
        toast("已删除");
        renderTasks();
      })
    );
  }

  /* ========== REVIEW ========== */
  function getScore(sub, item, taskId) {
    const key = `${taskId}:${sub.studentId}:${item.qid}`;
    if (state.overrides[key] != null) return state.overrides[key];
    return item.score;
  }

  function totalOf(sub, taskId) {
    return sub.items.reduce((s, it) => s + getScore(sub, it, taskId), 0);
  }

  /**
   * 确保 submission 的 items 带题干框（兼容旧 localStorage 任务）
   */
  function ensureStemBoxesOnSubmission(task, sub) {
    if (!sub?.items?.length) return sub;
    const bank = bankOf(task.subjectId);
    const pageCount = Math.max(1, (sub.pages || []).length);
    const need = sub.items.some((it) => !it.bbox);
    if (!need) return sub;

    // 优先：任务上挂载的 VL 真识别框（按题号对齐）
    const vlBoxes = task.vlStemBoxes || task.vlPageResult?.questions || [];
    if (vlBoxes.length) {
      const byNo = {};
      vlBoxes.forEach((b) => {
        const no = String(b.no || "").trim();
        if (no) byNo[no] = b.bbox ? b : { ...b, bbox: b.bbox };
      });
      sub.items = sub.items.map((it) => {
        if (it.bbox) return it;
        const q = bank.find((x) => x.id === it.qid);
        const no = String(q?.no || "").trim();
        const hit = byNo[no] || vlBoxes[sub.items.indexOf(it)];
        const bbox = hit?.bbox || hit;
        if (!bbox || typeof bbox.x !== "number") return it;
        return {
          ...it,
          bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
          pageIndex: hit.pageIndex ?? 0,
          stemDetect: {
            source: "qwen-vl",
            conf: hit.confidence ?? hit.conf ?? 0.85,
            label: `题干 · 第 ${no || "?"} 题 · VL`,
          },
          evidence: `题 ${no} 题干框 · 通义千问 VL`,
        };
      });
    }

    // 仍缺框：启发式补全
    if (sub.items.some((it) => !it.bbox)) {
      sub.items = G.attachStemBBoxes(sub.items, bank, pageCount);
    }
    if (task.submissions?.[sub.studentId]) {
      task.submissions[sub.studentId] = sub;
      upsertTask(task);
    }
    return sub;
  }

  /**
   * 在原图上叠题干识别框（相对图片显示区域定位）
   * 框 = 题干区域中段；点击框与右侧题卡联动
   */
  function mountStemBoxOverlay(viewerEl, pageImgEl, items, pageIndex, activeQid) {
    if (!viewerEl || !pageImgEl) return;

    // 用 stage 包住 img + layer，避免 grid 布局干扰绝对定位
    let stage = viewerEl.querySelector(".page-viewer-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.className = "page-viewer-stage";
      pageImgEl.replaceWith(stage);
      stage.appendChild(pageImgEl);
    }
    let layer = stage.querySelector(".stem-box-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "stem-box-layer";
      stage.appendChild(layer);
    }

    const paint = () => {
      // 框坐标相对「图片自然显示框」：stage 与 img 同尺寸时直接用 0~1 * 尺寸
      const iw = pageImgEl.clientWidth || pageImgEl.getBoundingClientRect().width;
      const ih = pageImgEl.clientHeight || pageImgEl.getBoundingClientRect().height;
      if (!iw || !ih) return;

      // stage 贴合图片尺寸
      stage.style.width = `${iw}px`;
      stage.style.height = `${ih}px`;

      const pageItems = (items || []).filter(
        (it) => (it.pageIndex ?? 0) === pageIndex && it.bbox
      );
      layer.innerHTML = pageItems
        .map((it) => {
          const b = it.bbox;
          const left = b.x * iw;
          const top = b.y * ih;
          const w = b.w * iw;
          const h = b.h * ih;
          const active = it.qid === activeQid ? "active" : "";
          const st = it.status || "partial";
          const conf = it.stemDetect?.conf
            ? Math.round(it.stemDetect.conf * 100)
            : Math.round((it.confidence || 0.8) * 100);
          const tag = it.stemDetect?.label || it.evidence || "题干框";
          return `<button type="button" class="stem-box ${st} ${active}" data-qid="${it.qid}"
            style="left:${left}px;top:${top}px;width:${w}px;height:${h}px"
            title="点击定位到右侧题卡">
            <span class="stem-box-label">${tag} · ${conf}%</span>
          </button>`;
        })
        .join("");

      layer.querySelectorAll(".stem-box").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          state.activeQid = btn.dataset.qid;
          state._followStemPage = true;
          const it = (items || []).find((x) => x.qid === btn.dataset.qid);
          if (it && typeof it.pageIndex === "number") {
            state.reviewPageIndex = it.pageIndex;
          }
          renderReview();
        };
      });
    };

    if (pageImgEl.complete && pageImgEl.naturalWidth) {
      paint();
    } else {
      pageImgEl.onload = () => paint();
    }
    requestAnimationFrame(() => {
      paint();
      // 图片解码后再量一次尺寸
      setTimeout(paint, 50);
    });
    return paint;
  }

  function renderReview() {
    const root = $("#grade-view-review");
    if (!root) return;
    const task = getActiveTask();
    if (!task || !Object.keys(task.submissions || {}).length) {
      root.innerHTML = `
        <div class="card"><div class="card-bd">
          <div class="empty-hint">还没有批改结果。请先在「导入批改」上传作业并完成批改。</div>
          <div class="mt-16" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" id="btn-go-import">去导入批改</button>
            <button class="btn" id="btn-quick-a">一键演示 · 模式 A</button>
            <button class="btn" id="btn-quick-hs">演示 · 高中语文（含题干框）</button>
          </div>
        </div></div>`;
      $("#btn-go-import")?.addEventListener("click", () => setNav("grade", "wizard"));
      $("#btn-quick-a")?.addEventListener("click", () => quickDemo("math", "with_answer"));
      $("#btn-quick-hs")?.addEventListener("click", () => quickDemo("hs_chinese", "with_answer"));
      return;
    }

    const bank = bankOf(task.subjectId);
    const ids = Object.keys(task.submissions);
    if (!state.reviewStudentId || !task.submissions[state.reviewStudentId]) {
      state.reviewStudentId = ids[0];
    }
    let sub = task.submissions[state.reviewStudentId];
    sub = ensureStemBoxesOnSubmission(task, sub);
    if (state.reviewPageIndex == null) state.reviewPageIndex = 0;
    if (state.reviewPageIndex >= (sub.pages || []).length) state.reviewPageIndex = 0;

    if (!state.activeQid) state.activeQid = sub.items[0]?.qid;
    let activeItem = sub.items.find((i) => i.qid === state.activeQid) || sub.items[0];
    // 点题卡时自动切到该题所在页
    if (activeItem && typeof activeItem.pageIndex === "number") {
      // 仅当切换题目时跟随；手动切页保留 reviewPageIndex 除非 active 不在当前页
      const onPage = (activeItem.pageIndex ?? 0) === state.reviewPageIndex;
      if (!onPage && state._followStemPage !== false) {
        state.reviewPageIndex = activeItem.pageIndex ?? 0;
      }
    }
    const pageIndex = state.reviewPageIndex || 0;
    const pageSrc = sub.pages[pageIndex] || sub.pages[0];
    const activeQ = bank.find((q) => q.id === activeItem.qid);
    const score = getScore(sub, activeItem, task.id);
    const reviewCount = sub.items.filter((i) => i.needReview || i.confidence < 0.8).length;
    const boxesOnPage = sub.items.filter((it) => (it.pageIndex ?? 0) === pageIndex && it.bbox).length;

    root.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="label">任务</div><div class="value" style="font-size:16px">${task.title}</div></div>
        <div class="stat"><div class="label">模式</div><div class="value" style="font-size:16px">${
          task.mode === "no_answer" ? "B" : "A"
        }</div></div>
        <div class="stat"><div class="label">学生</div><div class="value" style="font-size:20px">${sub.name}</div></div>
        <div class="stat"><div class="label">得分</div><div class="value">${totalOf(sub, task.id)}<span class="small muted">/${sub.maxScore}</span></div></div>
      </div>

      <div class="grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-hd"><h3>学生</h3><span class="small muted">待复核题 ${reviewCount}</span></div>
          <div class="card-bd" style="display:flex;gap:8px;flex-wrap:wrap">
            ${ids
              .map((id) => {
                const s = task.submissions[id];
                return `<button class="btn ${id === state.reviewStudentId ? "primary" : ""}" data-stu="${id}">
                  ${s.name} · ${totalOf(s, task.id)}/${s.maxScore}
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h3>总评</h3></div>
          <div class="card-bd">
            <p style="margin:0;line-height:1.6">${sub.comment}</p>
            <div class="tags mt-12">${(sub.weakPoints || []).map((w) => `<span class="tag">${w}</span>`).join("")}</div>
          </div>
        </div>
      </div>

      <div class="review-layout">
        <div>
          <div class="stem-detect-bar">
            <div>
              <strong>题干框识别</strong>
              <span class="small muted"> · 在原图上框出每道题的题干区域（中段）· 本页 ${boxesOnPage} 框</span>
            </div>
            <label class="stem-toggle">
              <input type="checkbox" id="toggle-stem-boxes" ${state.hideStemBoxes ? "" : "checked"} />
              显示题干框
            </label>
          </div>
          <div class="page-viewer" id="review-page-viewer">
            <div class="page-viewer-stage">
              <img src="${pageSrc}" alt="page" id="review-main-img" />
              <div class="stem-box-layer" aria-hidden="true"></div>
            </div>
          </div>
          <div class="sample-grid mt-12">
            ${(sub.pages || [])
              .map(
                (p, i) => `
              <figure class="page-thumb ${i === pageIndex ? "is-active" : ""}" data-page-index="${i}" data-src="${p}" style="cursor:pointer">
                <img src="${p}" alt="p${i}" />
                <figcaption>作答页 ${i + 1}${
                  sub.items.some((it) => (it.pageIndex ?? 0) === i)
                    ? ` · ${sub.items.filter((it) => (it.pageIndex ?? 0) === i).length} 题干`
                    : ""
                }</figcaption>
              </figure>`
              )
              .join("")}
          </div>
          <p class="small muted mt-8" style="margin:8px 0 0">
            提示：蓝/绿/红框表示题干识别范围；点击框或右侧题卡可联动高亮。框位置对应「题号后题干正文」的中段区域。
          </p>
        </div>
        <div class="q-list">
          ${sub.items
            .map((it) => {
              const q = bank.find((x) => x.id === it.qid);
              const sc = getScore(sub, it, task.id);
              const active = it.qid === activeItem.qid;
              const onCur = (it.pageIndex ?? 0) === pageIndex;
              return `
              <div class="q-card ${active ? "active" : ""}" data-qid="${it.qid}">
                <h4>第 ${q?.no} 题 · ${q?.type}
                  <span class="badge ${it.status}">${sc}/${it.maxScore}</span>
                </h4>
                <div class="q-meta">
                  <span class="badge ${it.status}">${
                    { correct: "正确", partial: "部分正确", wrong: "错误" }[it.status]
                  }</span>
                  <span class="badge ${it.confidence < 0.8 ? "review" : "ok"}">置信度 ${Math.round(
                    it.confidence * 100
                  )}%</span>
                  ${it.needReview ? `<span class="badge review">需复核</span>` : ""}
                  ${
                    it.bbox
                      ? `<span class="badge ${onCur ? "ok" : "pending"}">题干框 · 页${
                          (it.pageIndex ?? 0) + 1
                        }</span>`
                      : ""
                  }
                </div>
                <p><strong>识别：</strong>${it.ocr}</p>
                <p class="mt-8"><strong>证据：</strong>${it.evidence || "题干框"}</p>
                ${
                  it.bbox
                    ? `<p class="small muted mt-8">框坐标 (相对图) x=${(it.bbox.x * 100).toFixed(
                        0
                      )}% y=${(it.bbox.y * 100).toFixed(0)}% · w=${(it.bbox.w * 100).toFixed(
                        0
                      )}% h=${(it.bbox.h * 100).toFixed(0)}%</p>`
                    : ""
                }
                <div class="steps">
                  ${(it.steps || [])
                    .map(
                      (st) =>
                        `<div class="step ${st.ok ? "ok" : "bad"}"><span>${st.ok ? "✓" : "✗"} ${st.text}${
                          st.reason ? " · " + st.reason : ""
                        }</span><span>${st.score} 分</span></div>`
                    )
                    .join("")}
                </div>
                <p class="mt-8"><strong>评语：</strong>${it.comment}</p>
                ${
                  active
                    ? `<div class="score-edit">
                        <label class="small">改分</label>
                        <input type="number" min="0" max="${it.maxScore}" value="${sc}" id="score-input" />
                        <button class="btn primary" id="btn-save-score">保存</button>
                      </div>`
                    : ""
                }
              </div>`;
            })
            .join("")}
          <div class="mt-12"><button class="btn primary" id="btn-to-an">查看学情</button></div>
        </div>
      </div>
    `;

    const viewer = root.querySelector("#review-page-viewer");
    const mainImg = root.querySelector("#review-main-img");
    if (!state.hideStemBoxes) {
      mountStemBoxOverlay(viewer, mainImg, sub.items, pageIndex, activeItem.qid);
    }

    $("#toggle-stem-boxes")?.addEventListener("change", (e) => {
      state.hideStemBoxes = !e.target.checked;
      renderReview();
    });

    $$("[data-stu]", root).forEach((b) => {
      b.onclick = () => {
        state.reviewStudentId = b.dataset.stu;
        state.activeQid = null;
        state.reviewPageIndex = 0;
        renderReview();
      };
    });
    $$(".q-card[data-qid]", root).forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest("input,button")) return;
        state.activeQid = card.dataset.qid;
        state._followStemPage = true;
        const it = sub.items.find((x) => x.qid === card.dataset.qid);
        if (it && typeof it.pageIndex === "number") {
          state.reviewPageIndex = it.pageIndex;
        }
        renderReview();
      };
    });
    $$(".page-thumb", root).forEach((fig) => {
      fig.onclick = () => {
        state.reviewPageIndex = Number(fig.dataset.pageIndex) || 0;
        state._followStemPage = false;
        // 若当前题不在该页，选中该页第一框
        const first = sub.items.find((it) => (it.pageIndex ?? 0) === state.reviewPageIndex);
        if (first) state.activeQid = first.qid;
        renderReview();
      };
    });
    $("#btn-save-score")?.addEventListener("click", () => {
      const v = Number($("#score-input").value);
      const key = `${task.id}:${sub.studentId}:${activeItem.qid}`;
      state.overrides[key] = Math.max(0, Math.min(activeItem.maxScore, v));
      toast(`已改分：第 ${activeQ?.no} 题 → ${state.overrides[key]} 分`);
      renderReview();
    });
    $("#btn-to-an").onclick = () => setNav("dashboard");

    // 窗口尺寸变化时重绘框
    if (state._stemResizeHandler) {
      window.removeEventListener("resize", state._stemResizeHandler);
    }
    state._stemResizeHandler = () => {
      if (state.gradeTab === "review" && !state.hideStemBoxes) {
        const v = document.querySelector("#review-page-viewer");
        const img = document.querySelector("#review-main-img");
        if (v && img) {
          mountStemBoxOverlay(v, img, sub.items, state.reviewPageIndex || 0, state.activeQid);
        }
      }
    };
    window.addEventListener("resize", state._stemResizeHandler);
  }

  /* ========== ANALYTICS / DASHBOARD ========== */
  function buildAnalyticsHTML(task, a) {
    return `
      <div class="stat-row">
        <div class="stat"><div class="label">班级</div><div class="value" style="font-size:18px">${task.className || "—"}</div></div>
        <div class="stat"><div class="label">班级均分</div><div class="value">${a.avgScore}</div></div>
        <div class="stat"><div class="label">得分率</div><div class="value">${Math.round(a.avgRate * 100)}%</div></div>
        <div class="stat"><div class="label">需优先关注</div><div class="value">${a.focusStudents.length}</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-hd"><h3>知识点掌握率</h3></div>
          <div class="card-bd bars">
            ${a.knowledge
              .map(
                (k) => `
              <div class="bar-row">
                <div>${k.name}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.round(k.mastery * 100)}%"></div></div>
                <div>${Math.round(k.mastery * 100)}%</div>
              </div>`
              )
              .join("")}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h3>需优先关注</h3></div>
          <div class="card-bd">
            <table class="table">
              <thead><tr><th>学生</th><th>得分</th><th>原因</th></tr></thead>
              <tbody>
                ${a.focusStudents
                  .map((s) => `<tr><td>${s.name}</td><td>${s.score ?? "—"}</td><td>${s.reason}</td></tr>`)
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="grid-2 mt-16">
        <div class="card">
          <div class="card-hd"><h3>高失分题</h3></div>
          <div class="card-bd">
            <table class="table">
              <thead><tr><th>题号</th><th>题目</th><th>失分率</th><th>主错因</th></tr></thead>
              <tbody>
                ${a.hardQuestions
                  .map(
                    (q) =>
                      `<tr><td>${q.no}</td><td>${q.title}</td><td>${Math.round(q.wrongRate * 100)}%</td><td>${q.error}</td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="tags mt-12">${(a.commonErrors || []).map((e) => `<span class="tag">${e}</span>`).join("")}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h3>讲评建议</h3></div>
          <div class="card-bd">
            <ol style="margin:0;padding-left:18px;line-height:1.7">
              ${(a.teachingAdvice || []).map((t) => `<li>${t}</li>`).join("")}
            </ol>
          </div>
        </div>
      </div>
      <div class="card mt-16">
        <div class="card-hd">
          <h3>飞书同步摘要</h3>
          <div style="display:flex;gap:8px">
            <button class="btn" id="btn-copy">复制</button>
            <button class="btn primary" id="btn-sync">模拟同步到多维表格</button>
          </div>
        </div>
        <div class="card-bd">
          <div class="feishu-box"><pre id="feishu-summary">${a.feishuSummary}</pre></div>
        </div>
      </div>`;
  }

  function bindAnalyticsActions(root, a) {
    root.querySelector("#btn-copy")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(a.feishuSummary);
        toast("已复制");
      } catch {
        toast("复制失败");
      }
    });
    root.querySelector("#btn-sync")?.addEventListener("click", () => {
      toast("Demo：已模拟写入飞书多维表格并创建复核待办");
    });
  }

  function renderAnalytics() {
    renderAnalyticsInto($("#dashboard-body") || $("#grade-view-review"));
  }

  function renderAnalyticsInto(root) {
    if (!root) return;
    const task = getActiveTask();
    const a = task?.analytics;
    if (!a) {
      root.innerHTML = `<div class="card"><div class="card-bd"><div class="empty-hint">暂无学情。请先在「改作业」中完成一次批改。</div>
        <div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="btn-go-grade">去改作业</button>
          <button class="btn" id="btn-quick-demo">一键演示生成数据</button>
        </div></div></div>`;
      root.querySelector("#btn-go-grade")?.addEventListener("click", () => setNav("grade", "wizard"));
      root.querySelector("#btn-quick-demo")?.addEventListener("click", () => quickDemo("math", "with_answer"));
      return;
    }
    root.innerHTML = buildAnalyticsHTML(task, a);
    bindAnalyticsActions(root, a);
  }

  /* ========== 班级弹窗 ========== */
  function openClassModal() {
    state.classModalOpen = true;
    renderClassModal();
  }

  function closeClassModal(discard = true) {
    state.classModalOpen = false;
    if (discard) {
      state._rosterEdit = null;
      state._rosterClassId = null;
    }
    const root = $("#modal-root");
    if (root) root.innerHTML = "";
  }

  function renderClassModal() {
    const root = $("#modal-root");
    if (!root) return;
    const classes = getClasses();
    const active = getActiveClass();
    // 编辑副本
    if (!state._rosterEdit) {
      state._rosterEdit = JSON.parse(JSON.stringify(active.students || []));
      state._rosterClassId = active.id;
    }
    if (state._rosterClassId !== active.id) {
      state._rosterEdit = JSON.parse(JSON.stringify(active.students || []));
      state._rosterClassId = active.id;
    }
    const roster = state._rosterEdit;

    root.innerHTML = `
      <div class="modal-overlay" id="class-modal">
        <div class="modal-panel class-modal" role="dialog" aria-modal="true" aria-label="班级名单">
          <div class="modal-hd">
            <div>
              <h3 style="margin:0">班级与名单</h3>
              <p class="small muted" style="margin:4px 0 0">点击班级切换；名单可拍照导入，识别错误可手动改。</p>
            </div>
            <button type="button" class="btn" id="btn-close-class">关闭</button>
          </div>
          <div class="modal-bd">
            <div class="class-list-col">
              <div class="small muted" style="margin-bottom:8px">选择班级</div>
              ${classes
                .map(
                  (c) => `
                <button type="button" class="class-list-item ${c.id === active.id ? "active" : ""}" data-class-id="${c.id}">
                  <strong>${c.name}</strong>
                  <span class="small muted">${c.students.length} 人 · ${c.grade}</span>
                </button>`
                )
                .join("")}
              <button type="button" class="btn mt-12" id="btn-add-class" style="width:100%">+ 新建班级</button>
            </div>
            <div class="roster-col">
              <div class="roster-toolbar">
                <div>
                  <strong>${active.name}</strong>
                  <span class="small muted"> · ${roster.length} 人</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button type="button" class="btn" id="btn-photo-roster">拍照导入名单</button>
                  <input type="file" id="file-roster" accept="image/*" hidden />
                  <button type="button" class="btn" id="btn-add-student">添加学生</button>
                  <button type="button" class="btn" id="btn-sample-roster">演示·无学号</button>
                  <button type="button" class="btn" id="btn-sample-roster-with-no">演示·有学号</button>
                </div>
              </div>
              <div class="roster-hint small muted">
                <strong>学号规则：</strong>识别到学号则填入；素材没有则<strong>留空</strong>，可点表格手动补改。低置信姓名标黄。
                ${
                  roster.some((s) => !normalizeStudentNo(s.no))
                    ? ` · 当前 <strong>${roster.filter((s) => !normalizeStudentNo(s.no)).length}</strong> 人学号为空`
                    : ""
                }
              </div>
              <div class="roster-table-wrap">
                <table class="table roster-table">
                  <thead>
                    <tr>
                      <th style="width:96px">学号</th>
                      <th>姓名</th>
                      <th style="width:90px">置信度</th>
                      <th style="width:88px">来源</th>
                      <th style="width:56px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${roster
                      .map((s, idx) => {
                        const noVal = normalizeStudentNo(s.no);
                        const noEmpty = !noVal;
                        return `
                      <tr class="${s.conf < 0.75 ? "roster-low" : ""}" data-idx="${idx}">
                        <td>
                          <input
                            class="roster-input roster-no ${noEmpty ? "roster-no-empty" : ""}"
                            data-field="no"
                            data-idx="${idx}"
                            value="${noVal}"
                            placeholder="可留空"
                            inputmode="text"
                            autocomplete="off"
                            title="有则填写，无则留空；可随时手改"
                          />
                        </td>
                        <td><input class="roster-input ${s.conf < 0.75 ? "warn" : ""}" data-field="name" data-idx="${idx}" value="${s.name || ""}" placeholder="姓名" /></td>
                        <td><span class="badge ${s.conf < 0.75 ? "review" : "ok"}">${Math.round((s.conf || 1) * 100)}%</span></td>
                        <td class="small muted">${
                          s.source === "ocr"
                            ? noEmpty
                              ? "拍照·无学号"
                              : "拍照·有学号"
                            : s.source === "manual"
                              ? "手动"
                              : s.source === "photo_roster"
                                ? "实拍名单"
                                : "默认"
                        }</td>
                        <td><button type="button" class="btn-link" data-del-idx="${idx}">删除</button></td>
                      </tr>`;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn" id="btn-cancel-class">取消</button>
            <button type="button" class="btn primary" id="btn-save-class">保存名单</button>
          </div>
        </div>
      </div>`;

    root.querySelector("#btn-close-class").onclick = closeClassModal;
    root.querySelector("#btn-cancel-class").onclick = closeClassModal;
    root.querySelector(".modal-overlay").addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) closeClassModal();
    });

    $$("[data-class-id]", root).forEach((b) => {
      b.onclick = () => {
        // 切换前若未保存，直接切换加载新名单
        setActiveClass(b.dataset.classId);
        state._rosterEdit = null;
        renderClassModal();
        // 若在改作业界面，刷新标题中的班级信息
        if (state.nav === "grade") setNav("grade", state.gradeTab);
      };
    });

    root.querySelector("#btn-add-class").onclick = () => {
      const name = prompt("新班级名称", "五年级 新班");
      if (!name) return;
      const list = getClasses();
      const c = {
        id: G.uid("class"),
        name,
        grade: "自定义",
        teacher: D.meta.teacher,
        students: [],
      };
      list.push(c);
      state.activeClassId = c.id;
      saveClasses(list);
      state._rosterEdit = [];
      state._rosterClassId = c.id;
      toast("已创建班级");
      renderClassModal();
      updateClassSwitcher();
    };

    $$(".roster-input", root).forEach((input) => {
      input.addEventListener("input", () => {
        const idx = Number(input.dataset.idx);
        const field = input.dataset.field;
        if (!state._rosterEdit[idx]) return;
        let val = input.value;
        if (field === "no") {
          val = normalizeStudentNo(val);
          input.classList.toggle("roster-no-empty", !val);
        }
        state._rosterEdit[idx][field] = val;
        state._rosterEdit[idx].source = "manual";
        state._rosterEdit[idx].conf = 1;
        if (field === "no") {
          state._rosterEdit[idx].noFromOcr = false;
        }
        input.classList.remove("warn");
      });
    });

    $$("[data-del-idx]", root).forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.delIdx);
        state._rosterEdit.splice(idx, 1);
        renderClassModal();
      };
    });

    root.querySelector("#btn-add-student").onclick = () => {
      // 手动添加：学号默认留空，由老师填写（有则填、无则空）
      state._rosterEdit.push({
        id: G.uid("stu"),
        no: "",
        name: "",
        conf: 1,
        source: "manual",
        noFromOcr: false,
      });
      renderClassModal();
      // 聚焦到新行姓名
      const inputs = root.querySelectorAll('.roster-input[data-field="name"]');
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    };

    root.querySelector("#btn-photo-roster").onclick = () => {
      root.querySelector("#file-roster").click();
    };
    root.querySelector("#file-roster").onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const name = file.name;
      e.target.value = "";
      toast("正在调用通义千问 VL 识别名单…");
      try {
        const AI = window.AIClient;
        if (!AI) throw new Error("AI 客户端未加载");
        // 先探活代理
        try {
          await AI.health();
        } catch (_) {
          throw new Error(
            "本机 AI 代理未启动。请在项目根目录执行：python3 server/proxy.py"
          );
        }
        const result = await AI.recognizeRoster(file);
        const list = (result.students || []).map((s) => ({
          id: s.id || G.uid("stu"),
          no: normalizeStudentNo(s.no),
          name: (s.name || "").trim(),
          conf: typeof s.conf === "number" ? s.conf : 0.85,
          source: "ocr",
          noFromOcr: !!normalizeStudentNo(s.no),
          gender: s.gender || "",
        }));
        if (!list.length) {
          toast("未识别到姓名，已回退演示数据，请手改");
          state._rosterEdit = mockRosterOcrFromImage(name);
        } else {
          state._rosterEdit = list;
          const withNo = list.filter((s) => normalizeStudentNo(s.no)).length;
          toast(
            `AI 识别 ${list.length} 人（有学号 ${withNo} · 空 ${list.length - withNo}）· ${
              result.model || "qwen-vl"
            }`
          );
        }
        renderClassModal();
      } catch (err) {
        console.error(err);
        toast(`识别失败：${err.message || err}，已用演示数据`);
        state._rosterEdit = mockRosterOcrFromImage(name);
        renderClassModal();
      }
    };

    // 演示：素材无学号 → 学号列全空，可手填
    root.querySelector("#btn-sample-roster").onclick = () => {
      state._rosterEdit = mockRosterOcrFromImage("sample_roster_无学号.jpg", {
        forceNoNo: true,
      });
      toast("演示：素材无学号，学号已留空，请手动补或保持为空");
      renderClassModal();
    };

    // 演示：素材有学号（丽江实拍表）
    const btnSampleWithNo = root.querySelector("#btn-sample-roster-with-no");
    if (btnSampleWithNo) {
      btnSampleWithNo.onclick = () => {
        state._rosterEdit = mockRosterOcrFromImage("丽江_报名名单_有学号.jpg", {
          forceHasNo: true,
        });
        toast("演示：素材含学号，已写入；可继续手改");
        renderClassModal();
      };
    }

    root.querySelector("#btn-save-class").onclick = () => {
      // 姓名必填；学号可选（空字符串合法）
      const cleaned = (state._rosterEdit || [])
        .map((s) => ({
          ...s,
          name: (s.name || "").trim(),
          no: normalizeStudentNo(s.no),
        }))
        .filter((s) => s.name);
      if (!cleaned.length) {
        toast("名单至少需要 1 名学生（姓名不能为空）");
        return;
      }
      const emptyNoCount = cleaned.filter((s) => !s.no).length;
      const list = getClasses();
      const i = list.findIndex((c) => c.id === active.id);
      if (i >= 0) {
        list[i] = { ...list[i], students: cleaned };
        saveClasses(list);
      }
      // 同步草稿学生（学号可空）
      if (state.draft) {
        state.draft.className = list[i]?.name || active.name;
        state.draft.classId = active.id;
        state.draft.students = cleaned.map((s) => ({
          id: s.id,
          name: s.name,
          no: s.no || "",
        }));
      }
      toast(
        emptyNoCount
          ? `名单已保存（${cleaned.length} 人，其中 ${emptyNoCount} 人学号为空）`
          : `名单已保存（${cleaned.length} 人）`
      );
      closeClassModal(true);
      updateClassSwitcher();
      if (state.nav === "grade") setNav("grade", state.gradeTab);
    };
  }

  function bindGlobal() {
    $$(".side-nav button[data-nav]").forEach((b) => {
      b.addEventListener("click", () => setNav(b.dataset.nav));
    });
    $$(".grade-tab").forEach((b) => {
      b.addEventListener("click", () => setNav("grade", b.dataset.gradeTab));
    });
    $("#btn-class-switch")?.addEventListener("click", () => openClassModal());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.classModalOpen) closeClassModal(true);
    });
  }

  async function refreshAiStatus() {
    const el = $("#ai-status-pill");
    const AI = window.AIClient;
    if (!el) return;
    if (!AI) {
      el.textContent = "AI 未加载";
      el.className = "tag";
      return;
    }
    try {
      const h = await AI.health();
      el.textContent = h.configured
        ? `AI 在线 · ${h.vlModel || "VL"}`
        : "AI 代理未配置 Key";
      el.className = "tag " + (h.configured ? "tag-ok" : "");
      el.title = `代理 ${AI.getBase()}`;
    } catch (_) {
      el.textContent = "AI 离线 · 需启动代理";
      el.className = "tag";
      el.title = "在项目根目录运行: python3 server/proxy.py";
    }
  }

  function boot() {
    loadClasses();
    refreshAiStatus();
    setInterval(refreshAiStatus, 15000);
    $("#meta-box").innerHTML = `
      <strong>${D.meta.product}</strong>
      改作业 · 数据看板<br/>
      右上角可切换班级 / 导入名单<br/>
      <span class="small">${D.meta.note}</span>
    `;
    bindGlobal();
    updateClassSwitcher();
    setNav("grade", "wizard");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
