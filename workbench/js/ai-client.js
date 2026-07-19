/**
 * 前端 AI 客户端
 * ------------------------------------------------------------
 * 只请求本机代理 http://127.0.0.1:8787，不携带云端 Key。
 * 能力：健康检查、名单 VL 识别、卷面题干框识别。
 */
(function (global) {
  const DEFAULT_BASE = "http://127.0.0.1:8787";

  function getBase() {
    try {
      const saved = localStorage.getItem("seewo_pi_ai_proxy");
      if (saved) return saved.replace(/\/$/, "");
    } catch (_) {}
    return DEFAULT_BASE;
  }

  function setBase(url) {
    localStorage.setItem("seewo_pi_ai_proxy", String(url || DEFAULT_BASE).replace(/\/$/, ""));
  }

  async function request(path, options = {}) {
    const base = getBase();
    const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
    const ctrl = new AbortController();
    const timeout = options.timeout || 120000;
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  async function health() {
    return request("/health", { timeout: 8000 });
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

  async function recognizeRoster(imageDataUrlOrFile) {
    let dataUrl =
      typeof imageDataUrlOrFile === "string"
        ? imageDataUrlOrFile
        : await fileToDataURL(imageDataUrlOrFile);
    dataUrl = await compressDataURL(dataUrl, 1600, 0.85);
    return request("/api/roster", {
      method: "POST",
      body: { image: dataUrl },
      timeout: 120000,
    });
  }

  async function recognizePage(imageDataUrlOrFile) {
    let dataUrl =
      typeof imageDataUrlOrFile === "string"
        ? imageDataUrlOrFile
        : await fileToDataURL(imageDataUrlOrFile);
    dataUrl = await compressDataURL(dataUrl, 1600, 0.82);
    return request("/api/page", {
      method: "POST",
      body: { image: dataUrl },
      timeout: 120000,
    });
  }

  /**
   * 从 URL 拉图再识别（同源样例）
   */
  async function recognizePageFromUrl(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return recognizePage(blob);
  }

  async function recognizeRosterFromUrl(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return recognizeRoster(blob);
  }

  global.AIClient = {
    getBase,
    setBase,
    health,
    fileToDataURL,
    compressDataURL,
    recognizeRoster,
    recognizePage,
    recognizePageFromUrl,
    recognizeRosterFromUrl,
  };
})(window);
