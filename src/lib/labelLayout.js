// Shared physical label renderer: preview, Chrome and TSPL use the same dots.
import { ean13Bits, EAN13_GUARDS, LABEL_SIZES, DEFAULT_LABEL_SIZE, DEFAULT_LABEL_OPTS, loadLabelSize } from "../barcode";
import { fmtMoney } from "../store";

const FONT = `Arial, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif`;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

const resolveSize = (size) => {
  const key = LABEL_SIZES[size] ? size : loadLabelSize();
  return LABEL_SIZES[key] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
};

/** Taille de l'étiquette en points d'impression (arrondie au point près). */
export function labelDots(S, dpi) {
  // Thermal heads use 8 or 12 whole dots/mm (203/300 dpi profiles).
  const dpm = dpi === 300 ? 12 : 8;
  return { dpm, W: Math.round(S.w * dpm), H: Math.round(S.h * dpm) };
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

function setFont(ctx, px, text = "") {
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.direction = RTL.test(text) ? "rtl" : "ltr";
}


/** Integer-dot geometry with independent horizontal modules and vertical bands. */
export function labelLayout(entry, { size, opts = DEFAULT_LABEL_OPTS, store = "", dpi = 203 } = {}) {
  const S = resolveSize(size);
  const { W, H, dpm } = labelDots(S, dpi);
  const margin = Math.round(dpm * 0.8), gap = Math.max(2, Math.round(dpm * 0.5));
  const pt = p => Math.round(p * dpi / 72);
  const rows = [];
  let top = margin;
  const row = (kind, text, px) => {
    if (!text) return;
    const h = Math.ceil(px * 1.5);
    rows.push({ kind, text, px, y: top, h }); top += h + gap;
  };
  if (opts.showStore) row('store', store, pt(S.store));
  if (opts.showName) row('name', String(entry.name || ''), pt(S.name));
  const pricePx = pt(S.price), digitPx = pt(6);
  const priceH = opts.showPrice && Number(entry.price) > 0 ? Math.ceil(pricePx * 1.5) : 0;
  const digitH = opts.showCode ? Math.ceil(digitPx * 1.4) : 0;
  const bottom = H - margin;
  const priceY = bottom - priceH;
  const digitY = priceY - (priceH ? gap : 0) - digitH;
  const barBottom = digitY - (digitH ? gap : 0);
  const m = Math.max(1, Math.floor((W - margin * 2) / 113));
  const blockX = Math.floor((W - 113 * m) / 2);
  const bars = { x: blockX + 11 * m, y: top, w: 95 * m, h: barBottom - top, module: m,
    quietLeft: 11 * m, quietRight: 7 * m, blockX, blockW: 113 * m };
  if (bars.h < 8) throw new Error('Label too small for enabled fields');
  if (digitH) rows.push({ kind: 'digits', text: ean13Bits(entry.code).code, px: digitPx, y: digitY, h: digitH });
  if (priceH) rows.push({ kind: 'price', text: fmtMoney(entry.price), px: pricePx, y: priceY, h: priceH });
  return { W, H, dpm, margin, gap, rows, bars };
}

export function renderLabelCanvas(entry, {
  size, opts = DEFAULT_LABEL_OPTS, store = "", settings = {}, test = false,
} = {}) {
  const dpi = settings.dpi === 300 ? 300 : 203;
  const layout = labelLayout(entry, { size, opts, store, dpi });
  const { W, H, dpm, margin, rows, bars } = layout;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(Math.round((settings.offsetX || 0) * dpm), Math.round((settings.offsetY || 0) * dpm));
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const r of rows) {
    setFont(ctx, r.px, r.kind === 'digits' ? '' : r.text);
    const text = fitText(ctx, r.text, W - 2 * margin);
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
    const baseline = r.y + (r.h - ascent - descent) / 2 + ascent;
    ctx.fillText(text, W / 2, baseline);
    r.visibleText = text;
  }
  const { bits } = ean13Bits(entry.code);
  for (let i = 0; i < 95; i++) if (bits[i] === '1') {
    const guardExtra = opts.showCode ? Math.min(Math.round(dpm * 0.3), layout.gap - 1) : 0;
    ctx.fillRect(bars.x + i * bars.module, bars.y, bars.module,
      bars.h + (EAN13_GUARDS.has(i) ? guardExtra : 0));
  }
  // Optional border stays in the outer margin, outside the quiet zones/bands.
  if (test || opts.cutLines) {
    ctx.lineWidth = 1; ctx.setLineDash(test ? [] : [3, 3]);
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  }
  ctx.restore();
  canvas.labelLayout = layout;
  return canvas;
}
