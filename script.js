const flowButtons = document.querySelectorAll("[data-flow]");
const mapButtons = document.querySelectorAll("[data-map-node]");
const mapCaption = document.getElementById("map-caption");
const siteHeader = document.querySelector(".site-header");
const navLinks = document.querySelectorAll(".nav-links a");
const countItems = document.querySelectorAll("[data-count]");
const parallaxItems = document.querySelectorAll(".parallax");
const flowVisual = document.getElementById("flow-visual");
const demoShowcase = document.querySelector(".demo-showcase");
const demoFeatureButtons = document.querySelectorAll("[data-demo-feature]");

const flowData = [
  {
    label: "Step 01",
    screenTitle: "拍空白题目与答案",
    screenCopy: "生成题框、题型、分值和评分标准草稿。",
    agent: "OCR Agent",
    title: "先让系统理解本次作业",
    copy:
      "系统先识别空白题目和答案册，产出题框、知识点、答案解析和 Rubric 草稿，避免直接盲判学生作答。",
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
      "Rubric 不自动放行。教师确认或调整后，系统才把同一套评分标准批量应用到全班作答。",
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
      "老师可以从任意一本作业开始拍。系统识别姓名、学号或封面信息，低置信候选会明确进入人工确认。",
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
      "前台继续拍下一页，后台完成图像增强、题目切分、手写识别、公式解析和分题型判分。",
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
      "复核台展示原图区域、OCR 文本、步骤得分和扣分理由。教师修改会进入 Bad Case 和 Eval 回归。",
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
    screenTitle: "生成讲评课",
    screenCopy: "输出 TOP 题目、关注学生、板书结构和变式练习。",
    agent: "Teaching Agent",
    title: "把作业数据送回希沃课堂",
    copy:
      "学情结果转为希沃白板讲评页、易课堂练习包、飞书复核卡片和可追踪的教研数据。",
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

function renderFlowVisual(item) {
  if (!flowVisual) return;
  flowVisual.classList.remove("is-flow-visible");
  window.setTimeout(() => flowVisual.classList.add("is-flow-visible"), 30);

  if (item.visualType === "rubric") {
    flowVisual.innerHTML = renderRubricPanel(item);
  } else if (item.visualType === "identity") {
    flowVisual.innerHTML = renderIdentityPanel(item);
  } else if (item.visualType === "review") {
    flowVisual.innerHTML = renderReviewPanel(item);
  } else if (item.visualType === "teaching") {
    flowVisual.innerHTML = renderTeachingPanel(item);
  } else {
    flowVisual.innerHTML = renderScanPanel(item);
  }
}

const mapData = {
  client: "教师在多端完成低门槛采集，系统把图片、身份、题目和作答绑定成可批改任务。",
  ai: "AI 中台按任务拆分给 OCR、Identity、Rubric、Grading、Diagnosis、Teaching 和 Review Agent。",
  data: "教师修改、低置信样例和异常分进入 Bad Case 与 Eval，让系统持续进化。",
  eco: "批改结果导向希沃白板、大屏、易课堂和综评，把作业数据带回课堂。",
  feishu: "飞书机器人、Base、Aily 和自动化流程承接复核提醒、数据存档和自然语言学情查询。",
};

function setFlow(index) {
  const item = flowData[index];
  if (!item) return;

  renderFlowVisual(item);
  const flowLabel = document.getElementById("flow-label");
  const flowTitle = document.getElementById("flow-title-dynamic");
  const flowCopy = document.getElementById("flow-copy-dynamic");
  const flowTags = document.getElementById("flow-tags");
  if (flowLabel) flowLabel.textContent = item.label;
  if (flowTitle) flowTitle.textContent = item.title;
  if (flowCopy) flowCopy.textContent = item.copy;
  if (flowTags) flowTags.innerHTML = item.tags.map((tag) => `<span>${tag}</span>`).join("");
  flowButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.flow) === index);
  });
}

function setMapNode(key) {
  if (!mapData[key]) return;
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
    });
  },
  { threshold: 0.16 }
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

let currentFlow = 0;
let flowTimer = window.setInterval(() => {
  currentFlow = (currentFlow + 1) % flowData.length;
  setFlow(currentFlow);
}, 5200);

flowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    window.clearInterval(flowTimer);
    currentFlow = Number(button.dataset.flow);
    setFlow(currentFlow);
    flowTimer = window.setInterval(() => {
      currentFlow = (currentFlow + 1) % flowData.length;
      setFlow(currentFlow);
    }, 5200);
  });
});

mapButtons.forEach((button) => {
  const key = button.dataset.mapNode;
  button.addEventListener("mouseenter", () => setMapNode(key));
  button.addEventListener("focus", () => setMapNode(key));
  button.addEventListener("click", () => setMapNode(key));
});

function setDemoFeature(feature) {
  if (!demoShowcase) return;
  demoShowcase.dataset.activeFeature = feature;
  demoFeatureButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.demoFeature === feature);
  });
}

demoFeatureButtons.forEach((button) => {
  const feature = button.dataset.demoFeature;
  button.addEventListener("mouseenter", () => setDemoFeature(feature));
  button.addEventListener("focus", () => setDemoFeature(feature));
  button.addEventListener("click", () => setDemoFeature(feature));
});

let lastScrollY = window.scrollY;

function updateHeaderState() {
  if (!siteHeader) return;
  const currentY = window.scrollY;
  const isAtTop = currentY < 12;
  const scrollingDown = currentY > lastScrollY;
  siteHeader.classList.toggle("is-at-top", isAtTop);
  siteHeader.classList.toggle("is-scrolled", currentY > 72);
  siteHeader.classList.toggle("is-hidden", scrollingDown && currentY > 280);
  lastScrollY = currentY;
}

function updateParallax() {
  const viewport = window.innerHeight || 1;
  parallaxItems.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const delta = (center - viewport / 2) / viewport;
    item.style.setProperty("--parallax-y", `${Math.max(-18, Math.min(18, delta * -28))}px`);
  });
}

window.addEventListener("scroll", updateParallax, { passive: true });
window.addEventListener("scroll", updateHeaderState, { passive: true });
window.addEventListener("resize", updateParallax);

setFlow(0);
updateHeaderState();
updateParallax();

setFlow(currentFlow);
setMapNode("client");
setDemoFeature("split");
updateParallax();
