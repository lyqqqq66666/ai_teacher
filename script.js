const revealItems = document.querySelectorAll(".reveal");
const flowButtons = document.querySelectorAll("[data-flow]");

const flowData = [
  {
    screenTitle: "拍空白题目与答案",
    screenCopy: "自动切分题框、识别题型、生成分值与 Rubric。",
    agent: "Rubric Agent",
    title: "先把评分标准定清楚",
    copy:
      "老师先拍标准题目和答案，AI 生成题框、分值、知识点和步骤分标准；Rubric 必须由老师确认后才进入批量判分。",
    tags: ["题框 bbox", "答案解析", "步骤分"],
  },
  {
    screenTitle: "拍姓名并绑定学生",
    screenCopy: "姓名 OCR 与班级名单模糊匹配，低置信度弹出候选。",
    agent: "Identity Agent",
    title: "乱序作业不用先整理",
    copy:
      "老师从任意一本作业开始拍，系统识别姓名、学号或座号，并绑定当前学生；同名、低置信度和缺失信息必须人工确认。",
    tags: ["姓名 OCR", "名单匹配", "低置信确认"],
  },
  {
    screenTitle: "拍作答页，后台批改",
    screenCopy: "拍第二页时，第一页已经在队列里完成 OCR 和判分。",
    agent: "OCR + Grading Agent",
    title: "采集不中断，批改并行跑",
    copy:
      "端侧压缩上传，后台完成裁边、矫正、手写识别、公式识别和题目对齐。客观题规则判分，主观题按 Rubric 生成建议分。",
    tags: ["OpenCV", "PaddleOCR", "Qwen-VL", "Mathpix"],
  },
  {
    screenTitle: "教师复核重点项",
    screenCopy: "主观题、异常分、低置信度题目进入复核队列。",
    agent: "Review Agent",
    title: "AI 辅助，教师最终判断",
    copy:
      "复核台左侧显示原图题框，右侧显示 OCR 文本、步骤得分、扣分原因和置信度。教师修改会进入 Bad Case 库。",
    tags: ["原图证据", "步骤分", "置信度", "Bad Case"],
  },
  {
    screenTitle: "生成讲评与协同",
    screenCopy: "输出丢分 TOP3、需关注学生、白板讲评课和飞书卡片。",
    agent: "Teaching Agent",
    title: "把批改结果送回课堂现场",
    copy:
      "系统把学情报告转成希沃白板讲评页、易课堂变式练习、飞书复核任务和 Aily 学情问答，让批改数据直接形成教学行动。",
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
  { threshold: 0.16 }
);

revealItems.forEach((item) => observer.observe(item));

flowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFlow = Number(button.dataset.flow);
    setFlow(currentFlow);
  });
});

let currentFlow = 0;
setFlow(currentFlow);

window.setInterval(() => {
  currentFlow = (currentFlow + 1) % flowData.length;
  setFlow(currentFlow);
}, 5200);
