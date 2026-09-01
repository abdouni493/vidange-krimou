import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Minus, X, Package, User, UserPlus, ShoppingBag, Percent,
  Trash2, CheckCircle2, AlertTriangle, Printer, Barcode as BarcodeIcon, ScanLine,
} from "lucide-react";
import { useApp } from "../context";
import {
  uid, todayISO, fmtMoney, productPrice, applySaleToStock, clientNameOf,
  searchProducts, findProductByCode, digits,
} from "../store";
import {
  Btn, IconBtn, Field, Input, Select, SearchBox, Empty, PageHeader,
  Badge, MoneyLine, Confirm,
} from "../components/ui";
import BarcodeScanner from "../components/BarcodeScanner";
import { printSale } from "./Sales";

// ===== Right column: who is buying =====
// A sale can stay anonymous ("client de passage"), but a sale that leaves a
// balance behind has to be attached to someone we can chase for it.
function ClientPanel({ clientId, setClientId, requireClient }) {
  const { db, update, t } = useApp();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const selected = db.clients.find((c) => c.id === clientId);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return db.clients
      .filter((c) =>
        c.name.toLowerCase().includes(s) ||
        (c.phone || "").replace(/\s/g, "").includes(s.replace(/\s/g, ""))
      )
      .slice(0, 6);
  }, [db.clients, q]);

  const create = () => {
    if (!form.name.trim()) return;
    const c = { id: uid(), name: form.name.trim(), phone: form.phone.trim(), createdAt: todayISO() };
    update((d) => d.clients.push(c));
    setClientId(c.id);
    setCreating(false);
    setForm({ name: "", phone: "" });
    setQ("");
  };

  if (selected) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full grad-primary text-sm font-bold text-white">
            {selected.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-primary-900">{selected.name}</p>
            <p className="text-[11px] text-slate-500">{selected.phone || "—"}</p>
          </div>
        </div>
        <IconBtn icon={X} title={t("Retirer")} onClick={() => setClientId("")} />
      </motion.div>
    );
  }

  return (
    <div className="space-y-2.5">
      <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher client (nom ou téléphone)...")} />
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="overflow-hidden rounded-xl border border-primary-100">
            {results.map((c) => (
              <button key={c.id} type="button" onClick={() => { setClientId(c.id); setQ(""); }}
                className="flex w-full items-center justify-between border-b border-primary-50 px-3.5 py-2.5 text-start transition-colors last:border-0 hover:bg-primary-50 cursor-pointer">
                <span className="text-[13px] font-medium text-primary-900">{c.name}</span>
                <span className="text-[11px] text-slate-400">{c.phone}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!creating ? (
        <div className="flex flex-wrap gap-2">
          <Btn variant="soft" icon={UserPlus} onClick={() => setCreating(true)} className="flex-1">
            {t("Nouveau client")}
          </Btn>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="space-y-2.5 overflow-hidden rounded-xl border border-dashed border-primary-300 bg-primary-50/40 p-3.5">
          <Field label={t("Nom complet")} required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("Téléphone")}>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={create}>{t("Créer")}</Btn>
            <Btn variant="ghost" onClick={() => setCreating(false)}>{t("Annuler")}</Btn>
          </div>
        </motion.div>
      )}

      <p className={`rounded-xl px-3.5 py-2.5 text-[11.5px] leading-snug ${
        requireClient ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-500"
      }`}>
        {requireClient
          ? t("Une vente avec reste à payer doit être rattachée à un client.")
          : t("Laissez vide pour enregistrer la vente en client de passage.")}
      </p>
    </div>
  );
}

// ===== One product tile in the counter grid =====
function ProductTile({ product, inCart, onAdd }) {
  const { t } = useApp();
  const stock = Number(product.qtyCurrent) || 0;
  const out = stock <= 0;
  return (
    <motion.button
      type="button"
      layout
      whileHover={out ? {} : { y: -3 }}
      whileTap={out ? {} : { scale: 0.97 }}
      disabled={out}
      onClick={() => onAdd(product)}
      className={`card flex flex-col items-start p-3.5 text-start transition-colors ${
        out ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-primary-300"
      } ${inCart ? "ring-2 ring-primary-400" : ""}`}
    >
      <div className="mb-2 flex w-full items-start justify-between gap-2">
        <div className={`rounded-lg p-2 text-white ${out ? "bg-slate-300" : "grad-primary"}`}>
          <Package size={15} />
        </div>
        {out
          ? <Badge color="gray">{t("Rupture")}</Badge>
          : <Badge color={stock <= (Number(product.minQty) || 0) ? "orange" : "green"}>{stock}</Badge>}
      </div>
      <p className="line-clamp-2 text-[13px] font-bold leading-snug text-primary-900">{product.name}</p>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
        {product.brand || product.description || "—"}
      </p>
      <p className="mt-2 font-mono text-sm font-extrabold text-primary-700">{fmtMoney(productPrice(product))}</p>
    </motion.button>
  );
}

// ===== Page =====
export default function Pos() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lines, setLines] = useState([]);       // [{ productId, qty, price }]
  const [clientId, setClientId] = useState("");
  const [discountOn, setDiscountOn] = useState(false);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState(null);       // null => "pays the whole thing"
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);       // last saved sale, for the receipt
  const [clearing, setClearing] = useState(false);
  const [scanning, setScanning] = useState(false);

  const canCreate = can("pos", "create");

  // ---- catalogue ----
  // Même moteur de recherche que la fiche de réparation : insensible aux
  // accents et à la casse, mots dans n'importe quel ordre, code-barres accepté.
  const products = useMemo(() => {
    const inCategory = cat ? db.products.filter((p) => p.categoryId === cat) : db.products;
    return searchProducts(inCategory, q);
  }, [db.products, q, cat]);

  // ---- cart ----
  const stockOf = (id) => Number(db.products.find((p) => p.id === id)?.qtyCurrent) || 0;

  const addProduct = (p) => {
    setErr("");
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id);
      if (!found) return [...ls, { productId: p.id, qty: 1, price: productPrice(p) }];
      return ls.map((l) =>
        l.productId === p.id
          ? { ...l, qty: Math.min(stockOf(p.id), l.qty + 1) }
          : l
      );
    });
  };
  /**
   * Une lecture de code-barres — caméra du téléphone, douchette USB, ou
   * validation au clavier dans le champ de recherche — passe toutes par ici.
   */
  const scanCode = (code) => {
    const p = findProductByCode(db, code);
    if (!p) return { ok: false, message: t("Aucun produit avec ce code-barres") };
    if ((Number(p.qtyCurrent) || 0) <= 0) {
      return { ok: false, message: `${p.name} — ${t("Rupture")}` };
    }
    addProduct(p);
    setQ("");
    const qty = (lines.find((l) => l.productId === p.id)?.qty || 0) + 1;
    return { ok: true, message: `${p.name} × ${Math.min(qty, Number(p.qtyCurrent) || 1)}` };
  };

  // Entrée dans la recherche : si ce qui est saisi est un code-barres connu,
  // l'article part directement au ticket au lieu de simplement filtrer.
  const onSearchKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (digits(q).length >= 6 && findProductByCode(db, q)) { scanCode(q); return; }
    if (products.length === 1) { addProduct(products[0]); setQ(""); }
  };

  const setLine = (id, patch) =>
    setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const setQty = (id, qty) => {
    const capped = Math.max(1, Math.min(stockOf(id), Number(qty) || 1));
    setLine(id, { qty: capped });
  };
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.productId !== id));

  // ---- money ----
  const subtotal = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const discountValue = discountOn ? Math.min(subtotal, Math.max(0, Number(discount) || 0)) : 0;
  const total = Math.max(0, subtotal - discountValue);
  const shownPaid = paid === null ? total : Math.max(0, Number(paid) || 0);
  const rest = Math.max(0, total - shownPaid);
  const change = Math.max(0, shownPaid - total);   // client overpaid → give back
  const requireClient = rest > 0 && !clientId;

  const reset = () => {
    setLines([]); setClientId(""); setDiscountOn(false); setDiscount("");
    setPaid(null); setErr(""); setQ("");
  };

  const save = () => {
    setErr("");
    if (!lines.length) { setErr(t("Ajoutez au moins un produit")); return; }
    if (requireClient) { setErr(t("Une vente avec reste à payer doit être rattachée à un client.")); return; }

    const date = todayISO();
    // Never bank more than what is owed — the surplus is change, not a payment.
    const banked = Math.min(shownPaid, total);
    const seq = Number(db.counters?.sale) || 1;
    const sale = {
      id: uid(),
      ref: `VNT-${String(seq).padStart(4, "0")}`,
      clientId,
      date,
      items: lines.map((l) => ({
        productId: l.productId,
        name: db.products.find((p) => p.id === l.productId)?.name || "",
        qty: Number(l.qty) || 0,
        price: Number(l.price) || 0,
      })),
      subtotal,
      discount: { enabled: discountOn, amount: discountValue },
      total,
      payments: banked > 0 ? [{ id: uid(), amount: banked, date }] : [],
      createdAt: date,
    };

    update((d) => {
      // The counter read above comes from the last committed document; re-deriving
      // it here is what actually guarantees a unique reference. `sale` is the very
      // object stored, so the receipt banner shows the same number.
      const n = Number(d.counters.sale) || 1;
      d.counters.sale = n + 1;
      sale.ref = `VNT-${String(n).padStart(4, "0")}`;
      applySaleToStock(d, sale, -1);
      d.sales.unshift(sale);
    });

    setDone(sale);
    reset();
  };

  return (
    <div>
      <PageHeader
        title={t("Point de vente")}
        subtitle={t("Vendez les produits du comptoir et encaissez sur place")}
        actions={
          lines.length > 0 && (
            <Btn variant="danger" icon={Trash2} onClick={() => setClearing(true)}>{t("Vider le panier")}</Btn>
          )
        }
      />

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-700">
              {t("Vente enregistrée")} · <span className="font-mono">{done.ref}</span> · {fmtMoney(done.total)}
            </p>
            <div className="ms-auto flex gap-2">
              <Btn variant="soft" icon={Printer} onClick={() => printSale(done, db, t, lang)}>{t("Imprimer")}</Btn>
              <Btn variant="ghost" onClick={() => setDone(null)}>{t("Fermer")}</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* ===== Counter ===== */}
        <div>
          <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <SearchBox value={q} onChange={setQ} onKeyDown={onSearchKey}
                placeholder={t("Rechercher par nom, description ou code-barres...")} />
            </div>
            <Btn variant="soft" icon={ScanLine} onClick={() => setScanning(true)}>
              {t("Scanner")}
            </Btn>
            <div className="w-52">
              <Select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">{t("Toutes les catégories")}</option>
                {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <Badge className="ms-auto">{products.length} {t("Produits").toLowerCase()}</Badge>
          </div>

          {products.length === 0 ? (
            <Empty text={t("Aucun produit trouvé")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {products.map((p) => (
                <ProductTile key={p.id} product={p}
                  inCart={lines.some((l) => l.productId === p.id)}
                  onAdd={addProduct} />
              ))}
            </div>
          )}
        </div>

        {/* ===== Ticket ===== */}
        <div className="xl:sticky xl:top-24 xl:h-fit">
          <div className="card flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-primary-100/70 bg-gradient-to-r from-primary-50/80 to-white px-4 py-3">
              <div className="rounded-lg grad-primary p-1.5 text-white"><ShoppingBag size={15} /></div>
              <h3 className="text-sm font-bold text-primary-900">{t("Ticket de vente")}</h3>
              <Badge className="ms-auto">{lines.length}</Badge>
            </div>

            {/* client */}
            <div className="border-b border-primary-50 px-4 py-3.5">
              <p className="label flex items-center gap-1.5"><User size={12} /> {t("Client")}</p>
              <ClientPanel clientId={clientId} setClientId={setClientId} requireClient={requireClient} />
            </div>

            {/* lines */}
            <div className="max-h-[320px] space-y-2 overflow-y-auto px-4 py-3.5">
              {lines.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-400">
                  {t("Cliquez sur un produit pour l'ajouter au ticket")}
                </p>
              )}
              {lines.map((l) => {
                const p = db.products.find((x) => x.id === l.productId);
                if (!p) return null;
                const max = Number(p.qtyCurrent) || 0;
                return (
                  <motion.div key={l.productId} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    className="rounded-xl border border-primary-100 bg-white p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-primary-900">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{max} {t("en stock")}</p>
                      </div>
                      <IconBtn icon={X} title={t("Retirer")} variant="danger" onClick={() => removeLine(l.productId)} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <IconBtn icon={Minus} title="-"
                          onClick={() => (l.qty <= 1 ? removeLine(l.productId) : setQty(l.productId, l.qty - 1))} />
                        <input type="number" min="1" max={max} value={l.qty}
                          onChange={(e) => setQty(l.productId, e.target.value)}
                          className="input h-9 w-14 px-1 py-1 text-center font-mono text-sm" />
                        <IconBtn icon={Plus} title="+" onClick={() => setQty(l.productId, l.qty + 1)} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="0" value={l.price}
                          onChange={(e) => setLine(l.productId, { price: Math.max(0, Number(e.target.value) || 0) })}
                          className="input h-9 w-24 px-2 py-1 text-end font-mono text-sm"
                          title={t("Prix de vente")} />
                        <span className="w-24 text-end font-mono text-[13px] font-extrabold text-primary-900">
                          {fmtMoney((Number(l.price) || 0) * (Number(l.qty) || 0))}
                        </span>
                      </div>
                    </div>
                    {l.qty >= max && (
                      <p className="mt-1.5 text-[11px] font-medium text-accent-600">{t("Stock maximum atteint")}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* totals */}
            <div className="space-y-3 border-t border-primary-100 bg-primary-50/40 px-4 py-4">
              <MoneyLine label={t("Sous-total")} value={fmtMoney(subtotal)} />

              <div className="rounded-xl border border-primary-200 bg-white/70 p-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={discountOn}
                    onChange={(e) => { setDiscountOn(e.target.checked); setPaid(null); }} />
                  <Percent size={13} className="text-primary-500" />
                  <span className="text-[13px] font-semibold text-primary-900">{t("Appliquer une réduction")}</span>
                </label>
                <AnimatePresence initial={false}>
                  {discountOn && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-2.5">
                        <Input type="number" min="0" max={subtotal} value={discount}
                          placeholder="0"
                          onChange={(e) => { setDiscount(e.target.value); setPaid(null); }} />
                        <p className="mt-1 text-[11px] text-slate-400">
                          {t("Montant déduit du total")} — {fmtMoney(discountValue)}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="rounded-xl border-2 border-primary-300 bg-white p-3">
                <MoneyLine label={t("Total à payer")} value={fmtMoney(total)} big />
              </div>

              <Field label={t("Le client paie")}>
                <Input type="number" min="0" step="any" value={shownPaid}
                  onChange={(e) => setPaid(e.target.value === "" ? 0 : Number(e.target.value))} />
              </Field>

              <MoneyLine label={t("Reste")} value={fmtMoney(rest)}
                color={rest > 0 ? "text-red-500" : "text-emerald-600"} big />
              {change > 0 && (
                <MoneyLine label={t("Monnaie à rendre")} value={fmtMoney(change)} color="text-sky-600" />
              )}

              {rest > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {clientId
                    ? `${t("Cette vente sera enregistrée en dette pour")} ${clientNameOf(db, clientId, t)}.`
                    : t("Une vente avec reste à payer doit être rattachée à un client.")}
                </p>
              )}

              {err && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">{err}</p>
              )}

              {canCreate && (
                <Btn
                  variant={rest > 0 ? "accent" : "primary"}
                  icon={CheckCircle2}
                  className="w-full"
                  disabled={!lines.length || requireClient}
                  onClick={save}
                >
                  {rest > 0 ? t("Enregistrer en dette") : t("Encaisser la vente")}
                </Btn>
              )}
            </div>
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
            <BarcodeIcon size={12} className="shrink-0" />
            {t("Astuce : scannez avec la caméra, une douchette, ou tapez le code puis Entrée")}
          </p>
        </div>
      </div>

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={scanCode}
        title={t("Scanner un produit")}
        subtitle={t("Chaque code-barres reconnu est ajouté au ticket de vente.")}
      />

      <Confirm open={clearing} onClose={() => setClearing(false)} onConfirm={reset}
        title={t("Vider le panier")} message={t("Le ticket en cours sera effacé.")}
        confirmLabel={t("Vider le panier")} />
    </div>
  );
}
