import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, History, Phone, User } from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate, paidOf, serviceNamesOf } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, SearchBox, Empty, PageHeader,
  CardGrid, itemRise, Badge, StatusBadge, MoneyLine,
} from "../components/ui";

function ClientForm({ editing, onClose }) {
  const { update, t } = useApp();
  const [form, setForm] = useState(editing || { name: "", phone: "" });
  const save = () => {
    if (!form.name.trim()) return;
    update((d) => {
      if (editing) {
        const i = d.clients.findIndex((c) => c.id === editing.id);
        d.clients[i] = { ...editing, ...form };
      } else {
        d.clients.push({ id: uid(), name: form.name.trim(), phone: form.phone, createdAt: todayISO() });
      }
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouveau client")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <Field label={t("Nom complet")} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t("Téléphone")} required>
          <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function HistoryModal({ client, onClose }) {
  const { db, t, lang } = useApp();
  const visits = db.repairs.filter((r) => r.clientId === client.id && r.status !== "canceled");
  const total = visits.reduce((s, r) => s + Number(r.total), 0);
  const paid = visits.reduce((s, r) => s + paidOf(r.payments), 0);
  return (
    <Modal open onClose={onClose} title={`${t("Historique du client")} — ${client.name}`} width="max-w-2xl">
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          [t("Total des visites"), fmtMoney(total), "grad-primary"],
          [t("Total payé"), fmtMoney(paid), "bg-gradient-to-br from-emerald-500 to-teal-600"],
          [t("Total restant"), fmtMoney(total - paid), "bg-gradient-to-br from-rose-500 to-red-600"],
        ].map(([label, value, grad], i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`rounded-xl ${grad} p-3.5 text-white shadow-lift`}>
            <p className="text-[11px] opacity-75">{label}</p>
            <p className="font-mono text-[15px] font-bold">{value}</p>
          </motion.div>
        ))}
      </div>
      <div className="space-y-2.5">
        {visits.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("Aucune visite")}</p>}
        {visits.map((r) => {
          const rest = Math.max(0, r.total - paidOf(r.payments));
          return (
            <div key={r.id} className="rounded-xl border border-primary-100 bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge color={r.type === "appointment" ? "blue" : "violet"}>
                    {t(r.type === "appointment" ? "Rendez-vous" : "Réparation")}
                  </Badge>
                  <StatusBadge status={r.status} />
                </div>
                <span className="text-xs text-slate-400">{fmtDate(r.dateIn, lang)}</span>
              </div>
              <p className="mb-2 text-[13px] text-slate-600">{serviceNamesOf(r, db).join(", ") || r.problem || "—"}</p>
              <div className="space-y-1">
                <MoneyLine label={t("Total")} value={fmtMoney(r.total)} />
                <MoneyLine label={t("Payé")} value={fmtMoney(paidOf(r.payments))} color="text-emerald-600" />
                <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [history, setHistory] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = db.clients.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
  );

  return (
    <div>
      <PageHeader title={t("Clients")} subtitle={t("Gérez vos clients et leur historique")}
        actions={can("clients", "create") && <Btn icon={Plus} onClick={() => setModal("new")}>{t("Nouveau client")}</Btn>} />

      <div className="mb-5 w-full sm:w-72">
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher client (nom ou téléphone)...")} />
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun client")} />
      ) : (
        <CardGrid cols="sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((c) => {
            const visits = db.repairs.filter((r) => r.clientId === c.id && r.status !== "canceled");
            const debt = visits.reduce((s, r) => s + Math.max(0, r.total - paidOf(r.payments)), 0);
            return (
              <motion.div key={c.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full grad-primary text-base font-bold text-white shadow-lift">
                    {c.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-primary-900">{c.name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400"><Phone size={11} /> {c.phone}</p>
                  </div>
                </div>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t("Client depuis")} {fmtDate(c.createdAt, lang)}</span>
                  {debt > 0 ? <Badge color="red">-{fmtMoney(debt)}</Badge> : <Badge color="green">{visits.length} ✓</Badge>}
                </div>
                <div className="flex gap-1 border-t border-primary-50 pt-3">
                  {can("clients", "history") && <IconBtn icon={History} title={t("Historique")} variant="soft" onClick={() => setHistory(c)} />}
                  {can("clients", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: c })} />}
                  {can("clients", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(c)} />}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      )}

      {modal && <ClientForm editing={modal.editing} onClose={() => setModal(null)} />}
      {history && <HistoryModal client={history} onClose={() => setHistory(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.clients = d.clients.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
