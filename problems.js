/**
 * 渲染首页 #problems 命题对照（数据：data/topic-brief.js，摘自题目.html）
 */
(function () {
  const data = window.TOPIC_BRIEF;
  if (!data) {
    const lead = document.getElementById("scene-lead");
    if (lead) {
      lead.textContent =
        "未能载入命题数据。请确认 ./data/topic-brief.js 可访问。";
    }
    return;
  }

  const lead = document.getElementById("scene-lead");
  if (lead && data.scene) {
    lead.textContent = `${data.scene.problem} ${data.scene.goal}`;
  }

  const meta = document.getElementById("source-meta");
  if (meta && data.source) {
    meta.innerHTML = [
      data.source.file,
      data.source.track,
      data.source.enterprise,
      data.source.slogan,
    ]
      .filter(Boolean)
      .map((t) => `<span>${escapeHtml(t)}</span>`)
      .join("");
  }

  const capList = document.getElementById("capability-list");
  if (capList) {
    capList.innerHTML = (data.capabilities || []).map(renderCard).join("");
  }

  const delList = document.getElementById("delivery-list");
  if (delList) {
    delList.innerHTML = (data.delivery || []).map(renderCard).join("");
  }

  const extraList = document.getElementById("extra-list");
  if (extraList) {
    extraList.innerHTML = (data.extras || [])
      .map(
        (item) => `
      <article class="extra-card">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.note)}</p>
      </article>`
      )
      .join("");
  }

  function renderCard(item) {
    return `
      <article class="problem-card" id="topic-${escapeAttr(item.id || "")}">
        <div class="no">${escapeHtml(item.no || "")}</div>
        <h3>${escapeHtml(item.title || "")}</h3>
        <div class="pair">
          <span class="label">命题</span>
          <div>
            <p>${escapeHtml(item.problem || "")}</p>
          </div>
        </div>
        <div class="pair">
          <span class="label is-sol">方案</span>
          <div>
            <p>${escapeHtml(item.solution || "")}</p>
            ${
              item.proof
                ? `<p class="proof">落点：${escapeHtml(item.proof)}</p>`
                : ""
            }
          </div>
        </div>
      </article>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }
})();
