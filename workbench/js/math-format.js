/**
 * 标准字符化 · 数学公式渲染
 * ------------------------------------------------------------
 * 目标：题干/答案以接近 Word 公式的效果展示（KaTeX）。
 * 同时约定「双存档」数据结构：
 *  - standard：标准字符化（LaTeX 源 + 渲染 HTML）
 *  - archive：原始图片页 + 框选 bbox（永不丢）
 */
(function (global) {
  /**
   * 转义 HTML 文本节点
   */
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 将含 $...$ / $$...$$ / \(...\) / \[...\] 的文本渲染为 HTML
   * 无 KaTeX 时降级为等宽原文，保证 Demo 可离线弱化展示
   */
  function renderMathText(input, opts = {}) {
    const text = String(input || "");
    if (!text.trim()) return "";

    const displayModeDefault = !!opts.displayMode;
    const katex = global.katex;

    // 分段：块公式优先，再行内
    const parts = [];
    const re =
      /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$((?:\\.|[^$])+?)\$|\\\(([\s\S]+?)\\\)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        parts.push({ type: "text", value: text.slice(last, m.index) });
      }
      if (m[1] != null) parts.push({ type: "math", value: m[1], display: true });
      else if (m[2] != null) parts.push({ type: "math", value: m[2], display: true });
      else if (m[3] != null) parts.push({ type: "math", value: m[3], display: false });
      else if (m[4] != null) parts.push({ type: "math", value: m[4], display: false });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

    // 整段像裸 LaTeX（无 $ 包裹）且含命令时，整段当公式
    if (parts.length === 1 && parts[0].type === "text" && /\\[a-zA-Z]+/.test(parts[0].value)) {
      parts[0] = { type: "math", value: parts[0].value, display: displayModeDefault };
    }

    return parts
      .map((p) => {
        if (p.type === "text") {
          return escapeHtml(p.value).replace(/\n/g, "<br/>");
        }
        const latex = p.value.trim();
        if (!katex) {
          return `<code class="math-fallback">${escapeHtml(latex)}</code>`;
        }
        try {
          return katex.renderToString(latex, {
            throwOnError: false,
            displayMode: p.display || displayModeDefault,
            strict: "ignore",
            output: "html",
          });
        } catch (e) {
          return `<code class="math-fallback">${escapeHtml(latex)}</code>`;
        }
      })
      .join("");
  }

  /**
   * 创建标准双存档题对象
   */
  function createDualArchiveQuestion(partial = {}) {
    const stemLatex = partial.stemLatex || partial.stem || "";
    const answerLatex = partial.answerLatex || partial.answer || "";
    return {
      qid: partial.qid || `q_${Math.random().toString(36).slice(2, 9)}`,
      no: partial.no || "",
      type: partial.type || "简答",
      maxScore: partial.maxScore ?? 5,
      knowledge: partial.knowledge || [],
      paperId: partial.paperId || "",
      // —— 标准字符化 ——
      standard: {
        stemLatex,
        answerLatex,
        options: partial.options || [], // [{key:'A', latex:'...'}]
        steps: partial.steps || [], // [{text, score}]
        rubric: partial.rubric || [],
        confirmed: !!partial.confirmed,
      },
      // —— 原始图片存档 ——
      archive: {
        pageId: partial.pageId || "",
        pagePath: partial.pagePath || partial.sourceImage || "",
        bbox: partial.bbox || null, // {x,y,w,h} 相对 0~1
        note: partial.archiveNote || "原图存档，框选区域对应本题",
      },
      match: {
        answerPageId: partial.answerPageId || null,
        answerNo: partial.answerNo || null,
        score: partial.matchScore ?? null,
        source: partial.matchSource || "", // keybook | ai | manual
        paperId: partial.paperId || null,
      },
      conf: partial.conf ?? 0.8,
    };
  }

  /**
   * 在容器内渲染题卡（标准字符 + 原图）
   */
  function mountQuestionCard(el, q, opts = {}) {
    if (!el || !q) return;
    const showEdit = !!opts.editable;
    const st = q.standard || {};
    const ar = q.archive || {};
    const bbox = ar.bbox;
    const stemHtml = renderMathText(st.stemLatex || "");
    const ansHtml = renderMathText(st.answerLatex || "");
    const optsHtml = (st.options || [])
      .map(
        (o) =>
          `<div class="math-option"><span class="math-opt-key">${escapeHtml(
            o.key
          )}.</span> <span class="math-opt-body">${renderMathText(o.latex || o.text || "")}</span></div>`
      )
      .join("");

    const clipStyle = bbox
      ? `--bx:${bbox.x};--by:${bbox.y};--bw:${bbox.w};--bh:${bbox.h};`
      : "";

    el.innerHTML = `
      <div class="dual-archive-card" data-qid="${escapeHtml(q.qid)}" style="${clipStyle}">
        <div class="dual-archive-grid">
          <div class="dual-archive-side">
            <div class="dual-label">原始图片存档 ${bbox ? "· 框选区" : ""}</div>
            <div class="archive-viewport">
              ${
                ar.pagePath
                  ? `<img src="${escapeHtml(ar.pagePath)}" alt="原图" class="archive-full" />
                     ${
                       bbox
                         ? `<div class="archive-bbox" title="题目框选"></div>`
                         : ""
                     }`
                  : `<div class="empty-hint">无原图</div>`
              }
            </div>
            <div class="small muted mt-8">${escapeHtml(ar.pageId || "")} ${
              bbox
                ? `· bbox (${(bbox.x * 100).toFixed(0)}%,${(bbox.y * 100).toFixed(0)}%)`
                : ""
            }</div>
          </div>
          <div class="dual-archive-side">
            <div class="dual-label">标准字符化（公式可渲染）
              ${st.confirmed ? `<span class="badge ok">已确认</span>` : `<span class="badge review">待确认</span>`}
            </div>
            <div class="standard-preview">
              <div class="q-type-row">
                <strong>第 ${escapeHtml(String(q.no))} 题</strong>
                <span class="tag">${escapeHtml(q.type)}</span>
                <span class="tag">${q.maxScore} 分</span>
              </div>
              <div class="math-block stem-block">${stemHtml || "<span class='muted'>（无题干）</span>"}</div>
              ${optsHtml ? `<div class="math-options">${optsHtml}</div>` : ""}
              <div class="section-mini">参考答案</div>
              <div class="math-block ans-block">${ansHtml || "<span class='muted'>（未制答）</span>"}</div>
              ${
                (st.steps || []).length
                  ? `<div class="section-mini">过程要点</div>
                     <div class="steps">${(st.steps || [])
                       .map(
                         (s) =>
                           `<div class="step ok"><span>${renderMathText(
                             s.text || s.step || ""
                           )}</span><span>${s.score ?? ""} 分</span></div>`
                       )
                       .join("")}</div>`
                  : ""
              }
            </div>
            ${
              showEdit
                ? `<div class="standard-edit mt-12">
                    <label class="small muted">题干 LaTeX（可改）</label>
                    <textarea class="text-input math-src" data-field="stemLatex" rows="3">${escapeHtml(
                      st.stemLatex || ""
                    )}</textarea>
                    <label class="small muted mt-8">答案 LaTeX（可改）</label>
                    <textarea class="text-input math-src" data-field="answerLatex" rows="2">${escapeHtml(
                      st.answerLatex || ""
                    )}</textarea>
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>`;
  }

  /**
   * 将 LaTeX 源同步回对象并刷新预览（用于编辑）
   */
  function bindEditableCard(el, q, onChange) {
    if (!el) return;
    el.querySelectorAll(".math-src").forEach((ta) => {
      ta.addEventListener("input", () => {
        const field = ta.dataset.field;
        if (!q.standard) q.standard = {};
        q.standard[field] = ta.value;
        q.standard.confirmed = false;
        // 仅刷新预览区，保留焦点：重挂载较粗，局部更新
        const stem = el.querySelector(".stem-block");
        const ans = el.querySelector(".ans-block");
        if (stem && field === "stemLatex") stem.innerHTML = renderMathText(ta.value);
        if (ans && field === "answerLatex") ans.innerHTML = renderMathText(ta.value);
        onChange?.(q);
      });
    });
  }

  global.MathFormat = {
    escapeHtml,
    renderMathText,
    createDualArchiveQuestion,
    mountQuestionCard,
    bindEditableCard,
  };
})(window);
