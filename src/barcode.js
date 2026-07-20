// ===== EAN-13 barcodes: checksum, random generation, SVG rendering =====
// Self-contained (no library) so the same renderer feeds both the on-screen
// preview and the printed label sheet.

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

// ---- geometry (in modules; 1 module = 1 viewBox unit) ----
const QUIET_START = 11;          // left quiet zone, holds the first digit
const QUIET_END = 7;             // right quiet zone
const TOTAL = QUIET_START + 95 + QUIET_END;
const LEFT_X = QUIET_START + 3;  // after the start guard
const RIGHT_X = LEFT_X + 42 + 5; // after the left group + centre guard
// Guards run taller than the data bars, as on a real label
const GUARDS = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);

// Returns a standalone <svg> string — injected via dangerouslySetInnerHTML in the
// app and concatenated straight into the print document.
export function ean13Svg(value, { height = 70, showText = true, color = "#111827" } = {}) {
  const code = normalizeEan13(value);
  const parity = PARITY[Number(code[0])];

  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (parity[i] === "L" ? L : G)[Number(code[i + 1])];
  bits += "01010";
  for (let i = 0; i < 6; i++) bits += R[Number(code[i + 7])];
  bits += "101";

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
