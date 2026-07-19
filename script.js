const revealItems = document.querySelectorAll(".reveal, .section-lead, .brief-main, .innovation-list article, .value-grid article");
const flowButtons = document.querySelectorAll("[data-flow]");

const flowData = [
  {
    screenTitle: "拍空白题目与答案",
    screenCopy: "AI 生成题框、题型、分值和 Rubric。",
    agent: "Rubric Agent",
    title: "评分标准先由老师确认",
    copy:
      "系统先理解本次作业，而不是盲目判题。题目、答案、分值和步骤分标准被结构化后，教师确认即可批量复用。",
    tags: ["题框 bbox", "答案解析", "步骤分"],
  },
  {
    screenTitle: "拍姓名并绑定学生",
    screenCopy: "姓名 OCR 与班级名单匹配，低置信度人工确认。",
    agent: "Identity Agent",
    title: "乱序作业不用先整理",
    copy:
      "老师拿到一摞顺序混乱的作业本，可以从任意一本开始拍。系统当场显示当前作业归属人，避免后续按学号翻找。",
    tags: ["姓名 OCR", "名单匹配", "重复页检测"],
  },
  {
    screenTitle: "拍作答页，后台切题",
    screenCopy: "双栏、四边形、跨区题都能进入完整题图。",
    agent: "OCR + QuestionSplit",
    title: "题目切分是批改准确的前置条件",
    copy:
      "孟博新版 QuestionSplit 支持 EXIF 方向、双栏重切、四边形裁切和多 regions 竖拼，避免把题干劈开或夹带无关内容。",
    tags: ["two_col", "quad", "regions", "原图证据"],
  },
  {
    screenTitle: "主观题进入复核队列",
    screenCopy: "低置信度、异常分、步骤分争议项优先展示。",
    agent: "Review Agent",
    title: "AI 辅助，教师最终裁决",
    copy:
      "复核台保留原图、题框、OCR 文本、步骤得分和扣分原因。老师修改会回流到 Bad Case 库，持续优化规则和提示词。",
    tags: ["置信度", "步骤分", "Bad Case"],
  },
  {
    screenTitle: "生成讲评与协同",
    screenCopy: "输出丢分 TOP3、需关注学生和讲评课。",
    agent: "Teaching Agent",
    title: "把作业数据送回希沃课堂",
    copy:
      "学情结果转成希沃白板讲评页、易课堂变式练习和飞书复核卡片，让批改不止停留在分数。",
    tags: ["希沃白板", "易课堂", "飞书 Base", "Aily"],
  },
];

function setFlow(index) {
  const item = flowData[index];
  if (!item) return;
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

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

revealItems.forEach((item) => observer.observe(item));

let currentFlow = 0;
flowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFlow = Number(button.dataset.flow);
    setFlow(currentFlow);
  });
});

setFlow(currentFlow);

window.setInterval(() => {
  currentFlow = (currentFlow + 1) % flowData.length;
  setFlow(currentFlow);
}, 5200);
