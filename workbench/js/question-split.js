/**
 * 题目切分 / 框选区域 skill（QuestionSplit）
 * ------------------------------------------------------------
 * 目标：同页多题时按「完整本题」裁出可读区域。
 *
 * 几何：
 * - 允许任意凸四边形（非轴对齐矩形），四点 TL→TR→BR→BL，相对页 0~1
 * - 兼容旧 {x,y,w,h} 轴对齐框（自动转成四边形）
 * - 跨区同一题：regions[] 多块，按 order 竖拼
 *
 * 完整度策略：
 * - 默认扩边偏「宁多勿缺」（题号/选项/插图常贴边）
 * - 双栏禁止整页横条；栏内允许与邻题轻微重叠
 * - 裁切输出：将四边形透视/双线性映射为矩形图（结果仍是规整题图）
 */
(function (global) {
  function clamp01(v) {
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  function isBox(b) {
    return (
      b &&
      typeof b.x === "number" &&
      typeof b.y === "number" &&
      typeof b.w === "number" &&
      typeof b.h === "number" &&
      b.w > 0 &&
      b.h > 0
    );
  }

  /** 四点 [[x,y]×4] 或 [{x,y}×4]，TL TR BR BL */
  function isQuad(q) {
    if (!q) return false;
    const pts = normalizeQuadPoints(q);
    return pts && pts.length === 4;
  }

  function normalizeQuadPoints(q) {
    if (!q) return null;
    let pts = null;
    if (Array.isArray(q) && q.length === 4) {
      pts = q.map((p) =>
        Array.isArray(p)
          ? [Number(p[0]), Number(p[1])]
          : [Number(p.x), Number(p.y)]
      );
    } else if (q.quad) {
      return normalizeQuadPoints(q.quad);
    } else if (q.points) {
      return normalizeQuadPoints(q.points);
    }
    if (!pts || pts.length !== 4) return null;
    if (pts.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1]))) return null;
    return pts.map((p) => [clamp01(p[0]), clamp01(p[1])]);
  }

  function boxToQuad(b) {
    if (!isBox(b)) return null;
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }

  function aabbOfQuad(quad) {
    const pts = normalizeQuadPoints(quad);
    if (!pts) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const x1 = Math.max(...xs);
    const y1 = Math.max(...ys);
    return {
      x: +x0.toFixed(4),
      y: +y0.toFixed(4),
      w: +(x1 - x0).toFixed(4),
      h: +(y1 - y0).toFixed(4),
    };
  }

  function unionBoxes(boxes) {
    const list = (boxes || []).filter(isBox);
    if (!list.length) return null;
    let x0 = 1,
      y0 = 1,
      x1 = 0,
      y1 = 0;
    list.forEach((b) => {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    });
    return {
      x: +x0.toFixed(4),
      y: +y0.toFixed(4),
      w: +(x1 - x0).toFixed(4),
      h: +(y1 - y0).toFixed(4),
    };
  }

  /**
   * 扩边：默认偏完整（题号/末行选项常被切掉）
   * 禁止大 minW 把双栏拉成跨栏横条
   */
  function expandBox(bbox, opts = {}) {
    if (!isBox(bbox)) return null;
    const padX = opts.padX ?? 0.028;
    const padY = opts.padY ?? 0.028;
    const minW = opts.minW ?? 0;
    const minH = opts.minH ?? 0;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    let w = Math.min(1, bbox.w + padX * 2);
    let h = Math.min(1, bbox.h + padY * 2);
    if (minW > 0) w = Math.max(w, Math.min(1, minW));
    if (minH > 0) h = Math.max(h, Math.min(1, minH));
    let x = clamp01(cx - w / 2);
    let y = clamp01(cy - h / 2);
    x = Math.min(x, 1 - w);
    y = Math.min(y, 1 - h);
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    return {
      x: +x.toFixed(4),
      y: +y.toFixed(4),
      w: +w.toFixed(4),
      h: +h.toFixed(4),
    };
  }

  /** 四边形沿法向/中心外扩（相对页），保持四边形；宁多勿缺 */
  function expandQuad(quad, opts = {}) {
    const pts = normalizeQuadPoints(quad);
    if (!pts) return null;
    const padX = opts.padX ?? 0.028;
    const padY = opts.padY ?? 0.028;
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
    const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    // 按相对中心方向外推；pad 映射为约 bbox 尺寸比例
    const bb = aabbOfQuad(pts);
    const sx = bb.w > 0 ? padX / bb.w : 0;
    const sy = bb.h > 0 ? padY / bb.h : 0;
    // 更强外扩，优先保证整题完整
    const scale = 1 + Math.max(sx, sy) * 2.4;
    const out = pts.map(([x, y]) => {
      const nx = cx + (x - cx) * scale;
      const ny = cy + (y - cy) * scale;
      // 额外轴向 pad（上下略大于左右，兜底末行选项）
      const ax = nx + Math.sign(nx - cx || 1) * padX * 0.55;
      const ay = ny + Math.sign(ny - cy || 1) * padY * 0.7;
      return [clamp01(ax), clamp01(ay)];
    });
    return out.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  }

  function looksLikeFullWidthStrip(b) {
    return isBox(b) && b.w >= 0.72 && b.h <= 0.14;
  }

  /**
   * 双栏槽位：默认轻微重叠，保证题干+选项完整
   * 返回 {no, bbox, quad, layout, col}
   */
  function estimateTwoColumnSlots(n, opts = {}) {
    const total = Math.max(1, n | 0);
    const leftN = opts.leftN != null ? opts.leftN : Math.ceil(total / 2);
    const y0 = opts.y0 ?? 0.082;
    const y1 = opts.y1 ?? 0.958;
    const lx0 = opts.lx0 ?? 0.025;
    const lx1 = opts.lx1 ?? 0.508;
    const rx0 = opts.rx0 ?? 0.48;
    const rx1 = opts.rx1 ?? 0.975;
    // 负 gap / overlap：与邻题明显重叠，优先整题完整（可多含邻题墨水）
    const gapY = opts.gapY ?? -0.04;
    const overlap = opts.overlap != null ? opts.overlap : 0.32; // 相对 step 的额外高度
    const skew = opts.skew ?? 0.012; // 轻微非轴对齐四边形
    const slots = [];
    const leftCount = Math.min(leftN, total);
    const rightCount = Math.max(0, total - leftCount);

    const place = (count, colX0, colX1, startNo, col) => {
      if (count <= 0) return;
      const usable = y1 - y0;
      const step = usable / count;
      // 高度 = step + 重叠；gapY 负值再额外加高
      let h = Math.max(0.07, step * (1 + overlap) - Math.min(0, gapY) * 0.25);
      for (let i = 0; i < count; i++) {
        const cy = y0 + (i + 0.5) * step;
        let y = clamp01(cy - h / 2);
        if (y + h > 0.978) {
          y = Math.max(0.02, 0.978 - h);
          h = Math.min(h, 0.978 - y);
        }
        const bbox = {
          x: +colX0.toFixed(4),
          y: +y.toFixed(4),
          w: +(colX1 - colX0).toFixed(4),
          h: +h.toFixed(4),
        };
        // 梯形：外缘略斜，贴合摊开书页
        let quad;
        if (col === "L") {
          quad = [
            [colX0 + skew * 0.15, y],
            [colX1 - skew * 0.05, y],
            [colX1 + skew * 0.18, y + h],
            [colX0 - skew * 0.3, y + h],
          ];
        } else {
          quad = [
            [colX0 - skew * 0.08, y],
            [colX1 - skew * 0.15, y],
            [colX1 + skew * 0.3, y + h],
            [colX0 + skew * 0.12, y + h],
          ];
        }
        quad = normalizeQuadPoints(quad);
        slots.push({
          no: String(startNo + i),
          bbox: aabbOfQuad(quad) || bbox,
          quad,
          layout: "two_col",
          col,
        });
      }
    };
    place(leftCount, lx0, lx1, 1, "L");
    place(rightCount, rx0, rx1, leftCount + 1, "R");
    return slots;
  }

  function estimateSingleColumnSlots(n, opts = {}) {
    const total = Math.max(1, n | 0);
    const y0 = opts.y0 ?? 0.1;
    const y1 = opts.y1 ?? 0.94;
    const x0 = opts.x0 ?? 0.06;
    const x1 = opts.x1 ?? 0.94;
    const gapY = opts.gapY ?? -0.03;
    const overlap = opts.overlap != null ? opts.overlap : 0.28;
    const usable = y1 - y0;
    const step = usable / total;
    const h = Math.max(0.08, step * (1 + overlap) - Math.min(0, gapY) * 0.2);
    const out = [];
    for (let i = 0; i < total; i++) {
      const y = Math.min(y1 - h, y0 + i * step);
      const bbox = {
        x: +x0.toFixed(4),
        y: +y.toFixed(4),
        w: +(x1 - x0).toFixed(4),
        h: +h.toFixed(4),
      };
      out.push({
        no: String(i + 1),
        bbox,
        quad: boxToQuad(bbox),
        layout: "single_col",
      });
    }
    return out;
  }

  function shouldUseTwoColumn(pageQuestions, hints = {}) {
    if (hints.twoColumn === true) return true;
    if (hints.twoColumn === false) return false;
    const qs = pageQuestions || [];
    if (qs.length < 6) return false;
    const strips = qs.filter((q) =>
      looksLikeFullWidthStrip(q.bbox || q.archive?.bbox)
    ).length;
    return strips >= Math.max(4, qs.length * 0.5);
  }

  /**
   * 统一 region 结构：
   * { order, role, quad:[[x,y]×4], bbox:{x,y,w,h} }
   */
  function coerceRegion(r, order = 0) {
    if (!r) return null;
    if (isQuad(r.quad || r.points || r)) {
      const quad = normalizeQuadPoints(r.quad || r.points || r);
      return {
        order: r.order != null ? r.order : order,
        role: r.role || "part",
        quad,
        bbox: aabbOfQuad(quad),
        // 兼容旧字段
        x: aabbOfQuad(quad).x,
        y: aabbOfQuad(quad).y,
        w: aabbOfQuad(quad).w,
        h: aabbOfQuad(quad).h,
      };
    }
    if (isBox(r)) {
      const quad = boxToQuad(r);
      return {
        order: r.order != null ? r.order : order,
        role: r.role || "part",
        quad,
        bbox: { x: r.x, y: r.y, w: r.w, h: r.h },
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      };
    }
    return null;
  }

  function regionsOf(q) {
    const raw =
      q?.regions ||
      q?.archive?.regions ||
      q?.dual?.archive?.regions ||
      null;
    if (Array.isArray(raw) && raw.length) {
      return raw
        .map((r, i) => coerceRegion(r, i))
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
    }
    // top-level quad
    const tq =
      q?.quad ||
      q?.archive?.quad ||
      q?.dual?.archive?.quad ||
      null;
    if (tq) {
      const reg = coerceRegion({ quad: tq, role: "stem", order: 0 }, 0);
      return reg ? [reg] : [];
    }
    const b = q?.bbox || q?.archive?.bbox || q?.dual?.archive?.bbox;
    const reg = coerceRegion(b, 0);
    return reg ? [{ ...reg, role: "stem" }] : [];
  }

  function normalizeQuestionGeometry(q, pageQuestions = null, hints = {}) {
    const no = String(q?.no ?? "");
    let regions = regionsOf(q);
    let layout = q?.layout || q?.archive?.layout || "unknown";
    let source = "prelabel";
    const siblings = pageQuestions || [];

    const onlyStrip =
      regions.length === 1 && looksLikeFullWidthStrip(regions[0].bbox || regions[0]);

    if (siblings.length && shouldUseTwoColumn(siblings, hints) && onlyStrip) {
      const slots = estimateTwoColumnSlots(siblings.length, {
        ...(hints.twoCol || {}),
        gapY: hints.twoCol?.gapY ?? -0.04,
        overlap: hints.twoCol?.overlap ?? 0.32,
      });
      const sorted = siblings.slice().sort((a, b) => {
        const na = parseInt(a.no, 10);
        const nb = parseInt(b.no, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.no).localeCompare(String(b.no), "zh");
      });
      let idx = sorted.findIndex(
        (s) => String(s.qid || s.id) === String(q.qid || q.id)
      );
      if (idx < 0) idx = sorted.findIndex((s) => String(s.no) === no);
      if (idx < 0) idx = 0;
      const slot = slots[Math.min(idx, slots.length - 1)];
      if (slot) {
        regions = [
          coerceRegion(
            { quad: slot.quad, bbox: slot.bbox, role: "stem", order: 0 },
            0
          ),
        ];
        layout = "two_col";
        source = "two_col_reslot";
      }
    }

    if (regions.length > 1) {
      layout = "multi_region";
      regions = regions
        .slice()
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          const ay = a.bbox?.y ?? 0;
          const by = b.bbox?.y ?? 0;
          if (Math.abs(ay - by) > 0.04) return ay - by;
          return (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0);
        })
        .map((r, i) => ({ ...r, order: i }));
    } else if (layout === "unknown" && regions[0]?.bbox) {
      layout = regions[0].bbox.w < 0.55 ? "two_col" : "single_col";
    }

    const bbox = unionBoxes(regions.map((r) => r.bbox).filter(Boolean));
    const primaryQuad = regions[0]?.quad || (bbox ? boxToQuad(bbox) : null);
    return {
      layout,
      bbox,
      quad: primaryQuad,
      regions,
      pageId: q?.pageId || q?.archive?.pageId || "",
      conf: q?.conf ?? 0.85,
      source,
    };
  }

  function normalizePageQuestions(questions, hints = {}) {
    const list = questions || [];
    return list.map((q) => ({
      q,
      geo: normalizeQuestionGeometry(q, list, hints),
    }));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = src;
    });
  }

  function dist(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return Math.hypot(dx, dy);
  }

  /**
   * 将凸四边形双线性映射到矩形 canvas（完整题图）
   * dest (u,v)∈[0,1]² → src = (1-u)(1-v)TL + u(1-v)TR + u v BR + (1-u)v BL
   */
  function warpQuadToCanvas(img, quad, opts = {}) {
    const pts = normalizeQuadPoints(quad);
    if (!pts || !img) return null;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) return null;

    const [tl, tr, br, bl] = pts.map((p) => [p[0] * nw, p[1] * nh]);
    const top = dist(tl, tr);
    const bot = dist(bl, br);
    const left = dist(tl, bl);
    const right = dist(tr, br);
    const avgW = (top + bot) / 2;
    const avgH = (left + right) / 2;
    if (avgW < 2 || avgH < 2) return null;

    const maxEdge = opts.maxEdge || 1600;
    let outW = Math.round(avgW);
    let outH = Math.round(avgH);
    const sc = Math.min(1, maxEdge / Math.max(outW, outH));
    outW = Math.max(2, Math.round(outW * sc));
    outH = Math.max(2, Math.round(outH * sc));

    // 源图采样：先画到临时 canvas 取像素
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = nw;
    srcCanvas.height = nh;
    const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!sctx) return null;
    sctx.drawImage(img, 0, 0);
    let srcData;
    try {
      srcData = sctx.getImageData(0, 0, nw, nh);
    } catch {
      // 跨域失败：退回 AABB 裁切
      return null;
    }
    const src = srcData.data;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const octx = outCanvas.getContext("2d");
    if (!octx) return null;
    const outImg = octx.createImageData(outW, outH);
    const dst = outImg.data;

    const sample = (x, y) => {
      // bilinear sample
      const x0 = Math.max(0, Math.min(nw - 1, Math.floor(x)));
      const y0 = Math.max(0, Math.min(nh - 1, Math.floor(y)));
      const x1 = Math.max(0, Math.min(nw - 1, x0 + 1));
      const y1 = Math.max(0, Math.min(nh - 1, y0 + 1));
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * nw + x0) * 4;
      const i10 = (y0 * nw + x1) * 4;
      const i01 = (y1 * nw + x0) * 4;
      const i11 = (y1 * nw + x1) * 4;
      const r =
        src[i00] * (1 - fx) * (1 - fy) +
        src[i10] * fx * (1 - fy) +
        src[i01] * (1 - fx) * fy +
        src[i11] * fx * fy;
      const g =
        src[i00 + 1] * (1 - fx) * (1 - fy) +
        src[i10 + 1] * fx * (1 - fy) +
        src[i01 + 1] * (1 - fx) * fy +
        src[i11 + 1] * fx * fy;
      const b =
        src[i00 + 2] * (1 - fx) * (1 - fy) +
        src[i10 + 2] * fx * (1 - fy) +
        src[i01 + 2] * (1 - fx) * fy +
        src[i11 + 2] * fx * fy;
      return [r, g, b];
    };

    for (let j = 0; j < outH; j++) {
      const v = outH === 1 ? 0 : j / (outH - 1);
      for (let i = 0; i < outW; i++) {
        const u = outW === 1 ? 0 : i / (outW - 1);
        // bilinear patch
        const x =
          (1 - u) * (1 - v) * tl[0] +
          u * (1 - v) * tr[0] +
          u * v * br[0] +
          (1 - u) * v * bl[0];
        const y =
          (1 - u) * (1 - v) * tl[1] +
          u * (1 - v) * tr[1] +
          u * v * br[1] +
          (1 - u) * v * bl[1];
        const [r, g, b] = sample(x, y);
        const o = (j * outW + i) * 4;
        dst[o] = r;
        dst[o + 1] = g;
        dst[o + 2] = b;
        dst[o + 3] = 255;
      }
    }
    octx.putImageData(outImg, 0, 0);
    return outCanvas;
  }

  /** AABB 快速裁切（warp 失败时） */
  function cropAabbCanvas(img, bbox, opts = {}) {
    if (!img || !isBox(bbox)) return null;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const region = expandBox(bbox, opts) || bbox;
    let sx = Math.floor(region.x * nw);
    let sy = Math.floor(region.y * nh);
    let sw = Math.max(1, Math.ceil(region.w * nw));
    let sh = Math.max(1, Math.ceil(region.h * nh));
    if (sx < 0) {
      sw += sx;
      sx = 0;
    }
    if (sy < 0) {
      sh += sy;
      sy = 0;
    }
    if (sx + sw > nw) sw = nw - sx;
    if (sy + sh > nh) sh = nh - sy;
    if (sw < 1 || sh < 1) return null;
    const maxEdge = opts.maxEdge || 1600;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    return canvas;
  }

  /**
   * 按 regions（每块可为四边形）裁切并竖拼
   */
  async function cropQuestionRegions(src, regions, opts = {}) {
    const list = (regions || [])
      .map((r, i) => coerceRegion(r, i))
      .filter(Boolean);
    if (!src || !list.length) return null;

    const padOpts = {
      padX: opts.padX ?? 0.03,
      padY: opts.padY ?? 0.03,
      minW: opts.minW ?? 0,
      minH: opts.minH ?? 0,
      maxEdge: opts.maxEdge || 1600,
    };

    let img;
    try {
      img = await loadImage(src);
    } catch {
      return null;
    }

    const gap = opts.gap ?? 10;
    const partCanvases = [];
    for (const reg of list) {
      let quad = reg.quad;
      if (quad) {
        quad = expandQuad(quad, padOpts) || quad;
      }
      let canvas = quad ? warpQuadToCanvas(img, quad, padOpts) : null;
      if (!canvas && reg.bbox) {
        canvas = cropAabbCanvas(img, reg.bbox, padOpts);
      }
      if (canvas) partCanvases.push(canvas);
    }
    if (!partCanvases.length) return null;

    if (partCanvases.length === 1) {
      try {
        return partCanvases[0].toDataURL("image/jpeg", 0.92);
      } catch {
        return null;
      }
    }

    // 竖拼：统一宽度
    const targetW = Math.min(
      padOpts.maxEdge,
      Math.max(...partCanvases.map((c) => c.width))
    );
    const scaled = partCanvases.map((c) => {
      const sc = targetW / c.width;
      return {
        c,
        dw: targetW,
        dh: Math.max(1, Math.round(c.height * sc)),
      };
    });
    const totalH =
      scaled.reduce((s, p) => s + p.dh, 0) +
      gap * Math.max(0, scaled.length - 1);
    const scaleAll = Math.min(1, padOpts.maxEdge / Math.max(targetW, totalH));
    const cw = Math.max(1, Math.round(targetW * scaleAll));
    const ch = Math.max(1, Math.round(totalH * scaleAll));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0f1720";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    let y = 0;
    scaled.forEach((p, i) => {
      const dw = Math.round(p.dw * scaleAll);
      const dh = Math.round(p.dh * scaleAll);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, y, dw, dh);
      ctx.drawImage(p.c, 0, 0, p.c.width, p.c.height, 0, y, dw, dh);
      y += dh;
      if (i < scaled.length - 1) {
        const g = Math.round(gap * scaleAll);
        ctx.fillStyle = "#0f1720";
        ctx.fillRect(0, y, cw, g);
        ctx.strokeStyle = "rgba(77,141,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(8, y + g / 2);
        ctx.lineTo(cw - 8, y + g / 2);
        ctx.stroke();
        y += g;
      }
    });
    try {
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      return null;
    }
  }

  async function cropQuestion(src, q, pageQuestions = null, opts = {}) {
    const geo = normalizeQuestionGeometry(q, pageQuestions, opts.hints || {});
    if (!geo.regions.length) return null;
    return cropQuestionRegions(src, geo.regions, opts);
  }

  /** CSS clip-path polygon 字符串（百分比） */
  function quadToClipPath(quad) {
    const pts = normalizeQuadPoints(quad);
    if (!pts) return "";
    return (
      "polygon(" +
      pts.map((p) => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`).join(", ") +
      ")"
    );
  }

  global.QuestionSplit = {
    isBox,
    isQuad,
    clamp01,
    normalizeQuadPoints,
    boxToQuad,
    aabbOfQuad,
    unionBoxes,
    expandBox,
    expandQuad,
    looksLikeFullWidthStrip,
    estimateTwoColumnSlots,
    estimateSingleColumnSlots,
    shouldUseTwoColumn,
    coerceRegion,
    regionsOf,
    normalizeQuestionGeometry,
    normalizePageQuestions,
    cropQuestionRegions,
    cropQuestion,
    warpQuadToCanvas,
    quadToClipPath,
  };
})(window);
