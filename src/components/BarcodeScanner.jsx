// ===== Scanner de codes-barres par la caméra =====
//
// Deux moteurs, choisis à l'exécution :
//   1. `BarcodeDetector`, natif sur Chrome/Android — décodage matériel, aucune
//      bibliothèque à charger, c'est le cas courant sur un téléphone ;
//   2. ZXing, chargé à la demande, pour les navigateurs qui ne l'ont pas
//      (Safari iOS, Firefox, ordinateurs de bureau).
//
// Le scanner reste ouvert après une lecture : au comptoir comme à l'atelier on
// enchaîne les pièces, refermer la caméra à chaque article serait pénible.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, CameraOff, SwitchCamera, Zap, ZapOff, Keyboard, CheckCircle2,
  AlertTriangle, ScanLine,
} from "lucide-react";
import { useApp } from "../context";
import { Btn, Modal, Input } from "./ui";

// Formats utiles en magasin : EAN/UPC pour les articles du commerce, Code 128
// et Code 39 pour les étiquettes imprimées en interne.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];

const REPEAT_DELAY = 1400;  // ms avant d'accepter à nouveau le même code

/** Petit bip de confirmation, sans fichier audio à embarquer. */
function beep(ok = true) {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = ok ? 1180 : 320;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
    setTimeout(() => ctx.close(), 400);
  } catch { /* le son n'est qu'un confort */ }
  navigator.vibrate?.(ok ? 40 : [30, 40, 30]);
}

/**
 * Ouvre la caméra et appelle `onCode` à chaque lecture.
 * Renvoie l'état de la caméra pour que l'interface puisse expliquer un refus
 * plutôt que d'afficher un rectangle noir.
 */
function useCamera({ active, facing, onCode }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopRef = useRef(null);
  const lastRef = useRef({ code: "", at: 0 });
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchable, setTorchable] = useState(false);

  const emit = useCallback((raw) => {
    const code = String(raw || "").trim();
    if (!code) return;
    const now = Date.now();
    if (code === lastRef.current.code && now - lastRef.current.at < REPEAT_DELAY) return;
    lastRef.current = { code, at: now };
    onCode(code);
  }, [onCode]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const start = async () => {
      setError("");
      setReady(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? "Ce navigateur ne donne pas accès à la caméra."
            : "La caméra exige une connexion sécurisée (https:// ou localhost). Ouvrez l'application en HTTPS depuis le téléphone."
        );
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.name === "NotAllowedError"
            ? "Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, puis réessayez."
            : err?.name === "NotFoundError"
              ? "Aucune caméra détectée sur cet appareil."
              : err?.message || "Caméra indisponible."
        );
        return;
      }

      if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        try { await video.play(); } catch { /* autoplay bloqué : le bouton suffit */ }
      }
      setReady(true);

      const track = stream.getVideoTracks()[0];
      setTorchable(!!track?.getCapabilities?.().torch);

      // --- moteur 1 : détecteur natif ---
      if ("BarcodeDetector" in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const detector = new window.BarcodeDetector({
            formats: FORMATS.filter((f) => supported.includes(f)),
          });
          let raf = 0;
          const tick = async () => {
            if (cancelled) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found?.length) emit(found[0].rawValue);
            } catch { /* image non prête */ }
            raf = requestAnimationFrame(() => setTimeout(tick, 120));
          };
          tick();
          stopRef.current = () => cancelAnimationFrame(raf);
          return;
        } catch { /* on bascule sur ZXing */ }
      }

      // --- moteur 2 : ZXing, chargé seulement si nécessaire ---
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;
        const hints = new Map([
          [DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
            BarcodeFormat.ITF, BarcodeFormat.CODABAR,
          ]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 140 });
        const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (result) emit(result.getText());
        });
        stopRef.current = () => controls.stop();
      } catch (err) {
        if (!cancelled) setError(err?.message || "Lecteur de codes-barres indisponible.");
      }
    };

    start();

    return () => {
      cancelled = true;
      try { stopRef.current?.(); } catch { /* déjà arrêté */ }
      stopRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setReady(false);
      setTorch(false);
    };
  }, [active, facing, emit]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch((v) => !v);
    } catch { setTorchable(false); }
  };

  return { videoRef, error, ready, torch, torchable, toggleTorch };
}

/**
 * Fenêtre de scan.
 *
 * `onScan(code)` doit renvoyer `{ ok, message }` : c'est l'appelant qui sait si
 * le code correspond à un produit du stock, et le scanner se contente
 * d'afficher son verdict au-dessus de l'image.
 */
export default function BarcodeScanner({ open, onClose, onScan, title, subtitle }) {
  const { t } = useApp();
  const [facing, setFacing] = useState("environment");
  const [manual, setManual] = useState("");
  const [typing, setTyping] = useState(false);
  const [feed, setFeed] = useState([]);   // dernières lectures, la plus récente en tête

  useEffect(() => {
    if (!open) { setFeed([]); setManual(""); setTyping(false); }
  }, [open]);

  // `onScan` is rebuilt on every render of the calling screen. Reading it
  // through a ref keeps this callback stable — otherwise the effect that owns
  // the camera would tear it down and reopen it on each keystroke.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });

  const handle = useCallback((code) => {
    const res = onScanRef.current?.(code) || {};
    const ok = res.ok !== false;
    beep(ok);
    setFeed((f) => [{ id: `${code}-${Date.now()}`, code, ok, message: res.message || "" }, ...f].slice(0, 5));
  }, []);

  const { videoRef, error, ready, torch, torchable, toggleTorch } = useCamera({
    active: open && !typing,
    facing,
    onCode: handle,
  });

  const submitManual = (e) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    handle(code);
    setManual("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-lg"
      zIndex={130}
      title={title || t("Scanner un code-barres")}
      footer={<Btn variant="ghost" onClick={onClose}>{t("Terminer")}</Btn>}
    >
      <div className="space-y-4">
        <p className="text-xs leading-snug text-slate-500">
          {subtitle || t("Visez l'étiquette du produit : chaque lecture l'ajoute automatiquement.")}
        </p>

        {/* ---- viseur ---- */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-[260px] w-full object-cover transition-opacity sm:h-[320px] ${ready ? "opacity-100" : "opacity-40"}`}
          />

          {/* fenêtre de visée */}
          {ready && !error && (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[38%] w-[78%] rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]">
                  <motion.div
                    className="absolute inset-x-2 h-0.5 rounded-full bg-accent-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]"
                    animate={{ top: ["8%", "88%", "8%"] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </div>
              <div className="absolute end-2 top-2 flex gap-1.5">
                {torchable && (
                  <button type="button" onClick={toggleTorch} title={t("Lampe")}
                    className="rounded-lg bg-black/45 p-2 text-white backdrop-blur cursor-pointer hover:bg-black/65">
                    {torch ? <ZapOff size={16} /> : <Zap size={16} />}
                  </button>
                )}
                <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                  title={t("Changer de caméra")}
                  className="rounded-lg bg-black/45 p-2 text-white backdrop-blur cursor-pointer hover:bg-black/65">
                  <SwitchCamera size={16} />
                </button>
              </div>
            </>
          )}

          {!ready && !error && !typing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Camera size={26} className="animate-pulse" />
              <p className="text-xs font-medium">{t("Ouverture de la caméra…")}</p>
            </div>
          )}

          {(error || typing) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/80">
              <CameraOff size={26} />
              <p className="text-xs font-medium leading-snug">
                {typing ? t("Caméra en pause — saisie manuelle") : error}
              </p>
            </div>
          )}
        </div>

        {/* ---- saisie manuelle : douchette USB, ou caméra indisponible ---- */}
        <form onSubmit={submitManual} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label flex items-center gap-1.5">
              <Keyboard size={12} /> {t("Saisir ou scanner avec une douchette")}
            </label>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              inputMode="numeric"
              placeholder="6 1 3 0 0 4 5 0 0 0 1 2 3"
            />
          </div>
          <Btn type="submit" icon={ScanLine} disabled={!manual.trim()}>{t("Ajouter")}</Btn>
        </form>

        {/* ---- journal des lectures ---- */}
        <AnimatePresence initial={false}>
          {feed.map((row) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-start gap-2 overflow-hidden rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                row.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {row.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              <span className="leading-snug">
                <span className="font-mono">{row.code}</span>
                {row.message ? ` — ${row.message}` : ""}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

/** Bouton prêt à poser à côté d'un champ de recherche produit. */
export function ScanButton({ onClick, label, className = "" }) {
  const { t } = useApp();
  return (
    <Btn variant="soft" icon={ScanLine} onClick={onClick} className={className}>
      {label || t("Scanner")}
    </Btn>
  );
}
