const mapButtons = document.querySelectorAll("[data-map-node]");
const mapCaption = document.getElementById("map-caption");
const siteHeader = document.querySelector(".site-header");
const navLinks = document.querySelectorAll(".nav-links a");
const countItems = document.querySelectorAll("[data-count]");
const parallaxItems = document.querySelectorAll(".parallax");
const demoShowcase = document.querySelector(".demo-showcase");

const flowData = [
  {
    label: "Step 01",
    screenTitle: "拍空白题目与答案",
    screenCopy: "生成题框、题型、分值和评分标准草稿。",
    agent: "OCR Agent",
    title: "先让系统理解本次作业",
    copy:
      "先识别空白题目与答案册，产出题框与评分标准草稿，避免盲判学生作答。",
    tags: ["题框 bbox", "答案解析", "Rubric 草稿"],
    visualType: "scan",
    previewImage: "./workbench/public/thumbs/hs_math/IMG_0347.jpg",
    activeRegion: "question",
    evidenceItems: ["题框 bbox", "标准答案解析", "满分与题型"],
    agentEvents: [
      ["OCR Agent", "题目区域识别完成", "bbox 置信度 0.91"],
      ["Rubric Agent", "生成评分标准草稿", "等待教师确认"],
      ["Task Queue", "已创建批改任务", "可继续拍下一页"],
    ],
  },
  {
    label: "Step 02",
    screenTitle: "确认 Rubric",
    screenCopy: "教师确认步骤分、满分、扣分原因和知识点。",
    agent: "Rubric Agent",
    title: "主观题必须先有可解释评分标准",
    copy:
      "评分标准需教师确认后，再批量应用到全班作答。",
    tags: ["步骤分", "教师确认", "版本记录"],
    visualType: "rubric",
    previewImage: "./workbench/public/thumbs/hs_math/IMG_0350.jpg",
    activeRegion: "rubric",
    evidenceItems: ["步骤分", "扣分原因", "Rubric 版本"],
    agentEvents: [
      ["Rubric Agent", "拆解 3 个评分点", "主观题不自动放行"],
      ["Teacher Review", "等待确认标准", "修改会记录版本"],
      ["Schema Check", "结构化输出通过", "可批量复用"],
    ],
  },
  {
    label: "Step 03",
    screenTitle: "拍姓名与作答",
    screenCopy: "姓名 OCR 与班级名单匹配，作答页自动绑定学生。",
    agent: "Identity Agent",
    title: "乱序作业不用先整理",
    copy:
      "作业可乱序采集；姓名与名单匹配，低置信进入人工确认。",
    tags: ["姓名 OCR", "名单匹配", "重复页检测"],
    visualType: "identity",
    previewImage: "./workbench/public/thumbs/hs_chinese/IMG_0305.jpg",
    activeRegion: "identity",
    evidenceItems: ["姓名栏", "班级名单", "候选学生"],
    agentEvents: [
      ["Identity Agent", "匹配到候选学生", "置信度 0.86"],
      ["Roster Check", "同名风险已排除", "学号为空不编造"],
      ["Page Guard", "重复页检测通过", "绑定作业 ID"],
    ],
  },
  {
    label: "Step 04",
    screenTitle: "异步切题与判分",
    screenCopy: "增强版 QuestionSplit 保留原图证据并输出结构化题图。",
    agent: "QuestionSplit + Grading",
    title: "采集和批改并行，不让老师等待",
    copy:
      "前台继续拍，后台完成切题、识别与分题型判分。",
    tags: ["多区域切分", "公式识别", "规则优先"],
    visualType: "grading",
    previewImage: "./workbench/public/thumbs/hs_math/IMG_0353.jpg",
    activeRegion: "grading",
    evidenceItems: ["多区域题图", "公式 LaTeX", "规则判分"],
    agentEvents: [
      ["QuestionSplit", "跨区题已拼接", "3 regions -> 1 题图"],
      ["Formula OCR", "公式转 LaTeX", "等价校验待执行"],
      ["Grading Agent", "客观规则优先", "主观题进入建议分"],
    ],
  },
  {
    label: "Step 05",
    screenTitle: "异常聚焦复核",
    screenCopy: "低置信、主观题、异常分进入优先队列。",
    agent: "Review Agent",
    title: "AI 辅助，教师最终裁决",
    copy:
      "复核台对照原图、OCR 与步骤分；教师修改回流 Bad Case。",
    tags: ["置信度", "原图证据", "Bad Case"],
    visualType: "review",
    previewImage: "./workbench/public/thumbs/hs_chinese/IMG_0318.jpg",
    activeRegion: "review",
    evidenceItems: ["低置信题", "原图证据", "教师裁决"],
    agentEvents: [
      ["Review Agent", "异常分已置顶", "优先级 P0"],
      ["Evidence", "原图与 OCR 对齐", "可追溯扣分点"],
      ["Bad Case", "修改回流样例库", "纳入 Eval 回归"],
    ],
  },
  {
    label: "Step 06",
    screenTitle: "一人一评价 · 学情讲评",
    screenCopy: "输出讲评知识点、需关注学生与课堂动作。",
    agent: "Teaching Agent",
    title: "把作业数据送回希沃课堂",
    copy:
      "学情转为讲评顺序、变式练习与飞书复核摘要。",
    tags: ["希沃白板", "易课堂", "飞书 Base", "Aily"],
    visualType: "teaching",
    previewImage: "./workbench/public/thumbs/math/IMG_0293.jpg",
    activeRegion: "teaching",
    evidenceItems: ["讲评顺序", "变式练习", "飞书卡片"],
    agentEvents: [
      ["Diagnosis Agent", "生成 TOP3 丢分点", "关联知识点"],
      ["Teaching Agent", "讲评课草稿完成", "等待教师确认"],
      ["Feishu Bot", "复核摘要可推送", "Base 同步记录"],
    ],
    // 右侧栏丰富学情卡（对齐 demo 学情：知识点 / 需关注学生 / 讲评动作）
    teachingBrief: {
      classLabel: "高二 3 班 · 数学",
      avgRate: "81%",
      submitCount: 42,
      // 课上优先讲清的 3 个知识点（对应共性薄弱）
      teachPoints: [
        {
          no: "01",
          title: "空间关系建立",
          hint: "先辨方向与辅助线，再列式",
          rate: "62%",
        },
        {
          no: "02",
          title: "向量 / 几何关系",
          hint: "过程分边界：等价写法可给",
          rate: "71%",
        },
        {
          no: "03",
          title: "结论与单位规范",
          hint: "答句完整、单位不漏",
          rate: "78%",
        },
      ],
      // 表现需优先调整的 3 名同学（勿用负面标签）
      focusStudents: [
        {
          name: "李一航",
          score: "18/30",
          reason: "空间关系 · 审题",
        },
        {
          name: "王晓彤",
          score: "20/30",
          reason: "过程跳步 · 推导不全",
        },
        {
          name: "陈思远",
          score: "21/30",
          reason: "答句不规范 · 单位",
        },
      ],
    },
  },
];

function renderAgentStack(events) {
  return `
    <div class="agent-stack" aria-label="Agent 处理状态">
      ${events
        .map(
          ([agent, title, detail]) => `
            <article>
              <span>${agent}</span>
              <strong>${title}</strong>
              <small>${detail}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEvidenceCard(item, label = "识别证据") {
  return `
    <div class="evidence-card">
      <span>${label}</span>
      <strong>${item.evidenceItems.join(" · ")}</strong>
      <small>原图区域、OCR 文本和评分依据同步保存，教师复核时可以回看。</small>
    </div>
  `;
}

function renderScanPanel(item) {
  return `
    <div class="scan-console flow-panel" data-active-region="${item.activeRegion}">
      <div class="console-topbar">
        <span></span><span></span><span></span>
        <strong>${item.visualType === "grading" ? "异步批改控制台" : "采集任务控制台"}</strong>
      </div>
      <div class="scan-workspace">
        <div class="scan-paper">
          <img src="${item.previewImage}" alt="真实作业页识别预览" />
          <span class="scan-frame frame-question"></span>
          <span class="scan-frame frame-name"></span>
          <span class="scan-frame frame-answer"></span>
          <span class="scan-frame frame-review"></span>
          <span class="scan-sweep"></span>
        </div>
        ${renderAgentStack(item.agentEvents)}
      </div>
      ${renderEvidenceCard(item)}
    </div>
  `;
}

function renderRubricPanel(item) {
  return `
    <div class="product-console rubric-console flow-panel">
      <div class="console-topbar"><span></span><span></span><span></span><strong>Rubric 评分标准编辑器</strong></div>
      <div class="rubric-board">
        <aside class="rubric-summary">
          <span>Question 03</span>
          <strong>立体几何解答题 · 6 分</strong>
          <small>未确认 Rubric 不允许批量判分</small>
          <button type="button">教师确认标准</button>
        </aside>
        <div class="rubric-rows">
          <article><span>2 分</span><strong>建立空间关系</strong><small>识别关键图形关系和辅助线。</small></article>
          <article><span>2 分</span><strong>列出向量/几何关系</strong><small>过程表达完整，允许等价写法。</small></article>
          <article><span>2 分</span><strong>计算并写出结论</strong><small>答案、单位和结论句完整。</small></article>
        </div>
      </div>
      ${renderEvidenceCard(item, "Rubric 证据")}
    </div>
  `;
}

function renderIdentityPanel(item) {
  return `
    <div class="product-console identity-console flow-panel">
      <div class="console-topbar"><span></span><span></span><span></span><strong>学生身份绑定台</strong></div>
      <div class="identity-grid">
        <div class="identity-scan">
          <div class="id-card">
            <span>姓名栏 OCR</span>
            <strong>李一航</strong>
            <small>高二 3 班 · 数学作业 · 第 2 页</small>
          </div>
          <div class="confidence-ring"><strong>86%</strong><span>匹配置信度</span></div>
        </div>
        <div class="candidate-list">
          <article class="active"><strong>李一航</strong><small>学号 20260318 · 高置信候选</small></article>
          <article><strong>李逸航</strong><small>同音姓名 · 需排除</small></article>
          <article><strong>重复页检测</strong><small>未发现重复上传</small></article>
        </div>
      </div>
      ${renderEvidenceCard(item, "身份绑定证据")}
    </div>
  `;
}

function renderReviewPanel(item) {
  return `
    <div class="product-console review-console flow-panel">
      <div class="console-topbar"><span></span><span></span><span></span><strong>异常聚焦复核台</strong></div>
      <div class="review-grid">
        <div class="review-image">
          <img src="${item.previewImage}" alt="主观题复核原图区域" />
          <span></span>
        </div>
        <div class="review-detail">
          <span>低置信 · P0</span>
          <strong>步骤 2 缺少关键推导</strong>
          <p>OCR 文本与图形关系存在偏差，建议教师确认是否给过程分。</p>
          <div><button type="button">采纳建议分</button><button type="button">改为复核通过</button></div>
        </div>
      </div>
      ${renderEvidenceCard(item, "复核证据")}
    </div>
  `;
}

function renderTeachingPanel(item) {
  return `
    <div class="product-console teaching-console flow-panel">
      <div class="console-topbar"><span></span><span></span><span></span><strong>讲评课生成器</strong></div>
      <div class="teaching-board">
        <section>
          <span>学情 TOP3</span>
          <strong>空间关系建立不完整</strong>
          <ol>
            <li>典型错题：第 3 题</li>
            <li>需优先关注学生：8 人</li>
            <li>建议先讲图形关系，再讲计算</li>
          </ol>
        </section>
        <section class="lesson-card">
          <span>希沃白板</span>
          <strong>讲评页草稿已生成</strong>
          <small>板书结构 · 变式练习 · 分层作业</small>
        </section>
      </div>
      ${renderEvidenceCard(item, "讲评输出")}
    </div>
  `;
}

/** 右侧「一人一评价」：讲评知识点 TOP3 + 需调整同学 TOP3 */
function renderTeachColPanel(item) {
  const brief = item.teachingBrief || {};
  const teachPoints = brief.teachPoints || [];
  const focusStudents = brief.focusStudents || [];

  const pointsHtml = teachPoints
    .map(
      (p) => `
      <li>
        <span class="teach-no">${p.no || ""}</span>
        <div class="teach-body">
          <strong>${p.title || ""}</strong>
          <small>${p.hint || ""}</small>
        </div>
        <em class="teach-rate" title="班级掌握率">${p.rate || ""}</em>
      </li>`
    )
    .join("");

  const studentsHtml = focusStudents
    .map(
      (s, i) => `
      <li>
        <span class="focus-rank">${i + 1}</span>
        <div class="focus-body">
          <strong>${s.name || ""}</strong>
          <small>${s.reason || ""}</small>
        </div>
        <em class="focus-score">${s.score || ""}</em>
      </li>`
    )
    .join("");

  return `
    <div class="col-panel col-panel--teach">
      <div class="col-panel-bar">
        <i></i><i></i><i></i>
        <strong>${item.screenTitle || "一人一评价"}</strong>
      </div>
      <div class="teach-panel">
        <div class="teach-meta">
          <span>${brief.classLabel || "本班作业"}</span>
          <strong>均分 ${brief.avgRate || "—"}</strong>
          <small>提交 ${brief.submitCount != null ? brief.submitCount : "—"} 人</small>
        </div>

        <section class="teach-block" aria-label="讲评知识点">
          <header>
            <span>讲评优先</span>
            <strong>课上先讲清的 3 个知识点</strong>
          </header>
          <ol class="teach-point-list">${pointsHtml}</ol>
        </section>

        <section class="teach-block teach-block--focus" aria-label="需关注学生">
          <header>
            <span>面批优先</span>
            <strong>表现需调整的 3 位同学</strong>
          </header>
          <ol class="focus-student-list">${studentsHtml}</ol>
        </section>
      </div>
    </div>`;
}

/**
 * 扫描框：按百分比定位在照片上的识别区域
 * frame: { left, top, width, height, tone?: "teal"|"amber" }
 */
function renderScanFrames(frames) {
  if (!frames || !frames.length) return "";
  return frames
    .map((f) => {
      const tone = f.tone === "amber" ? " is-amber" : "";
      return `<span class="col-frame${tone}" style="left:${f.left};top:${f.top};width:${f.width};height:${f.height}" aria-hidden="true"></span>`;
    })
    .join("");
}

/** 三栏紧凑预览（左中右同一板块用）；扫描框挂在与照片同比例的 stage 上，避免 letterbox 错位 */
function renderColPanel(item, options = {}) {
  if (item.visualType === "teaching" || item.kind === "teach") {
    return renderTeachColPanel(item);
  }

  const title = options.barTitle || item.screenTitle || item.barTitle || "产品预览";
  const points = (item.agentEvents || item.events || []).slice(0, 2);
  const frames = item.scanFrames || item.frames || [];
  const alt = item.imageAlt || "";
  const aspect = item.imageAspect || "4 / 3";

  const pointsHtml = points
    .map(
      ([agent, t, detail]) => `
      <li>
        <span>${agent}</span>
        <strong>${t}</strong>
        <small>${detail}</small>
      </li>`
    )
    .join("");

  const frameHtml =
    frames.length > 0
      ? renderScanFrames(frames)
      : `<span class="col-frame${item.visualType === "review" ? " is-amber" : ""}" aria-hidden="true"></span>`;

  return `
    <div class="col-panel">
      <div class="col-panel-bar"><i></i><i></i><i></i><strong>${title}</strong></div>
      <div class="col-panel-body">
        <div class="col-panel-media col-panel-media--scan">
          <div class="col-scan-shot" style="aspect-ratio: ${aspect}">
            <img src="${item.previewImage}" alt="${alt}" loading="eager" decoding="async" />
            ${frameHtml}
          </div>
        </div>
        <ul class="col-panel-points">${pointsHtml}</ul>
      </div>
    </div>`;
}

function panelHtmlForItem(item) {
  return renderColPanel(item);
}

function renderFlowVisual(targetId, item) {
  const container = document.getElementById(targetId);
  if (!container || !item) return;

  // 静态写入：同目标只渲染一次，禁止反复 innerHTML / 换图
  const staticKey =
    item.previewImage ||
    (item.teachingBrief ? "teach-brief" : item.visualType || "panel");
  if (container.dataset.staticRendered === "1" && container.dataset.staticSrc === staticKey) {
    return;
  }
  container.classList.add("is-flow-visible");
  container.innerHTML = panelHtmlForItem(item);
  container.dataset.staticRendered = "1";
  container.dataset.staticSrc = staticKey;
}

const mapData = {
  client: "多端采集：图片、身份、题目与作答绑定成可批改任务。",
  ai: "中台拆分 OCR、身份、Rubric、判分、诊断、讲评与复核。",
  data: "教师修改与低置信样例进入 Bad Case，持续改进。",
  eco: "结果导向希沃白板与易课堂，作业数据回到课堂。",
  feishu: "飞书承接复核提醒、Base 存档与学情查询。",
};

function setMapNode(key) {
  if (!mapData[key] || !mapCaption) return;
  mapCaption.textContent = mapData[key];
  mapButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mapNode === key);
  });
}

function animateCount(item) {
  if (item.dataset.counted === "true") return;
  item.dataset.counted = "true";

  const target = Number(item.dataset.count);
  const suffix = item.dataset.suffix || "";
  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    item.textContent = `${Math.round(target * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      entry.target.querySelectorAll("[data-count]").forEach(animateCount);
      if (entry.target.matches("[data-count]")) animateCount(entry.target);
      // 只显现一次，避免长区块反复进出视口时闪动
      revealObserver.unobserve(entry.target);
    });
  },
  // 长 section 用低阈值 + 上沿提前触发，避免「半屏还是空白」
  { threshold: 0.04, rootMargin: "0px 0px -6% 0px" }
);

document.querySelectorAll(".reveal, .reveal-block, [data-count]").forEach((item) => {
  revealObserver.observe(item);
});

const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
      });
    });
  },
  { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
);

document.querySelectorAll("main section[id]").forEach((section) => navObserver.observe(section));

const prefersReducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 解决方案三栏：静态一帧，禁止轮播 / 定时换图（避免交替闪烁）
 * 左：空白卷（题框识别） / 中：作答卷（过程框） / 右：学情卡（无图片轮播）
 * 扫描框百分比按实拍对开课本估：中缝约 45%–51%，最右「听课记录」栏不画框
 */
const storyColumns = [
  {
    visualId: "flow-visual-0",
    item: {
      barTitle: "采集 · 空白题目",
      screenTitle: "采集 · 空白题目",
      previewImage: "./assets/story-blank-page.jpg",
      imageAlt: "空白题目册展开页（含答案区域）",
      imageAspect: "1448 / 1086",
      events: [
        ["OCR Agent", "题目区域识别完成", "对开页 6 个题框"],
        ["Rubric Agent", "生成评分标准草稿", "等待教师确认"],
      ],
      // 空白卷：左页四块题区 + 右页两块例题/训练；避开中缝与最右听课记录栏
      scanFrames: [
        { left: "3.5%", top: "4%", width: "40%", height: "24%" }, // 例1 线面垂直 + 示意图
        { left: "3.5%", top: "30%", width: "40%", height: "15%" }, // 例2 位置关系
        { left: "3.5%", top: "47%", width: "40%", height: "18%" }, // 线面角公式区
        { left: "3.5%", top: "67%", width: "40%", height: "27%" }, // 平面平行 + 知识梳理
        { left: "49%", top: "3.5%", width: "35%", height: "42%" }, // 例3 正方体题干与图
        { left: "49%", top: "48%", width: "35%", height: "42%" }, // 跟踪训练3 棱柱
      ],
    },
  },
  {
    visualId: "flow-visual-1",
    item: {
      barTitle: "采集 · 全班作答",
      screenTitle: "采集 · 全班作答",
      previewImage: "./assets/story-answer-page.jpg",
      imageAlt: "学生手写作答过程页",
      imageAspect: "1344 / 1792",
      events: [
        ["QuestionSplit", "作答区已切分", "过程与图示绑定"],
        ["Grading Agent", "步骤分建议已出", "低置信进复核"],
      ],
      // 作答卷：框住手写过程；琥珀框标示重点判分/待复核步骤；避开最右空白栏
      scanFrames: [
        { left: "4%", top: "5%", width: "43%", height: "28%", tone: "amber" }, // 左上 例1 手写推导
        { left: "4%", top: "35%", width: "43%", height: "14%" }, // 例2 手写
        { left: "4%", top: "51%", width: "43%", height: "18%" }, // 线面角旁手写
        { left: "4%", top: "72%", width: "43%", height: "21%", tone: "amber" }, // 平面平行手写
        { left: "52%", top: "3%", width: "33%", height: "38%" }, // 右上 例3 建系/法向量
        { left: "52%", top: "43%", width: "33%", height: "45%", tone: "amber" }, // 跟踪训练3 完整过程
      ],
    },
  },
  {
    visualId: "flow-visual-2",
    item: flowData[5],
  },
];

function preloadStoryImages() {
  storyColumns.forEach((col) => {
    const src = col.item && col.item.previewImage;
    if (!src) return;
    const img = new Image();
    img.src = src;
  });
}

function renderStoryColumns() {
  storyColumns.forEach((col) => {
    renderFlowVisual(col.visualId, col.item);
  });
}

// 仅渲染一次：无 setInterval / 无 phase 轮播 / 无换图
preloadStoryImages();
renderStoryColumns();

mapButtons.forEach((button) => {
  const key = button.dataset.mapNode;
  button.addEventListener("mouseenter", () => setMapNode(key));
  button.addEventListener("focus", () => setMapNode(key));
  button.addEventListener("click", () => setMapNode(key));
});

/**
 * 四个样例任务：各自独立的识别框 + TOP3 丢分点（因地制宜，禁止跨学科套用）
 * frames: 相对照片百分比；tone amber = 待复核/重点丢分区
 */
const demoSampleProfiles = {
  hs_math: {
    aspect: "3 / 4",
    frames: [
      // 竖版手写作答：课时标题/例题题干、例1 过程、例2 过程（对齐扫描 bbox 大致区域）
      { left: "10%", top: "6%", width: "78%", height: "16%" },
      { left: "10%", top: "28%", width: "78%", height: "30%" },
      { left: "12%", top: "62%", width: "74%", height: "28%", tone: "amber" },
    ],
    top3: [
      "线面 / 线线平行判定不完整",
      "建系坐标与中点条件写错",
      "平面平行缺关键推导句",
    ],
    meter: 62,
    hint: "建议先讲例 1 平行判定，再统一建系书写规范。",
  },
  math: {
    aspect: "4 / 3",
    frames: [
      // 横版练习册：左三视图连线、右/中分数计算、下应用题答句
      { left: "5%", top: "8%", width: "42%", height: "50%" },
      { left: "50%", top: "8%", width: "45%", height: "40%" },
      { left: "6%", top: "62%", width: "88%", height: "28%", tone: "amber" },
    ],
    top3: [
      "三视图「上面」朝向混淆",
      "异分母通分 / 约分遗漏",
      "应用题答句缺单位",
    ],
    meter: 55,
    hint: "建议先用小方块复盘前/左/上视图，再练通分找 LCM。",
  },
  hs_chinese: {
    aspect: "4 / 3",
    frames: [
      // 字音字形、词语辨析、下方研读任务手写
      { left: "4%", top: "6%", width: "44%", height: "42%" },
      { left: "50%", top: "6%", width: "45%", height: "42%" },
      { left: "6%", top: "54%", width: "88%", height: "36%", tone: "amber" },
    ],
    top3: [
      "多音字 / 易错字形识记不稳",
      "近义词语（觉醒·觉悟等）辨析混淆",
      "研读任务答点不全、缺少史实依据",
    ],
    meter: 58,
    hint: "建议先落实字音字形小测，再讲研读任务采分点。",
  },
  olympiad: {
    aspect: "4 / 3",
    frames: [
      // 杯赛多步：上题题干、中路径/面积、下追及或多步待复核
      { left: "6%", top: "6%", width: "86%", height: "24%" },
      { left: "6%", top: "34%", width: "86%", height: "28%" },
      { left: "8%", top: "66%", width: "82%", height: "26%", tone: "amber" },
    ],
    top3: [
      "题意建模不到位（位值 / 路径）",
      "几何割补与坐标描点缺步",
      "行程追及时间轴未画清",
    ],
    meter: 48,
    hint: "建议先练「画图建模」，再统一讲追及时间轴。",
  },
};

function resolveAssetUrl(src) {
  if (!src) return "";
  try {
    // 相对路径按当前页面解析，避免绝对 / 路径在子目录失效
    if (src.startsWith("./") || src.startsWith("../") || !src.startsWith("/")) {
      return new URL(src, window.location.href).href;
    }
    return new URL(src, window.location.origin).href;
  } catch {
    return src;
  }
}

function renderDemoFrames(sampleId) {
  const layer = document.getElementById("demo-bbox-layer");
  const stage = document.getElementById("demo-scan-stage");
  const profile = demoSampleProfiles[sampleId] || demoSampleProfiles.hs_math;
  if (!layer) return;

  if (stage && profile.aspect) {
    stage.style.aspectRatio = profile.aspect;
  }

  layer.innerHTML = (profile.frames || [])
    .map((f) => {
      const tone = f.tone === "amber" ? " is-amber" : "";
      return `<span class="demo-bbox${tone}" style="left:${f.left};top:${f.top};width:${f.width};height:${f.height}"></span>`;
    })
    .join("");
}

function renderDemoTop3(sampleId) {
  const profile = demoSampleProfiles[sampleId] || demoSampleProfiles.hs_math;
  const list = document.getElementById("demo-top3-list");
  const meter = document.getElementById("demo-report-meter");
  const hint = document.getElementById("demo-report-hint");
  if (list) {
    list.innerHTML = (profile.top3 || []).map((t) => `<li>${t}</li>`).join("");
  }
  if (meter) {
    meter.style.width = `${profile.meter != null ? profile.meter : 60}%`;
  }
  if (hint) {
    hint.textContent = profile.hint || "";
  }
}

function setDemoSample(button) {
  if (!button) return;

  const sampleId = button.getAttribute("data-demo-sample") || button.dataset.demoSample || "hs_math";
  const rawSrc =
    button.getAttribute("data-demo-src") ||
    button.dataset.demoSrc ||
    "";
  const alt =
    button.getAttribute("data-demo-alt") ||
    button.dataset.demoAlt ||
    "作业样例";
  const label =
    button.getAttribute("title") ||
    button.textContent.replace(/\s+/g, " ").trim() ||
    alt;
  const nextSrc = resolveAssetUrl(rawSrc);

  const img =
    document.getElementById("demo-paper-img") ||
    document.querySelector(".demo-paper-wrap img");
  const paperWrap = document.getElementById("demo-paper-wrap") || document.querySelector(".demo-paper-wrap");
  const badge = document.getElementById("demo-sample-badge");

  if (img && nextSrc) {
    if (paperWrap) paperWrap.classList.add("is-switching");

    img.alt = alt;
    img.setAttribute("data-active-sample", sampleId);

    const bust = `${nextSrc}${nextSrc.includes("?") ? "&" : "?"}t=${Date.now()}`;
    img.onload = () => {
      if (paperWrap) paperWrap.classList.remove("is-switching");
    };
    img.onerror = () => {
      img.onerror = null;
      img.src = nextSrc;
      if (paperWrap) paperWrap.classList.remove("is-switching");
    };
    img.src = bust;

    window.setTimeout(() => {
      if (paperWrap) paperWrap.classList.remove("is-switching");
    }, 280);
  }

  if (badge) badge.textContent = label;
  if (paperWrap) paperWrap.dataset.activeSample = sampleId;
  if (demoShowcase) demoShowcase.dataset.activeSample = sampleId;

  // 换样例：同步换框 + 换 TOP3（禁止全站同一套数学丢分点）
  renderDemoFrames(sampleId);
  renderDemoTop3(sampleId);

  document.querySelectorAll("[data-demo-sample]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
}

// 暴露到全局，便于调试与内联调用
window.setDemoSample = setDemoSample;

function bindDemoSampleClicks() {
  const demoSidebar = document.querySelector(".demo-sidebar");
  if (!demoSidebar) return;

  demoSidebar.querySelectorAll("[data-demo-sample]").forEach((button) => {
    if (button.dataset.boundSampleClick === "1") return;
    button.dataset.boundSampleClick = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDemoSample(button);
    });
  });

  demoSidebar.dataset.boundSample = "1";
}

bindDemoSampleClicks();
document.addEventListener("DOMContentLoaded", bindDemoSampleClicks);

// 首屏：默认高中数学样例的框与 TOP3
(function initDemoSample() {
  const active =
    document.querySelector(".demo-sidebar button.active[data-demo-sample]") ||
    document.querySelector("[data-demo-sample]");
  if (active) {
    renderDemoFrames(active.getAttribute("data-demo-sample") || "hs_math");
    renderDemoTop3(active.getAttribute("data-demo-sample") || "hs_math");
  } else {
    renderDemoFrames("hs_math");
    renderDemoTop3("hs_math");
  }
})();

let lastScrollY = window.scrollY;
let headerTicking = false;

function updateHeaderState() {
  if (!siteHeader) return;
  const currentY = window.scrollY;
  const isAtTop = currentY < 12;
  // 不再根据滚动方向隐藏顶栏：hide/show 会改变可用视口高度，整页上下颤动。
  siteHeader.classList.toggle("is-at-top", isAtTop);
  siteHeader.classList.toggle("is-scrolled", currentY > 72);
  siteHeader.classList.remove("is-hidden");
  lastScrollY = currentY;
}

function updateParallax() {
  if (!parallaxItems.length || prefersReducedMotion) return;
  const viewport = window.innerHeight || 1;
  parallaxItems.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const delta = (center - viewport / 2) / viewport;
    item.style.setProperty("--parallax-y", `${Math.max(-18, Math.min(18, delta * -28))}px`);
  });
}

function onScrollFrame() {
  headerTicking = false;
  updateHeaderState();
  updateParallax();
}

function requestScrollUpdate() {
  if (headerTicking) return;
  headerTicking = true;
  requestAnimationFrame(onScrollFrame);
}

window.addEventListener("scroll", requestScrollUpdate, { passive: true });
window.addEventListener("resize", requestScrollUpdate);

setMapNode("client");
updateHeaderState();
updateParallax();
