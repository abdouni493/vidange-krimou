import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Sparkles, Barcode as BarcodeIcon, Shuffle, Printer, Check } from "lucide-react";
import {
  randomEan13, serviceBarcodeId, printLabels,
  loadLabelSize, loadLabelRotation, loadLabelOpts,
} from "../barcode";
import { printLabelsAuto } from "../lib/labelPrinter";
import { useLabelPrinter, PrintIssue } from "../components/LabelPrinter";
import { useApp } from "../context";
import { uid, fmtMoney, todayISO } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, SearchBox,
  Empty, PageHeader, CardGrid, itemRise, BarcodeLabel as LabelPreview,
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

// Generate, regenerate and print the barcode label of a service. The code is saved in
// the `barcodes` table (id "svc-<serviceId>") so it is scannable from the repair form.
function ServiceBarcode({ service, onClose }) {
  const { db, update, t, lang, can } = useApp();
  const lp = useLabelPrinter();
  const id = serviceBarcodeId(service.id);
  const entry = (db.barcodes || []).find((b) => b.id === id);
  const [copies, setCopies] = useState(1);
  const [issue, setIssue] = useState(null);
  const [flash, setFlash] = useState("");
  const size = loadLabelSize();
  const rotation = loadLabelRotation();
  const opts = loadLabelOpts();

  const saveCode = (code) => update((d) => {
    if (!Array.isArray(d.barcodes)) d.barcodes = [];
    const cur = d.barcodes.find((b) => b.id === id);
    if (cur) { cur.code = code; cur.name = service.name; cur.price = Number(service.price) || 0; }
    else d.barcodes.unshift({ id, name: service.name, code, price: Number(service.price) || 0, productId: "", createdAt: todayISO() });
  });

  const fresh = () => {
    let code;
    do { code = randomEan13(); } while ((db.barcodes || []).some((b) => b.code === code) || db.products.some((p) => p.barcode === code));
    saveCode(code);
  };

  const label = entry ? { ...entry, name: service.name, price: service.price } : null;
  const printOptions = {
    size, rotation, opts, dpi: lp.settings.dpi,
    store: db.settings.name || "", title: t("Étiquettes code-barres"),
    dir: lang === "ar" ? "rtl" : "ltr",
  };
  const print = () => {
    if (!label) return;
    const list = [{ ...label, copies: Math.max(1, Math.min(200, Number(copies) || 1)) }];
    setIssue(null);
    printLabelsAuto(list, printOptions).then((r) => {
      if (r.ok && r.mode === "direct") { setFlash(`${r.count} ${t("étiquette(s) envoyée(s) à")} ${r.printer}`); setTimeout(() => setFlash(""), 2200); }
      else if (r.ok && r.fallback) setIssue({ tone: "warning", message: `${t("Impression directe indisponible")} — ${t("impression par la fenêtre de Chrome.")}` });
      else if (!r.ok && r.message) setIssue({ tone: "error", message: t(r.message), list });
    });
  };
  const canEdit = can("services", "edit") || can("services", "create");

  return (
    <Modal open onClose={onClose} title={`${t("Code-barres")} — ${service.name}`} width="max-w-md"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>{t("Fermer")}</Btn>
        {label && <Btn icon={Printer} onClick={print}>{t("Imprimer")}</Btn>}
      </>}>
      <div className="space-y-4">
        {flash && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><Check size={15} /> {flash}</p>}
        <PrintIssue issue={issue} onClose={() => setIssue(null)}
          onBrowser={issue?.list ? () => { printLabels(issue.list, printOptions); setIssue(null); } : undefined} />
        {label ? (
          <>
            <div className="rounded-xl bg-primary-50/50 p-3">
              <LabelPreview entry={label} opts={opts} size={size} />
            </div>
            <p className="text-center font-mono text-sm text-slate-500">{label.code}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {canEdit && (
                <Btn variant="soft" icon={Shuffle} onClick={fresh}>{t("Générer un autre code")}</Btn>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{t("Copies")}</span>
                <input type="number" min="1" max="200" value={copies} onChange={(e) => setCopies(e.target.value)}
                  className="input h-9 w-20 px-2 py-1 text-center text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">{t("Même format que les étiquettes de l'interface Codes-barres.")}</p>
          </>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-500">{t("Aucun code-barres pour ce service.")}</p>
            {canEdit && <Btn icon={BarcodeIcon} onClick={fresh}>{t("Créer un code-barres")}</Btn>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Services() {
  const { db, update, t, can } = useApp();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // {editing} | "new"
  const [deleting, setDeleting] = useState(null);
  const [barcodeFor, setBarcodeFor] = useState(null);

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
              {(db.barcodes || []).find((b) => b.id === serviceBarcodeId(s.id)) && (
                <p className="mt-2 font-mono text-[11px] text-slate-400">{db.barcodes.find((b) => b.id === serviceBarcodeId(s.id)).code}</p>
              )}
              <div className="mt-4 flex gap-1 border-t border-primary-50 pt-3">
                <IconBtn icon={BarcodeIcon} title={t("Code-barres")} onClick={() => setBarcodeFor(s)} />
                {can("services", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: s })} />}
                {can("services", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(s)} />}
              </div>
            </motion.div>
          ))}
        </CardGrid>
      )}

      {barcodeFor && <ServiceBarcode service={barcodeFor} onClose={() => setBarcodeFor(null)} />}
      {modal && <ServiceForm editing={modal.editing} onClose={() => setModal(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => {
          d.services = d.services.filter((x) => x.id !== deleting.id);
          d.barcodes = (d.barcodes || []).filter((b) => b.id !== serviceBarcodeId(deleting.id));
        })} />
    </div>
  );
}
