// ===== Impression directe des étiquettes (imprimante thermique TSPL) =====
//
// Chaque étiquette est dessinée ici, point par point, à la résolution réelle
// de la tête d'impression (203 points par pouce ≈ 8 points par mm) : une
// étiquette 40 × 20 mm fait exactement 320 × 160 points. Les barres du code
// EAN-13 tombent sur des points entiers, le résultat est net et lisible.
//
// Le travail est écrit en TSPL, le langage des imprimantes d'étiquettes
// (Xprinter, TSC…) :
//   SIZE 40 mm,20 mm      la taille de l'étiquette
//   GAP 2 mm,0 mm         l'espace entre deux étiquettes : l'imprimante le
//                         détecte et démarre chaque étiquette au bon endroit
//   BITMAP …  / PRINT …   l'image de l'étiquette, puis le nombre de copies
//
// Il part ensuite vers le serveur local AutoGarage (server/printer.js), qui le
// remet tel quel à l'imprimante. Ni la fenêtre d'impression de Chrome, ni le
// format de papier du pilote Windows n'interviennent plus.

import {
  ean13Bits, EAN13_GUARDS, LABEL_SIZES, DEFAULT_LABEL_SIZE, DEFAULT_LABEL_OPTS,
  loadLabelSize, printLabels,
} from "../barcode";
import { fmtMoney } from "../store";

// ---------------------------------------------------------------- réglages

const SETTINGS_KEY = "krimou.labelPrinter.v1";
const SETTINGS_EVENT = "krimou:label-printer";

export const DEFAULT_PRINTER_SETTINGS = {
  mode: "direct",     // "direct" (serveur local) | "browser" (fenêtre Chrome)
  printer: "",        // nom Windows de l'imprimante ; vide = détection automatique
  dpi: 203,           // résolution de la tête : 203 (8 pts/mm) ou 300
  gap: 2,             // espace entre deux étiquettes, en mm (0 = papier continu)
  density: 10,        // noirceur 0–15
  speed: 4,           // vitesse 2–6 (pouces/s)
  flip: false,        // retourner l'impression de 180°
  invert: false,      // certains modèles compatibles inversent noir et blanc
  offsetX: 0,         // décalage fin, en mm
  offsetY: 0,
};

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function cleanPrinterSettings(s = {}) {
  const d = DEFAULT_PRINTER_SETTINGS;
  return {
    mode: s.mode === "browser" ? "browser" : "direct",
    printer: typeof s.printer === "string" ? s.printer : "",
    dpi: Number(s.dpi) === 300 ? 300 : 203,
    gap: clampNum(s.gap, 0, 10, d.gap),
    density: Math.round(clampNum(s.density, 0, 15, d.density)),
    speed: Math.round(clampNum(s.speed, 1, 8, d.speed)),
    flip: !!s.flip,
    invert: !!s.invert,
    offsetX: clampNum(s.offsetX, -10, 10, 0),
    offsetY: clampNum(s.offsetY, -10, 10, 0),
  };
}

// Réglages propres à ce PC (c'est lui qui est relié à l'imprimante) : le
// stockage du navigateur est l'endroit naturel, ils n'ont pas à être partagés.
export function loadPrinterSettings() {
  try {
    return cleanPrinterSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch {
    return cleanPrinterSettings();
  }
}

export function savePrinterSettings(patch) {
  const next = cleanPrinterSettings({ ...loadPrinterSettings(), ...patch });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* navigation privée */ }
  try { window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next })); } catch { /* ignore */ }
  return next;
}

export function onPrinterSettings(cb) {
  const handler = (e) => cb(e.detail || loadPrinterSettings());
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
}

// ---------------------------------------------------------------- serveur local

export const AGENT_PORT = 5180;
const isLocalHost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);

/** Adresses où chercher le serveur local, dans l'ordre. */
function agentBases() {
  const bases = [];
  if (isLocalHost()) bases.push("");               // l'application est servie par lui
  const local = `http://127.0.0.1:${AGENT_PORT}`;
  if (!(isLocalHost() && window.location.port === String(AGENT_PORT))) bases.push(local);
  return bases;
}

async function fetchWithTimeout(url, init = {}, ms = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

let agentCache = { at: 0, value: null };

/** Dernier état connu du serveur local (null tant qu'on ne l'a pas cherché). */
export const cachedAgent = () => (Date.now() - agentCache.at < 60000 ? agentCache.value : null);

/**
 * Cherche le serveur local et la liste des imprimantes du PC.
 * @returns {Promise<{ok:true, base, printers, platform} | {ok:false, reason, error}>}
 */
export async function detectAgent({ force = false } = {}) {
  if (!force && agentCache.value && Date.now() - agentCache.at < 15000) return agentCache.value;
  let value = {
    ok: false,
    reason: "unreachable",
    error: "Serveur local AutoGarage introuvable sur ce PC",
  };
  for (const base of agentBases()) {
    try {
      // Le premier lancement de PowerShell sur un PC peut prendre quelques secondes
      const res = await fetchWithTimeout(`${base}/api/printers`, { headers: { "X-AutoGarage-Agent": "1" } }, 12000);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        value = { ok: true, base, printers: data.printers || [], platform: data.platform || "" };
        break;
      }
      if (data && res.status === 404 && /route introuvable/i.test(data.error || "")) {
        value = {
          ok: false,
          reason: "outdated",
          error: "Le serveur local est d'une version précédente : fermez la fenêtre « AutoGarage Pro - Serveur » puis relancez le raccourci AutoGarage Pro",
        };
        break;
      }
      if (data?.error) {
        value = { ok: false, reason: "error", error: data.error };
        break;
      }
    } catch {
      // pas de serveur à cette adresse : on essaie la suivante
    }
  }
  agentCache = { at: Date.now(), value };
  return value;
}

const LABEL_PRINTER_NAME = /xprinter|xp-|label|étiquette|etiquette|tsc|tspl|zebra|godex|gprinter|barcode/i;

/** L'imprimante choisie, ou à défaut celle qui ressemble à une imprimante d'étiquettes. */
export function pickPrinter(printers = [], wanted = "") {
  if (!printers.length) return null;
  return printers.find((p) => p.name === wanted)
    || printers.find((p) => LABEL_PRINTER_NAME.test(`${p.name} ${p.driver}`))
    || printers.find((p) => p.default)
    || printers[0];
}

// ---------------------------------------------------------------- dessin

const FONT = `Arial, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif`;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

const resolveSize = (size) => {
  const key = LABEL_SIZES[size] ? size : loadLabelSize();
  return LABEL_SIZES[key] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
};

/** Taille de l'étiquette en points d'impression (arrondie au point près). */
export function labelDots(S, dpi) {
  const dpm = dpi / 25.4;
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

/** Coupe en `maxLines` lignes au plus, la dernière terminée par « … » si besoin. */
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const tryLine = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(tryLine).width <= maxWidth || !cur) {
      cur = tryLine;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) {
        cur = words.slice(i).join(" ");
        break;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l) => fitText(ctx, l, maxWidth));
}

function setFont(ctx, px, text = "") {
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.direction = RTL.test(text) ? "rtl" : "ltr";
}

/**
 * Dessine le code EAN-13 (barres + chiffres) dans le rectangle donné, avec un
 * module (largeur de la barre la plus fine) d'un nombre ENTIER de points.
 */
function drawEan13(ctx, value, { x, y, w, h, showText }) {
  const { code, bits } = ean13Bits(value);
  // 95 modules + 7 de marge blanche de chaque côté (le premier chiffre loge à gauche)
  const m = Math.max(1, Math.min(4, Math.floor(w / 109)));
  const blockW = 109 * m;
  const x0 = Math.round(x + (w - blockW) / 2) + 7 * m;   // début de la garde gauche

  const digitPx = showText ? Math.min(Math.round(10.5 * m), Math.max(10, Math.round(h * 0.2))) : 0;
  const barH = Math.max(8, h - digitPx - (showText ? 1 : 0));
  const guardH = showText ? Math.min(h, barH + Math.round(digitPx * 0.55)) : barH;

  ctx.fillStyle = "#000";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    ctx.fillRect(x0 + i * m, y, m, EAN13_GUARDS.has(i) ? guardH : barH);
  }

  if (!showText) return;
  ctx.font = `bold ${digitPx}px ${FONT}`;
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const ty = y + h;
  ctx.fillText(code[0], x0 - 3.5 * m, ty);
  for (let i = 0; i < 6; i++) {
    ctx.fillText(code[i + 1], x0 + (3 + 7 * i + 3.5) * m, ty);
    ctx.fillText(code[i + 7], x0 + (50 + 7 * i + 3.5) * m, ty);
  }
}

/**
 * Dessine une étiquette sur un canvas de la taille exacte de l'étiquette, en
 * points d'impression. Le même dessin sert à l'aperçu et à l'impression.
 */
export function renderLabelCanvas(entry, {
  size, opts = DEFAULT_LABEL_OPTS, store = "", settings = loadPrinterSettings(), test = false,
} = {}) {
  const S = resolveSize(size);
  const { dpm, W, H } = labelDots(S, settings.dpi);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(Math.round(settings.offsetX * dpm), Math.round(settings.offsetY * dpm));
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const mx = Math.round(1 * dpm);                  // marges latérales 1 mm
  const my = Math.round((S.h <= 25 ? 0.6 : 1) * dpm);
  const gapY = Math.max(2, Math.round(0.3 * dpm));
  const innerW = W - 2 * mx;
  const pt = (p) => Math.round((p * settings.dpi) / 72);

  let top = my;
  let bottom = H - my;

  if (test) {
    // Cadre à 0,5 mm du bord : il doit apparaître entier et centré sur
    // l'étiquette. Sinon, ajuster les décalages.
    const inset = Math.round(0.5 * dpm);
    const t = Math.max(2, Math.round(0.25 * dpm));
    ctx.fillRect(inset, inset, W - 2 * inset, t);
    ctx.fillRect(inset, H - inset - t, W - 2 * inset, t);
    ctx.fillRect(inset, inset, t, H - 2 * inset);
    ctx.fillRect(W - inset - t, inset, t, H - 2 * inset);
    top = Math.max(top, inset + t + gapY);
    bottom = Math.min(bottom, H - inset - t - gapY);
  }

  if (opts.showStore && store) {
    const px = pt(S.store);
    setFont(ctx, px, store);
    ctx.fillText(fitText(ctx, store.toUpperCase(), innerW), W / 2, top);
    top += px + gapY;
  }

  if (opts.showName) {
    const px = pt(S.name);
    const lines = S.h <= 25 ? 1 : 2;
    setFont(ctx, px, entry.name);
    const lh = Math.round(px * 1.1);
    for (const line of wrapText(ctx, entry.name, innerW, lines)) {
      ctx.fillText(line, W / 2, top);
      top += lh;
    }
    top += gapY - (lh - px);
  }

  if (opts.showPrice && Number(entry.price) > 0) {
    const px = pt(S.price);
    const text = fmtMoney(entry.price);
    setFont(ctx, px, "");
    ctx.textBaseline = "bottom";
    ctx.fillText(fitText(ctx, text, innerW), W / 2, bottom);
    ctx.textBaseline = "top";
    bottom -= px + gapY;
  }

  const showText = !!opts.showCode && bottom - top >= Math.round(6 * dpm);
  drawEan13(ctx, entry.code, { x: mx, y: top, w: innerW, h: Math.max(8, bottom - top), showText });

  if (opts.cutLines && !test) {
    const d = Math.max(1, Math.round(0.15 * dpm));
    for (let x = 0; x < W; x += 6) { ctx.fillRect(x, 0, 3, d); ctx.fillRect(x, H - d, 3, d); }
    for (let y = 0; y < H; y += 6) { ctx.fillRect(0, y, d, 3); ctx.fillRect(W - d, y, d, 3); }
  }

  ctx.restore();
  return canvas;
}

/** Lit le canvas en noir et blanc pur : true = point imprimé. */
export function canvasToDots(canvas, threshold = 150) {
  const { width: W, height: H } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  const dots = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < dots.length; i += 4, j++) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    dots[j] = lum < threshold ? 1 : 0;
  }
  return { W, H, dots };
}

/**
 * Données de la commande TSPL `BITMAP` : une ligne = ⌈W/8⌉ octets, bit de
 * poids fort à gauche. En TSPL, un bit à 0 imprime un point noir.
 */
export function packTsplBitmap({ W, H, dots }, invert = false) {
  const wb = Math.ceil(W / 8);
  const bytes = new Uint8Array(wb * H);
  for (let y = 0; y < H; y++) {
    for (let bx = 0; bx < wb; bx++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const x = bx * 8 + b;
        const black = x < W && dots[y * W + x] === 1;
        if (black === invert) byte |= 0x80 >> b;    // blanc → 1 (ou l'inverse)
      }
      bytes[y * wb + bx] = byte;
    }
  }
  return { wb, H, bytes };
}

// ---------------------------------------------------------------- travaux TSPL

const encoder = new TextEncoder();
const fmtMm = (n) => String(Math.round(n * 100) / 100);

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function jobHeader(S, settings) {
  return [
    `SIZE ${fmtMm(S.w)} mm,${fmtMm(S.h)} mm`,
    settings.gap > 0 ? `GAP ${fmtMm(settings.gap)} mm,0 mm` : "GAP 0,0",
    `DIRECTION ${settings.flip ? 0 : 1},0`,
    "REFERENCE 0,0",
    `SPEED ${settings.speed}`,
    `DENSITY ${settings.density}`,
    "SET TEAR ON",
  ].join("\r\n") + "\r\n";
}

/**
 * Travail TSPL complet : un en-tête (taille, espace, noirceur…), puis pour
 * chaque étiquette différente son image et son nombre de copies.
 * @param labels [{ canvas, copies }]
 */
export function buildTsplJob(labels, { size, settings = loadPrinterSettings() } = {}) {
  const S = resolveSize(size);
  const parts = [encoder.encode(jobHeader(S, settings))];
  for (const { canvas, copies } of labels) {
    const bmp = packTsplBitmap(canvasToDots(canvas), settings.invert);
    parts.push(encoder.encode(`CLS\r\nBITMAP 0,0,${bmp.wb},${bmp.H},0,`));
    parts.push(bmp.bytes);
    const n = Math.max(1, Math.min(500, Math.round(Number(copies) || 1)));
    parts.push(encoder.encode(`\r\nPRINT ${n},1\r\n`));
  }
  return concat(parts);
}

/** Calibrage : l'imprimante avance quelques étiquettes et mesure l'espace. */
export function buildCalibrationJob({ size, settings = loadPrinterSettings() } = {}) {
  const S = resolveSize(size);
  return encoder.encode(
    `SIZE ${fmtMm(S.w)} mm,${fmtMm(S.h)} mm\r\n`
    + (settings.gap > 0 ? `GAP ${fmtMm(settings.gap)} mm,0 mm\r\n` : "GAP 0,0\r\n")
    + "GAPDETECT\r\n"
  );
}

export async function sendJob(base, printer, bytes) {
  let res;
  try {
    res = await fetchWithTimeout(`${base}/api/print/raw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-AutoGarage-Agent": "1",
        "X-AutoGarage-Printer": encodeURIComponent(printer),
      },
      body: bytes,
    }, 60000);
  } catch {
    agentCache = { at: 0, value: null };
    throw new Error("Le serveur local AutoGarage ne répond plus");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Erreur d'impression (${res.status})`);
  return data;
}

// ---------------------------------------------------------------- impression

const countLabels = (list) =>
  list.reduce((n, e) => n + Math.max(1, Math.min(500, Math.round(Number(e.copies) || 1))), 0);

/** Prépare l'imprimante et le travail ; lève une erreur lisible sinon. */
async function directTarget() {
  const settings = loadPrinterSettings();
  const agent = cachedAgent()?.ok ? cachedAgent() : await detectAgent();
  if (!agent.ok) throw Object.assign(new Error(agent.error), { canFallback: true });
  const printer = pickPrinter(agent.printers, settings.printer);
  if (!printer) throw Object.assign(new Error("Aucune imprimante installée sur ce PC"), { canFallback: true });
  return { settings, agent, printer };
}

/**
 * Imprime des étiquettes : en direct si le serveur local et l'imprimante sont
 * là, sinon par la fenêtre d'impression de Chrome.
 *
 * Quand on sait déjà que l'impression directe est indisponible, la fenêtre
 * Chrome est ouverte tout de suite, dans le clic de l'utilisateur : ouverte
 * après une attente réseau, le navigateur la bloquerait.
 *
 * @param entries [{ name, code, price, copies }]
 * @returns {Promise<{ok, mode:'direct'|'browser', message, count?, printer?, canFallback?, fallback?}>}
 */
export function printLabelsAuto(entries, options = {}) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return Promise.resolve({ ok: false, mode: "none", message: "" });
  const settings = loadPrinterSettings();
  const known = cachedAgent();

  if (settings.mode === "browser" || (known && !known.ok)) {
    printLabels(list, options);
    return Promise.resolve({
      ok: true, mode: "browser", message: "",
      fallback: settings.mode === "direct", reason: known?.error || "",
    });
  }

  return (async () => {
    const { settings: s, agent, printer } = await directTarget();
    const job = buildTsplJob(
      list.map((e) => ({
        canvas: renderLabelCanvas(e, { size: options.size, opts: options.opts, store: options.store, settings: s }),
        copies: e.copies,
      })),
      { size: options.size, settings: s }
    );
    await sendJob(agent.base, printer.name, job);
    return { ok: true, mode: "direct", count: countLabels(list), printer: printer.name, message: "" };
  })().catch((err) => ({
    ok: false, mode: "direct", message: err.message, canFallback: true,
  }));
}

/** Étiquette d'essai : cadre au bord + code-barres lisible. */
export async function printTestLabel({ size, opts = DEFAULT_LABEL_OPTS } = {}) {
  const { settings, agent, printer } = await directTarget();
  const S = resolveSize(size);
  const canvas = renderLabelCanvas(
    { name: `TEST ${S.label} · ${settings.dpi} dpi`, code: "6130000000008", price: 1200 },
    { size, opts: { ...opts, showName: true, showPrice: true, showCode: true, showStore: false }, settings, test: true }
  );
  await sendJob(agent.base, printer.name, buildTsplJob([{ canvas, copies: 1 }], { size, settings }));
  return printer.name;
}

export async function calibratePrinter({ size } = {}) {
  const { settings, agent, printer } = await directTarget();
  await sendJob(agent.base, printer.name, buildCalibrationJob({ size, settings }));
  return printer.name;
}
