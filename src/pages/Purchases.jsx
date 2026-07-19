import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, Eye, Wallet, Printer, ShoppingCart, X, Truck,
} from "lucide-react";
import { useApp } from "../context";
import {
  uid, todayISO, fmtMoney, fmtDate, paidOf, applyPurchaseToStock, printHTML,
} from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Select, SearchBox, Empty,
  PageHeader, CardGrid, itemRise, ViewToggle, Badge, InfoRow, MoneyLine, Steps,
} from "../components/ui";
import { ProductForm } from "./Stock";

// ===== Supplier inline create (also used in Suppliers page) =====
export function SupplierFormFields({ form, setForm, t }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t("Nom")} required>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label={t("Téléphone")}>
        <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label={t("Adresse")} className="sm:col-span-2">
        <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </Field>
    </div>
  );
}

// ===== Create / edit purchase wizard =====
function PurchaseWizard({ editing, onClose }) {
  const { db, update, t } = useApp();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [productModal, setProductModal] = useState(false);
  const [items, setItems] = useState(editing?.items.map((i) => ({ ...i })) || []);
  const [supplierId, setSupplierId] = useState(editing?.supplierId || "");
  const [creatingSup, setCreatingSup] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", phone: "", address: "" });
  const [date, setDate] = useState(editing?.date || todayISO());
  const total = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
  const [paid, setPaid] = useState(editing ? paidOf(editing.payments) : null);
  const shownPaid = paid === null ? total : paid;
  const rest = Math.max(0, total - Number(shownPaid));

  const results = q
    ? db.products.filter(
        (p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode || "").includes(q)
      ).slice(0, 6)
    : [];

  const addProduct = (p) => {
    if (!items.some((i) => i.productId === p.id))
      setItems([...items, { productId: p.id, qty: 1, price: p.purchasePrice || 0, minQty: p.minQty ?? 5, expiration: p.expiration || "" }]);
    setQ("");
  };
  const setItem = (id, patch) =>
    setItems(items.map((i) => (i.productId === id ? { ...i, ...patch } : i)));

  const createSupplier = () => {
    if (!supForm.name.trim()) return;
    const s = { id: uid(), ...supForm, name: supForm.name.trim() };
    update((d) => d.suppliers.push(s));
    setSupplierId(s.id);
    setCreatingSup(false);
    setSupForm({ name: "", phone: "", address: "" });
  };

  const validate = (s) => {
    setErr("");
    if (s === 0 && items.length === 0) { setErr(t("Ajoutez au moins un produit")); return false; }
    if (s === 1 && !supplierId) { setErr(t("Veuillez sélectionner un fournisseur")); return false; }
    return true;
  };

  const save = () => {
    update((d) => {
      if (editing) {
        const old = d.purchases.find((x) => x.id === editing.id);
        applyPurchaseToStock(d, old, -1); // revert previous quantities
        old.items = items; old.supplierId = supplierId; old.date = date;
        old.total = total;
        applyPurchaseToStock(d, old, 1);
      } else {
        const rec = {
          id: uid(), ref: `ACH-${String(d.counters.purchase++).padStart(4, "0")}`,
          supplierId, date, items, total,
          payments: shownPaid > 0 ? [{ id: uid(), amount: Number(shownPaid), date }] : [],
          createdAt: todayISO(),
        };
        applyPurchaseToStock(d, rec, 1);
        d.purchases.unshift(rec);
      }
    });
    onClose();
  };

  const steps = [t("Produits"), t("Fournisseur"), t("Paiement")];

  return (
    <>
      <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouvel achat")} width="max-w-3xl"
        footer={
          <>
            {step > 0 && <Btn variant="ghost" onClick={() => setStep(step - 1)}>{t("Précédent")}</Btn>}
            {step < 2
              ? <Btn onClick={() => validate(step) && setStep(step + 1)}>{t("Suivant")}</Btn>
              : <Btn variant="accent" onClick={save}>{editing ? t("Enregistrer") : t("Créer l'achat")}</Btn>}
          </>
        }>
        <Steps labels={steps} current={step} />
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher un produit (nom ou code-barres)...")} />
                  </div>
                  <Btn variant="soft" icon={Plus} onClick={() => setProductModal(true)}>{t("Nouveau produit")}</Btn>
                </div>
                <AnimatePresence>
                  {results.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="overflow-hidden rounded-xl border border-primary-100">
                      {results.map((p) => (
                        <button key={p.id} onClick={() => addProduct(p)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-start transition-colors hover:bg-primary-50 cursor-pointer border-b border-primary-50 last:border-0">
                          <span className="text-sm font-medium text-primary-900">{p.name}</span>
                          <span className="font-mono text-xs text-slate-400">{p.barcode}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="space-y-2.5">
                  {items.map((it) => {
                    const p = db.products.find((x) => x.id === it.productId);
                    if (!p) return null;
                    return (
                      <motion.div key={it.productId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-primary-100 bg-white p-3.5">
                        <div className="mb-2.5 flex items-center justify-between">
                          <p className="text-sm font-bold text-primary-900">{p.name}</p>
                          <IconBtn icon={X} title={t("Supprimer")} variant="danger"
                            onClick={() => setItems(items.filter((i) => i.productId !== it.productId))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Field label={t("Qté")}>
                            <Input type="number" min="1" value={it.qty} onChange={(e) => setItem(it.productId, { qty: Number(e.target.value) })} />
                          </Field>
                          <Field label={t("Prix d'achat")}>
                            <Input type="number" min="0" value={it.price} onChange={(e) => setItem(it.productId, { price: Number(e.target.value) })} />
                          </Field>
                          <Field label={t("Qté min alerte")}>
                            <Input type="number" min="0" value={it.minQty} onChange={(e) => setItem(it.productId, { minQty: Number(e.target.value) })} />
                          </Field>
                          <Field label={t("Date d'expiration")}>
                            <Input type="date" value={it.expiration || ""} onChange={(e) => setItem(it.productId, { expiration: e.target.value })} />
                          </Field>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {items.length > 0 && (
                  <div className="rounded-xl bg-primary-50 p-3.5">
                    <MoneyLine label={t("Total de l'achat")} value={fmtMoney(total)} big />
                  </div>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <Field label={t("Fournisseur")} required>
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">{t("Sélectionner un fournisseur")}</option>
                    {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                {!creatingSup ? (
                  <Btn variant="soft" icon={Plus} onClick={() => setCreatingSup(true)}>{t("Nouveau fournisseur")}</Btn>
                ) : (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="space-y-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/40 p-4">
                    <SupplierFormFields form={supForm} setForm={setSupForm} t={t} />
                    <div className="flex gap-2">
                      <Btn onClick={createSupplier}>{t("Créer")}</Btn>
                      <Btn variant="ghost" onClick={() => setCreatingSup(false)}>{t("Annuler")}</Btn>
                    </div>
                  </motion.div>
                )}
                <Field label={t("Date")}>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border border-primary-100 bg-surface p-4">
                  {items.map((it) => {
                    const p = db.products.find((x) => x.id === it.productId);
                    return p && <MoneyLine key={it.productId} label={`${p.name} × ${it.qty}`} value={fmtMoney(it.price * it.qty)} />;
                  })}
                </div>
                <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
                  <MoneyLine label={t("Total de l'achat")} value={fmtMoney(total)} big />
                  <Field label={t("Montant payé")}>
                    <Input type="number" min="0" value={shownPaid} onChange={(e) => setPaid(Number(e.target.value))} />
                  </Field>
                  <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} big />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">{err}</p>}
      </Modal>
      {productModal && <ProductForm onClose={() => setProductModal(false)} onCreated={(p) => addProduct(p)} />}
    </>
  );
}

// ===== Pay debt =====
function PayModal({ purchase, onClose }) {
  const { update, t, lang } = useApp();
  const already = paidOf(purchase.payments);
  const rest = Math.max(0, purchase.total - already);
  const [amount, setAmount] = useState(rest);
  const newRest = Math.max(0, rest - Number(amount || 0));
  const save = () => {
    update((d) => {
      const p = d.purchases.find((x) => x.id === purchase.id);
      if (p && Number(amount) > 0) p.payments.push({ id: uid(), amount: Number(amount), date: todayISO() });
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("Payer dette")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer le paiement")}</Btn></>}>
      <div className="space-y-2.5">
        <MoneyLine label={t("Total")} value={fmtMoney(purchase.total)} />
        <MoneyLine label={t("Déjà payé")} value={fmtMoney(already)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color="text-red-500" />
      </div>
      <Field label={t("Payer maintenant")} className="mt-4">
        <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="mt-3 rounded-xl bg-primary-50 p-3">
        <MoneyLine label={t("Reste")} value={fmtMoney(newRest)} color={newRest > 0 ? "text-red-500" : "text-emerald-600"} big />
      </div>
      {purchase.payments.length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {purchase.payments.map((p) => <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />)}
        </div>
      )}
    </Modal>
  );
}

// ===== View =====
function ViewModal({ purchase, onClose }) {
  const { db, t, lang } = useApp();
  const sup = db.suppliers.find((s) => s.id === purchase.supplierId);
  const already = paidOf(purchase.payments);
  return (
    <Modal open onClose={onClose} title={`${t("Facture d'achat")} ${purchase.ref}`} width="max-w-xl">
      <InfoRow label={t("Référence")} value={purchase.ref} />
      <InfoRow label={t("Fournisseur")} value={sup ? `${sup.name} · ${sup.phone}` : "—"} />
      <InfoRow label={t("Date")} value={fmtDate(purchase.date, lang)} />
      <div className="mt-4 rounded-xl border border-primary-100 bg-surface p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-400">{t("Produits de l'achat")}</p>
        {purchase.items.map((it) => {
          const p = db.products.find((x) => x.id === it.productId);
          return p && <MoneyLine key={it.productId} label={`${p.name} × ${it.qty} @ ${fmtMoney(it.price)}`} value={fmtMoney(it.price * it.qty)} />;
        })}
      </div>
      <div className="mt-4 space-y-2 rounded-xl bg-primary-50 p-4">
        <MoneyLine label={t("Total")} value={fmtMoney(purchase.total)} big />
        <MoneyLine label={t("Payé")} value={fmtMoney(already)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(Math.max(0, purchase.total - already))} color="text-red-500" />
      </div>
      {purchase.payments.length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {purchase.payments.map((p) => <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />)}
        </div>
      )}
    </Modal>
  );
}

// ===== Print invoice =====
function printPurchase(purchase, db, t) {
  const s = db.settings;
  const sup = db.suppliers.find((x) => x.id === purchase.supplierId);
  const already = paidOf(purchase.payments);
  const rows = purchase.items.map((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    return `<tr><td>${p?.name || "?"}</td><td>${p?.barcode || "—"}</td><td>${it.qty}</td>
      <td>${fmtMoney(it.price)}</td><td>${fmtMoney(it.price * it.qty)}</td></tr>`;
  }).join("");
  printHTML(`${t("Facture d'achat")} ${purchase.ref}`, `
    <div class="head">
      <div>
        <h1>${s.name}</h1>
        <p class="muted">${s.description || ""}</p>
        <p class="muted">${s.address || ""} · ${s.phone || ""} · ${s.email || ""}</p>
        <p class="muted">NIF: ${s.nif || "—"} · NIS: ${s.nis || "—"} · RC: ${s.rc || "—"} · Article: ${s.article || "—"}</p>
      </div>
      <div style="text-align:end">
        <span class="badge">${t("Facture d'achat")}</span>
        <h1 style="margin-top:6px">${purchase.ref}</h1>
        <p class="muted">${t("Date")}: ${fmtDate(purchase.date)}</p>
      </div>
    </div>
    <h2>${t("Fournisseur")}</h2>
    <p><b>${sup?.name || "—"}</b><br/>${sup?.phone || ""}<br/>${sup?.address || ""}</p>
    <h2>${t("Produits de l'achat")}</h2>
    <table>
      <tr><th>${t("Nom du produit")}</th><th>${t("Code-barres")}</th><th>${t("Qté")}</th><th>${t("Prix d'achat")}</th><th>${t("Total")}</th></tr>
      ${rows}
      <tr><td colspan="4" class="tot">${t("Total")}</td><td class="tot">${fmtMoney(purchase.total)}</td></tr>
      <tr><td colspan="4">${t("Payé")}</td><td>${fmtMoney(already)}</td></tr>
      <tr><td colspan="4" class="tot">${t("Reste")}</td><td class="tot">${fmtMoney(Math.max(0, purchase.total - already))}</td></tr>
    </table>
    <div class="sig">
      <div>${t("Signature du magasin")}</div>
      <div>${t("Signature du fournisseur")}</div>
    </div>
  `);
}

// ===== Main page =====
export default function Purchases() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [view, setView] = useState("cards");
  const [wizard, setWizard] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = db.purchases.filter((a) => {
    if (!q) return true;
    const sup = db.suppliers.find((s) => s.id === a.supplierId);
    return a.ref.toLowerCase().includes(q.toLowerCase()) || sup?.name.toLowerCase().includes(q.toLowerCase());
  });

  const supName = (id) => db.suppliers.find((s) => s.id === id)?.name || "—";

  const actions = (a, rest) => (
    <div className="flex flex-wrap gap-1">
      <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(a)} />
      {can("purchases", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setWizard({ editing: a })} />}
      {can("purchases", "pay") && rest > 0 && <IconBtn icon={Wallet} title={t("Payer dette")} variant="soft" onClick={() => setPaying(a)} />}
      {can("purchases", "print") && <IconBtn icon={Printer} title={t("Imprimer")} onClick={() => printPurchase(a, db, t)} />}
      {can("purchases", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(a)} />}
    </div>
  );

  return (
    <div>
      <PageHeader title={t("Achats")} subtitle={t("Gérez vos achats et factures fournisseurs")}
        actions={can("purchases", "create") && <Btn icon={Plus} onClick={() => setWizard({})}>{t("Nouvel achat")}</Btn>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72"><SearchBox value={q} onChange={setQ} placeholder={t("Rechercher...")} /></div>
        <div className="ms-auto"><ViewToggle view={view} onChange={setView} /></div>
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun achat pour le moment")} />
      ) : view === "cards" ? (
        <CardGrid>
          {list.map((a) => {
            const already = paidOf(a.payments);
            const rest = Math.max(0, a.total - already);
            return (
              <motion.div key={a.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-xl grad-primary p-2.5 text-white shadow-lift"><ShoppingCart size={16} /></div>
                    <div>
                      <p className="font-mono text-sm font-bold text-primary-900">{a.ref}</p>
                      <p className="text-[11px] text-slate-400">{fmtDate(a.date, lang)}</p>
                    </div>
                  </div>
                  {rest > 0 ? <Badge color="red">{t("Reste")} {fmtMoney(rest)}</Badge> : <Badge color="green">{t("Payé")}</Badge>}
                </div>
                <div className="mb-2 flex items-center gap-2 text-[13px] text-slate-600">
                  <Truck size={13} className="text-primary-400" /> {supName(a.supplierId)}
                </div>
                <p className="mb-3 text-xs text-slate-400">{a.items.length} {t("produit(s)")}</p>
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-primary-50/70 p-2.5 text-center">
                  <div><p className="text-[10px] text-slate-400">{t("Total")}</p><p className="font-mono text-[13px] font-bold text-primary-900">{fmtMoney(a.total)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Payé")}</p><p className="font-mono text-[13px] font-bold text-emerald-600">{fmtMoney(already)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Reste")}</p><p className={`font-mono text-[13px] font-bold ${rest > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmtMoney(rest)}</p></div>
                </div>
                <div className="mt-auto border-t border-primary-50 pt-3">{actions(a, rest)}</div>
              </motion.div>
            );
          })}
        </CardGrid>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="thead bg-primary-50/60">
              <tr><th>{t("Référence")}</th><th>{t("Fournisseur")}</th><th>{t("Date")}</th><th>{t("Total")}</th><th>{t("Payé")}</th><th>{t("Reste")}</th><th>{t("Actions")}</th></tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const already = paidOf(a.payments);
                const rest = Math.max(0, a.total - already);
                return (
                  <tr key={a.id} className="trow transition-colors hover:bg-primary-50/40">
                    <td className="font-mono font-bold text-primary-900">{a.ref}</td>
                    <td>{supName(a.supplierId)}</td>
                    <td className="text-slate-400">{fmtDate(a.date, lang)}</td>
                    <td className="font-mono">{fmtMoney(a.total)}</td>
                    <td className="font-mono text-emerald-600">{fmtMoney(already)}</td>
                    <td className={`font-mono ${rest > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmtMoney(rest)}</td>
                    <td>{actions(a, rest)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {wizard && <PurchaseWizard editing={wizard.editing} onClose={() => setWizard(null)} />}
      {viewing && <ViewModal purchase={viewing} onClose={() => setViewing(null)} />}
      {paying && <PayModal purchase={paying} onClose={() => setPaying(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => {
          const old = d.purchases.find((x) => x.id === deleting.id);
          if (old) applyPurchaseToStock(d, old, -1);
          d.purchases = d.purchases.filter((x) => x.id !== deleting.id);
        })} />
    </div>
  );
}
