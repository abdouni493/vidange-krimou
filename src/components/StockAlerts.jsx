import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, PackageX, Printer, ChevronRight } from "lucide-react";
import { useApp } from "../context";
import { fmtDate, todayISO, dayOffset, esc, docHead, printHTML } from "../store";
import { Modal, Btn, Badge, Seg, Empty } from "./ui";

// How far ahead an expiry date counts as "soon"
export const EXPIRY_WINDOW_DAYS = 30;

/**
 * Products needing attention. Both lists are derived from the live product
 * sheet, so a purchase that restocks a product (higher quantity, new expiry
 * date) clears its alert on its own.
 */
export function stockAlertsOf(db) {
  const today = todayISO();
  const limit = dayOffset(EXPIRY_WINDOW_DAYS);
  const lowStock = db.products
    .filter((p) => Number(p.qtyCurrent) <= Number(p.minQty))
    .sort((a, b) => Number(a.qtyCurrent) - Number(b.qtyCurrent));
  const expiring = db.products
    .filter((p) => p.trackExpiration && p.expiration && p.expiration <= limit && Number(p.qtyCurrent) > 0)
    .map((p) => ({ ...p, expired: p.expiration < today, daysLeft: Math.round((new Date(p.expiration) - new Date(today)) / 86400000) }))
    .sort((a, b) => a.expiration.localeCompare(b.expiration));
  return { lowStock, expiring };
}

function printAlerts(kind, rows, db, t, lang) {
  const low = kind === "low";
  const title = low ? t("Produits presque épuisés") : t("Produits bientôt expirés");
  const cat = (id) => db.categories.find((c) => c.id === id)?.name || "—";
  const body = rows.map((p) => `<tr>
      <td><b>${esc(p.name)}</b>${p.brand ? `<div class="dim">${esc(p.brand)}</div>` : ""}</td>
      <td>${esc(cat(p.categoryId))}</td>
      <td>${esc(p.barcode || "—")}</td>
      <td class="num">${Number(p.qtyCurrent) || 0}</td>
      ${low
        ? `<td class="num">${Number(p.minQty) || 0}</td>`
        : `<td>${fmtDate(p.expiration, lang)}</td><td class="num">${p.expired ? t("Expiré") : p.daysLeft}</td>`}
    </tr>`).join("");

  printHTML(title, `
    ${docHead(db.settings, title, fmtDate(todayISO(), lang), t)}
    <table class="doc-table">
      <thead><tr>
        <th>${t("Nom du produit")}</th><th>${t("Catégorie")}</th><th>${t("Code-barres")}</th>
        <th class="num">${t("Quantité actuelle")}</th>
        ${low
          ? `<th class="num">${t("Quantité minimale (alerte)")}</th>`
          : `<th>${t("Date d'expiration")}</th><th class="num">${t("Jours restants")}</th>`}
      </tr></thead>
      <tbody>${body || `<tr><td colspan="6" class="dim">${t("Aucun produit")}</td></tr>`}</tbody>
    </table>
  `, lang === "ar" ? "rtl" : "ltr");
}

function AlertsModal({ initial, alerts, onClose }) {
  const { db, t, lang } = useApp();
  const [kind, setKind] = useState(initial);
  const rows = kind === "low" ? alerts.lowStock : alerts.expiring;
  const cat = (id) => db.categories.find((c) => c.id === id)?.name || "—";

  return (
    <Modal open onClose={onClose} width="max-w-3xl"
      title={kind === "low" ? t("Produits presque épuisés") : t("Produits bientôt expirés")}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>{t("Fermer")}</Btn>
        <Btn icon={Printer} disabled={!rows.length} onClick={() => printAlerts(kind, rows, db, t, lang)}>{t("Imprimer")}</Btn>
      </>}>
      <div className="mb-4">
        <Seg value={kind} onChange={setKind} options={[
          { value: "low", label: `${t("Presque épuisés")} (${alerts.lowStock.length})` },
          { value: "exp", label: `${t("Bientôt expirés")} (${alerts.expiring.length})` },
        ]} />
      </div>
      {rows.length === 0 ? <Empty text={t("Aucune alerte")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="thead bg-primary-50/60">
              <tr>
                <th>{t("Nom")}</th><th>{t("Catégorie")}</th><th>{t("Quantité actuelle")}</th>
                {kind === "low" ? <th>{t("Quantité minimale (alerte)")}</th> : <><th>{t("Date d'expiration")}</th><th>{t("Jours restants")}</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="trow">
                  <td className="font-semibold text-primary-900">{p.name}<p className="text-[11px] font-normal text-slate-400">{p.brand || ""}</p></td>
                  <td>{cat(p.categoryId)}</td>
                  <td className={`font-mono font-bold ${kind === "low" ? "text-red-500" : ""}`}>{p.qtyCurrent}</td>
                  {kind === "low" ? <td className="font-mono">{p.minQty}</td> : <>
                    <td>{fmtDate(p.expiration, lang)}</td>
                    <td>{p.expired ? <Badge color="red">{t("Expiré")}</Badge> : <Badge color="orange">{p.daysLeft} {t("j")}</Badge>}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Clickable alert banners — shown on the dashboard and on the stock page. */
export default function StockAlerts() {
  const { db, t } = useApp();
  const alerts = useMemo(() => stockAlertsOf(db), [db]);
  const [open, setOpen] = useState(null);

  const cards = [
    alerts.lowStock.length > 0 && {
      kind: "low", icon: PackageX, cls: "border-red-200 bg-red-50 text-red-700",
      text: `${alerts.lowStock.length} ${t("produit(s) presque épuisé(s)")}`,
    },
    alerts.expiring.length > 0 && {
      kind: "exp", icon: CalendarClock, cls: "border-amber-200 bg-amber-50 text-amber-700",
      text: `${alerts.expiring.length} ${t("produit(s) expiré(s) ou bientôt expiré(s)")}`,
    },
  ].filter(Boolean);

  if (!cards.length) return null;
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
      {cards.map((c) => (
        <motion.button key={c.kind} type="button" onClick={() => setOpen(c.kind)}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-start ${c.cls}`}>
          <AlertTriangle size={18} className="shrink-0" />
          <c.icon size={16} className="shrink-0" />
          <span className="flex-1 text-[13px] font-semibold">{c.text}</span>
          <span className="text-[12px] font-medium">{t("Voir la liste")}</span>
          <ChevronRight size={15} className="rtl:rotate-180" />
        </motion.button>
      ))}
      {open && <AlertsModal initial={open} alerts={alerts} onClose={() => setOpen(null)} />}
    </div>
  );
}
