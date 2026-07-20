const flowButtons = document.querySelectorAll("[data-flow]");
const mapButtons = document.querySelectorAll("[data-map-node]");
const mapCaption = document.getElementById("map-caption");
const navLinks = document.querySelectorAll(".nav-links a");
const countItems = document.querySelectorAll("[data-count]");
const parallaxItems = document.querySelectorAll(".parallax");

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
  },
];

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

  document.getElementById("flow-label").textContent = item.label;
  document.getElementById("flow-screen-title").textContent = item.screenTitle;
  document.getElementById("flow-screen-copy").textContent = item.screenCopy;
  document.getElementById("flow-agent").textContent = item.agent;
  document.getElementById("flow-title-dynamic").textContent = item.title;
  document.getElementById("flow-copy-dynamic").textContent = item.copy;
  document.getElementById("flow-tags").innerHTML = item.tags.map((tag) => `<span>${tag}</span>`).join("");

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
window.addEventListener("resize", updateParallax);

setFlow(currentFlow);
setMapNode("client");
updateParallax();
