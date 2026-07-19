import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, Eye, ShieldCheck, HandCoins, CalendarX, Wallet,
  HardHat, Phone, UserCheck, UserX as UserXIcon,
} from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate, PAGES, PAGE_ACTIONS } from "../store";
import { NAV } from "../components/Layout";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox,
  Empty, PageHeader, CardGrid, itemRise, Badge, InfoRow, MoneyLine, Steps,
} from "../components/ui";

const ACTION_LABELS = {
  view: "Voir", create: "Créer", edit: "Modifier", delete: "Supprimer",
  pay: "Payer dette", finalize: "Finaliser", cancel: "Annuler", print: "Imprimer",
  history: "Historique", permissions: "Permissions", advance: "Acompte",
  absence: "Absence", payment: "Paiement",
};

// ===== Create / edit worker wizard =====
function WorkerWizard({ editing, onClose }) {
  const { db, update, t } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(editing || {
    fullName: "", birthday: "", idCard: "", phone: "", roleId: "", startDate: todayISO(),
    pay: { enabled: false, mode: "month", amount: "", percent: 10 },
    account: { enabled: false, email: "", username: "", password: "" },
  });
  const [newRole, setNewRole] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPay = (k, v) => setForm((f) => ({ ...f, pay: { ...f.pay, [k]: v } }));
  const setAcc = (k, v) => setForm((f) => ({ ...f, account: { ...f.account, [k]: v } }));

  const addRole = () => {
    if (!newRole?.trim()) return;
    const r = { id: uid(), name: newRole.trim() };
    update((d) => d.roles.push(r));
    setForm((f) => ({ ...f, roleId: r.id }));
    setNewRole(null);
  };

  const save = () => {
    if (!form.fullName.trim()) return;
    update((d) => {
      if (editing) {
        const i = d.workers.findIndex((w) => w.id === editing.id);
        d.workers[i] = { ...editing, ...form, pay: { ...form.pay, amount: Number(form.pay.amount) || 0 } };
      } else {
        d.workers.push({
          id: uid(), ...form,
          pay: { ...form.pay, amount: Number(form.pay.amount) || 0, percent: Number(form.pay.percent) || 0 },
          permissions: {}, advances: [], absences: [], payments: [], settledRepairIds: [],
        });
      }
    });
    onClose();
  };

  const steps = [t("Informations personnelles"), t("Rémunération"), t("Compte de connexion")];

  return (
    <Modal open onClose={onClose} title={editing ? t("Modifier") : t("Nouvel employé")} width="max-w-2xl"
      footer={
        <>
          {step > 0 && <Btn variant="ghost" onClick={() => setStep(step - 1)}>{t("Précédent")}</Btn>}
          {step < 2
            ? <Btn onClick={() => setStep(step + 1)}>{t("Suivant")}</Btn>
            : <Btn variant="accent" onClick={save}>{t("Enregistrer")}</Btn>}
        </>
      }>
      <Steps labels={steps} current={step} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          {step === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("Nom complet")} required>
                <Input value={form.fullName} onChange={set("fullName")} />
              </Field>
              <Field label={t("Date de naissance")}>
                <Input type="date" value={form.birthday} onChange={set("birthday")} />
              </Field>
              <Field label={`${t("N° carte d'identité")} (${t("Optionnel").toLowerCase()})`}>
                <Input value={form.idCard} onChange={set("idCard")} />
              </Field>
              <Field label={t("Téléphone")}>
                <Input type="tel" value={form.phone} onChange={set("phone")} />
              </Field>
              <Field label={t("Rôle")}>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={form.roleId} onChange={set("roleId")}>
                      <option value="">{t("Choisir...")}</option>
                      {db.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </div>
                  <Btn variant="soft" icon={Plus} type="button" onClick={() => setNewRole(newRole === null ? "" : null)}>{t("Nouveau rôle")}</Btn>
                </div>
                {newRole !== null && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 flex gap-2">
                    <Input placeholder={t("Nom du rôle")} value={newRole} onChange={(e) => setNewRole(e.target.value)} />
                    <Btn type="button" onClick={addRole}>{t("Ajouter")}</Btn>
                  </motion.div>
                )}
              </Field>
              <Field label={t("Date de début de travail")}>
                <Input type="date" value={form.startDate} onChange={set("startDate")} />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={form.pay.enabled}
                  onChange={(e) => setPay("enabled", e.target.checked)} />
                <span className="text-sm font-semibold text-primary-900">{t("Cet employé est rémunéré")}</span>
              </label>
              <AnimatePresence>
                {form.pay.enabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field label={t("Type")}>
                        <Select value={form.pay.mode} onChange={(e) => setPay("mode", e.target.value)}>
                          <option value="month">{t("Par mois")}</option>
                          <option value="day">{t("Par jour")}</option>
                        </Select>
                      </Field>
                      <Field label={t("Montant")}>
                        <Input type="number" min="0" value={form.pay.amount} onChange={(e) => setPay("amount", e.target.value)} />
                      </Field>
                      <Field label={t("Commission sur réparations (%)")}>
                        <Input type="number" min="0" max="100" value={form.pay.percent} onChange={(e) => setPay("percent", e.target.value)} />
                      </Field>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={form.account.enabled}
                  onChange={(e) => setAcc("enabled", e.target.checked)} />
                <span className="text-sm font-semibold text-primary-900">{t("Activer le compte de connexion")}</span>
              </label>
              <AnimatePresence>
                {form.account.enabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="grid grid-cols-1 gap-4 overflow-hidden sm:grid-cols-3">
                    <Field label={t("Email")}>
                      <Input type="email" value={form.account.email} onChange={(e) => setAcc("email", e.target.value)} />
                    </Field>
                    <Field label={t("Nom d'utilisateur")}>
                      <Input value={form.account.username} onChange={(e) => setAcc("username", e.target.value)} />
                    </Field>
                    <Field label={t("Mot de passe")}>
                      <Input value={form.account.password} onChange={(e) => setAcc("password", e.target.value)} />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

// ===== Permissions modal =====
function PermissionsModal({ worker, onClose }) {
  const { update, t } = useApp();
  const [perms, setPerms] = useState(structuredClone(worker.permissions || {}));

  const togglePage = (page) =>
    setPerms((p) => {
      const next = { ...p };
      if (next[page]) delete next[page];
      else next[page] = ["view"];
      return next;
    });
  const toggleAction = (page, action) =>
    setPerms((p) => {
      const acts = p[page] || [];
      return { ...p, [page]: acts.includes(action) ? acts.filter((a) => a !== action) : [...acts, action] };
    });

  const save = () => {
    update((d) => {
      const w = d.workers.find((x) => x.id === worker.id);
      if (w) w.permissions = perms;
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${t("Permissions")} — ${worker.fullName}`} width="max-w-2xl"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <p className="mb-4 text-xs text-slate-500">{t("Interfaces visibles")}</p>
      <div className="space-y-2.5">
        {PAGES.map((page) => {
          const nav = NAV.find((n) => n.key === page);
          const on = !!perms[page];
          return (
            <div key={page} className={`rounded-xl border transition-colors ${on ? "border-primary-300 bg-primary-50/50" : "border-primary-100"}`}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={on} onChange={() => togglePage(page)} />
                {nav && <nav.icon size={16} className="text-primary-500" />}
                <span className="text-sm font-semibold text-primary-900">{t(nav?.label || page)}</span>
              </label>
              <AnimatePresence>
                {on && PAGE_ACTIONS[page].length > 1 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="flex flex-wrap gap-2 border-t border-primary-100 px-4 py-3">
                      {PAGE_ACTIONS[page].filter((a) => a !== "view").map((action) => {
                        const has = (perms[page] || []).includes(action);
                        return (
                          <button key={action} onClick={() => toggleAction(page, action)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              has ? "grad-primary text-white" : "bg-white border border-primary-200 text-slate-500 hover:border-primary-400"
                            }`}>
                            {t(ACTION_LABELS[action] || action)}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ===== Advance / absence =====
function EntryModal({ worker, kind, onClose }) {
  const { update, t } = useApp();
  const [form, setForm] = useState({ date: todayISO(), description: "", amount: "" });
  const save = () => {
    update((d) => {
      const w = d.workers.find((x) => x.id === worker.id);
      if (!w) return;
      if (kind === "advance")
        w.advances.push({ id: uid(), date: form.date, description: form.description, amount: Number(form.amount) || 0, settled: false });
      else
        w.absences.push({ id: uid(), date: form.date, description: form.description, cost: Number(form.amount) || 0, settled: false });
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={kind === "advance" ? t("Nouvel acompte") : t("Nouvelle absence")} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn onClick={save}>{t("Enregistrer")}</Btn></>}>
      <div className="space-y-4">
        <Field label={t("Date")} required>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label={kind === "advance" ? t("Montant") : t("Coût")} required>
          <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label={t("Description")}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// ===== Payment modal =====
function PaymentModal({ worker, onClose }) {
  const { db, update, t, lang } = useApp();
  const pendingAdvances = worker.advances.filter((a) => !a.settled);
  const pendingAbsences = worker.absences.filter((a) => !a.settled);
  const commissions = useMemo(() =>
    db.repairs.filter(
      (r) => r.status === "finalized" && (r.workers || []).includes(worker.id) &&
        !(worker.settledRepairIds || []).includes(r.id)
    ).map((r) => ({
      id: r.id,
      label: `${db.clients.find((c) => c.id === r.clientId)?.name || "?"} · ${fmtDate(r.dateIn, lang)}`,
      amount: Math.round((Number(r.total) * Number(worker.pay?.percent || 0)) / 100),
    })), [db, worker, lang]);

  const base = worker.pay?.enabled ? Number(worker.pay.amount) : 0;
  const commTotal = commissions.reduce((s, c) => s + c.amount, 0);
  const advTotal = pendingAdvances.reduce((s, a) => s + Number(a.amount), 0);
  const absTotal = pendingAbsences.reduce((s, a) => s + Number(a.cost), 0);
  const suggested = Math.max(0, base + commTotal - advTotal - absTotal);
  const [amount, setAmount] = useState(suggested);
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const lastPay = worker.payments[worker.payments.length - 1];

  const save = () => {
    update((d) => {
      const w = d.workers.find((x) => x.id === worker.id);
      if (!w) return;
      w.payments.push({
        id: uid(), date, description: desc, amount: Number(amount) || 0,
        details: { base, commissions: commTotal, advances: advTotal, absences: absTotal },
      });
      w.advances.forEach((a) => { if (!a.settled) a.settled = true; });
      w.absences.forEach((a) => { if (!a.settled) a.settled = true; });
      w.settledRepairIds = [...(w.settledRepairIds || []), ...commissions.map((c) => c.id)];
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${t("Paiement")} — ${worker.fullName}`} width="max-w-lg"
      footer={<><Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn><Btn variant="accent" icon={Wallet} onClick={save}>{t("Payer")}</Btn></>}>
      <p className="mb-4 text-xs text-slate-500">
        {t("Dernier paiement")}: {lastPay ? `${fmtDate(lastPay.date, lang)} · ${fmtMoney(lastPay.amount)}` : t("Jamais payé")}
      </p>
      <div className="space-y-3">
        <div className="rounded-xl border border-primary-100 bg-surface p-4">
          <MoneyLine label={`${t("Salaire de base")} (${t(worker.pay?.mode === "day" ? "Par jour" : "Par mois")})`}
            value={fmtMoney(base)} />
        </div>
        {commissions.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="mb-2 text-xs font-bold text-emerald-700">{t("Commissions non payées")} ({worker.pay?.percent || 0}%)</p>
            {commissions.map((c) => <MoneyLine key={c.id} label={c.label} value={`+ ${fmtMoney(c.amount)}`} color="text-emerald-600" />)}
          </div>
        )}
        {pendingAdvances.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="mb-2 text-xs font-bold text-amber-700">{t("Acomptes à déduire")}</p>
            {pendingAdvances.map((a) => (
              <MoneyLine key={a.id} label={`${fmtDate(a.date, lang)} ${a.description ? "· " + a.description : ""}`}
                value={`- ${fmtMoney(a.amount)}`} color="text-amber-600" />
            ))}
          </div>
        )}
        {pendingAbsences.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <p className="mb-2 text-xs font-bold text-red-600">{t("Absences à déduire")}</p>
            {pendingAbsences.map((a) => (
              <MoneyLine key={a.id} label={`${fmtDate(a.date, lang)} ${a.description ? "· " + a.description : ""}`}
                value={`- ${fmtMoney(a.cost)}`} color="text-red-500" />
            ))}
          </div>
        )}
        <div className="space-y-3 rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
          <Field label={t("Montant à payer (modifiable)")}>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Date de paiement")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={`${t("Description")} (${t("Optionnel").toLowerCase()})`}>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== View modal =====
function ViewModal({ worker, onClose }) {
  const { db, t, lang } = useApp();
  const role = db.roles.find((r) => r.id === worker.roleId);
  const repairs = db.repairs.filter((r) => (r.workers || []).includes(worker.id));
  return (
    <Modal open onClose={onClose} title={worker.fullName} width="max-w-lg">
      <InfoRow label={t("Rôle")} value={role?.name} />
      <InfoRow label={t("Téléphone")} value={worker.phone} />
      <InfoRow label={t("Date de naissance")} value={worker.birthday ? fmtDate(worker.birthday, lang) : "—"} />
      <InfoRow label={t("N° carte d'identité")} value={worker.idCard || "—"} />
      <InfoRow label={t("Date de début de travail")} value={fmtDate(worker.startDate, lang)} />
      <InfoRow label={t("Salaire")}
        value={worker.pay?.enabled ? `${fmtMoney(worker.pay.amount)} / ${t(worker.pay.mode === "day" ? "Par jour" : "Par mois")} · ${worker.pay.percent || 0}%` : t("Non rémunéré")} />
      <InfoRow label={t("Compte de connexion")}
        value={worker.account?.enabled ? `${worker.account.username} · ${worker.account.email}` : t("Sans compte")} />
      <InfoRow label={t("Réparations assignées")} value={repairs.length} />
      {worker.payments.length > 0 && (
        <div className="mt-4">
          <p className="label">{t("Paiements effectués")}</p>
          {worker.payments.map((p) => (
            <MoneyLine key={p.id} label={`${fmtDate(p.date, lang)} ${p.description ? "· " + p.description : ""}`} value={fmtMoney(p.amount)} />
          ))}
        </div>
      )}
    </Modal>
  );
}

// ===== Main page =====
export default function Workers() {
  const { db, update, t, lang, can } = useApp();
  const [q, setQ] = useState("");
  const [wizard, setWizard] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [perms, setPerms] = useState(null);
  const [entry, setEntry] = useState(null); // {worker, kind}
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = db.workers.filter((w) => w.fullName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title={t("Employés")} subtitle={t("Gérez vos employés, salaires et permissions")}
        actions={can("workers", "create") && <Btn icon={Plus} onClick={() => setWizard({})}>{t("Nouvel employé")}</Btn>} />

      <div className="mb-5 w-full sm:w-72">
        <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher...")} />
      </div>

      {list.length === 0 ? (
        <Empty text={t("Aucun employé")} />
      ) : (
        <CardGrid>
          {list.map((w) => {
            const role = db.roles.find((r) => r.id === w.roleId);
            return (
              <motion.div key={w.id} variants={itemRise} layout whileHover={{ y: -4 }} className="card p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full grad-accent text-base font-bold text-white shadow-lift">
                    {w.fullName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-primary-900">{w.fullName}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <HardHat size={11} /> {role?.name || "—"}
                    </p>
                  </div>
                  {w.account?.enabled
                    ? <Badge color="green"><UserCheck size={11} /> {t("Compte actif")}</Badge>
                    : <Badge color="gray"><UserXIcon size={11} /> {t("Sans compte")}</Badge>}
                </div>
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={11} /> {w.phone || "—"}</span>
                  <span className="font-mono font-semibold text-primary-700">
                    {w.pay?.enabled ? `${fmtMoney(w.pay.amount)}/${t(w.pay.mode === "day" ? "Par jour" : "Par mois").toLowerCase()}` : t("Non rémunéré")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 border-t border-primary-50 pt-3">
                  <IconBtn icon={Eye} title={t("Voir")} onClick={() => setViewing(w)} />
                  {can("workers", "edit") && <IconBtn icon={Pencil} title={t("Modifier")} onClick={() => setWizard({ editing: w })} />}
                  {can("workers", "permissions") && <IconBtn icon={ShieldCheck} title={t("Permissions")} variant="soft" onClick={() => setPerms(w)} />}
                  {can("workers", "advance") && <IconBtn icon={HandCoins} title={t("Acompte")} onClick={() => setEntry({ worker: w, kind: "advance" })} />}
                  {can("workers", "absence") && <IconBtn icon={CalendarX} title={t("Absence")} onClick={() => setEntry({ worker: w, kind: "absence" })} />}
                  {can("workers", "payment") && <IconBtn icon={Wallet} title={t("Paiement")} variant="accent" className="grad-accent text-white" onClick={() => setPaying(w)} />}
                  {can("workers", "delete") && <IconBtn icon={Trash2} title={t("Supprimer")} variant="danger" onClick={() => setDeleting(w)} />}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      )}

      {wizard && <WorkerWizard editing={wizard.editing} onClose={() => setWizard(null)} />}
      {viewing && <ViewModal worker={viewing} onClose={() => setViewing(null)} />}
      {perms && <PermissionsModal worker={perms} onClose={() => setPerms(null)} />}
      {entry && <EntryModal worker={entry.worker} kind={entry.kind} onClose={() => setEntry(null)} />}
      {paying && <PaymentModal worker={paying} onClose={() => setPaying(null)} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => update((d) => { d.workers = d.workers.filter((x) => x.id !== deleting.id); })} />
    </div>
  );
}
