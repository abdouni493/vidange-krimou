import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, animate } from "framer-motion";
import { X, Search, AlertTriangle, Inbox, LayoutGrid, Table2, ChevronDown } from "lucide-react";
import { useApp } from "../context";
import { fmtMoney } from "../store";
import { ean13Svg, DEFAULT_LABEL_OPTS } from "../barcode";

// ===== Animated number (count-up) =====
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString("fr-FR") }) {
  const reduce = useReducedMotion();
  const [txt, setTxt] = useState(() => format(reduce ? value : 0));
  useEffect(() => {
    if (reduce) { setTxt(format(value)); return; }
    const controls = animate(0, Number(value) || 0, {
      duration: 0.9, ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setTxt(format(v)),
    });
    return () => controls.stop();
  }, [value]);
  return <span>{txt}</span>;
}

// ===== Buttons =====
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400";
const variants = {
  primary: "text-white grad-primary shadow-lift hover:brightness-110 shine",
  accent: "text-white grad-accent shadow-lift hover:brightness-110 shine",
  soft: "bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200/70",
  ghost: "text-slate-600 hover:bg-primary-50 hover:text-primary-700",
  danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200/70",
  outline: "border border-primary-300 text-primary-700 hover:bg-primary-50",
};

// `type` defaults to "button": a bare <button> submits its form, which inside a
// wizard would fire the final action instead of the step it was clicked on.
export function Btn({ variant = "primary", icon: Icon, children, className = "", type = "button", ...props }) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      className={`${btnBase} ${variants[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} />}
      {children}
    </motion.button>
  );
}

export function IconBtn({ icon: Icon, title, variant = "ghost", className = "", type = "button", ...props }) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.08 }}
      title={title}
      aria-label={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer transition-colors ${variants[variant]} !p-0 ${className}`}
      {...props}
    >
      <Icon size={16} strokeWidth={2} />
    </motion.button>
  );
}

// ===== Modal =====
// `zIndex` lets a nested dialog (the barcode scanner opened from a wizard)
// stack above the dialog that launched it.
export function Modal({ open, onClose, title, children, width = "max-w-2xl", footer, zIndex = 100 }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-primary-950/40 p-4 backdrop-blur-sm sm:p-8"
          style={{ backgroundColor: "rgba(30,20,60,0.45)", zIndex }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog" aria-modal="true"
            className={`card w-full ${width} my-auto overflow-hidden`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <div className="flex items-center justify-between border-b border-primary-100/70 bg-gradient-to-r from-primary-50/80 to-white px-6 py-4">
              <h3 className="text-base font-bold text-primary-900">{title}</h3>
              <IconBtn icon={X} title="Fermer" onClick={onClose} />
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-primary-100/70 bg-primary-50/40 px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel }) {
  const { t } = useApp();
  return (
    <Modal open={open} onClose={onClose} title={title || t("Êtes-vous sûr ?")} width="max-w-md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn>
          <Btn variant="danger" onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel || t("Oui, supprimer")}
          </Btn>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-red-50 p-2.5 text-red-500"><AlertTriangle size={22} /></div>
        <p className="pt-1.5 text-sm text-slate-600">{message || t("Cette action est irréversible.")}</p>
      </div>
    </Modal>
  );
}

// ===== Form =====
export function Field({ label, required, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className="label">
        {label} {required && <span className="text-accent-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Textarea = (props) => <textarea className="input min-h-[84px]" {...props} />;
export function Select({ children, ...props }) {
  return (
    <div className="relative">
      <select className="input appearance-none pe-9 cursor-pointer" {...props}>{children}</select>
      <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, ...rest }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className="input ps-10" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} {...rest} />
    </div>
  );
}

// ===== Display =====
const badgeColors = {
  violet: "bg-primary-100 text-primary-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-accent-100 text-accent-700",
  red: "bg-red-100 text-red-600",
  blue: "bg-sky-100 text-sky-700",
  gray: "bg-slate-100 text-slate-600",
};
export function Badge({ color = "violet", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColors[color]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const { t } = useApp();
  const map = {
    pending: { color: "orange", label: "En attente" },
    finalized: { color: "green", label: "Finalisé" },
    canceled: { color: "red", label: "Annulé" },
  };
  const m = map[status] || map.pending;
  return <Badge color={m.color}>{t(m.label)}</Badge>;
}

export function Empty({ text }) {
  const { t } = useApp();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-2xl bg-primary-50 p-4 text-primary-300"><Inbox size={32} /></div>
      <p className="text-sm text-slate-400">{text || t("Aucune donnée")}</p>
    </motion.div>
  );
}

// ===== Page header =====
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <motion.h1 initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
          className="grad-text text-2xl font-bold">{title}</motion.h1>
        {subtitle && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
            className="mt-1 text-sm text-slate-500">{subtitle}</motion.p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

// ===== Wizard steps =====
export function Steps({ labels, current }) {
  return (
    <div className="mb-6 flex items-center gap-1.5">
      {labels.map((l, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i === 0 ? "opacity-0" : i <= current ? "grad-primary" : "bg-primary-100"}`} />
            <motion.div
              animate={{ scale: i === current ? 1.15 : 1 }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                i < current ? "grad-primary text-white" : i === current ? "grad-accent text-white shadow-lift" : "bg-primary-100 text-primary-400"
              }`}
            >
              {i + 1}
            </motion.div>
            <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i === labels.length - 1 ? "opacity-0" : i < current ? "grad-primary" : "bg-primary-100"}`} />
          </div>
          <span className={`text-center text-[11px] font-medium leading-tight ${i === current ? "text-primary-800" : "text-slate-400"}`}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Body of one wizard step.
 *
 * The keyed remount replays the entrance animation on every step change, and
 * there is deliberately no exit animation: an `AnimatePresence mode="wait"`
 * around wizard steps can freeze mid-transition and leave the step blank, which
 * looks like "the wizard refuses to advance" (same fix as the page shell).
 */
export function StepPane({ step, children }) {
  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ===== Segmented filter =====
export function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-primary-50 p-1 border border-primary-100">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            value === o.value ? "text-white" : "text-slate-500 hover:text-primary-700"
          }`}
        >
          {value === o.value && (
            <motion.span layoutId={undefined} className="absolute inset-0 rounded-lg grad-primary"
              initial={false} transition={{ type: "spring", stiffness: 400, damping: 32 }} />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ViewToggle({ view, onChange }) {
  const { t } = useApp();
  return (
    <Seg
      value={view}
      onChange={onChange}
      options={[
        { value: "cards", label: t("Cartes") },
        { value: "table", label: t("Tableau") },
      ]}
    />
  );
}

// ===== Stagger list container =====
export const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};
export const itemRise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

export function CardGrid({ children, cols = "sm:grid-cols-2 xl:grid-cols-3" }) {
  return (
    <motion.div variants={listStagger} initial="hidden" animate="show"
      className={`grid grid-cols-1 gap-4 ${cols}`}>
      {children}
    </motion.div>
  );
}

// ===== Info row (view modals) =====
export function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-primary-50 py-2 last:border-0">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-end text-[13px] font-semibold text-primary-900">{value ?? "—"}</span>
    </div>
  );
}

// ===== Barcode label — the on-screen twin of what `printLabels` puts on paper =====
export function BarcodeLabel({ entry, opts = DEFAULT_LABEL_OPTS }) {
  const { db } = useApp();
  const svg = useMemo(
    () => ean13Svg(entry.code, { height: opts.showCode ? 46 : 40, showText: opts.showCode }),
    [entry.code, opts.showCode]
  );
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-lg bg-white px-3 py-2.5 ${
      opts.cutLines ? "border border-dashed border-primary-200" : "border border-transparent"
    }`}>
      {opts.showStore && db.settings.name && (
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{db.settings.name}</p>
      )}
      {opts.showName && (
        <p className="line-clamp-2 text-center text-[11px] font-bold leading-tight text-primary-900">
          {entry.name || "—"}
        </p>
      )}
      <div className="w-full max-w-[210px]" dangerouslySetInnerHTML={{ __html: svg }} />
      {opts.showPrice && Number(entry.price) > 0 && (
        <p className="font-mono text-xs font-extrabold text-primary-900">{fmtMoney(entry.price)}</p>
      )}
    </div>
  );
}

// ===== Money summary line =====
export function MoneyLine({ label, value, color = "text-primary-900", big }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${big ? "text-sm font-semibold" : "text-[13px]"} text-slate-500`}>{label}</span>
      <span className={`font-mono ${big ? "text-lg font-bold" : "text-sm font-semibold"} ${color}`}>{value}</span>
    </div>
  );
}
