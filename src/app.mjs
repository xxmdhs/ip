/**
 * OCR · 简洁版
 * 单图工作流：粘贴 / 拖入 / 选择 → 自动识别。
 * 图片居中占主位；滚轮缩放、拖拽平移、图片上直接选词复制、框选重识。
 * 模型进度等细节只打 console，界面保持干净。
 */
import { loadTinyAssets, createPipeline, TINY_PARAMS } from "./ppocr.mjs";

const MODEL_BASE = new URL("../models/ppocrv6-tiny/", import.meta.url).href.replace(/\/$/, "");

async function fileToImageData(file) {
  if (!file.type.startsWith("image/")) throw new Error("不是图片文件");
  if (!file.size) throw new Error("空文件");
  if ("createImageBitmap" in window) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return ctx.getImageData(0, 0, c.width, c.height);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片解码失败"));
      el.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cropImageData(src, x0, y0, x1, y1) {
  const sx = Math.max(0, Math.floor(Math.min(x0, x1)));
  const sy = Math.max(0, Math.floor(Math.min(y0, y1)));
  const ex = Math.min(src.width, Math.ceil(Math.max(x0, x1)));
  const ey = Math.min(src.height, Math.ceil(Math.max(y0, y1)));
  const w = ex - sx;
  const h = ey - sy;
  if (w < 4 || h < 4) return null;
  const out = new ImageData(w, h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = ((sy + r) * src.width + (sx + c)) * 4;
      const d = (r * w + c) * 4;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = src.data[s + 3];
    }
  }
  return { crop: out, sx, sy };
}

class OcrApp extends HTMLElement {
  imageData = null;
  imgUrl = "";
  results = [];
  status = "idle"; // idle | loading-model | recognizing | ready
  statusText = "本地识别 · 图片不上传";
  running = false;
  pipeline = null;
  selected = -1;
  cropMode = false;
  _moved = false;

  // 视图变换（图片像素 → 屏幕像素）
  scale = 1;
  tx = 0;
  ty = 0;
  fitScale = 1;

  connectedCallback() {
    this.render();
    this.bindGlobal();
    this.ensureEngine().catch(() => {});
  }

  /* ---------- 引擎（信息只打 console） ---------- */

  async ensureEngine() {
    if (this.pipeline) return this.pipeline;
    this.setStatus("loading-model", "准备模型…");
    try {
      const assets = await loadTinyAssets(MODEL_BASE, ({ label, pct }) => {
        console.log(`[model] ${label} ${Math.round(pct ?? 0)}%`);
      });
      console.log("[model] 初始化推理后端 webgpu → webgl → wasm …");
      this.pipeline = await createPipeline(assets, TINY_PARAMS, (ep, err) => {
        console.warn(`[${ep}] 不可用:`, err?.message ?? err);
      });
      console.log(`[model] 就绪 · 后端 ${this.pipeline.backend} · 字典 ${TINY_PARAMS.dictSize}`);
      if (!this.imageData) this.setStatus("idle", "本地识别 · 图片不上传");
      return this.pipeline;
    } catch (e) {
      console.error("[model] 加载失败:", e);
      this.setStatus("idle", "模型加载失败，看控制台");
      throw e;
    }
  }

  setStatus(status, text) {
    this.status = status;
    if (text != null) this.statusText = text;
    const el = this.querySelector("[data-status-text]");
    const spin = this.querySelector("[data-spin]");
    if (el) el.textContent = this.statusText;
    if (spin) spin.style.display = status === "loading-model" || status === "recognizing" ? "" : "none";
    const busy = this.querySelector("[data-busy]");
    if (busy) busy.style.display = status === "recognizing" ? "flex" : "none";
  }

  /* ---------- 图片接入：粘贴即识别 ---------- */

  async addFiles(fileList) {
    const file = [...fileList].find((f) => f.type.startsWith("image/") && f.size > 0);
    if (!file) return;
    if (this.running) return;
    try {
      const imageData = await fileToImageData(file);
      if (this.imgUrl) URL.revokeObjectURL(this.imgUrl);
      this.imgUrl = URL.createObjectURL(file);
      this.imageData = imageData;
      this.results = [];
      this.selected = -1;
      this.cropMode = false;
      this.paintCropBtn();
      this.paintImage();
      this.paintSide();
      // 摆好位置后直接开始识别
      this.fit();
      this.recognize();
    } catch (e) {
      console.error(e);
      this.setStatus("idle", e.message || "图片解码失败");
    }
  }

  clear() {
    if (this.running) return;
    if (this.imgUrl) URL.revokeObjectURL(this.imgUrl);
    this.imgUrl = "";
    this.imageData = null;
    this.results = [];
    this.selected = -1;
    this.cropMode = false;
    this.paintCropBtn();
    this.paintImage();
    this.paintSide();
    this.setStatus("idle", "本地识别 · 图片不上传");
  }

  /* ---------- 识别 ---------- */

  async recognize(region = null) {
    if (!this.imageData || this.running) return;
    this.running = true;
    this.setStatus("recognizing", region ? "识别所选区域…" : "识别中…");
    this.paintSide();
    try {
      const pipe = await this.ensureEngine();
      let target = this.imageData;
      let ox = 0;
      let oy = 0;
      if (region) {
        const c = cropImageData(this.imageData, region.x0, region.y0, region.x1, region.y1);
        if (!c) throw new Error("框选区域太小");
        target = c.crop;
        ox = c.sx;
        oy = c.sy;
      }
      const out = await pipe.run(target, ({ pct, label }) => {
        console.log(`[ocr] ${label} ${Math.round(pct ?? 0)}%`);
      });
      console.log(
        `[ocr] done · 后端 ${out.backend} · 框 ${out.boxesFound} · 行 ${out.results.length} · det ${out.detMs.toFixed(0)}ms · rec ${out.recMs.toFixed(0)}ms · 共 ${out.totalMs.toFixed(0)}ms`,
      );
      // 框选时把坐标平移回整图
      this.results = out.results.map((r) => ({
        ...r,
        box: { x0: r.box.x0 + ox, y0: r.box.y0 + oy, x1: r.box.x1 + ox, y1: r.box.y1 + oy },
      }));
      this.selected = -1;
      this.setStatus("idle", out.results.length ? `识别出 ${out.results.length} 行` : "没有识别到文字，换张更清晰的试试");
    } catch (e) {
      console.error("[ocr] 失败:", e);
      this.setStatus("idle", `识别失败：${e.message}`);
    } finally {
      this.running = false;
      this.paintOverlays();
      this.paintSide();
    }
  }

  /* ---------- 渲染 ---------- */

  render() {
    this.innerHTML = `
      <header class="nav">
        <span class="title">OCR</span>
        <span class="status"><span class="spin" data-spin style="display:none"></span><span data-status-text>本地识别 · 图片不上传</span></span>
      </header>
      <div class="toolbar">
        <button data-act="pick" class="primary">添加图片</button>
        <button data-act="crop">框选识别</button>
        <button data-act="fit">适应</button>
        <button data-act="one">1:1</button>
        <span class="spacer"></span>
        <button data-act="clear">清空</button>
        <input type="file" accept="image/*" hidden data-input />
      </div>
      <div class="main">
        <section class="stage-card">
          <div class="viewport" data-view>
            <div class="stage" data-stage>
              <img data-img alt="" draggable="false" style="display:none" />
              <div class="olines" data-olines></div>
              <div class="croprect" data-croprect style="display:none"></div>
            </div>
            <div class="empty" data-empty>
              <div class="icon">＋</div>
              <strong>拖入 / 点击 / 粘贴图片</strong>
              <span>Ctrl+V 直接粘贴截图，自动开始识别</span>
            </div>
          </div>
          <div class="crophint" data-crophint style="display:none">在图片上拖动，框选要识别的区域</div>
          <div class="busy" data-busy style="display:none"><span class="spin"></span>识别中…</div>
          <div class="zoombar" data-zoombar style="display:none">
            <button data-zoom="out">−</button>
            <span class="pct" data-pct>100%</span>
            <button data-zoom="in">＋</button>
          </div>
        </section>
        <aside class="side">
          <div class="side-head">文本<span class="n" data-count></span><button data-act="copy">复制</button></div>
          <ul class="lines" data-lines></ul>
        </aside>
      </div>
    `;

    this.view = this.querySelector("[data-view]");
    this.stage = this.querySelector("[data-stage]");
    this.img = this.querySelector("[data-img]");
    this.olines = this.querySelector("[data-olines]");
    this.croprect = this.querySelector("[data-croprect]");
    this.empty = this.querySelector("[data-empty]");
    this.crophint = this.querySelector("[data-crophint]");
    this.zoombar = this.querySelector("[data-zoombar]");
    this.pct = this.querySelector("[data-pct]");

    this.querySelector('[data-act="pick"]').addEventListener("click", () => this.querySelector("[data-input]").click());
    this.querySelector("[data-input]").addEventListener("change", (e) => {
      this.addFiles(e.target.files);
      e.target.value = "";
    });
    this.querySelector('[data-act="crop"]').addEventListener("click", () => {
      if (!this.imageData || this.running) return;
      this.cropMode = !this.cropMode;
      this.paintCropBtn();
    });
    this.querySelector('[data-act="fit"]').addEventListener("click", () => this.fit());
    this.querySelector('[data-act="one"]').addEventListener("click", () => this.zoomTo(1));
    this.querySelector('[data-act="clear"]').addEventListener("click", () => this.clear());
    this.querySelector('[data-act="copy"]').addEventListener("click", () => this.copyAll());
    this.empty.addEventListener("click", () => this.querySelector("[data-input]").click());
    this.querySelector('[data-zoom="in"]').addEventListener("click", (e) => {
      e.stopPropagation();
      this.zoomBy(1.25);
    });
    this.querySelector('[data-zoom="out"]').addEventListener("click", (e) => {
      e.stopPropagation();
      this.zoomBy(0.8);
    });

    this.bindView();
    this.paintImage();
    this.paintSide();
  }

  paintCropBtn() {
    const btn = this.querySelector('[data-act="crop"]');
    btn.classList.toggle("toggled", this.cropMode);
    btn.textContent = this.cropMode ? "取消框选" : "框选识别";
    this.view.classList.toggle("crop", this.cropMode);
    this.view.classList.toggle("pan", !this.cropMode);
    this.crophint.style.display = this.cropMode ? "" : "none";
  }

  paintImage() {
    const has = !!this.imageData;
    this.empty.style.display = has ? "none" : "flex";
    this.zoombar.style.display = has ? "flex" : "none";
    if (!has) {
      this.img.style.display = "none";
      this.olines.innerHTML = "";
      return;
    }
    if (this.img.src !== this.imgUrl) {
      this.img.src = this.imgUrl;
      this.img.style.display = "block";
      this.img.style.width = `${this.imageData.width}px`;
      this.img.style.height = `${this.imageData.height}px`;
      this.img.onload = () => this.fit();
    }
    this.paintOverlays();
  }

  /** 文字层：跟图片一起缩放，可直接在图上拖选复制 */
  paintOverlays() {
    this.olines.innerHTML = "";
    if (!this.imageData) return;
    this.results.forEach((r, i) => {
      const d = document.createElement("div");
      d.className = "oline" + (i === this.selected ? " sel" : "");
      const { x0, y0, x1, y1 } = r.box;
      d.style.left = `${x0}px`;
      d.style.top = `${y0}px`;
      d.style.width = `${Math.max(2, x1 - x0)}px`;
      d.style.height = `${Math.max(2, y1 - y0)}px`;
      d.style.fontSize = `${Math.max(8, (y1 - y0) * 0.82)}px`;
      d.textContent = r.text;
      d.title = `${r.text} · ${(r.confidence * 100).toFixed(1)}% · 点击选中后可拖选复制`;
      // 已选中的框：拦住按下事件，走浏览器原生拖选复制；
      // 未选中的冒泡给 viewport，拖动即平移、纯点击即选中
      d.addEventListener("pointerdown", (e) => {
        if (this.selected === i) e.stopPropagation();
      });
      d.addEventListener("click", (e) => {
        if (this._moved) return;
        e.stopPropagation();
        this.selected = i;
        this.paintOverlays();
        this.paintSide();
      });
      this.olines.appendChild(d);
    });
  }

  paintSide() {
    const ul = this.querySelector("[data-lines]");
    const count = this.querySelector("[data-count]");
    ul.innerHTML = "";
    count.textContent = this.results.length ? `共 ${this.results.length} 行` : "";
    const pushTip = (text) => {
      const li = document.createElement("li");
      li.className = "tip";
      li.textContent = text;
      ul.appendChild(li);
    };
    if (this.running) pushTip("识别中…");
    else if (!this.imageData) pushTip("粘贴截图后自动识别");
    else if (!this.results.length) pushTip("暂无文字");
    this.results.forEach((r, i) => {
      const li = document.createElement("li");
      if (i === this.selected) li.classList.add("sel");
      const conf = document.createElement("span");
      conf.className = "conf";
      conf.textContent = `${(r.confidence * 100).toFixed(1)}%`;
      li.append(conf, document.createTextNode(r.text));
      li.title = "点击定位到图片";
      li.addEventListener("click", () => {
        this.selected = i;
        this.paintOverlays();
        this.paintSide();
      });
      ul.appendChild(li);
    });
  }

  copyAll() {
    if (!this.results.length) return;
    const text = this.results.map((r) => r.text).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  /* ---------- 视图：滚轮缩放 / 拖拽平移 / 框选 ---------- */

  bindGlobal() {
    document.addEventListener("paste", (e) => {
      if (e.clipboardData?.files?.length) {
        e.preventDefault();
        this.addFiles(e.clipboardData.files);
      }
    });
    ["dragover", "drop"].forEach((ev) =>
      document.addEventListener(ev, (e) => e.preventDefault()),
    );
    document.addEventListener("drop", (e) => {
      if (e.dataTransfer?.files?.length) this.addFiles(e.dataTransfer.files);
    });
    window.addEventListener("resize", () => {
      if (this.imageData) this.applyTransform();
    });
  }

  viewPoint(e) {
    const rect = this.view.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  toImage(x, y) {
    return { x: (x - this.tx) / this.scale, y: (y - this.ty) / this.scale };
  }

  applyTransform() {
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    this.pct.textContent = `${Math.round(this.scale * 100)}%`;
  }

  fit() {
    if (!this.imageData) return;
    const rect = this.view.getBoundingClientRect();
    if (rect.width < 2) {
      requestAnimationFrame(() => this.fit());
      return;
    }
    const pad = 28;
    const s = Math.min(
      (rect.width - pad * 2) / this.imageData.width,
      (rect.height - pad * 2) / this.imageData.height,
    );
    this.fitScale = s;
    this.scale = Math.min(s, 2);
    this.tx = (rect.width - this.imageData.width * this.scale) / 2;
    this.ty = (rect.height - this.imageData.height * this.scale) / 2;
    this.applyTransform();
  }

  zoomTo(scale, cx = null, cy = null) {
    if (!this.imageData) return;
    const rect = this.view.getBoundingClientRect();
    cx ??= rect.width / 2;
    cy ??= rect.height / 2;
    const ix = (cx - this.tx) / this.scale;
    const iy = (cy - this.ty) / this.scale;
    this.scale = Math.min(24, Math.max(this.fitScale * 0.2, scale));
    this.tx = cx - ix * this.scale;
    this.ty = cy - iy * this.scale;
    this.applyTransform();
  }

  zoomBy(f, cx, cy) {
    this.zoomTo(this.scale * f, cx, cy);
  }

  bindView() {
    // 滚轮缩放：以光标为中心，符合直觉
    this.view.addEventListener(
      "wheel",
      (e) => {
        if (!this.imageData) return;
        e.preventDefault();
        const p = this.viewPoint(e);
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
        this.zoomBy(f, p.x, p.y);
      },
      { passive: false },
    );

    const pointers = new Map();
    let pan = null;
    let crop = null;
    let pinch = null;

    this.view.addEventListener("pointerdown", (e) => {
      if (!this.imageData || this.running) return;
      this.view.setPointerCapture?.(e.pointerId);
      const p = this.viewPoint(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        // 双指捏合缩放
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale };
        pan = null;
        crop = null;
        this._moved = true;
        this.hideCropRect();
        return;
      }
      this._moved = false;
      if (this.cropMode && e.button === 0) {
        const im = this.toImage(p.x, p.y);
        crop = { x0: im.x, y0: im.y, x1: im.x, y1: im.y };
        this.showCropRect(crop);
      } else {
        // 阻止原生文本选中/图片拖拽：拖动一律先当平移处理
        e.preventDefault();
        pan = { sx: p.x, sy: p.y, tx: this.tx, ty: this.ty };
      }
    });

    this.view.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = this.viewPoint(e);
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0) {
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          this.zoomTo((pinch.scale * dist) / pinch.dist, cx, cy);
        }
        return;
      }
      if (crop) {
        const im = this.toImage(p.x, p.y);
        crop.x1 = Math.max(0, Math.min(this.imageData.width, im.x));
        crop.y1 = Math.max(0, Math.min(this.imageData.height, im.y));
        this.showCropRect(crop);
      } else if (pan) {
        const dx = p.x - pan.sx;
        const dy = p.y - pan.sy;
        if (Math.hypot(dx, dy) > 4) {
          this._moved = true;
          this.view.classList.add("dragging");
          // 拖起来了就清掉已有文本选区，避免误选中
          getSelection()?.removeAllRanges?.();
        }
        this.tx = pan.tx + dx;
        this.ty = pan.ty + dy;
        this.applyTransform();
      }
    });

    const up = (e) => {
      const wasSingle = pointers.size === 1 && pointers.has(e.pointerId);
      const hadPinch = !!pinch;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      this.view.classList.remove("dragging");
      if (crop && e.type === "pointerup") {
        const region = { ...crop };
        crop = null;
        this.hideCropRect();
        const w = Math.abs(region.x1 - region.x0);
        const h = Math.abs(region.y1 - region.y0);
        if (w > 8 && h > 8) {
          this.cropMode = false;
          this.paintCropBtn();
          this.recognize(region);
        }
      }
      if (e.type === "pointerup" || e.type === "pointercancel") pan = null;
      // 纯点击（没拖动）：点中文字框就选中，点空白就取消选中
      if (
        e.type === "pointerup" && wasSingle && !hadPinch && !this._moved &&
        !this.cropMode && !this.running && this.imageData
      ) {
        const p = this.viewPoint(e);
        const im = this.toImage(p.x, p.y);
        const hit = this.results.findIndex(
          (r) =>
            im.x >= r.box.x0 && im.x <= r.box.x1 &&
            im.y >= r.box.y0 && im.y <= r.box.y1,
        );
        if (hit !== this.selected) {
          this.selected = hit;
          this.paintOverlays();
          this.paintSide();
        }
      }
    };
    this.view.addEventListener("pointerup", up);
    this.view.addEventListener("pointercancel", up);

    // 双击切换适应 / 1:1
    this.view.addEventListener("dblclick", (e) => {
      if (!this.imageData || this.cropMode) return;
      const p = this.viewPoint(e);
      if (Math.abs(this.scale - 1) < 0.02) this.fit();
      else this.zoomTo(1, p.x, p.y);
    });
  }

  showCropRect(r) {
    const el = this.croprect;
    el.style.display = "block";
    el.style.left = `${Math.min(r.x0, r.x1)}px`;
    el.style.top = `${Math.min(r.y0, r.y1)}px`;
    el.style.width = `${Math.abs(r.x1 - r.x0)}px`;
    el.style.height = `${Math.abs(r.y1 - r.y0)}px`;
  }

  hideCropRect() {
    this.croprect.style.display = "none";
  }
}

customElements.define("ocr-app", OcrApp);
