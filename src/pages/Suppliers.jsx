import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, ShoppingCart, Phone, MapPin, Truck } from "lucide-react";
import { useApp } from "../context";
import { uid, fmtMoney, fmtDate, paidOf } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, SearchBox, Empty, PageHeader, CardGrid,
  itemRise, Badge, MoneyLine,
} from "../components/ui";
import { SupplierFormFields } from "./Purchases";

function SupplierForm({ editing, onClose }) {
  const { update, t } = useApp();
  const [form, setForm] = useState(editing || { name: "", phone: "", address: "" });
  const save = () => {
    if (!form.name.trim()) return;
    update((d) => {
      if (editing) {
        const i = d.suppliers.findIndex((s) => s.id === editing.id);
        d.suppliers[i] = { ...editing, ...form };
      } else {
        d.suppliers.push({ id: uid(), ...form, name: form.name.trim() });
      }
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouveau fournisseur")} width="max-w-lg"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <SupplierFormFields form={form} setForm={setForm} t={t} />
    </Modal>
  );
}

function PurchasesModal({ supplier, onClose }) {
  const { db, t, lang } = useApp();
  const purchases = db.purchases.filter((a) => a.supplierId === supplier.id);
  const total = purchases.reduce((s, a) => s + Number(a.total), 0);
  const paid = purchases.reduce((s, a) => s + paidOf(a.payments), 0);
  return (
    <Modal open onClose={onClose} title={`${t("Historique des achats")} — ${supplier.name}`} width="max-w-2xl">
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          [t("Total des achats"), fmtMoney(total), "grad-primary"],
          [t("Total payé"), fmtMoney(paid), "bg-gradient-to-br from-emerald-500 to-teal-600"],
          [t("Total restant"), fmtMoney(total - paid), "bg-gradient-to-br from-rose-500 to-red-600"],
        ].map(([label, value, grad], i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className={`rounded-xl ${grad} p-3.5 text-white shadow-lift`}>
            <p className="text-[11px] opacity-75">{label}</p>
            <p className="font-mono text-[15px] font-bold">{value}</p>
          </motion.div>
        ))}
      </div>
      <div className="space-y-2.5">
        {purchases.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("Aucun achat")}</p>}
        {purchases.map((a) => {
          const rest = Math.max(0, a.total - paidOf(a.payments));
          return (
            <div key={a.id} className="rounded-xl border border-primary-100 bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-primary-900">{a.ref}</span>
                <span className="text-xs text-slate-400">{fmtDate(a.date, lang)}</span>
              </div>
              <div className="mb-2 space-y-1">
                {a.items.map((it) => {
                  const p = db.products.find((x) => x.id === it.productId);
                  return p && <MoneyLine key={it.productId} label={`${p.name} × ${it.qty}`} value={fmtMoney(it.price * it.qty)} />;
                })}
              </div>
              <div className="space-y-1 border-t border-primary-100 pt-2">
                <MoneyLine label={t("Total")} value={fmtMoney(a.total)} />
                <MoneyLine label={t("Payé")} value={fmtMoney(paidOf(a.payments))} color="text-emerald-600" />
                <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default function Suppliers() {
  const { db, update, t, can } = useApp();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [history, setHistory] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = db.suppliers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title={t("Fournisseurs")} subtitle={t("Gérez vos fournisseurs et leurs achats")}
        actions={can("suppliers", "create") && <Btn icon={Plus} onClick={() => setModal("new")}>{t("Nouveau fournisseur")}</Btn>} />

      <div className="mb-5 w-full sm:w-72">
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher...")} />
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun fournisseur")} />
      ) : (
        <CardGrid>
          {list.map((s) => {
            const purchases = db.purchases.filter((a) => a.supplierId === s.id);
            const debt = purchases.reduce((sum, a) => sum + Math.max(0, a.total - paidOf(a.payments)), 0);
            return (
              <motion.div key={s.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="rounded-xl grad-primary p-2.5 text-white shadow-lift"><Truck size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-primary-900">{s.name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400"><Phone size={11} /> {s.phone || "—"}</p>
                  </div>
                  {debt > 0 && <Badge color="red">-{fmtMoney(debt)}</Badge>}
                </div>
                <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin size={12} className="shrink-0 text-primary-300" /> {s.address || "—"}
                </p>
                <p className="mb-3 text-xs text-slate-400">{purchases.length} {t("Achats").toLowerCase()}</p>
                <div className="flex gap-1 border-t border-primary-50 pt-3">
                  {can("suppliers", "history") && <IconBtn icon={ShoppingCart} title={t("Historique des achats")} variant="soft" onClick={() => setHistory(s)} />}
                  {can("suppliers", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: s })} />}
                  {can("suppliers", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(s)} />}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      )}

      {modal && <SupplierForm editing={modal.editing} onClose={() => setModal(null)} />}
      {history && <PurchasesModal supplier={history} onClose={() => setHistory(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.suppliers = d.suppliers.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
