import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowDownCircle, ArrowUpCircle, Landmark, Wallet, Receipt } from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate, presetRange, inRange, clientNameOf } from "../store";
import {
  Btn, Modal, Field, Input, Textarea, Select, Empty, PageHeader, Seg,
  Badge, MoneyLine, CountUp,
} from "../components/ui";

function TransactionForm({ onClose }) {
  const { db, update, t } = useApp();
  const [form, setForm] = useState({ type: "deposit", amount: "", date: todayISO(), description: "", categoryId: "" });
  const [newCat, setNewCat] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addCategory = () => {
    if (!newCat?.trim()) return;
    const c = { id: uid(), name: newCat.trim() };
    update((d) => d.caisseCategories.push(c));
    setForm((f) => ({ ...f, categoryId: c.id }));
    setNewCat(null);
  };

  const save = () => {
    if (!Number(form.amount)) return;
    update((d) => d.caisse.unshift({ id: uid(), ...form, amount: Number(form.amount) }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t("Nouvelle transaction")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <Field label={t("Type")}>
          <div className="grid grid-cols-2 gap-2">
            {[["deposit", t("Dépôt"), ArrowDownCircle, "text-emerald-600 border-emerald-300 bg-emerald-50"],
              ["withdraw", t("Retrait"), ArrowUpCircle, "text-red-500 border-red-300 bg-red-50"]].map(([v, label, Icon, cls]) => (
              <button key={v} onClick={() => setForm((f) => ({ ...f, type: v }))}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-all cursor-pointer ${
                  form.type === v ? cls : "border-primary-100 text-slate-400 hover:border-primary-300"
                }`}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Montant")} required>
            <Input type="number" min="0" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label={t("Date")} required>
            <Input type="date" value={form.date} onChange={set("date")} />
          </Field>
        </div>
        <Field label={t("Catégorie")}>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={form.categoryId} onChange={set("categoryId")}>
                <option value="">{t("Choisir...")}</option>
                {db.caisseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
        <Field label={t("Description")}>
          <Textarea value={form.description} onChange={set("description")} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Caisse() {
  const { db, t, lang, can } = useApp();
  const [preset, setPreset] = useState("today");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [modal, setModal] = useState(false);

  const range = preset === "period" ? period : presetRange(preset);

  const data = useMemo(() => {
    // Everything a client hands over: repair/appointment settlements *and*
    // counter sales — both land in the same till.
    const clientPayments = [
      ...db.repairs
        .filter((r) => r.status !== "canceled")
        .flatMap((r) =>
          (r.payments || []).map((p) => ({
            ...p, clientName: clientNameOf(db, r.clientId, t),
            source: r.type === "appointment" ? "Rendez-vous" : "Réparation",
          }))
        ),
      ...(db.sales || []).flatMap((s) =>
        (s.payments || []).map((p) => ({
          ...p, clientName: clientNameOf(db, s.clientId, t),
          source: "Vente", ref: s.ref,
        }))
      ),
    ];
    const inP = (arr, get = (x) => x.date) => arr.filter((x) => inRange(get(x), range.from, range.to));

    const pays = inP(clientPayments).sort((a, b) => b.date.localeCompare(a.date));
    const trans = inP(db.caisse).sort((a, b) => b.date.localeCompare(a.date));
    const exps = inP(db.expenses).sort((a, b) => b.date.localeCompare(a.date));

    const totalIn = pays.reduce((s, p) => s + Number(p.amount), 0)
      + trans.filter((x) => x.type === "deposit").reduce((s, x) => s + Number(x.amount), 0);
    const totalOut = trans.filter((x) => x.type === "withdraw").reduce((s, x) => s + Number(x.amount), 0)
      + exps.reduce((s, e) => s + Number(e.amount), 0);

    // global balance (all time)
    const allIn = clientPayments.reduce((s, p) => s + Number(p.amount), 0)
      + db.caisse.filter((x) => x.type === "deposit").reduce((s, x) => s + Number(x.amount), 0);
    const allOut = db.caisse.filter((x) => x.type === "withdraw").reduce((s, x) => s + Number(x.amount), 0)
      + db.expenses.reduce((s, e) => s + Number(e.amount), 0)
      + db.purchases.flatMap((a) => a.payments || []).reduce((s, p) => s + Number(p.amount), 0);

    return { pays, trans, exps, totalIn, totalOut, balance: allIn - allOut };
  }, [db, range.from, range.to, t]);

  const catName = (id) => db.caisseCategories.find((c) => c.id === id)?.name;

  return (
    <div>
      <PageHeader title={t("Caisse")} subtitle={t("Suivez vos encaissements et décaissements")}
        actions={can("caisse", "create") && <Btn icon={Plus} onClick={() => setModal(true)}>{t("Nouvelle transaction")}</Btn>} />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          [t("Entrées"), data.totalIn, "bg-gradient-to-br from-emerald-500 to-teal-600", ArrowDownCircle],
          [t("Sorties"), data.totalOut, "bg-gradient-to-br from-rose-500 to-red-600", ArrowUpCircle],
          [t("Solde total de la caisse"), data.balance, "grad-primary", Landmark],
        ].map(([label, value, grad, Icon], i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }} className={`rounded-2xl ${grad} p-5 text-white shadow-lift`}>
            <Icon size={20} className="mb-2 opacity-80" />
            <p className="text-xs opacity-75">{label}</p>
            <p className="font-mono text-xl font-bold"><CountUp value={value} format={(v) => fmtMoney(v)} /></p>
          </motion.div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Seg value={preset} onChange={setPreset} options={[
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Client payments */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet size={16} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Encaissements clients")}</h3>
            <Badge color="green" className="ms-auto">{data.pays.length}</Badge>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pe-1">
            {data.pays.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t("Aucun encaissement")}</p>}
            {data.pays.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-primary-50 bg-surface px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-primary-900">{p.clientName}</p>
                  <p className="text-[11px] text-slate-400">
                    {fmtDate(p.date, lang)} · {t(p.source)}{p.ref ? ` · ${p.ref}` : ""}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-600">+{fmtMoney(p.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Transactions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Landmark size={16} className="text-primary-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Transactions")}</h3>
            <Badge className="ms-auto">{data.trans.length}</Badge>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pe-1">
            {data.trans.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t("Aucune transaction")}</p>}
            {data.trans.map((x) => (
              <div key={x.id} className="flex items-center justify-between rounded-xl border border-primary-50 bg-surface px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-primary-900">{x.description || t(x.type === "deposit" ? "Dépôt" : "Retrait")}</p>
                  <p className="text-[11px] text-slate-400">{fmtDate(x.date, lang)}{catName(x.categoryId) ? ` · ${catName(x.categoryId)}` : ""}</p>
                </div>
                <span className={`font-mono text-sm font-bold ${x.type === "deposit" ? "text-emerald-600" : "text-red-500"}`}>
                  {x.type === "deposit" ? "+" : "-"}{fmtMoney(x.amount)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Expenses of period */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Receipt size={16} className="text-accent-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Dépenses de la période")}</h3>
            <Badge color="orange" className="ms-auto">{data.exps.length}</Badge>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pe-1">
            {data.exps.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t("Aucune dépense")}</p>}
            {data.exps.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-primary-50 bg-surface px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-primary-900">{e.name}</p>
                  <p className="text-[11px] text-slate-400">{fmtDate(e.date, lang)}</p>
                </div>
                <span className="font-mono text-sm font-bold text-accent-600">-{fmtMoney(e.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {modal && <TransactionForm onClose={() => setModal(false)} />}
    </div>
  );
}
