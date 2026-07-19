import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Eye, Package, AlertTriangle } from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate } from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox,
  Empty, PageHeader, CardGrid, itemRise, ViewToggle, Badge, InfoRow,
} from "../components/ui";

// Shared product form — also embedded in the Purchases interface
export function ProductForm({ editing, onClose, onCreated }) {
  const { db, update, t } = useApp();
  const [form, setForm] = useState(
    editing || {
      name: "", description: "", brand: "", categoryId: "", barcode: "",
      purchasePrice: "", salePrice: "", qtyCurrent: 0, minQty: 5, expiration: "",
    }
  );
  const [newCat, setNewCat] = useState(null); // null | string being typed
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addCategory = () => {
    if (!newCat?.trim()) return;
    const c = { id: uid(), name: newCat.trim() };
    update((d) => d.categories.push(c));
    setForm((f) => ({ ...f, categoryId: c.id }));
    setNewCat(null);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      update((d) => {
        const i = d.products.findIndex((p) => p.id === editing.id);
        d.products[i] = {
          ...editing, ...form,
          purchasePrice: Number(form.purchasePrice) || 0,
          salePrice: Number(form.salePrice) || 0,
          qtyCurrent: Number(form.qtyCurrent) || 0,
          minQty: Number(form.minQty) || 0,
        };
      });
    } else {
      const p = {
        id: uid(), name: form.name.trim(), description: form.description, brand: form.brand,
        categoryId: form.categoryId, barcode: form.barcode,
        purchasePrice: Number(form.purchasePrice) || 0, salePrice: Number(form.salePrice) || 0,
        qtyPrincipal: Number(form.qtyCurrent) || 0, qtyCurrent: Number(form.qtyCurrent) || 0,
        minQty: Number(form.minQty) || 0, expiration: form.expiration, createdAt: todayISO(),
      };
      update((d) => d.products.push(p));
      onCreated?.(p);
    }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouveau produit")} width="max-w-2xl"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("Nom du produit")} required>
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label={t("Marque")}>
          <Input value={form.brand} onChange={set("brand")} />
        </Field>
        <Field label={t("Catégorie")} className="sm:col-span-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={form.categoryId} onChange={set("categoryId")}>
                <option value="">{t("Choisir...")}</option>
                {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <Btn variant="soft" icon={Plus} type="button" onClick={() => setNewCat(newCat === null ? "" : null)}>
              {t("Nouvelle catégorie")}
            </Btn>
          </div>
          {newCat !== null && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="mt-2 flex gap-2">
              <Input placeholder={t("Nom de la catégorie")} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Btn type="button" onClick={addCategory}>{t("Ajouter")}</Btn>
            </motion.div>
          )}
        </Field>
        <Field label={t("Code-barres")}>
          <Input value={form.barcode} onChange={set("barcode")} />
        </Field>
        <Field label={t("Date d'expiration")}>
          <Input type="date" value={form.expiration} onChange={set("expiration")} />
        </Field>
        <Field label={t("Prix d'achat")}>
          <Input type="number" min="0" value={form.purchasePrice} onChange={set("purchasePrice")} />
        </Field>
        <Field label={t("Prix de vente")}>
          <Input type="number" min="0" value={form.salePrice} onChange={set("salePrice")} />
        </Field>
        <Field label={editing ? t("Quantité actuelle") : t("Quantité initiale")}>
          <Input type="number" min="0" value={form.qtyCurrent} onChange={set("qtyCurrent")} />
        </Field>
        <Field label={t("Quantité minimale (alerte)")}>
          <Input type="number" min="0" value={form.minQty} onChange={set("minQty")} />
        </Field>
        <Field label={t("Description")} className="sm:col-span-2">
          <Textarea value={form.description} onChange={set("description")} />
        </Field>
      </div>
    </Modal>
  );
}

function ProductView({ product, onClose }) {
  const { db, t, lang } = useApp();
  const cat = db.categories.find((c) => c.id === product.categoryId);
  const low = Number(product.qtyCurrent) <= Number(product.minQty);
  return (
    <Modal open onClose={onClose} title={product.name} width="max-w-md">
      {low && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          <AlertTriangle size={14} /> {t("Stock faible")}
        </p>
      )}
      <InfoRow label={t("Marque")} value={product.brand} />
      <InfoRow label={t("Catégorie")} value={cat?.name} />
      <InfoRow label={t("Code-barres")} value={product.barcode} />
      <InfoRow label={t("Description")} value={product.description} />
      <InfoRow label={t("Prix d'achat")} value={fmtMoney(product.purchasePrice)} />
      <InfoRow label={t("Prix de vente")} value={fmtMoney(product.salePrice)} />
      <InfoRow label={t("Quantité principale")} value={product.qtyPrincipal} />
      <InfoRow label={t("Quantité actuelle")} value={product.qtyCurrent} />
      <InfoRow label={t("Quantité minimale (alerte)")} value={product.minQty} />
      <InfoRow label={t("Date d'expiration")} value={product.expiration ? fmtDate(product.expiration, lang) : "—"} />
      <InfoRow label={t("Ajouté le")} value={fmtDate(product.createdAt, lang)} />
    </Modal>
  );
}

export default function Stock() {
  const { db, update, t, can, lang } = useApp();
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState("cards");
  const [modal, setModal] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const brands = useMemo(() => [...new Set(db.products.map((p) => p.brand).filter(Boolean))], [db.products]);

  const list = db.products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (brand && p.brand !== brand) return false;
    if (cat && p.categoryId !== cat) return false;
    return true;
  });

  const catName = (id) => db.categories.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <PageHeader title={t("Gestion de stock")} subtitle={t("Gérez vos produits et votre inventaire")}
        actions={can("stock", "create") && <Btn icon={Plus} onClick={() => setModal("new")}>{t("Nouveau produit")}</Btn>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher un produit...")} />
        </div>
        <div className="w-44">
          <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">{t("Toutes les marques")}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </div>
        <div className="w-48">
          <Select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t("Toutes les catégories")}</option>
            {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="ms-auto"><ViewToggle view={view} onChange={setView} /></div>
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun produit trouvé")} />
      ) : view === "cards" ? (
        <CardGrid cols="sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((p) => {
            const low = Number(p.qtyCurrent) <= Number(p.minQty);
            return (
              <motion.div key={p.id} variants={itemRise} layout whileHover={{ y: -4 }}
                className="card flex flex-col p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className={`rounded-xl p-2.5 text-white shadow-lift ${low ? "bg-gradient-to-br from-rose-500 to-red-600" : "grad-primary"}`}>
                    <Package size={17} />
                  </div>
                  {low
                    ? <Badge color="red">{t("Stock faible")}</Badge>
                    : <Badge color="green">{p.qtyCurrent} {t("en stock")}</Badge>}
                </div>
                <h3 className="text-[14.5px] font-bold leading-snug text-primary-900">{p.name}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{p.brand || "—"} · {catName(p.categoryId)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-primary-50/70 p-2.5 text-center">
                  <div><p className="text-[10px] text-slate-400">{t("Quantité")}</p><p className={`font-mono text-[13px] font-bold ${low ? "text-red-500" : "text-primary-900"}`}>{p.qtyCurrent} / {p.qtyPrincipal}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Prix de vente")}</p><p className="font-mono text-[13px] font-bold text-primary-900">{fmtMoney(p.salePrice || p.purchasePrice)}</p></div>
                </div>
                <div className="mt-4 flex gap-1 border-t border-primary-50 pt-3">
                  <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(p)} />
                  {can("stock", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: p })} />}
                  {can("stock", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(p)} />}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="thead bg-primary-50/60">
              <tr>
                <th>{t("Nom")}</th><th>{t("Marque")}</th><th>{t("Catégorie")}</th>
                <th>{t("Quantité")}</th><th>{t("Prix de vente")}</th><th>{t("Ajouté le")}</th><th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const low = Number(p.qtyCurrent) <= Number(p.minQty);
                return (
                  <tr key={p.id} className="trow transition-colors hover:bg-primary-50/40">
                    <td className="font-semibold text-primary-900">{p.name}</td>
                    <td>{p.brand || "—"}</td>
                    <td>{catName(p.categoryId)}</td>
                    <td className={`font-mono font-bold ${low ? "text-red-500" : ""}`}>{p.qtyCurrent}</td>
                    <td className="font-mono">{fmtMoney(p.salePrice || p.purchasePrice)}</td>
                    <td className="text-slate-400">{fmtDate(p.createdAt, lang)}</td>
                    <td>
                      <div className="flex gap-1">
                        <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(p)} />
                        {can("stock", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setModal({ editing: p })} />}
                        {can("stock", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(p)} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {modal && <ProductForm editing={modal.editing} onClose={() => setModal(null)} />}
      {viewing && <ProductView product={viewing} onClose={() => setViewing(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.products = d.products.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
