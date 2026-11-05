// ===== EAN-13 barcodes: checksum, random generation, SVG rendering =====
// Self-contained (no library) so the same renderer feeds both the on-screen
// preview and the printed label sheet.

import { esc, fmtMoney } from "./store";

// Module patterns for the three EAN-13 alphabets
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
// The first digit isn't encoded as bars — it picks the L/G pattern of the left group
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

// GS1 country prefix for Algeria — keeps generated codes consistent with the seeded stock
export const DEFAULT_PREFIX = "613";

export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

// Modulo-10 check digit over the 12 data digits (odd positions ×1, even ×3)
export function ean13CheckDigit(first12) {
  const d = onlyDigits(first12).padStart(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

// Coerce anything into a printable 13-digit code (pads/truncates, then re-signs it)
export function normalizeEan13(value) {
  const d = onlyDigits(value);
  const base = d.length >= 13 ? d.slice(0, 12) : d.slice(0, 12).padStart(12, "0");
  return base + ean13CheckDigit(base);
}

export function isValidEan13(value) {
  const d = onlyDigits(value);
  return d.length === 13 && ean13CheckDigit(d.slice(0, 12)) === d[12];
}

// Random but valid: fixed prefix + random filler + computed check digit
export function randomEan13(prefix = DEFAULT_PREFIX) {
  let base = onlyDigits(prefix).slice(0, 12);
  while (base.length < 12) base += Math.floor(Math.random() * 10);
  return base + ean13CheckDigit(base);
}

/**
 * Turn a scanner reading into a code the product sheet can store.
 *
 * A scanner hands back exactly what is printed, which is not always an EAN-13:
 * a UPC-A label reads as 12 digits and becomes an EAN-13 by prefixing a zero —
 * re-signing it like any other 12-digit string would name a *different*
 * article. Anything else (alphanumeric Code 39/128, EAN-8) falls outside what
 * this app prints and reads back, so it is refused rather than mangled into
 * digits that match nothing.
 *
 * @returns {string} the 13-digit code, or "" when the reading is unusable
 */
export function scanToEan13(raw) {
  const text = String(raw ?? "").trim();
  const d = onlyDigits(text);
  if (!d || d.length !== text.length) return "";   // lettres, tirets, symboles
  if (d.length === 13) return isValidEan13(d) ? d : normalizeEan13(d);
  if (d.length === 12) return isValidEan13(`0${d}`) ? `0${d}` : normalizeEan13(d);
  return "";
}

// ---- geometry (in modules; 1 module = 1 viewBox unit) ----
const QUIET_START = 11;          // left quiet zone, holds the first digit
const QUIET_END = 7;             // right quiet zone
const TOTAL = QUIET_START + 95 + QUIET_END;
const LEFT_X = QUIET_START + 3;  // after the start guard
const RIGHT_X = LEFT_X + 42 + 5; // after the left group + centre guard
// Guards run taller than the data bars, as on a real label
const GUARDS = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);

/**
 * The 95 modules of an EAN-13 symbol ("1" = dark bar), guards included.
 * Shared by the SVG preview and the printer bitmap, so both draw the same bars.
 */
export function ean13Bits(value) {
  const code = normalizeEan13(value);
  const parity = PARITY[Number(code[0])];
  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (parity[i] === "L" ? L : G)[Number(code[i + 1])];
  bits += "01010";
  for (let i = 0; i < 6; i++) bits += R[Number(code[i + 7])];
  bits += "101";
  return { code, bits };
}

/** Module indexes of the start, centre and end guards (drawn taller). */
export const EAN13_GUARDS = GUARDS;

// Returns a standalone <svg> string — injected via dangerouslySetInnerHTML in the
// app and concatenated straight into the print document.
export function ean13Svg(value, { height = 70, showText = true, color = "#111827" } = {}) {
  const { code, bits } = ean13Bits(value);

  const guardExtra = showText ? 8 : 0;
  const textSize = 11;
  const vbHeight = height + guardExtra + (showText ? 13 : 0);

  // One rect per dark module — neighbours abut exactly, so runs render as solid bars
  let bars = "";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    const h = GUARDS.has(i) ? height + guardExtra : height;
    bars += `<rect x="${QUIET_START + i}" y="0" width="1" height="${h}" fill="${color}"/>`;
  }

  let text = "";
  if (showText) {
    const y = height + guardExtra + textSize;
    const font = `font-family="monospace" font-size="${textSize}" fill="${color}"`;
    text += `<text x="${QUIET_START - 3}" y="${y}" text-anchor="end" ${font}>${code[0]}</text>`;
    for (let i = 0; i < 6; i++) {
      text += `<text x="${LEFT_X + 7 * i + 3.5}" y="${y}" text-anchor="middle" ${font}>${code[i + 1]}</text>`;
      text += `<text x="${RIGHT_X + 7 * i + 3.5}" y="${y}" text-anchor="middle" ${font}>${code[i + 7]}</text>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TOTAL} ${vbHeight}" `
    + `width="100%" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" `
    + `role="img" aria-label="Code-barres ${code}">`
    + `<rect x="0" y="0" width="${TOTAL}" height="${vbHeight}" fill="#ffffff"/>${bars}${text}</svg>`;
}

// ===== Printable label sheet =====
// Shared by the Codes-barres library and the product sheet, so a label printed
// from either place comes out identical.

// Physical label formats (mm) for a thermal label printer (Xprinter XP-300B /
// XP-365B / XP-420B…). Each label is printed as ONE page of exactly its own size,
// so the driver feeds one label per page — no A4 sheet, no margins, no scaling.
export const LABEL_SIZES = {
  s40x20: { w: 40, h: 20, name: 6, price: 7.5, store: 4.5, label: "40 × 20 mm" },
  s30x20: { w: 30, h: 20, name: 5.5, price: 7, store: 4.5, label: "30 × 20 mm" },
  s40x30: { w: 40, h: 30, name: 6.5, price: 8.5, store: 5, label: "40 × 30 mm" },
  s50x25: { w: 50, h: 25, name: 7, price: 9, store: 5.5, label: "50 × 25 mm" },
  s50x30: { w: 50, h: 30, name: 7.5, price: 9.5, store: 6, label: "50 × 30 mm" },
  s58x40: { w: 58, h: 40, name: 8.5, price: 11, store: 6.5, label: "58 × 40 mm" },
  s38x25: { w: 38, h: 25, name: 6, price: 7.5, store: 5, label: "38 × 25 mm" },
  s70x40: { w: 70, h: 40, name: 9.5, price: 12, store: 7, label: "70 × 40 mm" },
};
// Legacy keys from older saved preferences
const SIZE_ALIASES = { small: "s38x25", medium: "s50x30", large: "s70x40" };
export const DEFAULT_LABEL_SIZE = "s40x20";

// Chrome sends a page wider than tall as "landscape", and many thermal drivers
// (XP-300B…) then rotate it 90° onto the label, printing it sideways. Rotating
// the content ourselves on a portrait page cancels that out.
export const LABEL_ROTATIONS = { r0: "0°", r90: "90°", r270: "270°" };
export const DEFAULT_LABEL_ROTATION = "r90";
const ROT_KEY = "krimou.labelRotation";
export function loadLabelRotation() {
  try { const v = localStorage.getItem(ROT_KEY); return LABEL_ROTATIONS[v] ? v : DEFAULT_LABEL_ROTATION; }
  catch { return DEFAULT_LABEL_ROTATION; }
}
export function saveLabelRotation(k) {
  try { localStorage.setItem(ROT_KEY, k); } catch { /* ignore */ }
}

const SIZE_KEY = "krimou.labelSize";
export function loadLabelSize() {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    const k = SIZE_ALIASES[v] || v;
    return LABEL_SIZES[k] ? k : DEFAULT_LABEL_SIZE;
  } catch { return DEFAULT_LABEL_SIZE; }
}
export function saveLabelSize(k) {
  try { localStorage.setItem(SIZE_KEY, k); } catch { /* ignore */ }
}

// Thermal labels are already die-cut: dashed borders would print as a frame
export const DEFAULT_LABEL_OPTS = {
  showName: true, showPrice: true, showCode: true, showStore: false, cutLines: false,
};

/**
 * Print labels sized for a thermal label printer: one label = one page whose
 * @page size equals the label, with zero margins. In the print dialog choose the
 * printer's label paper (same size), Margins "None"/"Default" and Scale 100 %.
 *
 * @param entries  [{ name, code, price, copies }]
 * @param size     key of LABEL_SIZES
 */
export function printLabels(entries, { size, rotation, opts = DEFAULT_LABEL_OPTS, store = "", title = "Étiquettes code-barres", dir = "ltr" } = {}) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return;
  const key = SIZE_ALIASES[size] || size || loadLabelSize();
  const S = LABEL_SIZES[key] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
  const rot = LABEL_ROTATIONS[rotation] ? rotation : loadLabelRotation();
  const turned = rot !== "r0";
  const pageW = turned ? S.h : S.w, pageH = turned ? S.w : S.h;
  const transform = rot === "r90" ? `translateX(${S.h}mm) rotate(90deg)`
    : rot === "r270" ? `translateY(${S.w}mm) rotate(-90deg)` : "none";
  const lines = S.h <= 25 ? 1 : 2;
  // Vertical budget: the barcode gets whatever name/price leave over
  const hasText = opts.showCode;

  const label = (e) => `
    <div class="pg"><div class="lbl">
      ${opts.showStore && store ? `<div class="lbl-s">${esc(store)}</div>` : ""}
      ${opts.showName ? `<div class="lbl-n">${esc(e.name)}</div>` : ""}
      <div class="lbl-b">${ean13Svg(e.code, { height: hasText ? 50 : 56, showText: hasText, color: "#000" })}</div>
      ${opts.showPrice && Number(e.price) > 0 ? `<div class="lbl-p">${esc(fmtMoney(e.price))}</div>` : ""}
    </div></div>`;

  const cells = list
    .flatMap((e) => Array.from({ length: Math.max(1, Math.min(500, Number(e.copies) || 1)) }, () => label(e)))
    .join("");

  const w = window.open("", "_blank", "width=600,height=600");
  if (!w) return;
  w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${pageW}mm; background: #fff; }
    .pg { width: ${pageW}mm; height: ${pageH}mm; overflow: hidden; position: relative;
          page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
    .pg:last-child { page-break-after: auto; break-after: auto; }
    body { font-family: Arial, 'Segoe UI', 'Tajawal', sans-serif; color: #000;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .lbl {
      width: ${S.w}mm; height: ${S.h}mm; padding: ${S.h <= 25 ? "0.8mm 1.5mm" : "1.2mm 1.8mm"}; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      gap: 0.3mm; position: absolute; top: 0; left: 0; transform-origin: top left; transform: ${transform};
      ${opts.cutLines ? "outline: 0.2mm dashed #999; outline-offset: -0.6mm;" : ""}
    }
    .lbl-s { font-size: ${S.store}pt; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1; }
    .lbl-n { width: 100%; font-size: ${S.name}pt; font-weight: 700; text-align: center; line-height: 1.1;
             display: -webkit-box; -webkit-line-clamp: ${lines}; -webkit-box-orient: vertical; overflow: hidden;
             word-break: break-word; }
    .lbl-b { width: 100%; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .lbl-b svg { width: 100%; height: 100%; display: block; }
    .lbl-p { font-size: ${S.price}pt; font-weight: 800; font-family: Arial, sans-serif; line-height: 1; white-space: nowrap; }
    @media screen {
      html, body { width: auto; } body { background: #e5e7eb; padding: 10px; }
      .pg { background: #fff; margin: 0 auto 8px; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    }
  </style></head><body>${cells}
  <script>window.onload = () => setTimeout(() => window.print(), 150);<\/script></body></html>`);
  w.document.close();
}
