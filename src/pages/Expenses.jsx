import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox,
  Empty, PageHeader, CardGrid, itemRise, Badge,
} from "../components/ui";

export function ExpenseForm({ editing, onClose }) {
  const { db, update, t } = useApp();
  const [form, setForm] = useState(editing || { name: "", description: "", categoryId: "", amount: "", date: todayISO() });
  const [newCat, setNewCat] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addCategory = () => {
    if (!newCat?.trim()) return;
    const c = { id: uid(), name: newCat.trim() };
    update((d) => d.expenseCategories.push(c));
    setForm((f) => ({ ...f, categoryId: c.id }));
    setNewCat(null);
  };

  const save = () => {
    if (!form.name.trim()) return;
    update((d) => {
      if (editing) {
        const i = d.expenses.findIndex((e) => e.id === editing.id);
        d.expenses[i] = { ...editing, ...form, amount: Number(form.amount) || 0 };
      } else {
        d.expenses.unshift({ id: uid(), ...form, name: form.name.trim(), amount: Number(form.amount) || 0 });
      }
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouvelle dépense")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <Field label={t("Nom de la dépense")} required>
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label={t("Catégorie")}>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={form.categoryId} onChange={set("categoryId")}>
                <option value="">{t("Choisir...")}</option>
                {db.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <Btn variant="soft" icon={Plus} type="button" onClick={() => setNewCat(newCat === null ? "" : null)}>{t("Nouvelle catégorie")}</Btn>
          </div>
          {newCat !== null && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 flex gap-2">
              <Input placeholder={t("Nom de la catégorie")} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Btn type="button" onClick={addCategory}>{t("Ajouter")}</Btn>
            </motion.div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Montant")} required>
            <Input type="number" min="0" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label={t("Date")} required>
            <Input type="date" value={form.date} onChange={set("date")} />
          </Field>
        </div>
        <Field label={t("Description")}>
          <Textarea value={form.description} onChange={set("description")} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Expenses() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = db.expenses.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const catName = (id) => db.expenseCategories.find((c) => c.id === id)?.name;

  return (
    <div>
      <PageHeader title={t("Dépenses")} subtitle={t("Gérez les dépenses de votre garage")}
        actions={can("expenses", "create") && <Btn icon={Plus} onClick={() => setModal("new")}>{t("Nouvelle dépense")}</Btn>} />

      <div className="mb-5 w-full sm:w-72">
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher...")} />
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucune dépense")} />
      ) : (
        <CardGrid>
          {list.map((e) => (
            <motion.div key={e.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="rounded-xl grad-accent p-2.5 text-white shadow-lift"><Receipt size={16} /></div>
                <span className="font-mono text-base font-bold text-accent-600">-{fmtMoney(e.amount)}</span>
              </div>
              <h3 className="text-sm font-bold text-primary-900">{e.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{e.description || "—"}</p>
              <div className="mt-3 flex items-center justify-between">
                {catName(e.categoryId) ? <Badge>{catName(e.categoryId)}</Badge> : <span />}
                <span className="text-xs text-slate-400">{fmtDate(e.date, lang)}</span>
              </div>
              <div className="mt-3 flex gap-1 border-t border-primary-50 pt-3">
                {can("expenses", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: e })} />}
                {can("expenses", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(e)} />}
              </div>
            </motion.div>
          ))}
        </CardGrid>
      )}

      {modal && <ExpenseForm editing={modal.editing} onClose={() => setModal(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.expenses = d.expenses.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
