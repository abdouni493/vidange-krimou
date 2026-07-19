import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus, Wrench, Eye, Pencil, Trash2, Wallet, CheckCircle2, Ban,
  Plus, X, Car, User, Phone, Package, Minus,
} from "lucide-react";
import { useApp } from "../context";
import {
  uid, todayISO, fmtMoney, fmtDate, paidOf, presetRange, inRange,
  serviceNamesOf, restockRepair, consumeRepairStock,
} from "../store";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox,
  Badge, StatusBadge, Empty, PageHeader, Steps, Seg, CardGrid, itemRise,
  InfoRow, MoneyLine,
} from "../components/ui";

// ========== Reusable pickers ==========

export function ClientPicker({ value, onChange }) {
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
        </>
      )}
    </div>
  );
}

export function ServicePicker({ selected, onChange }) {
  const { db, update, t } = useApp();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", price: "" });

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const createService = () => {
    if (!form.name.trim()) return;
    const s = { id: uid(), name: form.name.trim(), description: form.description, price: Number(form.price) || 0 };
    update((d) => d.services.push(s));
    onChange([...selected, s.id]);
    setCreating(false); setForm({ name: "", description: "", price: "" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {db.services.map((s) => {
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

export function ProductPicker({ items, onChange }) {
  const { db, t } = useApp();
  const [q, setQ] = useState("");
  const results = q
    ? db.products.filter(
        (p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode || "").includes(q)
      ).slice(0, 6)
    : [];

  const add = (p) => {
    if (!items.some((i) => i.productId === p.id)) onChange([...items, { productId: p.id, qty: 1 }]);
    setQ("");
  };
  const setQty = (id, qty) =>
    onChange(items.map((i) => (i.productId === id ? { ...i, qty: Math.max(1, qty) } : i)));

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher un produit...")} />
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="overflow-hidden rounded-xl border border-primary-100">
            {results.map((p) => (
              <button key={p.id} onClick={() => add(p)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-start transition-colors hover:bg-primary-50 cursor-pointer border-b border-primary-50 last:border-0">
                <span className="text-sm font-medium text-primary-900">{p.name}</span>
                <span className="text-xs text-slate-400">
                  {p.qtyCurrent} {t("en stock")} · <span className="font-mono text-primary-600">{fmtMoney(p.salePrice || p.purchasePrice)}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return null;
            return (
              <motion.div key={it.productId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-white px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Package size={15} className="shrink-0 text-primary-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-primary-900">{p.name}</p>
                    <p className="text-[11px] text-slate-400">{fmtMoney(p.salePrice || p.purchasePrice)} · {p.qtyCurrent} {t("en stock")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <IconBtn icon={Minus} title="-" onClick={() => setQty(it.productId, Number(it.qty) - 1)} />
                  <span className="w-8 text-center font-mono text-sm font-bold">{it.qty}</span>
                  <IconBtn icon={Plus} title="+" onClick={() => setQty(it.productId, Number(it.qty) + 1)} />
                  <IconBtn icon={X} title={t("Supprimer")} variant="danger"
                    onClick={() => onChange(items.filter((i) => i.productId !== it.productId))} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
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

// ========== helpers ==========
const useAutoTotal = (db, serviceIds, products) =>
  useMemo(() => {
    const s = serviceIds.reduce((sum, id) => sum + Number(db.services.find((x) => x.id === id)?.price || 0), 0);
    const p = products.reduce((sum, it) => {
      const pr = db.products.find((x) => x.id === it.productId);
      return sum + Number(pr?.salePrice || pr?.purchasePrice || 0) * Number(it.qty);
    }, 0);
    return s + p;
  }, [db, serviceIds, products]);

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
  const [total, setTotal] = useState(editing?.total ?? 0);
  const [paid, setPaid] = useState(editing ? paidOf(editing.payments) : null); // null => not yet initialized

  const autoTotal = useAutoTotal(db, serviceIds, products);
  const shownTotal = totalEdited ? total : autoTotal;
  const shownPaid = paid === null ? shownTotal : paid;
  const rest = Math.max(0, Number(shownTotal) - Number(shownPaid));

  const steps = isAppt
    ? [t("Date"), t("Client"), t("Véhicule"), t("Services"), t("Résumé")]
    : [t("Client"), t("Véhicule"), t("Services"), t("Résumé")];
  const last = steps.length - 1;

  const validate = (s) => {
    setErr("");
    const clientStep = isAppt ? 1 : 0;
    const svcStep = isAppt ? 3 : 2;
    if (s === clientStep && !clientId) { setErr(t("Veuillez sélectionner un client")); return false; }
    if (s === svcStep && serviceIds.length === 0 && products.length === 0) {
      setErr(t("Sélectionnez au moins un service ou produit")); return false;
    }
    return true;
  };

  const save = () => {
    const rec = {
      id: editing?.id || uid(),
      type: isAppt ? "appointment" : "repair",
      status: editing?.status || (isAppt ? "pending" : "finalized"),
      dateIn: `${dates.inDate}T${dates.inTime}`,
      dateOut: `${dates.outDate}T${dates.outTime}`,
      clientId, car, problem,
      services: serviceIds.map((id) => ({ serviceId: id })),
      products,
      total: Number(shownTotal),
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
    if (idx === 1) return <ClientPicker value={clientId} onChange={setClientId} />;
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
            <p className="text-sm font-semibold text-primary-900">{client?.name}</p>
            <p className="text-xs text-slate-500">{client?.phone}</p>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Total (modifiable)")}>
              <Input type="number" min="0" value={shownTotal}
                onChange={(e) => { setTotalEdited(true); setTotal(Number(e.target.value)); if (paid === null) setPaid(null); }} />
            </Field>
            <Field label={t("Le client paie")}>
              <Input type="number" min="0" value={shownPaid} onChange={(e) => setPaid(Number(e.target.value))} />
            </Field>
          </div>
          <MoneyLine label={t("Reste")} value={fmtMoney(rest)} color={rest > 0 ? "text-red-500" : "text-emerald-600"} big />
        </div>
      </div>
    );
  };

  return (
    <Modal open onClose={onClose} width="max-w-3xl"
      title={editing ? t("Modifier") : isAppt ? t("Nouveau RDV") : t("Nouvelle réparation")}
      footer={
        <>
          {step > 0 && <Btn variant="ghost" onClick={() => setStep(step - 1)}>{t("Précédent")}</Btn>}
          {step < last
            ? <Btn onClick={() => validate(step) && setStep(step + 1)}>{t("Suivant")}</Btn>
            : <Btn variant="accent" onClick={save}>{editing ? t("Enregistrer") : isAppt ? t("Créer le RDV") : t("Créer la réparation")}</Btn>}
        </>
      }>
      <Steps labels={steps} current={step} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          {stepContent()}
        </motion.div>
      </AnimatePresence>
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

function FinalizeModal({ repair, onClose }) {
  const { db, update, t, currentUser } = useApp();
  const [serviceIds, setServiceIds] = useState(repair.services.map((s) => s.serviceId).filter(Boolean));
  const [newProducts, setNewProducts] = useState([]); // products added at finalization
  const [workers, setWorkers] = useState(
    repair.workers?.length ? repair.workers : currentUser?.kind === "worker" ? [currentUser.id] : []
  );
  const already = paidOf(repair.payments);
  const autoNew = useAutoTotal(db, serviceIds, [...repair.products, ...newProducts]);
  const [totalEdited, setTotalEdited] = useState(false);
  const [total, setTotal] = useState(repair.total);
  const shownTotal = totalEdited ? total : Math.max(autoNew, repair.total);
  const rest = Math.max(0, Number(shownTotal) - already);
  const [amount, setAmount] = useState(rest);
  const newRest = Math.max(0, Number(shownTotal) - already - Number(amount || 0));

  const save = () => {
    update((d) => {
      const r = d.repairs.find((x) => x.id === repair.id);
      if (!r) return;
      consumeRepairStock(d, newProducts);
      r.services = serviceIds.map((id) => ({ serviceId: id }));
      r.products = [...r.products, ...newProducts];
      r.total = Number(shownTotal);
      if (Number(amount) > 0) r.payments.push({ id: uid(), amount: Number(amount), date: todayISO() });
      r.workers = workers;
      r.status = "finalized";
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t("Finalisation")} width="max-w-3xl"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn variant="accent" icon={CheckCircle2} onClick={save}>{t("Finaliser")}</Btn></>}>
      <div className="space-y-5">
        <Field label={t("Services")}>
          <ServicePicker selected={serviceIds} onChange={setServiceIds} />
        </Field>
        <Field label={t("Produits du stock")}>
          <ProductPicker items={newProducts} onChange={setNewProducts} />
        </Field>
        <Field label={t("Assigner des employés (optionnel)")}>
          <WorkerPicker selected={workers} onChange={setWorkers} />
        </Field>
        <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Total (modifiable)")}>
              <Input type="number" min="0" value={shownTotal}
                onChange={(e) => { setTotalEdited(true); setTotal(Number(e.target.value)); }} />
            </Field>
            <Field label={t("Payer maintenant")}>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <MoneyLine label={t("Déjà payé")} value={fmtMoney(already)} color="text-emerald-600" />
          <MoneyLine label={t("Reste")} value={fmtMoney(newRest)} color={newRest > 0 ? "text-red-500" : "text-emerald-600"} big />
        </div>
      </div>
    </Modal>
  );
}

// ========== View modal ==========

function ViewModal({ repair, onClose }) {
  const { db, t, lang } = useApp();
  const client = db.clients.find((c) => c.id === repair.clientId);
  const already = paidOf(repair.payments);
  const rest = Math.max(0, repair.total - already);
  return (
    <Modal open onClose={onClose} title={t("Détails")} width="max-w-xl">
      <div className="mb-3 flex items-center gap-2">
        <Badge color={repair.type === "appointment" ? "blue" : "violet"}>
          {t(repair.type === "appointment" ? "Rendez-vous" : "Réparation")}
        </Badge>
        <StatusBadge status={repair.status} />
      </div>
      <InfoRow label={t("Client")} value={client ? `${client.name} · ${client.phone}` : "—"} />
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
        <MoneyLine label={t("Total")} value={fmtMoney(repair.total)} big />
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
                  <p className="text-sm font-bold text-primary-900">{client?.name || "—"}</p>
                </div>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                  <Phone size={12} /> {client?.phone}
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
