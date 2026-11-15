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
  LABEL_SIZES, DEFAULT_LABEL_SIZE, DEFAULT_LABEL_OPTS,
  loadLabelSize, printLabels,
} from "../barcode";
import { renderLabelCanvas } from "./labelLayout";

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

const resolveSize = (size) => LABEL_SIZES[size] || LABEL_SIZES[loadLabelSize()] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
export { renderLabelCanvas, labelDots } from "./labelLayout";

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
