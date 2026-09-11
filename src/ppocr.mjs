/**
 * PP-OCRv6 两阶段流水线（原生重写，可读版）
 * 检测 DBNet + 识别 CTC，推理经 onnxruntime-web，GPU 适配由 ORT 负责。
 * 对应原站 643 chunk 的 createPpocrPipeline。
 */
import * as ort from "../vendor/ort/ort.all.min.mjs";

export const TINY_PARAMS = {
  detMaxSide: 960,
  recHeight: 48,
  recMaxWidth: 3200,
  dictSize: 6906, // blank + 6904 字 + 空格
  colorOrder: "BGR",
  detThresh: 0.2,
  boxThresh: 0.4,
  unclipRatio: 1.4,
  minBoxSide: 3,
};

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_MEAN = [0.5, 0.5, 0.5];
const REC_STD = [0.5, 0.5, 0.5];

/** 按 EP 优先级建 session：webgpu → webgl → wasm，失败自动降级 */
async function createSessionPreferGPU(buffer, onWarn) {
  let lastErr = null;
  for (const ep of ["webgpu", "webgl", "wasm"]) {
    try {
      const session = await ort.InferenceSession.create(buffer.slice(0), {
        executionProviders: [ep],
      });
      return { session, ep };
    } catch (e) {
      lastErr = e;
      onWarn?.(ep, e);
    }
  }
  throw lastErr ?? new Error("无可用推理后端");
}

/** ImageData → Float32 NCHW，可选 BGR 通道重排 + 归一化 */
function normalizeToNCHW(img, mean, std, colorOrder) {
  const { data, width, height } = img;
  const out = new Float32Array(3 * width * height);
  const order = colorOrder === "BGR" ? [2, 1, 0] : [0, 1, 2];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * width + x;
      for (let c = 0; c < 3; c++) {
        out[c * width * height + dst] =
          (data[src + order[c]] / 255 - mean[c]) / std[c];
      }
    }
  }
  return out;
}

/** canvas 重采样：把 source 画到 w×h 并读回 ImageData */
function resample(sourceCanvasOrImage, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceCanvasOrImage, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * DBNet 后处理：概率图 → 文本框
 * 二值化 → 4 邻接 BFS 连通域 → 均分/边长过滤 → unclip 外扩 → 按 y0 排序
 */
function dbnetBoxes(prob, predW, predH, scaleX, scaleY, params) {
  const { detThresh, boxThresh, unclipRatio, minBoxSide } = params;
  const mask = new Uint8Array(predW * predH);
  for (let i = 0; i < mask.length; i++) mask[i] = prob[i] > detThresh ? 1 : 0;

  const label = new Int32Array(predW * predH);
  let cur = 0;
  const boxes = [];

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1 || label[i] !== 0) continue;
    cur++;
    const stack = [i];
    label[i] = cur;
    let x0 = predW,
      x1 = 0,
      y0 = predH,
      y1 = 0,
      sum = 0,
      cnt = 0;

    while (stack.length) {
      const p = stack.pop();
      const x = p % predW;
      const y = (p / predW) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sum += prob[p];
      cnt++;
      // 4 邻接
      if (x > 0 && mask[p - 1] && !label[p - 1]) {
        label[p - 1] = cur;
        stack.push(p - 1);
      }
      if (x < predW - 1 && mask[p + 1] && !label[p + 1]) {
        label[p + 1] = cur;
        stack.push(p + 1);
      }
      if (y > 0 && mask[p - predW] && !label[p - predW]) {
        label[p - predW] = cur;
        stack.push(p - predW);
      }
      if (y < predH - 1 && mask[p + predW] && !label[p + predW]) {
        label[p + predW] = cur;
        stack.push(p + predW);
      }
    }

    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (Math.min(bw, bh) < minBoxSide || sum / Math.max(1, cnt) < boxThresh)
      continue;
    const pad = (bw * bh * unclipRatio) / (2 * (bw + bh));
    boxes.push({
      x0: Math.max(0, x0 - pad) * scaleX,
      y0: Math.max(0, y0 - pad) * scaleY,
      x1: Math.min(predW, x1 + pad) * scaleX,
      y1: Math.min(predH, y1 + pad) * scaleY,
    });
  }
  boxes.sort((a, b) => a.y0 - b.y0);
  return boxes;
}

/** 从大 ImageData 按框裁剪，越界钳制 */
function cropBox(img, box) {
  const x = Math.max(0, Math.floor(box.x0));
  const y = Math.max(0, Math.floor(box.y0));
  const w = Math.min(Math.floor(box.x1) - x, img.width - x);
  const h = Math.min(Math.floor(box.y1) - y, img.height - y);
  if (w <= 0 || h <= 0) return null;
  const out = new ImageData(w, h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = ((y + r) * img.width + (x + c)) * 4;
      const d = (r * w + c) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = img.data[s + 3];
    }
  }
  return out;
}

/**
 * CTC 贪心解码：blank=0，去重，跳 blank
 * 置信度自适应：softmax 输出直接取 max，logits 则 exp归一
 */
function ctcGreedyDecode(logits, T, C, dict) {
  let text = "";
  const scores = [];
  let prev = -1;
  let isSoftmax = null;

  for (let t = 0; t < T; t++) {
    let best = -1e9,
      bestMin = 1e9,
      bestIdx = 0,
      rowSum = 0;
    const base = t * C;
    for (let c = 0; c < C; c++) {
      const v = logits[base + c];
      if (!Number.isFinite(v)) continue;
      rowSum += v;
      if (v < bestMin) bestMin = v;
      if (v > best) {
        best = v;
        bestIdx = c;
      }
    }
    if (best === -1e9) {
      prev = -1;
      continue;
    }
    if (isSoftmax === null)
      isSoftmax = bestMin >= -1e-6 && Math.abs(rowSum - 1) < 0.02;
    if (bestIdx !== 0 && bestIdx !== prev) {
      let conf;
      if (isSoftmax) {
        conf = best;
      } else {
        let denom = 0;
        for (let c = 0; c < C; c++) {
          const d = logits[base + c] - best;
          if (d >= -50 && Number.isFinite(d)) denom += Math.exp(d);
        }
        conf = denom > 0 ? 1 / denom : 0.001;
      }
      text += dict[bestIdx] ?? "";
      scores.push(Math.min(0.999, Math.max(0.001, conf)));
    }
    prev = bestIdx;
  }
  const confidence = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  return { text, confidence, charCount: scores.length };
}

/** 加载 tiny 三件套：det/rec 二进制 + dict.json → ["", ...dict, " "] */
export async function loadTinyAssets(base, onProgress) {
  const tick = (label, pct) => onProgress?.({ label, pct });
  tick("dict", 4);
  const dictRaw = await (await fetch(`${base}/dict.json`)).json();
  if (!Array.isArray(dictRaw) || !dictRaw.every((s) => typeof s === "string")) {
    throw new Error("字典 JSON 非法");
  }
  const dict = ["", ...dictRaw, " "];
  if (dict.length !== TINY_PARAMS.dictSize) {
    throw new Error(
      `字典维数不匹配: ${dict.length} vs ${TINY_PARAMS.dictSize}`,
    );
  }
  tick("det", 10);
  const det = await (await fetch(`${base}/det.onnx`)).arrayBuffer();
  tick("rec", 55);
  const rec = await (await fetch(`${base}/rec.onnx`)).arrayBuffer();
  tick("done", 100);
  return { det, rec, dict };
}

/** 建流水线：各建 det/rec session，校验 rec 输出维 C == dictSize */
export async function createPipeline(assets, params = TINY_PARAMS, onWarn) {
  ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
  ort.env.wasm.numThreads = 1;

  const det = await createSessionPreferGPU(assets.det, onWarn);
  let rec;
  try {
    rec = await createSessionPreferGPU(assets.rec, onWarn);
  } catch (e) {
    await det.session.release().catch(() => {});
    throw e;
  }
  const backend = det.ep === rec.ep ? det.ep : `${det.ep}/${rec.ep}`;

  // 校验 rec 静态输出维（需 outputMetadata）
  const outName = rec.session.outputNames[0];
  const meta = Array.isArray(rec.session.outputMetadata)
    ? rec.session.outputMetadata.find((m) => m.name === outName)
    : null;
  const dimC = meta?.isTensor ? meta.shape?.at(-1) : null;
  if (typeof dimC === "number" && dimC !== params.dictSize) {
    await Promise.allSettled([det.session.release(), rec.session.release()]);
    throw new Error(
      `rec 输出维 C=${dimC} 与 dictSize=${params.dictSize} 不一致`,
    );
  }

  let disposed = false;

  /** 对单张 ImageData 跑完整 OCR */
  async function run(imageData, onProgress = () => {}) {
    if (disposed) throw new Error("Pipeline 已释放");
    const t0 = performance.now();
    const W = imageData.width,
      H = imageData.height;

    // —— 检测预处理 ——
    onProgress({ pct: 5, label: "preprocess" });
    const src = document.createElement("canvas");
    src.width = W;
    src.height = H;
    src.getContext("2d").putImageData(imageData, 0, 0);
    const k = Math.min(1, params.detMaxSide / Math.max(W, H));
    const dw = Math.max(32, 32 * Math.round((W * k) / 32));
    const dh = Math.max(32, 32 * Math.round((H * k) / 32));
    const detInput = resample(src, dw, dh);
    const detTensor = new ort.Tensor(
      "float32",
      normalizeToNCHW(detInput, DET_MEAN, DET_STD, params.colorOrder),
      [1, 3, dh, dw],
    );

    // —— 检测 ——
    onProgress({ pct: 20, label: "detect" });
    const z0 = performance.now();
    const detOut = await det.session.run({
      [det.session.inputNames[0]]: detTensor,
    });
    const detMs = performance.now() - z0;
    const feat = detOut[det.session.outputNames[0]];
    const [ph, pw] = [feat.dims[2], feat.dims[3]];

    // —— DBNet 解码 ——
    onProgress({ pct: 35, label: "dbnet" });
    const boxes = dbnetBoxes(feat.data, pw, ph, W / pw, H / ph, params);
    if (!boxes.length) {
      return {
        results: [],
        boxesFound: 0,
        detMs,
        recMs: 0,
        totalMs: performance.now() - t0,
        backend,
      };
    }

    // —— 逐框识别 ——
    let recMs = 0;
    const results = [];
    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi];
      if (box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) continue;
      const crop = cropBox(imageData, box);
      if (!crop) continue;
      // 等比缩到高 recHeight，超宽切片
      const fullW = Math.max(
        8,
        Math.round((params.recHeight * (box.x1 - box.x0)) / (box.y1 - box.y0)),
      );
      const slices = Math.max(1, Math.ceil(fullW / params.recMaxWidth));
      const sliceW = Math.max(8, Math.round(fullW / slices));
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = crop.width;
      cropCanvas.height = crop.height;
      cropCanvas.getContext("2d").putImageData(crop, 0, 0);

      onProgress({
        pct: 35 + (55 * bi) / boxes.length,
        label: `recognize ${bi + 1}/${boxes.length}`,
      });
      let text = "";
      const confs = [];
      for (let s = 0; s < slices; s++) {
        const piece = document.createElement("canvas");
        piece.width = Math.ceil(crop.width / slices);
        piece.height = crop.height;
        piece
          .getContext("2d")
          .drawImage(cropCanvas, -(crop.width * s) / slices, 0);
        const recInput = resample(piece, sliceW, params.recHeight);
        const recTensor = new ort.Tensor(
          "float32",
          normalizeToNCHW(recInput, REC_MEAN, REC_STD, params.colorOrder),
          [1, 3, params.recHeight, sliceW],
        );
        const r0 = performance.now();
        const recOut = await rec.session.run({
          [rec.session.inputNames[0]]: recTensor,
        });
        recMs += performance.now() - r0;
        const y = recOut[rec.session.outputNames[0]];
        if (y.dims[2] !== params.dictSize) {
          throw new Error(`rec 输出维 C=${y.dims[2]} 与 dictSize 不一致`);
        }
        const dec = ctcGreedyDecode(y.data, y.dims[1], y.dims[2], assets.dict);
        text += dec.text;
        if (dec.charCount) confs.push(dec.confidence);
      }
      const clean = text.trim();
      if (clean) {
        results.push({
          box,
          text: clean,
          confidence: confs.length
            ? confs.reduce((a, b) => a + b, 0) / confs.length
            : 0,
        });
      }
    }
    return {
      results,
      boxesFound: boxes.length,
      detMs,
      recMs,
      totalMs: performance.now() - t0,
      backend,
    };
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await Promise.allSettled([det.session.release(), rec.session.release()]);
  }

  return { backend, run, dispose };
}
