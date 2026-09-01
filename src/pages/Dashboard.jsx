import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Wallet, CalendarClock, Hourglass, UserX, Truck, Landmark, PackageX,
  Boxes, Users, HardHat, Bell, TrendingUp, Wrench, Receipt,
} from "lucide-react";
import { useApp } from "../context";
import {
  fmtMoney, fmtDate, paidOf, dayOffset, todayISO, serviceNamesOf,
  saleAmounts, clientNameOf,
} from "../store";
import { PageHeader, Badge, StatusBadge, listStagger, itemRise, CountUp } from "../components/ui";

function StatCard({ icon: Icon, label, value, money, sub, grad }) {
  return (
    <motion.div variants={itemRise} whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="card relative overflow-hidden p-5">
      <div className={`absolute -end-6 -top-6 h-24 w-24 rounded-full opacity-10 ${grad}`} />
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lift ${grad}`}>
        <Icon size={18} />
      </div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold text-primary-900">
        {money !== undefined
          ? <CountUp value={money} format={(v) => fmtMoney(v)} />
          : typeof value === "number" ? <CountUp value={value} /> : value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </motion.div>
  );
}

export default function Dashboard() {
  const { db, t, lang } = useApp();

  const stats = useMemo(() => {
    const today = todayISO();
    const monthStart = today.slice(0, 8) + "01";
    const active = db.repairs.filter((r) => r.status !== "canceled");

    // Money in comes from two places: repairs and counter sales
    const clientPayments = [
      ...active.flatMap((r) => r.payments || []),
      ...(db.sales || []).flatMap((s) => s.payments || []),
    ];

    const revenueMonth = clientPayments
      .filter((p) => p.date >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
    const expensesMonth = db.expenses.filter((e) => e.date >= monthStart)
      .reduce((s, e) => s + Number(e.amount), 0);
    const repairsMonth = active.filter((r) => (r.createdAt || "") >= monthStart).length;
    const salesMonth = (db.sales || []).filter((s) => (s.date || "") >= monthStart);

    const rdvToday = db.repairs.filter((r) => r.status === "pending" && r.dateIn?.slice(0, 10) === today);
    const pending = db.repairs.filter((r) => r.status === "pending");
    const clientDebts = active.map((r) => ({ r, rest: Number(r.total) - paidOf(r.payments) }))
      .filter((x) => x.rest > 0);
    const saleDebts = (db.sales || []).map((s) => ({ s, rest: saleAmounts(s).rest }))
      .filter((x) => x.rest > 0);
    const clientDebtTotal = clientDebts.reduce((s, x) => s + x.rest, 0)
      + saleDebts.reduce((s, x) => s + x.rest, 0);
    const supplierDebtTotal = db.purchases.reduce((s, a) => s + Math.max(0, Number(a.total) - paidOf(a.payments)), 0);
    const lowStock = db.products.filter((p) => Number(p.qtyCurrent) <= Number(p.minQty));

    const caisseIn = db.caisse.filter((c) => c.type === "deposit").reduce((s, c) => s + Number(c.amount), 0)
      + clientPayments.reduce((s, p) => s + Number(p.amount), 0);
    const caisseOut = db.caisse.filter((c) => c.type === "withdraw").reduce((s, c) => s + Number(c.amount), 0)
      + db.expenses.reduce((s, e) => s + Number(e.amount), 0)
      + db.purchases.flatMap((a) => a.payments || []).reduce((s, p) => s + Number(p.amount), 0);

    // last 7 days revenue
    const days = Array.from({ length: 7 }, (_, i) => dayOffset(i - 6));
    const chart = days.map((d) => ({
      day: d,
      total: clientPayments.filter((p) => p.date === d).reduce((s, p) => s + Number(p.amount), 0),
    }));

    const upcoming = db.repairs
      .filter((r) => r.status === "pending" && r.dateIn >= today)
      .sort((a, b) => a.dateIn.localeCompare(b.dateIn)).slice(0, 5);

    const recent = [...db.repairs].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);

    return {
      revenueMonth, expensesMonth, repairsMonth, salesMonth, rdvToday, pending,
      clientDebts, saleDebts, clientDebtTotal, supplierDebtTotal, lowStock,
      caisse: caisseIn - caisseOut, chart, upcoming, recent,
    };
  }, [db]);

  const clientName = (id) => clientNameOf(db, id, t);
  const maxChart = Math.max(1, ...stats.chart.map((c) => c.total));

  const alerts = [
    ...stats.rdvToday.map((r) => ({
      icon: CalendarClock, color: "text-accent-500 bg-accent-50",
      text: `${t("RDV en attente :")} ${clientName(r.clientId)} — ${r.dateIn?.slice(11, 16)}`,
    })),
    ...stats.clientDebts.slice(0, 5).map(({ r, rest }) => ({
      icon: UserX, color: "text-red-500 bg-red-50",
      text: `${t("Dette client :")} ${clientName(r.clientId)} ${t("doit")} ${fmtMoney(rest)}`,
    })),
    ...stats.saleDebts.slice(0, 5).map(({ s, rest }) => ({
      icon: UserX, color: "text-red-500 bg-red-50",
      text: `${t("Dette client :")} ${clientName(s.clientId)} ${t("doit")} ${fmtMoney(rest)} (${s.ref})`,
    })),
    ...stats.lowStock.slice(0, 5).map((p) => ({
      icon: PackageX, color: "text-primary-500 bg-primary-50",
      text: `${t("Stock faible :")} ${p.name} — ${p.qtyCurrent} ${t("restant(s)")}`,
    })),
  ];

  return (
    <div>
      <PageHeader title={t("Tableau de bord")} subtitle={t("Vue d'ensemble de votre activité")} />

      <motion.div variants={listStagger} initial="hidden" animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard icon={Wallet} label={t("Revenus du mois")} money={stats.revenueMonth} grad="grad-primary"
          sub={`${stats.salesMonth.length} ${t("ventes")} · ${stats.repairsMonth} ${t("réparations")}`} />
        <StatCard icon={Receipt} label={t("Dépenses du mois")} money={stats.expensesMonth} grad="grad-accent" />
        <StatCard icon={CalendarClock} label={t("RDV aujourd'hui")} value={stats.rdvToday.length} grad="bg-gradient-to-br from-sky-500 to-blue-600" />
        <StatCard icon={Hourglass} label={t("En attente")} value={stats.pending.length} grad="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard icon={UserX} label={t("Dettes clients")} money={stats.clientDebtTotal} grad="bg-gradient-to-br from-rose-500 to-red-600" />
        <StatCard icon={Truck} label={t("Dettes fournisseurs")} money={stats.supplierDebtTotal} grad="bg-gradient-to-br from-fuchsia-500 to-purple-600" />
        <StatCard icon={Landmark} label={t("Solde caisse")} money={stats.caisse} grad="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard icon={PackageX} label={t("Stock faible")} value={stats.lowStock.length}
          sub={`${db.products.length} ${t("Produits").toLowerCase()}`} grad="bg-gradient-to-br from-violet-500 to-indigo-600" />
      </motion.div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Chart */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="card p-6 xl:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <TrendingUp size={17} className="text-primary-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Encaissements des 7 derniers jours")}</h3>
          </div>
          <div className="flex h-44 items-end gap-3">
            {stats.chart.map((c, i) => (
              <div key={c.day} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400">{c.total > 0 ? fmtMoney(c.total) : ""}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(4, (c.total / maxChart) * 130)}px` }}
                  transition={{ delay: 0.25 + i * 0.06, type: "spring", stiffness: 200, damping: 22 }}
                  className={`w-full max-w-[46px] rounded-t-lg ${c.total > 0 ? "grad-primary" : "bg-primary-100"}`}
                  title={`${fmtDate(c.day, lang)} — ${fmtMoney(c.total)}`}
                />
                <span className="text-[10px] font-medium text-slate-400">
                  {new Date(c.day).toLocaleDateString(lang === "ar" ? "ar-DZ" : "fr-FR", { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Alerts */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bell size={17} className="text-accent-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Alertes")}</h3>
            <Badge color="orange" className="ms-auto">{alerts.length}</Badge>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
            {alerts.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("Aucune alerte")}</p>}
            {alerts.map((a, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                className="flex items-start gap-2.5 rounded-xl border border-primary-50 bg-surface px-3 py-2.5">
                <span className={`rounded-lg p-1.5 ${a.color}`}><a.icon size={14} /></span>
                <p className="text-[12.5px] leading-snug text-slate-600">{a.text}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Upcoming appointments */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock size={17} className="text-sky-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Prochains rendez-vous")}</h3>
          </div>
          <div className="space-y-2">
            {stats.upcoming.length === 0 && <p className="py-4 text-center text-sm text-slate-400">{t("Aucun rendez-vous à venir")}</p>}
            {stats.upcoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-primary-50 bg-surface px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-primary-900">{clientName(r.clientId)}</p>
                  <p className="text-[11.5px] text-slate-400">{serviceNamesOf(r, db).join(", ") || r.problem || "—"}</p>
                </div>
                <div className="text-end">
                  <p className="font-mono text-[12px] font-semibold text-primary-700">{fmtDate(r.dateIn, lang)}</p>
                  <p className="text-[11px] text-slate-400">{r.dateIn?.slice(11, 16)}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent activity */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Wrench size={17} className="text-primary-500" />
            <h3 className="text-sm font-bold text-primary-900">{t("Activité récente")}</h3>
          </div>
          <div className="space-y-2">
            {stats.recent.map((r) => {
              const rest = Number(r.total) - paidOf(r.payments);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-primary-50 bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-primary-900">{clientName(r.clientId)}</p>
                    <p className="text-[11.5px] text-slate-400">
                      {t(r.type === "appointment" ? "Rendez-vous" : "Réparation")} · {fmtDate(r.createdAt, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rest > 0 && r.status !== "canceled" && <Badge color="red">-{fmtMoney(rest)}</Badge>}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
