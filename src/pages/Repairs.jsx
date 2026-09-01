import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus, Wrench, Eye, Pencil, Trash2, Wallet, CheckCircle2, Ban,
  Plus, X, Car, User, Phone, Package, Minus, Printer, FileText,
  ScanLine, Boxes, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useApp } from "../context";
import {
  uid, todayISO, fmtMoney, fmtDate, paidOf, presetRange, inRange,
  serviceNamesOf, restockRepair, consumeRepairStock, productPrice,
  searchProducts, findProductByCode, norm,
  printHTML, esc, docHead, docStamp, repairAmounts, DEFAULT_TVA_RATE,
} from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox,
  Badge, StatusBadge, Empty, PageHeader, Steps, StepPane, Seg, CardGrid,
  itemRise, InfoRow, MoneyLine,
} from "../components/ui";
import BarcodeScanner from "../components/BarcodeScanner";

// Le catalogue affiché sans recherche est plafonné : au-delà, taper deux
// lettres est plus rapide que de faire défiler tout le stock.
const MAX_RESULTS = 40;

// ========== Reusable pickers ==========

/**
 * `optional` lets the step be left empty — the job is then recorded for a
 * walk-in customer. A balance left unpaid still needs a real client, which the
 * summary step enforces.
 */
export function ClientPicker({ value, onChange, optional }) {
  const { db, update, t } = useApp();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const selected = db.clients.find((c) => c.id === value);

  const results = q
    ? db.clients.filter(
        (c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      ).slice(0, 6)
    : [];

  const createClient = () => {
    if (!form.name.trim()) return;
    const c = { id: uid(), name: form.name.trim(), phone: form.phone.trim(), createdAt: todayISO() };
    update((d) => d.clients.push(c));
    onChange(c.id);
    setCreating(false); setForm({ name: "", phone: "" }); setQ("");
  };

  return (
    <div className="space-y-3">
      {selected ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full grad-primary text-sm font-bold text-white">
              {selected.name.slice(0, 1)}
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-900">{selected.name}</p>
              <p className="text-xs text-slate-500">{selected.phone}</p>
            </div>
          </div>
          <IconBtn icon={X} title={t("Annuler")} onClick={() => onChange("")} />
        </motion.div>
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher client (nom ou téléphone)...")} />
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="overflow-hidden rounded-xl border border-primary-100">
                {results.map((c) => (
                  <button key={c.id} onClick={() => { onChange(c.id); setQ(""); }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-start transition-colors hover:bg-primary-50 cursor-pointer border-b border-primary-50 last:border-0">
                    <span className="text-sm font-medium text-primary-900">{c.name}</span>
                    <span className="text-xs text-slate-400">{c.phone}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {!creating ? (
            <Btn variant="soft" icon={Plus} onClick={() => setCreating(true)}>{t("Nouveau client")}</Btn>
          ) : (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="space-y-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/40 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("Nom complet")} required>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label={t("Téléphone")} required>
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Btn onClick={createClient}>{t("Créer")}</Btn>
                <Btn variant="ghost" onClick={() => setCreating(false)}>{t("Annuler")}</Btn>
              </div>
            </motion.div>
          )}
          {optional && (
            <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs leading-snug text-slate-500">
              {t("Laissez vide pour enregistrer en client de passage. Un reste à payer exigera un client.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ServicePicker({ selected, onChange }) {
  const { db, update, t } = useApp();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", description: "", price: "" });

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const createService = () => {
    if (!form.name.trim()) return;
    const s = { id: uid(), name: form.name.trim(), description: form.description, price: Number(form.price) || 0 };
    update((d) => d.services.push(s));
    onChange([...selected, s.id]);
    setCreating(false); setForm({ name: "", description: "", price: "" });
    setQ("");
  };

  // Les prestations retenues restent visibles en tête, même quand la recherche
  // ne les fait plus ressortir : on doit toujours pouvoir en retirer une.
  const shown = useMemo(() => {
    const list = q ? db.services.filter((sv) => norm(sv.name).includes(norm(q))) : db.services;
    const extra = db.services.filter((sv) => selected.includes(sv.id) && !list.includes(sv));
    return [...extra, ...list];
  }, [db.services, q, selected]);

  const chosenTotal = selected.reduce(
    (sum, id) => sum + Number(db.services.find((x) => x.id === id)?.price || 0), 0
  );

  return (
    <div className="space-y-3">
      {db.services.length > 6 && (
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher une prestation...")} />
      )}

      {db.services.length === 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          {t("Aucune prestation enregistrée. Créez-en une ci-dessous.")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {shown.map((s) => {
          const on = selected.includes(s.id);
          return (
            <motion.button key={s.id} whileTap={{ scale: 0.95 }} onClick={() => toggle(s.id)}
              className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-all cursor-pointer ${
                on ? "grad-primary border-transparent text-white shadow-lift" : "border-primary-200 bg-white text-slate-600 hover:border-primary-400"
              }`}>
              {s.name} <span className={`ms-1 font-mono text-[11px] ${on ? "text-white/70" : "text-primary-500"}`}>{fmtMoney(s.price)}</span>
            </motion.button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl bg-primary-50/70 px-3.5 py-2.5">
          <MoneyLine label={`${selected.length} ${t("prestation(s)")}`} value={fmtMoney(chosenTotal)} />
        </div>
      )}
      {!creating ? (
        <Btn variant="soft" icon={Plus} onClick={() => setCreating(true)}>{t("Nouveau service")}</Btn>
      ) : (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="space-y-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Nom du service")} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("Prix du service")} required>
              <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
          </div>
          <Field label={t("Description")}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={createService}>{t("Ajouter le service")}</Btn>
            <Btn variant="ghost" onClick={() => setCreating(false)}>{t("Annuler")}</Btn>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Pièces posées sur une réparation.
 *
 * L'écran affiche le stock en permanence — auparavant la liste n'apparaissait
 * qu'après avoir tapé, et restait muette dès qu'un accent, une majuscule ou un
 * espace ne tombait pas juste. La recherche accepte désormais le nom, la
 * marque, la description et le code-barres, et la caméra du téléphone remplace
 * la saisie quand la pièce porte une étiquette.
 */
export function ProductPicker({ items, onChange }) {
  const { db, t } = useApp();
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }

  const chosen = useMemo(
    () => new Map(items.map((i) => [i.productId, Number(i.qty) || 0])),
    [items]
  );

  const results = useMemo(() => searchProducts(db.products, q, MAX_RESULTS), [db.products, q]);
  const truncated = !q && db.products.length > MAX_RESULTS;

  // Le retour d'un scan s'efface tout seul : il confirme un geste, il ne
  // demande pas d'être fermé à la main.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(id);
  }, [notice]);

  /** Ajoute la pièce, ou incrémente sa quantité si elle est déjà sur la fiche. */
  const add = (p, step = 1) => {
    const current = chosen.get(p.id);
    if (current === undefined) onChange([...items, { productId: p.id, qty: step }]);
    else onChange(items.map((i) => (i.productId === p.id ? { ...i, qty: current + step } : i)));
    setQ("");
    return current === undefined ? step : current + step;
  };

  const setQty = (id, qty) =>
    onChange(items.map((i) => (i.productId === id ? { ...i, qty: Math.max(1, qty) } : i)));

  const remove = (id) => onChange(items.filter((i) => i.productId !== id));

  // Retour affiché par le scanner après chaque lecture.
  const onScan = (code) => {
    const p = findProductByCode(db, code);
    if (!p) {
      setNotice({ ok: false, text: `${code} — ${t("Aucun produit avec ce code-barres")}` });
      return { ok: false, message: t("Aucun produit avec ce code-barres") };
    }
    const qty = add(p);
    setNotice({ ok: true, text: `${p.name} × ${qty}` });
    return { ok: true, message: `${p.name} × ${qty}` };
  };

  const subtotal = items.reduce((s, it) => {
    const p = db.products.find((x) => x.id === it.productId);
    return s + productPrice(p) * (Number(it.qty) || 0);
  }, 0);

  return (
    <div className="space-y-3">
      {/* ---- recherche + caméra ---- */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <SearchBox value={q} onChange={setQ}
            placeholder={t("Rechercher une pièce : nom, marque ou code-barres...")} />
        </div>
        <Btn variant="soft" icon={ScanLine} onClick={() => setScanning(true)} className="sm:w-auto">
          {t("Scanner")}
        </Btn>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`overflow-hidden rounded-lg px-3 py-2 text-xs font-medium ${
              notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}>
            {notice.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ---- catalogue ---- */}
      <div className="overflow-hidden rounded-xl border border-primary-100">
        <div className="flex items-center justify-between border-b border-primary-50 bg-primary-50/60 px-3.5 py-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-500">
            <Boxes size={12} /> {t("Produits du stock")}
          </span>
          <span className="text-[11px] text-slate-400">
            {results.length}{truncated ? "+" : ""} {t("résultats")}
          </span>
        </div>

        {results.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-slate-400">
            {db.products.length === 0
              ? t("Aucun produit en stock. Ajoutez-en depuis « Gestion de stock ».")
              : t("Aucun produit ne correspond à cette recherche.")}
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {results.map((p) => {
              const stock = Number(p.qtyCurrent) || 0;
              const picked = chosen.get(p.id);
              return (
                <button key={p.id} type="button" onClick={() => add(p)}
                  className="flex w-full items-center justify-between gap-3 border-b border-primary-50 px-3.5 py-2.5 text-start transition-colors last:border-0 hover:bg-primary-50 cursor-pointer">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-primary-900">
                      {p.name}
                      {picked !== undefined && (
                        <span className="ms-2 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                          × {picked}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {[p.brand, p.barcode].filter(Boolean).join(" · ") || t("Sans code-barres")}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-mono text-[13px] font-bold text-primary-700">{fmtMoney(productPrice(p))}</p>
                    <p className={`text-[11px] ${stock > 0 ? "text-slate-400" : "text-red-500"}`}>
                      {stock} {t("en stock")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- pièces retenues ---- */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return null;
            const stock = Number(p.qtyCurrent) || 0;
            const qty = Number(it.qty) || 0;
            const short = qty > stock;
            return (
              <motion.div key={it.productId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className={`rounded-xl border bg-white px-3.5 py-2.5 ${short ? "border-accent-300 bg-accent-50/40" : "border-primary-100"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Package size={15} className="shrink-0 text-primary-400" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-primary-900">{p.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {fmtMoney(productPrice(p))} · {stock} {t("en stock")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IconBtn icon={Minus} title="-" onClick={() => setQty(it.productId, qty - 1)} />
                    <input type="number" min="1" value={qty}
                      onChange={(e) => setQty(it.productId, Number(e.target.value))}
                      className="input h-9 w-14 px-1 py-1 text-center font-mono text-sm" />
                    <IconBtn icon={Plus} title="+" onClick={() => setQty(it.productId, qty + 1)} />
                    <span className="w-24 text-end font-mono text-[13px] font-extrabold text-primary-900">
                      {fmtMoney(productPrice(p) * qty)}
                    </span>
                    <IconBtn icon={X} title={t("Supprimer")} variant="danger" onClick={() => remove(it.productId)} />
                  </div>
                </div>
                {short && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-accent-700">
                    <AlertTriangle size={12} />
                    {t("Quantité supérieure au stock disponible")} ({stock})
                  </p>
                )}
              </motion.div>
            );
          })}
          <div className="rounded-xl bg-primary-50/70 px-3.5 py-2.5">
            <MoneyLine label={t("Sous-total pièces")} value={fmtMoney(subtotal)} />
          </div>
        </div>
      )}

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={onScan}
        title={t("Scanner une pièce")}
        subtitle={t("Chaque code-barres reconnu est ajouté aux produits utilisés sur cette réparation.")}
      />
    </div>
  );
}

export function WorkerPicker({ selected, onChange }) {
  const { db } = useApp();
  return (
    <div className="flex flex-wrap gap-2">
      {db.workers.map((w) => {
        const on = selected.includes(w.id);
        return (
          <motion.button key={w.id} whileTap={{ scale: 0.95 }}
            onClick={() => onChange(on ? selected.filter((x) => x !== w.id) : [...selected, w.id])}
            className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-all cursor-pointer ${
              on ? "grad-accent border-transparent text-white shadow-lift" : "border-primary-200 bg-white text-slate-600 hover:border-accent-400"
            }`}>
            {w.fullName}
          </motion.button>
        );
      })}
    </div>
  );
}

// ========== TVA ==========

// Optional VAT on top of the HT base — defaults to 19%, editable.
function TvaSection({ on, setOn, rate, setRate, base, tva, total }) {
  const { t } = useApp();
  return (
    <div className="space-y-3 rounded-xl border border-primary-200 bg-white/70 p-3.5">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={on}
          onChange={(e) => setOn(e.target.checked)} />
        <span className="text-sm font-semibold text-primary-900">{t("Appliquer la TVA")}</span>
        {!on && <span className="text-xs text-slate-400">({DEFAULT_TVA_RATE}% {t("par défaut")})</span>}
      </label>
      <AnimatePresence initial={false}>
        {on && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="space-y-2.5 overflow-hidden">
            <Field label={t("Taux de TVA (%)")}>
              <Input type="number" min="0" max="100" step="0.1" value={rate}
                onChange={(e) => setRate(e.target.value)} />
            </Field>
            <MoneyLine label={t("Total HT")} value={fmtMoney(base)} />
            <MoneyLine label={`${t("TVA")} (${Number(rate) || 0}%)`} value={fmtMoney(tva)} color="text-accent-600" />
          </motion.div>
        )}
      </AnimatePresence>
      <MoneyLine label={t(on ? "Total TTC" : "Total à payer")} value={fmtMoney(total)} big />
    </div>
  );
}

// ========== helpers ==========

/** Somme catalogue des prestations et des pièces retenues. */
export const autoTotalOf = (db, serviceIds = [], products = []) => {
  const s = serviceIds.reduce(
    (sum, id) => sum + Number(db.services.find((x) => x.id === id)?.price || 0), 0
  );
  const p = products.reduce((sum, it) => {
    const pr = db.products.find((x) => x.id === it.productId);
    return sum + productPrice(pr) * (Number(it.qty) || 0);
  }, 0);
  return s + p;
};

const useAutoTotal = (db, serviceIds, products) =>
  useMemo(() => autoTotalOf(db, serviceIds, products), [db, serviceIds, products]);

/**
 * Champ « Total HT » avec retour au total calculé.
 *
 * Le montant reste modifiable à la main — un geste commercial, une remise —
 * mais dès qu'il s'écarte du catalogue on propose de revenir au calcul, sinon
 * ajouter une pièce après avoir corrigé le prix passait inaperçu.
 */
function TotalField({ value, auto, edited, onChange, onReset }) {
  const { t } = useApp();
  return (
    <Field label={t("Total HT (modifiable)")}>
      <Input type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {edited && Math.round(auto) !== Math.round(value) && (
        <button type="button" onClick={onReset}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800 cursor-pointer">
          <RefreshCw size={12} />
          {t("Revenir au total calculé")} — {fmtMoney(auto)}
        </button>
      )}
    </Field>
  );
}

// ========== Wizard (create / edit appointment & repair) ==========

function RepairWizard({ mode, editing, onClose }) {
  const { db, update, t, currentUser } = useApp();
  const isAppt = mode === "appointment";
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");

  const [dates, setDates] = useState(() => ({
    inDate: editing?.dateIn?.slice(0, 10) || todayISO(),
    inTime: editing?.dateIn?.slice(11, 16) || "09:00",
    outDate: editing?.dateOut?.slice(0, 10) || todayISO(),
    outTime: editing?.dateOut?.slice(11, 16) || "17:00",
  }));
  const [clientId, setClientId] = useState(editing?.clientId || "");
  const [car, setCar] = useState(editing?.car || { name: "", brand: "", color: "", year: "", plate: "", description: "" });
  const [problem, setProblem] = useState(editing?.problem || "");
  const [serviceIds, setServiceIds] = useState(editing?.services?.map((s) => s.serviceId).filter(Boolean) || []);
  const [products, setProducts] = useState(editing?.products?.map((p) => ({ ...p })) || []);
  const [workers, setWorkers] = useState(
    editing?.workers || (!isAppt && currentUser?.kind === "worker" ? [currentUser.id] : [])
  );
  const [totalEdited, setTotalEdited] = useState(!!editing);
  const [total, setTotal] = useState(editing?.subtotal ?? editing?.total ?? 0); // HT base
  const [tvaOn, setTvaOn] = useState(!!editing?.tva?.enabled);
  const [tvaRate, setTvaRate] = useState(editing?.tva?.rate ?? DEFAULT_TVA_RATE);
  const [paid, setPaid] = useState(editing ? paidOf(editing.payments) : null); // null => not yet initialized

  const autoTotal = useAutoTotal(db, serviceIds, products);
  const baseHT = Number(totalEdited ? total : autoTotal) || 0;
  const tvaAmount = tvaOn ? Math.round((baseHT * (Number(tvaRate) || 0)) / 100) : 0;
  const grandTotal = baseHT + tvaAmount;
  const shownPaid = paid === null ? grandTotal : paid;
  const rest = Math.max(0, grandTotal - Number(shownPaid));

  const steps = isAppt
    ? [t("Date"), t("Client"), t("Véhicule"), t("Services"), t("Résumé")]
    : [t("Client"), t("Véhicule"), t("Services"), t("Résumé")];
  const last = steps.length - 1;

  const svcStep = isAppt ? 3 : 2;

  const validate = (s) => {
    setErr("");
    if (s === svcStep && serviceIds.length === 0 && products.length === 0) {
      setErr(t("Sélectionnez au moins un service ou produit")); return false;
    }
    return true;
  };

  const save = () => {
    if (!validate(svcStep)) { setStep(svcStep); return; }
    // A balance carried over has to be attached to someone we can invoice later
    if (rest > 0 && !clientId) {
      setErr(t("Un reste à payer doit être rattaché à un client. Sélectionnez ou créez un client."));
      return;
    }
    const rec = {
      id: editing?.id || uid(),
      type: isAppt ? "appointment" : "repair",
      status: editing?.status || (isAppt ? "pending" : "finalized"),
      dateIn: `${dates.inDate}T${dates.inTime}`,
      dateOut: `${dates.outDate}T${dates.outTime}`,
      clientId, car, problem,
      services: serviceIds.map((id) => ({ serviceId: id })),
      products,
      subtotal: baseHT,
      tva: { enabled: tvaOn, rate: Number(tvaRate) || 0, amount: tvaAmount },
      total: grandTotal,
      payments: editing ? editing.payments : shownPaid > 0 ? [{ id: uid(), amount: Number(shownPaid), date: todayISO() }] : [],
      workers,
      createdAt: editing?.createdAt || todayISO(),
    };
    update((d) => {
      if (editing) {
        const old = d.repairs.find((r) => r.id === editing.id);
        if (old) restockRepair(d, old); // give back previous product quantities
        consumeRepairStock(d, products);
        const i = d.repairs.findIndex((r) => r.id === editing.id);
        d.repairs[i] = rec;
      } else {
        consumeRepairStock(d, products);
        d.repairs.unshift(rec);
      }
    });
    onClose();
  };

  const client = db.clients.find((c) => c.id === clientId);

  const stepContent = () => {
    const idx = isAppt ? step : step + 1; // align: 0=dates only for appt
    if (isAppt && step === 0)
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("Date & heure d'arrivée")} required>
            <div className="flex gap-2">
              <Input type="date" value={dates.inDate} onChange={(e) => setDates({ ...dates, inDate: e.target.value })} />
              <Input type="time" value={dates.inTime} onChange={(e) => setDates({ ...dates, inTime: e.target.value })} className="input w-28" />
            </div>
          </Field>
          <Field label={t("Date & heure de sortie")} required>
            <div className="flex gap-2">
              <Input type="date" value={dates.outDate} onChange={(e) => setDates({ ...dates, outDate: e.target.value })} />
              <Input type="time" value={dates.outTime} onChange={(e) => setDates({ ...dates, outTime: e.target.value })} className="input w-28" />
            </div>
          </Field>
        </div>
      );
    if (idx === 1) return <ClientPicker value={clientId} onChange={setClientId} optional />;
    if (idx === 2)
      return (
        <div className="space-y-4">
          <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-700">{t("Toutes les informations du véhicule sont optionnelles.")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("Nom du véhicule")}><Input value={car.name} onChange={(e) => setCar({ ...car, name: e.target.value })} /></Field>
            <Field label={t("Marque")}><Input value={car.brand} onChange={(e) => setCar({ ...car, brand: e.target.value })} /></Field>
            <Field label={t("Couleur")}><Input value={car.color} onChange={(e) => setCar({ ...car, color: e.target.value })} /></Field>
            <Field label={t("Année")}><Input value={car.year} onChange={(e) => setCar({ ...car, year: e.target.value })} /></Field>
            <Field label={t("Immatriculation")}><Input value={car.plate} onChange={(e) => setCar({ ...car, plate: e.target.value })} /></Field>
          </div>
          <Field label={t("Description")}><Textarea value={car.description} onChange={(e) => setCar({ ...car, description: e.target.value })} /></Field>
        </div>
      );
    if (idx === 3)
      return (
        <div className="space-y-5">
          <Field label={t("Description du problème")}>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder={t("Décrivez le problème du véhicule...")} />
          </Field>
          <Field label={t("Services")}>
            <ServicePicker selected={serviceIds} onChange={setServiceIds} />
          </Field>
          <Field label={t("Produits du stock")}>
            <ProductPicker items={products} onChange={setProducts} />
          </Field>
        </div>
      );
    // Summary
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-primary-100 bg-surface p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-400"><User size={13} /> {t("Client")}</p>
            <p className="text-sm font-semibold text-primary-900">{client?.name || t("Client de passage")}</p>
            <p className="text-xs text-slate-500">{client?.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-primary-100 bg-surface p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-400"><Car size={13} /> {t("Véhicule")}</p>
            <p className="text-sm font-semibold text-primary-900">{[car.brand, car.name, car.year].filter(Boolean).join(" ") || "—"}</p>
            <p className="text-xs text-slate-500">{[car.color, car.plate].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {problem && (
          <div className="rounded-xl border border-primary-100 bg-surface p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary-400">{t("Problème")}</p>
            <p className="text-sm text-slate-600">{problem}</p>
          </div>
        )}
        <div className="rounded-xl border border-primary-100 bg-surface p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-400">{t("Services & produits")}</p>
          <div className="space-y-1.5">
            {serviceIds.map((id) => {
              const s = db.services.find((x) => x.id === id);
              return s && <MoneyLine key={id} label={s.name} value={fmtMoney(s.price)} />;
            })}
            {products.map((it) => {
              const p = db.products.find((x) => x.id === it.productId);
              return p && <MoneyLine key={it.productId} label={`${p.name} × ${it.qty}`} value={fmtMoney((p.salePrice || p.purchasePrice) * it.qty)} />;
            })}
          </div>
        </div>
        {!isAppt && (
          <Field label={t("Assigner des employés (optionnel)")}>
            <WorkerPicker selected={workers} onChange={setWorkers} />
          </Field>
        )}
        <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
          <TotalField value={baseHT} auto={autoTotal} edited={totalEdited}
            onChange={(v) => { setTotalEdited(true); setTotal(v); }}
            onReset={() => { setTotalEdited(false); setTotal(autoTotal); }} />
          <TvaSection on={tvaOn} setOn={setTvaOn} rate={tvaRate} setRate={setTvaRate}
            base={baseHT} tva={tvaAmount} total={grandTotal} />
          <Field label={t("Le client paie")}>
            <Input type="number" min="0" value={shownPaid} onChange={(e) => setPaid(Number(e.target.value))} />
          </Field>
          <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} big />
          {rest > 0 && !clientId && (
            <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
              <p className="text-xs font-semibold leading-snug text-red-600">
                {t("Un reste à payer doit être rattaché à un client. Sélectionnez ou créez un client.")}
              </p>
              <ClientPicker value={clientId} onChange={setClientId} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal open onClose={onClose} width="max-w-3xl"
      title={editing ? t("Modifier") : isAppt ? t("Nouveau RDV") : t("Nouvelle réparation")}
      footer={
        <>
          {/* Le montant en cours reste sous les yeux à chaque étape. */}
          <div className="me-auto text-start">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t(tvaOn ? "Total TTC" : "Total")}
            </p>
            <p className="font-mono text-base font-bold text-primary-900">{fmtMoney(grandTotal)}</p>
          </div>
          {step > 0 && <Btn variant="ghost" onClick={() => setStep(step - 1)}>{t("Précédent")}</Btn>}
          {step < last
            ? <Btn onClick={() => validate(step) && setStep(step + 1)}>{t("Suivant")}</Btn>
            : <Btn variant="accent" onClick={save}>{editing ? t("Enregistrer") : isAppt ? t("Créer le RDV") : t("Créer la réparation")}</Btn>}
        </>
      }>
      <Steps labels={steps} current={step} />
      <StepPane step={step}>{stepContent()}</StepPane>
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}

// ========== Pay debt modal ==========

function PayModal({ repair, onClose }) {
  const { db, update, t, lang } = useApp();
  const already = paidOf(repair.payments);
  const rest = Math.max(0, Number(repair.total) - already);
  const [amount, setAmount] = useState(rest);
  const newRest = Math.max(0, rest - Number(amount || 0));

  const save = () => {
    update((d) => {
      const r = d.repairs.find((x) => x.id === repair.id);
      if (r && Number(amount) > 0) r.payments.push({ id: uid(), amount: Number(amount), date: todayISO() });
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t("Paiement de la dette")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer le paiement")}</Btn></>}>
      <div className="space-y-2 rounded-xl border border-primary-100 bg-surface p-4">
        {serviceNamesOf(repair, db).map((n, i) => <p key={i} className="text-[13px] text-slate-600">• {n}</p>)}
      </div>
      <div className="mt-4 space-y-2.5">
        <MoneyLine label={t("Total")} value={fmtMoney(repair.total)} />
        <MoneyLine label={t("Déjà payé")} value={fmtMoney(already)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color="text-red-500" />
      </div>
      <Field label={t("Payer maintenant")} className="mt-4">
        <Input type="number" min="0" max={rest} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="mt-3 rounded-xl bg-primary-50 p-3">
        <MoneyLine label={t("Reste")} value={fmtMoney(newRest)} color={newRest > 0 ? "text-red-500" : "text-emerald-600"} big />
      </div>
      {repair.payments.length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {repair.payments.map((p) => (
            <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />
          ))}
        </div>
      )}
    </Modal>
  );
}

// ========== Finalize modal ==========

/**
 * Clôture d'un rendez-vous.
 *
 * L'atelier corrige ici ce qui a réellement été fait : la fiche est ouverte
 * telle qu'elle a été réservée — prestations et pièces comprises — et non plus
 * en lecture seule avec un simple ajout par-dessus. Retirer une pièce prévue
 * mais non posée la remet donc bien en stock.
 */
function FinalizeModal({ repair, onClose }) {
  const { db, update, t, currentUser } = useApp();
  const [clientId, setClientId] = useState(repair.clientId || "");
  const [err, setErr] = useState("");
  const [serviceIds, setServiceIds] = useState(repair.services.map((s) => s.serviceId).filter(Boolean));
  const [products, setProducts] = useState(() => (repair.products || []).map((p) => ({ ...p })));
  const [workers, setWorkers] = useState(
    repair.workers?.length ? repair.workers : currentUser?.kind === "worker" ? [currentUser.id] : []
  );
  const already = paidOf(repair.payments);

  const autoTotal = useAutoTotal(db, serviceIds, products);

  // Un total saisi à la main lors de la prise de rendez-vous doit survivre à
  // l'ouverture de cette fenêtre : on ne le repasse en automatique que s'il
  // correspondait déjà au calcul du catalogue.
  const [totalEdited, setTotalEdited] = useState(() => {
    const stored = Number(repair.subtotal ?? repair.total) || 0;
    const asBooked = autoTotalOf(
      db,
      repair.services.map((x) => x.serviceId).filter(Boolean),
      repair.products || []
    );
    return Math.round(stored) !== Math.round(asBooked);
  });
  const [total, setTotal] = useState(Number(repair.subtotal ?? repair.total) || 0);

  const [tvaOn, setTvaOn] = useState(!!repair.tva?.enabled);
  const [tvaRate, setTvaRate] = useState(repair.tva?.rate ?? DEFAULT_TVA_RATE);

  const baseHT = Number(totalEdited ? total : autoTotal) || 0;
  const tvaAmount = tvaOn ? Math.round((baseHT * (Number(tvaRate) || 0)) / 100) : 0;
  const grandTotal = baseHT + tvaAmount;
  const rest = Math.max(0, grandTotal - already);

  // Le montant proposé suit le reste dû tant que le caissier n'a rien saisi.
  const [amount, setAmount] = useState(null);
  const shownAmount = amount === null ? rest : Number(amount) || 0;
  const newRest = Math.max(0, grandTotal - already - shownAmount);

  const save = () => {
    setErr("");
    if (serviceIds.length === 0 && products.length === 0) {
      setErr(t("Sélectionnez au moins un service ou produit"));
      return;
    }
    if (newRest > 0 && !clientId) {
      setErr(t("Un reste à payer doit être rattaché à un client. Sélectionnez ou créez un client."));
      return;
    }
    update((d) => {
      const r = d.repairs.find((x) => x.id === repair.id);
      if (!r) return;
      // Les pièces réservées à la prise de rendez-vous sont rendues, puis la
      // liste réellement posée est déduite : la correction fonctionne dans les
      // deux sens, en plus comme en moins.
      restockRepair(d, r);
      consumeRepairStock(d, products);
      r.clientId = clientId;
      r.services = serviceIds.map((id) => ({ serviceId: id }));
      r.products = products;
      r.subtotal = baseHT;
      r.tva = { enabled: tvaOn, rate: Number(tvaRate) || 0, amount: tvaAmount };
      r.total = grandTotal;
      if (shownAmount > 0) r.payments.push({ id: uid(), amount: shownAmount, date: todayISO() });
      r.workers = workers;
      r.status = "finalized";
    });
    onClose();
  };

  const client = db.clients.find((c) => c.id === clientId);

  return (
    <Modal open onClose={onClose} title={t("Finalisation")} width="max-w-3xl"
      footer={
        <>
          <div className="me-auto text-start">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t(tvaOn ? "Total TTC" : "Total")}
            </p>
            <p className="font-mono text-base font-bold text-primary-900">{fmtMoney(grandTotal)}</p>
          </div>
          <Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn>
          <Btn variant="accent" icon={CheckCircle2} onClick={save}>{t("Finaliser")}</Btn>
        </>
      }>
      <div className="space-y-5">
        {/* Rappel de la fiche : on finalise un rendez-vous précis, pas un formulaire vierge */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-primary-100 bg-surface p-3.5">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary-400">
              <User size={12} /> {t("Client")}
            </p>
            <p className="text-sm font-semibold text-primary-900">{client?.name || t("Client de passage")}</p>
            <p className="text-xs text-slate-500">{client?.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-primary-100 bg-surface p-3.5">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary-400">
              <Car size={12} /> {t("Véhicule")}
            </p>
            <p className="text-sm font-semibold text-primary-900">
              {[repair.car?.brand, repair.car?.name, repair.car?.year].filter(Boolean).join(" ") || "—"}
            </p>
            <p className="text-xs text-slate-500">
              {[repair.car?.color, repair.car?.plate].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>

        {repair.problem && (
          <div className="rounded-xl border border-primary-100 bg-surface p-3.5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-primary-400">{t("Problème")}</p>
            <p className="text-sm text-slate-600">{repair.problem}</p>
          </div>
        )}

        <Field label={t("Services")}>
          <ServicePicker selected={serviceIds} onChange={setServiceIds} />
        </Field>

        <Field label={t("Produits du stock")}
          hint={t("Ajoutez, retirez ou corrigez les pièces réellement posées — le stock suit.")}>
          <ProductPicker items={products} onChange={setProducts} />
        </Field>

        <Field label={t("Assigner des employés (optionnel)")}>
          <WorkerPicker selected={workers} onChange={setWorkers} />
        </Field>

        <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
          <TotalField value={baseHT} auto={autoTotal} edited={totalEdited}
            onChange={(v) => { setTotalEdited(true); setTotal(v); }}
            onReset={() => { setTotalEdited(false); setTotal(autoTotal); }} />
          <TvaSection on={tvaOn} setOn={setTvaOn} rate={tvaRate} setRate={setTvaRate}
            base={baseHT} tva={tvaAmount} total={grandTotal} />
          <Field label={t("Payer maintenant")}>
            <Input type="number" min="0" value={shownAmount}
              onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))} />
          </Field>
          <MoneyLine label={t("Déjà payé")} value={fmtMoney(already)} color="text-emerald-600" />
          <MoneyLine label={t("Reste")} value={fmtMoney(newRest)} color={newRest > 0 ? "text-red-500" : "text-emerald-600"} big />
          {newRest > 0 && !clientId && (
            <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
              <p className="text-xs font-semibold leading-snug text-red-600">
                {t("Un reste à payer doit être rattaché à un client. Sélectionnez ou créez un client.")}
              </p>
              <ClientPicker value={clientId} onChange={setClientId} />
            </div>
          )}
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

// ========== View modal ==========

function ViewModal({ repair, onClose }) {
  const { db, t, lang } = useApp();
  const client = db.clients.find((c) => c.id === repair.clientId);
  const { subtotal, tvaEnabled, tvaRate, tva, total, paid: already, rest } = repairAmounts(repair);
  return (
    <Modal open onClose={onClose} title={t("Détails")} width="max-w-xl"
      footer={
        <>
          <Btn variant="soft" icon={FileText} onClick={() => printRepairDoc(repair, db, t, lang, "order")}>
            {t("Bon de réparation")}
          </Btn>
          <Btn icon={Printer} onClick={() => printRepairDoc(repair, db, t, lang, "invoice")}>
            {t("Facture")}
          </Btn>
        </>
      }>
      <div className="mb-3 flex items-center gap-2">
        <Badge color={repair.type === "appointment" ? "blue" : "violet"}>
          {t(repair.type === "appointment" ? "Rendez-vous" : "Réparation")}
        </Badge>
        <StatusBadge status={repair.status} />
      </div>
      <InfoRow label={t("Client")} value={client ? `${client.name} · ${client.phone}` : t("Client de passage")} />
      <InfoRow label={t("Arrivée")} value={`${fmtDate(repair.dateIn, lang)} ${repair.dateIn?.slice(11, 16) || ""}`} />
      <InfoRow label={t("Sortie")} value={`${fmtDate(repair.dateOut, lang)} ${repair.dateOut?.slice(11, 16) || ""}`} />
      <InfoRow label={t("Véhicule")} value={[repair.car?.brand, repair.car?.name, repair.car?.year].filter(Boolean).join(" ") || "—"} />
      <InfoRow label={t("Couleur")} value={repair.car?.color || "—"} />
      <InfoRow label={t("Immatriculation")} value={repair.car?.plate || "—"} />
      <InfoRow label={t("Problème")} value={repair.problem || "—"} />
      <InfoRow label={t("Employés assignés")}
        value={(repair.workers || []).map((id) => db.workers.find((w) => w.id === id)?.fullName).filter(Boolean).join(", ") || "—"} />
      <div className="mt-4 rounded-xl border border-primary-100 bg-surface p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-400">{t("Services & produits")}</p>
        {repair.services.map((s, i) => {
          const sv = db.services.find((x) => x.id === s.serviceId);
          return sv && <MoneyLine key={i} label={sv.name} value={fmtMoney(sv.price)} />;
        })}
        {repair.products.map((it, i) => {
          const p = db.products.find((x) => x.id === it.productId);
          return p && <MoneyLine key={`p${i}`} label={`${p.name} × ${it.qty}`} value={fmtMoney((p.salePrice || p.purchasePrice) * it.qty)} />;
        })}
        {repair.services.length === 0 && repair.products.length === 0 && (
          <p className="text-xs text-slate-400">{t("Aucun service")}</p>
        )}
      </div>
      <div className="mt-4 space-y-2 rounded-xl bg-primary-50 p-4">
        {tvaEnabled && (
          <>
            <MoneyLine label={t("Total HT")} value={fmtMoney(subtotal)} />
            <MoneyLine label={`${t("TVA")} (${tvaRate}%)`} value={fmtMoney(tva)} color="text-accent-600" />
          </>
        )}
        <MoneyLine label={t(tvaEnabled ? "Total TTC" : "Total")} value={fmtMoney(total)} big />
        <MoneyLine label={t("Payé")} value={fmtMoney(already)} color="text-emerald-600" />
        <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
      </div>
      {repair.payments.length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Historique des paiements")}</p>
          {repair.payments.map((p) => <MoneyLine key={p.id} label={fmtDate(p.date, lang)} value={fmtMoney(p.amount)} />)}
        </div>
      )}
    </Modal>
  );
}

// ========== Printable documents (facture / bon de réparation) ==========

const STATUS_LABEL = { pending: "En attente", finalized: "Finalisé", canceled: "Annulé" };

// kind: "invoice" -> FACTURE | "order" -> BON DE RÉPARATION (same layout, different title)
export function printRepairDoc(repair, db, t, lang, kind = "invoice") {
  const s = db.settings || {};
  const client = db.clients.find((c) => c.id === repair.clientId);
  const car = repair.car || {};
  const isInvoice = kind === "invoice";
  const { subtotal, tvaEnabled, tvaRate, tva, total, paid, rest } = repairAmounts(repair);
  const docTitle = isInvoice ? t("FACTURE") : t("BON DE RÉPARATION");
  const ref = `${isInvoice ? "FAC" : "BR"}-${String(repair.id).slice(-6).toUpperCase()}`;
  const dt = (iso) => (iso ? `${fmtDate(iso, lang)}${iso.slice(11, 16) ? ` · ${iso.slice(11, 16)}` : ""}` : "—");

  const line = (name, sub, type, qty, unit) => `<tr>
    <td><b>${esc(name)}</b>${sub ? `<div class="dim">${esc(sub)}</div>` : ""}</td>
    <td>${esc(type)}</td>
    <td class="num">${qty}</td>
    <td class="num">${fmtMoney(unit)}</td>
    <td class="num">${fmtMoney(unit * qty)}</td>
  </tr>`;

  const rows = [
    ...(repair.services || []).map((it) => {
      const sv = db.services.find((x) => x.id === it.serviceId);
      return sv ? line(sv.name, sv.description, t("Service"), 1, Number(sv.price) || 0) : "";
    }),
    ...(repair.products || []).map((it) => {
      const p = db.products.find((x) => x.id === it.productId);
      if (!p) return "";
      return line(p.name, p.brand, t("Pièce"), Number(it.qty) || 1, Number(p.salePrice || p.purchasePrice) || 0);
    }),
  ].filter(Boolean).join("");

  const workerNames = (repair.workers || [])
    .map((id) => db.workers.find((w) => w.id === id)?.fullName)
    .filter(Boolean).join(", ");

  const payRows = (repair.payments || [])
    .map((p) => `<tr><td>${fmtDate(p.date, lang)}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`)
    .join("");

  printHTML(`${docTitle} ${ref}`, `
    ${docHead(s, docTitle, ref, t)}

    <div class="doc-meta">
      <div><span>${t("Référence")}:</span> <b>${ref}</b></div>
      <div><span>${t("Date")}:</span> <b>${fmtDate(repair.createdAt || repair.dateIn, lang)}</b></div>
      <div><span>${t("Type")}:</span> <b>${t(repair.type === "appointment" ? "Rendez-vous" : "Réparation")}</b></div>
      <div><span>${t("Statut")}:</span> <b>${t(STATUS_LABEL[repair.status] || "En attente")}</b></div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>${t("Client")}</h3>
        <div class="kv"><span>${t("Nom")}</span><b>${esc(client?.name || t("Client de passage"))}</b></div>
        <div class="kv"><span>${t("Téléphone")}</span><b>${esc(client?.phone || "—")}</b></div>
        <div class="kv"><span>${t("Client depuis")}</span><b>${client?.createdAt ? fmtDate(client.createdAt, lang) : "—"}</b></div>
      </div>
      <div class="box">
        <h3>${t("Véhicule")}</h3>
        <div class="kv"><span>${t("Véhicule")}</span><b>${esc([car.brand, car.name].filter(Boolean).join(" ") || "—")}</b></div>
        <div class="kv"><span>${t("Immatriculation")}</span><b>${esc(car.plate || "—")}</b></div>
        <div class="kv"><span>${t("Couleur")} / ${t("Année")}</span><b>${esc([car.color, car.year].filter(Boolean).join(" · ") || "—")}</b></div>
      </div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>${t("Arrivée")} / ${t("Sortie")}</h3>
        <div class="kv"><span>${t("Arrivée")}</span><b>${dt(repair.dateIn)}</b></div>
        <div class="kv"><span>${t("Sortie")}</span><b>${dt(repair.dateOut)}</b></div>
        <div class="kv"><span>${t("Employés assignés")}</span><b>${esc(workerNames || "—")}</b></div>
      </div>
      <div class="box">
        <h3>${t("Problème")}</h3>
        <p class="note">${esc(repair.problem || "—")}</p>
        ${car.description ? `<p class="note dim" style="margin-top:6px">${esc(car.description)}</p>` : ""}
      </div>
    </div>

    <h2>${t("Services & produits")}</h2>
    <table class="doc-table">
      <thead>
        <tr>
          <th>${t("Désignation")}</th><th>${t("Type")}</th>
          <th class="num">${t("Qté")}</th><th class="num">${t("Prix unitaire")}</th><th class="num">${t("Total")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="dim">${t("Aucun service")}</td></tr>`}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div>${docStamp(total, paid, t)}</div>
      <div class="totals">
        ${tvaEnabled ? `
          <div class="row"><span>${t("Total HT")}</span><b>${fmtMoney(subtotal)}</b></div>
          <div class="row"><span>${t("TVA")} (${tvaRate}%)</span><b>${fmtMoney(tva)}</b></div>` : ""}
        <div class="row grand"><span>${t(tvaEnabled ? "Total TTC" : "Total à payer")}</span><b>${fmtMoney(total)}</b></div>
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

// ========== Main page ==========

export default function Repairs() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [preset, setPreset] = useState("all");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [wizard, setWizard] = useState(null); // {mode, editing}
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [finalizing, setFinalizing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = useMemo(() => {
    const range = preset === "period" ? period : presetRange(preset);
    return db.repairs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (preset !== "all" && !inRange(r.dateIn, range.from, range.to)) return false;
      if (q) {
        const c = db.clients.find((x) => x.id === r.clientId);
        const needle = q.toLowerCase();
        if (!c || (!c.name.toLowerCase().includes(needle) && !c.phone.replace(/\s/g, "").includes(needle.replace(/\s/g, ""))))
          return false;
      }
      return true;
    });
  }, [db, q, status, preset, period]);

  const remove = (r) => {
    update((d) => {
      const old = d.repairs.find((x) => x.id === r.id);
      if (old && old.status !== "canceled") restockRepair(d, old);
      d.repairs = d.repairs.filter((x) => x.id !== r.id);
    });
  };

  const cancel = (r) => {
    update((d) => {
      const old = d.repairs.find((x) => x.id === r.id);
      if (old) { restockRepair(d, old); old.status = "canceled"; }
    });
  };

  return (
    <div>
      <PageHeader
        title={t("Réparations et rendez-vous")}
        subtitle={t("Vue d'ensemble de votre activité")}
        actions={
          <>
            {can("repairs", "create") && (
              <>
                <Btn icon={CalendarPlus} onClick={() => setWizard({ mode: "appointment" })}>{t("Nouveau RDV")}</Btn>
                <Btn variant="accent" icon={Wrench} onClick={() => setWizard({ mode: "repair" })}>{t("Nouvelle réparation")}</Btn>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher client (nom ou téléphone)...")} />
        </div>
        <Seg value={status} onChange={setStatus} options={[
          { value: "all", label: t("Tous") },
          { value: "pending", label: t("En attente") },
          { value: "finalized", label: t("Finalisé") },
          { value: "canceled", label: t("Annulé") },
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
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun résultat")} />
      ) : (
        <CardGrid cols="md:grid-cols-2 2xl:grid-cols-3">
          {list.map((r) => {
            const client = db.clients.find((c) => c.id === r.clientId);
            const already = paidOf(r.payments);
            const rest = Math.max(0, r.total - already);
            const names = serviceNamesOf(r, db);
            return (
              <motion.div key={r.id} variants={itemRise} layout
                whileHover={{ y: -4, transition: { duration: 0.18 } }}
                className="card flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge color={r.type === "appointment" ? "blue" : "violet"}>
                    {t(r.type === "appointment" ? "Rendez-vous" : "Réparation")}
                  </Badge>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mb-1 flex items-center gap-2">
                  <User size={14} className="text-primary-400" />
                  <p className="text-sm font-bold text-primary-900">{client?.name || t("Client de passage")}</p>
                </div>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                  <Phone size={12} /> {client?.phone || "—"}
                  <span className="mx-1">·</span>
                  <Car size={12} /> {[r.car?.brand, r.car?.name].filter(Boolean).join(" ") || "—"}
                </div>
                <p className="mb-3 line-clamp-1 text-xs text-slate-500">
                  {names.join(", ") || r.problem || "—"}
                </p>
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-primary-50/70 p-2.5 text-center">
                  <div><p className="text-[10px] text-slate-400">{t("Total")}</p><p className="font-mono text-[13px] font-bold text-primary-900">{fmtMoney(r.total)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Payé")}</p><p className="font-mono text-[13px] font-bold text-emerald-600">{fmtMoney(already)}</p></div>
                  <div><p className="text-[10px] text-slate-400">{t("Reste")}</p><p className={`font-mono text-[13px] font-bold ${rest > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmtMoney(rest)}</p></div>
                </div>
                <p className="mb-3 text-[11px] text-slate-400">
                  {t("Arrivée")}: {fmtDate(r.dateIn, lang)} {r.dateIn?.slice(11, 16)}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-primary-50 pt-3">
                  <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(r)} />
                  <IconBtn icon={Printer} title={t("Imprimer la facture")}
                    onClick={() => printRepairDoc(r, db, t, lang, "invoice")} />
                  <IconBtn icon={FileText} title={t("Imprimer le bon de réparation")}
                    onClick={() => printRepairDoc(r, db, t, lang, "order")} />
                  {can("repairs", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setWizard({ mode: r.type, editing: r })} />}
                  {can("repairs", "pay") && rest > 0 && r.status !== "canceled" && (
                    <IconBtn icon={Wallet} title={t("Payer dette")} variant="soft" onClick={() => setPaying(r)} />
                  )}
                  {can("repairs", "finalize") && r.status === "pending" && (
                    <IconBtn icon={CheckCircle2} title={t("Finaliser")} variant="accent" className="grad-accent text-white" onClick={() => setFinalizing(r)} />
                  )}
                  {can("repairs", "cancel") && r.status === "pending" && (
                    <IconBtn icon={Ban} title={t("Annuler le RDV")} variant="danger" onClick={() => cancel(r)} />
                  )}
                  {can("repairs", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(r)} />}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      )}

      {wizard && <RepairWizard mode={wizard.mode} editing={wizard.editing} onClose={() => setWizard(null)} />}
      {viewing && <ViewModal repair={viewing} onClose={() => setViewing(null)} />}
      {paying && <PayModal repair={paying} onClose={() => setPaying(null)} />}
      {finalizing && <FinalizeModal repair={finalizing} onClose={() => setFinalizing(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />
    </div>
  );
}
