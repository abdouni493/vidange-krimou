import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { useApp } from "../context";
import { uid, fmtMoney } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, SearchBox,
  Empty, PageHeader, CardGrid, itemRise,
} from "../components/ui";

function ServiceForm({ editing, onClose }) {
  const { update, t } = useApp();
  const [form, setForm] = useState(editing || { name: "", description: "", price: "" });
  const save = () => {
    if (!form.name.trim()) return;
    update((d) => {
      if (editing) {
        const i = d.services.findIndex((s) => s.id === editing.id);
        d.services[i] = { ...editing, ...form, price: Number(form.price) || 0 };
      } else {
        d.services.push({ id: uid(), name: form.name.trim(), description: form.description, price: Number(form.price) || 0 });
      }
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouveau service")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <Field label={t("Nom du service")} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t("Description")}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label={t("Prix")} required>
          <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Services() {
  const { db, update, t, can } = useApp();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // {editing} | "new"
  const [deleting, setDeleting] = useState(null);

  const list = db.services.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title={t("Services")} subtitle={t("Gérez vos services et leurs tarifs")}
        actions={can("services", "create") && <Btn icon={Plus} onClick={() => setModal("new")}>{t("Nouveau service")}</Btn>} />

      <div className="mb-5 w-full sm:w-72">
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher...")} />
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun service pour le moment")} />
      ) : (
        <CardGrid>
          {list.map((s) => (
            <motion.div key={s.id} variants={itemRise} layout whileHover={{ y: -4 }}
              className="card flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="rounded-xl grad-primary p-2.5 text-white shadow-lift"><Sparkles size={17} /></div>
                <span className="rounded-xl bg-primary-50 px-3 py-1.5 font-mono text-sm font-bold text-primary-700">{fmtMoney(s.price)}</span>
              </div>
              <h3 className="text-[15px] font-bold text-primary-900">{s.name}</h3>
              <p className="mt-1 flex-1 text-[13px] text-slate-500">{s.description || "—"}</p>
              <div className="mt-4 flex gap-1 border-t border-primary-50 pt-3">
                {can("services", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: s })} />}
                {can("services", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(s)} />}
              </div>
            </motion.div>
          ))}
        </CardGrid>
      )}

      {modal && <ServiceForm editing={modal.editing} onClose={() => setModal(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.services = d.services.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
