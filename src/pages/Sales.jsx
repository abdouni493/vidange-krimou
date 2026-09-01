import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, Pencil, Trash2, Wallet, Printer, Receipt, User, Phone, Plus, Minus, X,
} from "lucide-react";
import { useApp } from "../context";
import {
  uid, todayISO, fmtMoney, fmtDate, paidOf, presetRange, inRange,
  saleAmounts, applySaleToStock, clientNameOf,
  printHTML, esc, docHead, docStamp,
} from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Select, SearchBox, Empty,
  PageHeader, CardGrid, itemRise, ViewToggle, Badge, InfoRow, MoneyLine, Seg,
} from "../components/ui";

// ===== Printable receipt (also used right after cashing in from the POS) =====
export function printSale(sale, db, t, lang = "fr") {
  const s = db.settings || {};
  const client = db.clients.find((c) => c.id === sale.clientId);
  const { subtotal, discount, total, paid, rest } = saleAmounts(sale);
  const title = t("FACTURE DE VENTE");
  const qty = (sale.items || []).reduce((n, it) => n + (Number(it.qty) || 0), 0);

  const rows = (sale.items || []).map((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    const name = p?.name || it.name || "?";
    return `<tr>
      <td><b>${esc(name)}</b>${p?.brand ? `<div class="dim">${esc(p.brand)}</div>` : ""}</td>
      <td>${esc(p?.barcode || "—")}</td>
      <td class="num">${Number(it.qty) || 0}</td>
      <td class="num">${fmtMoney(it.price)}</td>
      <td class="num">${fmtMoney((Number(it.price) || 0) * (Number(it.qty) || 0))}</td>
    </tr>`;
  }).join("");

  const payRows = (sale.payments || [])
    .map((p) => `<tr><td>${fmtDate(p.date, lang)}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`)
    .join("");

  printHTML(`${title} ${sale.ref}`, `
    ${docHead(s, title, sale.ref, t)}

    <div class="doc-meta">
      <div><span>${t("Référence")}:</span> <b>${esc(sale.ref)}</b></div>
      <div><span>${t("Date")}:</span> <b>${fmtDate(sale.date, lang)}</b></div>
      <div><span>${t("Articles")}:</span> <b>${(sale.items || []).length}</b></div>
      <div><span>${t("Quantité totale")}:</span> <b>${qty}</b></div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>${t("Client")}</h3>
        <div class="kv"><span>${t("Nom")}</span><b>${esc(client?.name || t("Client de passage"))}</b></div>
        <div class="kv"><span>${t("Téléphone")}</span><b>${esc(client?.phone || "—")}</b></div>
      </div>
      <div class="box">
        <h3>${t("Détails de la vente")}</h3>
        <div class="kv"><span>${t("Références")}</span><b>${(sale.items || []).length}</b></div>
        <div class="kv"><span>${t("Paiements")}</span><b>${(sale.payments || []).length}</b></div>
      </div>
    </div>

    <h2>${t("Produits vendus")}</h2>
    <table class="doc-table">
      <thead>
        <tr>
          <th>${t("Nom du produit")}</th><th>${t("Code-barres")}</th>
          <th class="num">${t("Qté")}</th><th class="num">${t("Prix unitaire")}</th><th class="num">${t("Total")}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" class="dim">${t("Aucun produit")}</td></tr>`}</tbody>
    </table>

    <div class="totals-wrap">
      <div>${docStamp(total, paid, t)}</div>
      <div class="totals">
        <div class="row"><span>${t("Sous-total")}</span><b>${fmtMoney(subtotal)}</b></div>
        ${discount > 0 ? `<div class="row"><span>${t("Réduction")}</span><b>- ${fmtMoney(discount)}</b></div>` : ""}
        <div class="row grand"><span>${t("Total à payer")}</span><b>${fmtMoney(total)}</b></div>
        <div class="row"><span>${t("Payé")}</span><b>${fmtMoney(paid)}</b></div>
        <div class="row due"><span>${t("Reste")}</span><b>${fmtMoney(rest)}</b></div>
      </div>
    </div>

    ${payRows ? `
      <h2>${t("Historique des paiements")}</h2>
      <table class="doc-table">
        <thead><tr><th>${t("Date")}</th><th class="num">${t("Montant")}</th></tr></thead>
        <tbody>${payRows}</tbody>
      </table>` : ""}

    <div class="sig">
      <div>${t("Signature du magasin")}</div>
      <div>${t("Signature du client")}</div>
    </div>

    <div class="foot">
      ${esc(s.name || "")}${s.phone ? ` · ${esc(s.phone)}` : ""}${s.email ? ` · ${esc(s.email)}` : ""}
    </div>
  `, lang === "ar" ? "rtl" : "ltr");
}

// ===== Details =====
function ViewModal({ sale, onClose }) {
  const { db, t, lang } = useApp();
  const client = db.clients.find((c) => c.id === sale.clientId);
  const { subtotal, discount, total, paid, rest } = saleAmounts(sale);
  return (
    <Modal open onClose={onClose} title={`${t("Vente")} ${sale.ref}`} width="max-w-xl"
      footer={<Btn icon={Printer} onClick={() => printSale(sale, db, t, lang)}>{t("Imprimer")}</Btn>}>
      <InfoRow label={t("Référence")} value={sale.ref} />
      <InfoRow label={t("Client")}
        value={client ? `${client.name}${client.phone ? ` · ${client.phone}` : ""}` : t("Client de passage")} />
      <InfoRow label={t("Date")} value={fmtDate(sale.date, lang)} />
      <div className="mt-4 rounded-xl border border-primary-100 bg-surface p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-400">{t("Produits vendus")}</p>
        {(sale.items || []).map((it, i) => (
          <MoneyLine key={i}
            label={`${db.products.find((p) => p.id === it.productId)?.name || it.name || "?"} × ${it.qty} @ ${fmtMoney(it.price)}`}
            value={fmtMoney((Number(it.price) || 0) * (Number(it.qty) || 0))} />
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl bg-primary-50 p-4">
        <MoneyLine label={t("Sous-total")} value={fmtMoney(subtotal)} />
        {discount > 0 && <MoneyLine label={t("Réduction")} value={`- ${fmtMoney(discount)}`} color="text-accent-600" />}
        <MoneyLine label={t("Total à payer")} value={fmtMoney(total)} big />
        <MoneyLine label={t("Payé")} value={fmtMoney(paid)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
      </div>
      {(sale.payments || []).length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {sale.payments.map((p) => <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />)}
        </div>
      )}
    </Modal>
  );
}

// ===== Pay off the remaining balance =====
function PayModal({ sale, onClose }) {
  const { update, t, lang } = useApp();
  const { total, paid: already, rest } = saleAmounts(sale);
  const [amount, setAmount] = useState(rest);
  const capped = Math.min(rest, Math.max(0, Number(amount) || 0));
  const newRest = Math.max(0, rest - capped);

  const save = () => {
    if (capped <= 0) { onClose(); return; }
    update((d) => {
      const s = d.sales.find((x) => x.id === sale.id);
      if (s) (s.payments ||= []).push({ id: uid(), amount: capped, date: todayISO() });
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t("Payer dette")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer le paiement")}</Btn></>}>
      <div className="space-y-2.5">
        <MoneyLine label={t("Total")} value={fmtMoney(total)} />
        <MoneyLine label={t("Déjà payé")} value={fmtMoney(already)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color="text-red-500" />
      </div>
      <Field label={t("Payer maintenant")} className="mt-4">
        <Input type="number" min="0" max={rest} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="mt-3 rounded-xl bg-primary-50 p-3">
        <MoneyLine label={t("Reste")} value={fmtMoney(newRest)}
          color={newRest > 0 ? "text-red-500" : "text-emerald-600"} big />
      </div>
      {(sale.payments || []).length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {sale.payments.map((p) => <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />)}
        </div>
      )}
    </Modal>
  );
}

// ===== Edit an existing sale (quantities, prices, discount, client) =====
function EditModal({ sale, onClose }) {
  const { db, update, t } = useApp();
  const [items, setItems] = useState(() => (sale.items || []).map((i) => ({ ...i })));
  const [clientId, setClientId] = useState(sale.clientId || "");
  const [date, setDate] = useState(sale.date || todayISO());
  const [discountOn, setDiscountOn] = useState(!!sale.discount?.enabled);
  const [discount, setDiscount] = useState(sale.discount?.amount || "");
  const [err, setErr] = useState("");

  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  const discountValue = discountOn ? Math.min(subtotal, Math.max(0, Number(discount) || 0)) : 0;
  const total = Math.max(0, subtotal - discountValue);
  const paid = paidOf(sale.payments);
  const rest = Math.max(0, total - paid);

  // What is on the shelf right now, plus what this sale already took out of it.
  const maxFor = (it) => {
    const p = db.products.find((x) => x.id === it.productId);
    const original = (sale.items || []).find((x) => x.productId === it.productId);
    return (Number(p?.qtyCurrent) || 0) + (Number(original?.qty) || 0);
  };

  const setItem = (id, patch) =>
    setItems((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));

  const save = () => {
    if (!items.length) { setErr(t("Ajoutez au moins un produit")); return; }
    if (rest > 0 && !clientId) { setErr(t("Une vente avec reste à payer doit être rattachée à un client.")); return; }
    update((d) => {
      const s = d.sales.find((x) => x.id === sale.id);
      if (!s) return;
      applySaleToStock(d, s, 1);       // put the old quantities back
      s.items = items;
      s.clientId = clientId;
      s.date = date;
      s.subtotal = subtotal;
      s.discount = { enabled: discountOn, amount: discountValue };
      s.total = total;
      applySaleToStock(d, s, -1);      // take the new ones out
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${t("Modifier")} — ${sale.ref}`} width="max-w-2xl"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("Client")}>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{t("Client de passage")}</option>
              {db.clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
            </Select>
          </Field>
          <Field label={t("Date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          {items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            const max = maxFor(it);
            return (
              <div key={it.productId} className="rounded-xl border border-primary-100 bg-white p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-primary-900">{p?.name || it.name}</p>
                    <p className="text-[11px] text-slate-400">{t("Disponible")} : {max}</p>
                  </div>
                  <IconBtn icon={X} title={t("Retirer")} variant="danger"
                    onClick={() => setItems(items.filter((x) => x.productId !== it.productId))} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <IconBtn icon={Minus} title="-"
                      onClick={() => setItem(it.productId, { qty: Math.max(1, (Number(it.qty) || 1) - 1) })} />
                    <span className="w-10 text-center font-mono text-sm font-bold">{it.qty}</span>
                    <IconBtn icon={Plus} title="+"
                      onClick={() => setItem(it.productId, { qty: Math.min(max, (Number(it.qty) || 0) + 1) })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" value={it.price}
                      onChange={(e) => setItem(it.productId, { price: Math.max(0, Number(e.target.value) || 0) })}
                      className="input h-9 w-28 px-2 py-1 text-end font-mono text-sm" />
                    <span className="w-28 text-end font-mono text-[13px] font-extrabold text-primary-900">
                      {fmtMoney((Number(it.price) || 0) * (Number(it.qty) || 0))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="py-4 text-center text-xs text-slate-400">{t("Aucun produit")}</p>}
        </div>

        <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
          <MoneyLine label={t("Sous-total")} value={fmtMoney(subtotal)} />
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={discountOn}
              onChange={(e) => setDiscountOn(e.target.checked)} />
            <span className="text-[13px] font-semibold text-primary-900">{t("Appliquer une réduction")}</span>
          </label>
          {discountOn && (
            <Input type="number" min="0" max={subtotal} value={discount}
              onChange={(e) => setDiscount(e.target.value)} />
          )}
          <MoneyLine label={t("Total à payer")} value={fmtMoney(total)} big />
          <MoneyLine label={t("Payé")} value={fmtMoney(paid)} color="text-emerald-600" />
          <MoneyLine label={t("Reste")} value={fmtMoney(rest)}
            color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
        </div>

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

// ===== Page =====
export default function Sales() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState("all");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("cards");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = useMemo(() => {
    const range = preset === "period" ? period : presetRange(preset);
    const needle = q.trim().toLowerCase();
    return (db.sales || []).filter((s) => {
      if (preset !== "all" && !inRange(s.date, range.from, range.to)) return false;
      if (status !== "all") {
        const { rest } = saleAmounts(s);
        if (status === "paid" && rest > 0) return false;
        if (status === "debt" && rest <= 0) return false;
      }
      if (needle) {
        const c = db.clients.find((x) => x.id === s.clientId);
        const hay = [
          s.ref, c?.name || "", (c?.phone || "").replace(/\s/g, ""),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle.replace(/\s/g, ""))) return false;
      }
      return true;
    });
  }, [db.sales, db.clients, q, preset, period, status]);

  const totals = useMemo(() => list.reduce((acc, s) => {
    const { total, paid, rest } = saleAmounts(s);
    return { total: acc.total + total, paid: acc.paid + paid, rest: acc.rest + rest };
  }, { total: 0, paid: 0, rest: 0 }), [list]);

  const remove = (sale) =>
    update((d) => {
      const s = d.sales.find((x) => x.id === sale.id);
      if (s) applySaleToStock(d, s, 1); // a cancelled sale returns to the shelf
      d.sales = d.sales.filter((x) => x.id !== sale.id);
    });

  const actions = (s, rest) => (
    <div className="flex flex-wrap gap-1">
      <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(s)} />
      {can("sales", "print") && <IconBtn icon={Printer} title={t("Imprimer")} onClick={() => printSale(s, db, t, lang)} />}
      {can("sales", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setEditing(s)} />}
      {can("sales", "pay") && rest > 0 && (
        <IconBtn icon={Wallet} title={t("Payer dette")} variant="soft" onClick={() => setPaying(s)} />
      )}
      {can("sales", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(s)} />}
    </div>
  );

  return (
    <div>
      <PageHeader title={t("Ventes")} subtitle={t("Toutes vos factures de vente et leurs règlements")} />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          [t("Total des ventes"), totals.total, "grad-primary"],
          [t("Encaissé"), totals.paid, "bg-gradient-to-br from-emerald-500 to-teal-600"],
          [t("Dettes clients"), totals.rest, "bg-gradient-to-br from-rose-500 to-red-600"],
        ].map(([label, value, grad], i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className={`rounded-2xl ${grad} p-5 text-white shadow-lift`}>
            <p className="text-xs opacity-75">{label}</p>
            <p className="font-mono text-xl font-bold">{fmtMoney(value)}</p>
          </motion.div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher client (nom ou téléphone)...")} />
        </div>
        <Seg value={status} onChange={setStatus} options={[
          { value: "all", label: t("Tous") },
          { value: "paid", label: t("Payé") },
          { value: "debt", label: t("Dette") },
        ]} />
        <Seg value={preset} onChange={setPreset} options={[
          { value: "all", label: t("Tous") },
          { value: "today", label: t("Aujourd'hui") },
          { value: "week", label: t("7 derniers jours") },
          { value: "month", label: t("30 derniers jours") },
          { value: "period", label: t("Période") },
        ]} />
        <AnimatePresence>
          {preset === "period" && (
            <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }} className="flex items-center gap-2 overflow-hidden">
              <Input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="input w-40" />
              <span className="text-xs text-slate-400">→</span>
              <Input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="input w-40" />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="ms-auto"><ViewToggle view={view} onChange={setView} /></div>
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucune vente pour le moment")} />
      ) : view === "cards" ? (
        <CardGrid>
          {list.map((s) => {
            const { total, discount, paid, rest } = saleAmounts(s);
            const client = db.clients.find((c) => c.id === s.clientId);
            return (
              <motion.div key={s.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-xl grad-primary p-2.5 text-white shadow-lift"><Receipt size={16} /></div>
                    <div>
                      <p className="font-mono text-sm font-bold text-primary-900">{s.ref}</p>
                      <p className="text-[11px] text-slate-400">{fmtDate(s.date, lang)}</p>
                    </div>
                  </div>
                  {rest > 0 ? <Badge color="red">{t("Reste")} {fmtMoney(rest)}</Badge> : <Badge color="green">{t("Payé")}</Badge>}
                </div>
                <div className="mb-1 flex items-center gap-2 text-[13px] text-slate-600">
                  <User size={13} className="text-primary-400" /> {client?.name || t("Client de passage")}
                </div>
                {client?.phone && (
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400"><Phone size={11} /> {client.phone}</p>
                )}
                <p className="mb-3 text-xs text-slate-400">
                  {(s.items || []).length} {t("produit(s)")}
                  {discount > 0 && <> · <span className="text-accent-600">-{fmtMoney(discount)}</span></>}
                </p>
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-primary-50/70 p-2.5 text-center">
                  <div><p className="text-[10px] text-slate-400">{t("Total")}</p><p className="font-mono text-[13px] font-bold text-primary-900">{fmtMoney(total)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Payé")}</p><p className="font-mono text-[13px] font-bold text-emerald-600">{fmtMoney(paid)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Reste")}</p><p className={`font-mono text-[13px] font-bold ${rest > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmtMoney(rest)}</p></div>
                </div>
                <div className="mt-auto border-t border-primary-50 pt-3">{actions(s, rest)}</div>
              </motion.div>
            );
          })}
        </CardGrid>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="thead bg-primary-50/60">
              <tr>
                <th>{t("Référence")}</th><th>{t("Client")}</th><th>{t("Date")}</th>
                <th>{t("Articles")}</th><th>{t("Total")}</th><th>{t("Payé")}</th><th>{t("Reste")}</th><th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const { total, paid, rest } = saleAmounts(s);
                return (
                  <tr key={s.id} className="trow transition-colors hover:bg-primary-50/40">
                    <td className="font-mono font-bold text-primary-900">{s.ref}</td>
                    <td>{clientNameOf(db, s.clientId, t)}</td>
                    <td className="text-slate-400">{fmtDate(s.date, lang)}</td>
                    <td className="font-mono">{(s.items || []).length}</td>
                    <td className="font-mono">{fmtMoney(total)}</td>
                    <td className="font-mono text-emerald-600">{fmtMoney(paid)}</td>
                    <td className={`font-mono ${rest > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmtMoney(rest)}</td>
                    <td>{actions(s, rest)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {viewing && <ViewModal sale={viewing} onClose={() => setViewing(null)} />}
      {editing && <EditModal sale={editing} onClose={() => setEditing(null)} />}
      {paying && <PayModal sale={paying} onClose={() => setPaying(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => remove(deleting)}
        message={t("La vente sera supprimée et les quantités retournées au stock.")} />
    </div>
  );
}
