/**
 * 前端 AI 客户端
 * ------------------------------------------------------------
 * 只请求本机代理 http://127.0.0.1:8787，不携带云端 Key。
 * 能力：健康检查、名单 VL、卷面题干、通用 chat、模型偏好、调用分析。
 */
(function (global) {
  const DEFAULT_BASE = "http://127.0.0.1:8787";
  const LS_PROXY = "seewo_pi_ai_proxy";
  const LS_VL = "seewo_pi_vl_model";
  const LS_TEXT = "seewo_pi_text_model";
  const LS_LOG = "seewo_pi_ai_call_log";
  const MAX_LOG = 200;

  const DEFAULT_VL = "qwen-vl-max";
  const DEFAULT_TEXT = "qwen-plus";

  /** 会话内缓存最近一次 health */
  let lastHealth = null;
  let logListeners = [];

  function getBase() {
    try {
      const saved = localStorage.getItem(LS_PROXY);
      if (saved) return saved.replace(/\/$/, "");
    } catch (_) {}
    return DEFAULT_BASE;
  }

  function setBase(url) {
    localStorage.setItem(LS_PROXY, String(url || DEFAULT_BASE).replace(/\/$/, ""));
  }

  function getVlModel() {
    try {
      return localStorage.getItem(LS_VL) || DEFAULT_VL;
    } catch (_) {
      return DEFAULT_VL;
    }
  }

  function setVlModel(id) {
    const v = String(id || DEFAULT_VL).trim() || DEFAULT_VL;
    localStorage.setItem(LS_VL, v);
    return v;
  }

  function getTextModel() {
    try {
      return localStorage.getItem(LS_TEXT) || DEFAULT_TEXT;
    } catch (_) {
      return DEFAULT_TEXT;
    }
  }

  function setTextModel(id) {
    const v = String(id || DEFAULT_TEXT).trim() || DEFAULT_TEXT;
    localStorage.setItem(LS_TEXT, v);
    return v;
  }

  function loadLog() {
    try {
      const raw = localStorage.getItem(LS_LOG);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveLog(entries) {
    try {
      localStorage.setItem(LS_LOG, JSON.stringify(entries.slice(0, MAX_LOG)));
    } catch (_) {
      // 配额满时只保留最近 50 条
      try {
        localStorage.setItem(LS_LOG, JSON.stringify(entries.slice(0, 50)));
      } catch (__) {}
    }
  }

  function pushLog(entry) {
    const list = loadLog();
    list.unshift(entry);
    if (list.length > MAX_LOG) list.length = MAX_LOG;
    saveLog(list);
    logListeners.forEach((fn) => {
      try {
        fn(entry, list);
      } catch (_) {}
    });
    return entry;
  }

  function clearLog() {
    saveLog([]);
    logListeners.forEach((fn) => {
      try {
        fn(null, []);
      } catch (_) {}
    });
  }

  function onLog(fn) {
    if (typeof fn === "function") logListeners.push(fn);
    return () => {
      logListeners = logListeners.filter((x) => x !== fn);
    };
  }

  /**
   * 汇总分析
   */
  function analyzeLog(entries) {
    const list = entries || loadLog();
    const total = list.length;
    const ok = list.filter((e) => e.ok).length;
    const fail = total - ok;
    const durations = list.filter((e) => typeof e.ms === "number").map((e) => e.ms);
    const avgMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const maxMs = durations.length ? Math.max(...durations) : 0;
    const minMs = durations.length ? Math.min(...durations) : 0;

    const byKind = {};
    const byModel = {};
    list.forEach((e) => {
      const k = e.kind || "other";
      byKind[k] = byKind[k] || { total: 0, ok: 0, fail: 0, msSum: 0 };
      byKind[k].total += 1;
      if (e.ok) byKind[k].ok += 1;
      else byKind[k].fail += 1;
      if (typeof e.ms === "number") byKind[k].msSum += e.ms;

      const m = e.model || "—";
      byModel[m] = byModel[m] || { total: 0, ok: 0, fail: 0, msSum: 0 };
      byModel[m].total += 1;
      if (e.ok) byModel[m].ok += 1;
      else byModel[m].fail += 1;
      if (typeof e.ms === "number") byModel[m].msSum += e.ms;
    });

    Object.keys(byKind).forEach((k) => {
      const b = byKind[k];
      b.avgMs = b.total ? Math.round(b.msSum / b.total) : 0;
    });
    Object.keys(byModel).forEach((k) => {
      const b = byModel[k];
      b.avgMs = b.total ? Math.round(b.msSum / b.total) : 0;
    });

    const last24h = list.filter((e) => Date.now() - (e.ts || 0) < 86400000).length;
    return {
      total,
      ok,
      fail,
      successRate: total ? Math.round((ok / total) * 1000) / 10 : 0,
      avgMs,
      maxMs,
      minMs,
      byKind,
      byModel,
      last24h,
      recent: list.slice(0, 20),
    };
  }

  async function request(path, options = {}) {
    const base = getBase();
    const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
    const ctrl = new AbortController();
    const timeout = options.timeout || 120000;
    const t = setTimeout(() => ctrl.abort(), timeout);
    const kind = options.kind || path;
    const model = options.model || "";
    const started = performance.now();
    let logMeta = options.logMeta || {};
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      const ms = Math.round(performance.now() - started);
      if (!res.ok || data.ok === false) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        if (options.log !== false) {
          pushLog({
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            ts: Date.now(),
            kind,
            model: data.model || model || "",
            path,
            ok: false,
            ms,
            error: err.message,
            status: res.status,
            ...logMeta,
          });
        }
        throw err;
      }
      if (options.log !== false) {
        pushLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now(),
          kind,
          model: data.model || model || "",
          path,
          ok: true,
          ms,
          // 轻量结果摘要，避免撑爆 localStorage
          summary: summarizeResult(kind, data),
          ...logMeta,
        });
      }
      return data;
    } catch (err) {
      if (options.log !== false && !err.status) {
        // 网络/超时等未在上面记日志
        const ms = Math.round(performance.now() - started);
        pushLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now(),
          kind,
          model: model || "",
          path,
          ok: false,
          ms,
          error: err.name === "AbortError" ? "请求超时" : err.message || String(err),
          ...logMeta,
        });
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  function summarizeResult(kind, data) {
    if (!data || typeof data !== "object") return "";
    if (kind === "roster" || kind === "/api/roster") {
      return `名单 ${data.count ?? (data.students || []).length} 人`;
    }
    if (kind === "page" || kind === "/api/page") {
      return `题干 ${(data.questions || []).length} 道 · ${data.pageRole || ""}`;
    }
    if (kind === "chat" || kind === "/api/chat") {
      const t = data.text || "";
      return t.slice(0, 80) + (t.length > 80 ? "…" : "");
    }
    if (kind === "health" || kind === "/health") {
      return data.configured ? `在线 VL=${data.vlModel}` : "未配置 Key";
    }
    if (kind === "models" || kind === "/api/models") {
      return `可用模型 ${data.count ?? (data.models || []).length}`;
    }
    return data.ok ? "ok" : "";
  }

  async function health(opts = {}) {
    const data = await request("/health", {
      timeout: 8000,
      kind: "health",
      log: opts.log !== false,
    });
    lastHealth = { ...data, at: Date.now() };
    return data;
  }

  function getLastHealth() {
    return lastHealth;
  }

  async function listModels(opts = {}) {
    return request("/api/models", {
      timeout: 30000,
      kind: "models",
      log: opts.log !== false,
    });
  }

  /**
   * File / Blob → data URL
   */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 压缩大图，避免 payload 过大（最长边 maxSide）
   */
  function compressDataURL(dataUrl, maxSide = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function recognizeRoster(imageDataUrlOrFile, opts = {}) {
    let dataUrl =
      typeof imageDataUrlOrFile === "string"
        ? imageDataUrlOrFile
        : await fileToDataURL(imageDataUrlOrFile);
    dataUrl = await compressDataURL(dataUrl, 1600, 0.85);
    const model = opts.model || getVlModel();
    return request("/api/roster", {
      method: "POST",
      body: { image: dataUrl, model },
      timeout: opts.timeout || 120000,
      kind: "roster",
      model,
      logMeta: { label: opts.label || "名单识别" },
    });
  }

  async function recognizePage(imageDataUrlOrFile, opts = {}) {
    let dataUrl =
      typeof imageDataUrlOrFile === "string"
        ? imageDataUrlOrFile
        : await fileToDataURL(imageDataUrlOrFile);
    dataUrl = await compressDataURL(dataUrl, 1600, 0.82);
    const model = opts.model || getVlModel();
    return request("/api/page", {
      method: "POST",
      body: { image: dataUrl, model },
      timeout: opts.timeout || 120000,
      kind: "page",
      model,
      logMeta: { label: opts.label || "题干识别" },
    });
  }

  /**
   * 从 URL 拉图再识别（同源样例）
   */
  async function recognizePageFromUrl(url, opts = {}) {
    const res = await fetch(url);
    const blob = await res.blob();
    return recognizePage(blob, opts);
  }

  async function recognizeRosterFromUrl(url, opts = {}) {
    const res = await fetch(url);
    const blob = await res.blob();
    return recognizeRoster(blob, opts);
  }

  /**
   * 通用文本 chat（文本模型）
   */
  async function chat(messages, opts = {}) {
    const model = opts.model || getTextModel();
    return request("/api/chat", {
      method: "POST",
      body: {
        messages,
        model,
        temperature: opts.temperature,
      },
      timeout: opts.timeout || 90000,
      kind: "chat",
      model,
      logMeta: { label: opts.label || "文本对话" },
    });
  }

  /**
   * 快速连通性测试：health + 可选文本 ping
   */
  async function probe(opts = {}) {
    const result = { health: null, chat: null, models: null, errors: [] };
    try {
      result.health = await health({ log: true });
    } catch (e) {
      result.errors.push({ step: "health", error: e.message });
      return result;
    }
    if (opts.listModels) {
      try {
        result.models = await listModels({ log: true });
      } catch (e) {
        result.errors.push({ step: "models", error: e.message });
      }
    }
    if (opts.pingChat !== false && result.health?.configured) {
      try {
        result.chat = await chat(
          [{ role: "user", content: "只回复两个字：在线" }],
          { label: "连通性探测", temperature: 0 }
        );
      } catch (e) {
        result.errors.push({ step: "chat", error: e.message });
      }
    }
    return result;
  }

  /** 常用 VL / 文本模型建议列表（代理 /api/models 失败时的兜底） */
  const SUGGESTED_VL = [
    "qwen-vl-max",
    "qwen-vl-plus",
    "qwen3-vl-plus",
    "qwen-vl-max-latest",
  ];
  const SUGGESTED_TEXT = [
    "qwen-plus",
    "qwen-max",
    "qwen-turbo",
    "qwen-long",
    "qwen2.5-72b-instruct",
  ];

  global.AIClient = {
    DEFAULT_BASE,
    DEFAULT_VL,
    DEFAULT_TEXT,
    SUGGESTED_VL,
    SUGGESTED_TEXT,
    getBase,
    setBase,
    getVlModel,
    setVlModel,
    getTextModel,
    setTextModel,
    health,
    getLastHealth,
    listModels,
    fileToDataURL,
    compressDataURL,
    recognizeRoster,
    recognizePage,
    recognizePageFromUrl,
    recognizeRosterFromUrl,
    chat,
    probe,
    getLog: loadLog,
    clearLog,
    analyzeLog,
    onLog,
  };
})(window);
