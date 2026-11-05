// ===== Imprimante d'étiquettes : état, réglages, aperçu exact =====
//
// Le panneau répond à trois questions, dans l'ordre où on se les pose devant
// l'imprimante : l'application la voit-elle ? sur quelle taille d'étiquette
// imprime-t-on ? et à quoi ressemblera exactement l'étiquette (point par point) ?

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Printer, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Crosshair, SlidersHorizontal, X,
} from "lucide-react";
import { useApp } from "../context";
import { LABEL_SIZES, LABEL_ROTATIONS, DEFAULT_LABEL_OPTS } from "../barcode";
import {
  loadPrinterSettings, savePrinterSettings, onPrinterSettings, cachedAgent, detectAgent,
  pickPrinter, renderLabelCanvas, canvasToDots, labelDots, printTestLabel, calibratePrinter,
} from "../lib/labelPrinter";
import { Btn, IconBtn, Field, Input, Select, Seg } from "./ui";

/** Réglages + état du serveur local, partagés entre tous les écrans ouverts. */
export function useLabelPrinter() {
  const [settings, setSettings] = useState(loadPrinterSettings);
  const [agent, setAgent] = useState(() => cachedAgent());
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async (force = true) => {
    setChecking(true);
    try {
      setAgent(await detectAgent({ force }));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(false); }, [refresh]);
  useEffect(() => onPrinterSettings(setSettings), []);

  const update = useCallback((patch) => setSettings(savePrinterSettings(patch)), []);
  const printer = agent?.ok ? pickPrinter(agent.printers, settings.printer) : null;
  // L'impression part en direct seulement si tout est réuni ; sinon Chrome.
  const direct = settings.mode === "direct" && !!agent?.ok && !!printer;

  return { settings, update, agent, checking, refresh, printer, direct };
}

/** L'étiquette telle que l'imprimante la recevra : chaque pixel = un point. */
export function LabelBitmapPreview({ entry, size, opts = DEFAULT_LABEL_OPTS, store = "", settings }) {
  const ref = useRef(null);
  const S = LABEL_SIZES[size] || LABEL_SIZES.s40x20;
  const { W } = labelDots(S, settings.dpi);
  const key = JSON.stringify([entry?.name, entry?.code, entry?.price, size, opts, store,
    settings.dpi, settings.offsetX, settings.offsetY]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !entry) return;
    const { W: w, H: h, dots } = canvasToDots(renderLabelCanvas(entry, { size, opts, store, settings }));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < dots.length; i++) {
      const v = dots[i] ? 17 : 255;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // `key` résume tout ce qui change le dessin (texte, format, résolution, décalages)
  }, [key]);

  return (
    <canvas ref={ref} aria-label="Aperçu de l'étiquette"
      className="block rounded-md bg-white shadow-sm ring-1 ring-slate-300"
      style={{ width: W, maxWidth: "100%", imageRendering: "pixelated" }} />
  );
}

/** Bandeau d'erreur / d'avertissement d'impression, avec repli sur Chrome. */
export function PrintIssue({ issue, onClose, onBrowser }) {
  const { t } = useApp();
  if (!issue) return null;
  const warn = issue.tone === "warning";
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className={`mb-4 flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        warn ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 font-medium">{issue.message}</p>
      {onBrowser && !warn && (
        <button onClick={onBrowser}
          className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          {t("Imprimer via Chrome")}
        </button>
      )}
      <button onClick={onClose} aria-label={t("Fermer")} className="cursor-pointer opacity-70 hover:opacity-100"><X size={16} /></button>
    </motion.div>
  );
}

function StatusLine({ lp }) {
  const { t } = useApp();
  const { settings, agent, checking, printer, direct } = lp;
  if (settings.mode === "browser") {
    return <span className="text-xs font-semibold text-slate-500">{t("Impression par la fenêtre de Chrome")}</span>;
  }
  if (checking && !agent) {
    return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Loader2 size={13} className="animate-spin" />{t("Recherche de l'imprimante…")}</span>;
  }
  if (direct) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 size={14} /> {t("Impression directe")} · {printer.name}{printer.offline ? ` (${t("hors ligne")})` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700">
      <AlertTriangle size={14} /> {t("Impression directe indisponible")}
    </span>
  );
}

/** Ligne compacte (fiche produit) : où partira l'étiquette. */
export function LabelPrinterStatus({ lp }) {
  return <StatusLine lp={lp} />;
}

/**
 * Panneau complet (écran Codes-barres).
 * @param size / onSizeChange           format d'étiquette (clé de LABEL_SIZES)
 * @param rotation / onRotationChange   rotation du mode Chrome uniquement
 * @param previewEntry                  étiquette à montrer dans l'aperçu exact
 */
export function LabelPrinterPanel({ lp, size, onSizeChange, rotation, onRotationChange, previewEntry, opts, store }) {
  const { t } = useApp();
  const { settings, update, agent, checking, refresh, printer, direct } = lp;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [advanced, setAdvanced] = useState(false);

  const say = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 6000); };
  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (e) { say(e.message, false); } finally { setBusy(""); }
  };
  const test = () => run("test", async () => {
    const name = await printTestLabel({ size, opts });
    say(`${t("Étiquette de test envoyée à")} ${name}`);
  });
  const calibrate = () => run("calibrate", async () => {
    const name = await calibratePrinter({ size });
    say(`${t("Calibrage lancé sur")} ${name} — ${t("l'imprimante avance quelques étiquettes pour mesurer l'espace entre elles.")}`);
  });

  const sizeOptions = useMemo(
    () => Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>), []);

  return (
    <div className="card mb-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg grad-primary p-1.5 text-white"><Printer size={14} /></div>
          <h3 className="text-sm font-bold text-primary-900">{t("Imprimante d'étiquettes")}</h3>
        </div>
        <StatusLine lp={lp} />
        <div className="ms-auto flex items-center gap-2">
          <Seg value={settings.mode} onChange={(v) => update({ mode: v })} options={[
            { value: "direct", label: t("Directe (recommandée)") },
            { value: "browser", label: t("Via Chrome") },
          ]} />
          <IconBtn icon={RefreshCw} title={t("Rechercher à nouveau l'imprimante")}
            className={checking ? "animate-spin" : ""} onClick={() => refresh(true)} />
        </div>
      </div>

      {settings.mode === "direct" && !direct && !checking && agent && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
          <p className="font-semibold">{t(agent.error || "Aucune imprimante installée sur ce PC")}</p>
          {agent.reason === "unreachable" && (
            <p className="mt-0.5">
              {t("Ouvrez l'application avec le raccourci « AutoGarage Pro » sur le PC relié à l'imprimante (adresse http://localhost:5180). En attendant, l'impression passe par la fenêtre de Chrome.")}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {direct && (
          <Field label={t("Imprimante")}>
            <Select value={printer?.name || ""} onChange={(e) => update({ printer: e.target.value })}>
              {agent.printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}{p.offline ? ` (${t("hors ligne")})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("Format des étiquettes")}>
          <Select value={size} onChange={(e) => onSizeChange(e.target.value)}>{sizeOptions}</Select>
        </Field>
      </div>

      {!direct && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Rotation")}</span>
            <Seg value={rotation} onChange={onRotationChange}
              options={Object.entries(LABEL_ROTATIONS).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <p className="text-[11.5px] leading-snug text-slate-400">
            {t("Dans la fenêtre d'impression de Chrome : même format de papier que l'étiquette, Marges « Aucune », Échelle « Par défaut », en-têtes et pieds de page décochés.")}
          </p>
        </div>
      )}

      {direct && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="min-w-0">
              <p className="label">{t("Aperçu exact — chaque point imprimé")}</p>
              {previewEntry && (
                <LabelBitmapPreview entry={previewEntry} size={size} opts={opts} store={store} settings={settings} />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Btn variant="soft" icon={busy === "test" ? Loader2 : Printer} disabled={!!busy} onClick={test}
                className={busy === "test" ? "[&>svg]:animate-spin" : ""}>
                {t("Imprimer un test")}
              </Btn>
              <Btn variant="ghost" icon={busy === "calibrate" ? Loader2 : Crosshair} disabled={!!busy} onClick={calibrate}
                className={busy === "calibrate" ? "[&>svg]:animate-spin" : ""}>
                {t("Calibrer les étiquettes")}
              </Btn>
            </div>
          </div>

          {msg && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {msg.text}
            </p>
          )}

          <button onClick={() => setAdvanced((v) => !v)}
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-800">
            <SlidersHorizontal size={14} /> {advanced ? t("Masquer les réglages avancés") : t("Réglages avancés")}
          </button>

          {advanced && (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-primary-100 bg-primary-50/30 p-3 sm:grid-cols-4">
              <Field label={t("Espace entre étiquettes (mm)")}>
                <Input type="number" step="0.5" min="0" max="10" value={settings.gap}
                  onChange={(e) => update({ gap: e.target.value })} />
              </Field>
              <Field label={t("Résolution")}>
                <Select value={settings.dpi} onChange={(e) => update({ dpi: Number(e.target.value) })}>
                  <option value={203}>203 dpi (8 pts/mm)</option>
                  <option value={300}>300 dpi (12 pts/mm)</option>
                </Select>
              </Field>
              <Field label={`${t("Noirceur")} (${settings.density})`}>
                <input type="range" min="0" max="15" value={settings.density} className="mt-3 w-full accent-primary-600"
                  onChange={(e) => update({ density: e.target.value })} />
              </Field>
              <Field label={t("Vitesse")}>
                <Select value={settings.speed} onChange={(e) => update({ speed: Number(e.target.value) })}>
                  {[2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label={t("Décalage horizontal (mm)")}>
                <Input type="number" step="0.25" min="-10" max="10" value={settings.offsetX}
                  onChange={(e) => update({ offsetX: e.target.value })} />
              </Field>
              <Field label={t("Décalage vertical (mm)")}>
                <Input type="number" step="0.25" min="-10" max="10" value={settings.offsetY}
                  onChange={(e) => update({ offsetY: e.target.value })} />
              </Field>
              <label className="col-span-2 flex cursor-pointer items-start gap-2 pt-1 text-[12.5px] text-slate-600 sm:col-span-1">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-600" checked={settings.flip}
                  onChange={() => update({ flip: !settings.flip })} />
                {t("Retourner l'impression (180°)")}
              </label>
              <label className="col-span-2 flex cursor-pointer items-start gap-2 pt-1 text-[12.5px] text-slate-600 sm:col-span-1">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-600" checked={settings.invert}
                  onChange={() => update({ invert: !settings.invert })} />
                {t("Inverser noir / blanc (si l'étiquette sort noire)")}
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
