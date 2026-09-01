import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Sparkles, Wallet, Receipt, UserX, Truck, Boxes,
  Users, Trophy, Ban, AlertTriangle, PieChart, Percent, CalendarClock, HardHat,
} from "lucide-react";
import { useApp } from "../context";
import {
  fmtMoney, fmtDate, todayISO, toISODate, dayOffset, inRange, paidOf,
  saleAmounts, repairAmounts, productPrice, clientNameOf,
} from "../store";
import {
  PageHeader, Seg, Badge, MoneyLine, Input, Field, Empty,
  listStagger, itemRise, CountUp,
} from "../components/ui";

// The analysis periods the user reasons in: today, this month, this year.
const RANGES = {
  today: () => ({ from: todayISO(), to: todayISO() }),
  month: () => ({ from: dayOffset(-30), to: todayISO() }),
  year: () => ({ from: dayOffset(-365), to: todayISO() }),
};

function Panel({ icon: Icon, title, extra, children, tone = "grad-primary" }) {
  return (
    <motion.div variants={itemRise} className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className={`rounded-lg ${tone} p-1.5 text-white`}><Icon size={14} /></div>
        <h3 className="text-sm font-bold text-primary-900">{title}</h3>
        {extra && <span className="ms-auto">{extra}</span>}
      </div>
      {children}
    </motion.div>
  );
}

// Horizontal ranking bar — same shape for products, services and clients
function RankBar({ label, sub, value, max, money = true, color = "grad-primary" }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] font-medium text-slate-600">{label}</span>
        <span className="shrink-0 font-mono text-[12.5px] font-bold text-primary-900">
          {money ? fmtMoney(value) : value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-50">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full rounded-full ${color}`} />
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Tile({ label, value, money, sub, grad }) {
  return (
    <motion.div variants={itemRise} className={`rounded-2xl ${grad} p-5 text-white shadow-lift`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="font-mono text-lg font-bold">
        {money !== undefined ? <CountUp value={money} format={(v) => fmtMoney(v)} /> : value}
      </p>
      {sub && <p className="mt-1 text-[11px] opacity-70">{sub}</p>}
    </motion.div>
  );
}

export default function Analytics() {
  const { db, t, lang } = useApp();
  const [preset, setPreset] = useState("month");
  const [period, setPeriod] = useState({ from: dayOffset(-30), to: todayISO() });

  const range = preset === "period" ? period : RANGES[preset]();

  const a = useMemo(() => {
    const within = (iso) => inRange(iso, range.from, range.to);

    // ---- the two revenue streams ----
    const sales = (db.sales || []).filter((s) => within(s.date));
    const repairs = db.repairs.filter((r) => r.status !== "canceled" && within(r.dateIn));

    const salesTotal = sales.reduce((s, x) => s + saleAmounts(x).total, 0);
    const repairsTotal = repairs.reduce((s, r) => s + (Number(r.total) || 0), 0);

    const salesCashed = (db.sales || [])
      .flatMap((s) => s.payments || []).filter((p) => within(p.date))
      .reduce((s, p) => s + Number(p.amount), 0);
    const repairsCashed = db.repairs.filter((r) => r.status !== "canceled")
      .flatMap((r) => r.payments || []).filter((p) => within(p.date))
      .reduce((s, p) => s + Number(p.amount), 0);

    // ---- outgoings ----
    const purchases = db.purchases.filter((p) => within(p.date));
    const purchasesTotal = purchases.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const purchasesPaid = db.purchases.flatMap((p) => p.payments || [])
      .filter((p) => within(p.date)).reduce((s, p) => s + Number(p.amount), 0);
    const expenses = db.expenses.filter((e) => within(e.date));
    const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const wagesTotal = db.workers.flatMap((w) => w.payments || [])
      .filter((p) => within(p.date)).reduce((s, p) => s + Number(p.amount), 0);

    const cashedIn = salesCashed + repairsCashed;
    const cashedOut = purchasesPaid + expensesTotal + wagesTotal;
    const profit = cashedIn - cashedOut;

    // ---- product movement (POS lines + parts used on repairs) ----
    const moved = new Map(); // productId -> { qty, revenue, cost, sales, repairs }
    const bump = (productId, qty, unit, source) => {
      const p = db.products.find((x) => x.id === productId);
      const row = moved.get(productId) || {
        id: productId, name: p?.name || t("Produit supprimé"),
        brand: p?.brand || "", qty: 0, revenue: 0, cost: 0, sales: 0, repairs: 0,
      };
      row.qty += qty;
      row.revenue += unit * qty;
      row.cost += (Number(p?.purchasePrice) || 0) * qty;
      row[source] += qty;
      moved.set(productId, row);
    };
    sales.forEach((s) => (s.items || []).forEach((it) =>
      bump(it.productId, Number(it.qty) || 0, Number(it.price) || 0, "sales")));
    repairs.forEach((r) => (r.products || []).forEach((it) => {
      const p = db.products.find((x) => x.id === it.productId);
      bump(it.productId, Number(it.qty) || 0, productPrice(p), "repairs");
    }));

    const productRows = [...moved.values()].map((r) => ({ ...r, margin: r.revenue - r.cost }));
    const topProducts = [...productRows].sort((x, y) => y.revenue - x.revenue);
    const weakProducts = [...productRows].sort((x, y) => x.revenue - y.revenue);
    const deadProducts = db.products.filter((p) => !moved.has(p.id));

    // ---- service movement ----
    const svcMap = new Map();
    repairs.forEach((r) => (r.services || []).forEach((it) => {
      const sv = db.services.find((x) => x.id === it.serviceId);
      if (!sv) return;
      const row = svcMap.get(sv.id) || { id: sv.id, name: sv.name, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += Number(sv.price) || 0;
      svcMap.set(sv.id, row);
    }));
    const serviceRows = [...svcMap.values()];
    const topServices = [...serviceRows].sort((x, y) => y.revenue - x.revenue);
    const weakServices = [...serviceRows].sort((x, y) => x.revenue - y.revenue);
    const unusedServices = db.services.filter((s) => !svcMap.has(s.id));

    // ---- debts (all-time: a debt does not belong to a period) ----
    const clientDebts = db.clients.map((c) => {
      const fromRepairs = db.repairs
        .filter((r) => r.clientId === c.id && r.status !== "canceled")
        .reduce((s, r) => s + Math.max(0, Number(r.total) - paidOf(r.payments)), 0);
      const fromSales = (db.sales || [])
        .filter((s) => s.clientId === c.id)
        .reduce((s, x) => s + saleAmounts(x).rest, 0);
      return { id: c.id, name: c.name, phone: c.phone, rest: fromRepairs + fromSales };
    }).filter((x) => x.rest > 0).sort((x, y) => y.rest - x.rest);

    const supplierDebts = db.suppliers.map((s) => ({
      name: s.name,
      rest: db.purchases.filter((p) => p.supplierId === s.id)
        .reduce((sum, p) => sum + Math.max(0, Number(p.total) - paidOf(p.payments)), 0),
    })).filter((x) => x.rest > 0).sort((x, y) => y.rest - x.rest);

    // ---- best clients over the period ----
    const clientMap = new Map();
    const credit = (clientId, amount) => {
      const key = clientId || "__walkin";
      const row = clientMap.get(key) || {
        key, name: clientId ? clientNameOf(db, clientId, t) : t("Client de passage"), amount: 0, count: 0,
      };
      row.amount += amount;
      row.count += 1;
      clientMap.set(key, row);
    };
    sales.forEach((s) => credit(s.clientId, saleAmounts(s).total));
    repairs.forEach((r) => credit(r.clientId, Number(r.total) || 0));
    const topClients = [...clientMap.values()].sort((x, y) => y.amount - x.amount);

    // ---- stock health ----
    const stockValue = db.products.reduce(
      (s, p) => s + (Number(p.qtyCurrent) || 0) * (Number(p.purchasePrice) || 0), 0);
    const stockRetail = db.products.reduce(
      (s, p) => s + (Number(p.qtyCurrent) || 0) * productPrice(p), 0);
    const lowStock = db.products.filter(
      (p) => (Number(p.qtyCurrent) || 0) <= (Number(p.minQty) || 0));
    const outOfStock = db.products.filter((p) => (Number(p.qtyCurrent) || 0) <= 0);
    const soon = dayOffset(30);
    const expiring = db.products
      .filter((p) => p.trackExpiration && p.expiration && p.expiration <= soon)
      .sort((x, y) => (x.expiration || "").localeCompare(y.expiration || ""));

    // ---- margin & mix ----
    const soldMargin = productRows.reduce((s, r) => s + r.margin, 0);
    const servicesRevenue = serviceRows.reduce((s, r) => s + r.revenue, 0);
    const productsRevenue = productRows.reduce((s, r) => s + r.revenue, 0);
    const mixTotal = servicesRevenue + productsRevenue;

    const repairCount = repairs.length;
    const avgSale = sales.length ? salesTotal / sales.length : 0;
    const avgRepair = repairCount ? repairsTotal / repairCount : 0;

    // ---- daily revenue curve ----
    // The date inputs can be cleared, so fall back rather than build from NaN
    const days = [];
    const start = new Date(range.from || dayOffset(-30));
    const end = new Date(range.to || todayISO());
    if (Number.isNaN(start.getTime())) start.setTime(new Date(dayOffset(-30)).getTime());
    if (Number.isNaN(end.getTime())) end.setTime(new Date(todayISO()).getTime());
    const span = Math.min(31, Math.max(1, Math.round((end - start) / 86400000) + 1));
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const iso = toISODate(d); // local date — toISOString() would shift by a day
      const amount =
        (db.sales || []).flatMap((s) => s.payments || []).filter((p) => p.date === iso)
          .reduce((s, p) => s + Number(p.amount), 0) +
        db.repairs.filter((r) => r.status !== "canceled")
          .flatMap((r) => r.payments || []).filter((p) => p.date === iso)
          .reduce((s, p) => s + Number(p.amount), 0);
      days.push({ iso, amount });
    }

    return {
      sales, repairs, salesTotal, repairsTotal, salesCashed, repairsCashed,
      purchases, purchasesTotal, purchasesPaid, expenses, expensesTotal, wagesTotal,
      cashedIn, cashedOut, profit,
      topProducts, weakProducts, deadProducts, topServices, weakServices, unusedServices,
      clientDebts, supplierDebts, topClients,
      stockValue, stockRetail, lowStock, outOfStock, expiring,
      soldMargin, servicesRevenue, productsRevenue, mixTotal,
      avgSale, avgRepair, days,
      clientDebtTotal: clientDebts.reduce((s, x) => s + x.rest, 0),
      supplierDebtTotal: supplierDebts.reduce((s, x) => s + x.rest, 0),
    };
  }, [db, range.from, range.to, t]);

  const maxDay = Math.max(1, ...a.days.map((d) => d.amount));
  const revenue = a.salesTotal + a.repairsTotal;
  const marginPct = a.productsRevenue > 0 ? Math.round((a.soldMargin / a.productsRevenue) * 100) : 0;

  return (
    <div>
      <PageHeader title={t("Analyse")}
        subtitle={t("Ce qui marche, ce qui ne marche pas, et où part l'argent")} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Seg value={preset} onChange={setPreset} options={[
          { value: "today", label: t("Aujourd'hui") },
          { value: "month", label: t("Ce mois") },
          { value: "year", label: t("Cette année") },
          { value: "period", label: t("Période") },
        ]} />
        {preset === "period" && (
          <div className="flex items-end gap-2">
            <Field label={t("Date de début")}>
              <Input type="date" value={period.from} className="input w-40"
                onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
            </Field>
            <Field label={t("Date de fin")}>
              <Input type="date" value={period.to} className="input w-40"
                onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
            </Field>
          </div>
        )}
        <span className="ms-auto text-xs text-slate-400">
          {fmtDate(range.from, lang)} → {fmtDate(range.to, lang)}
        </span>
      </div>

      <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-5">
        {/* ===== headline ===== */}
        <motion.div variants={itemRise} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Tile label={t("Chiffre d'affaires")} money={revenue} grad="grad-primary"
            sub={`${a.sales.length} ${t("ventes")} · ${a.repairs.length} ${t("réparations")}`} />
          <Tile label={t("Encaissé")} money={a.cashedIn} grad="bg-gradient-to-br from-emerald-500 to-teal-600" />
          <Tile label={t("Décaissé")} money={a.cashedOut} grad="bg-gradient-to-br from-rose-500 to-red-600"
            sub={t("Achats + dépenses + salaires")} />
          <Tile label={t("Gains (bénéfice)")} money={a.profit}
            grad={a.profit >= 0 ? "bg-gradient-to-br from-emerald-500 to-green-600" : "bg-gradient-to-br from-rose-500 to-red-600"} />
          <Tile label={t("Dettes clients")} money={a.clientDebtTotal} grad="bg-gradient-to-br from-amber-500 to-orange-600" />
          <Tile label={t("Dettes fournisseurs")} money={a.supplierDebtTotal} grad="bg-gradient-to-br from-fuchsia-500 to-purple-600" />
        </motion.div>

        {/* ===== revenue curve ===== */}
        <Panel icon={TrendingUp} title={t("Encaissements de la période")}
          extra={<Badge color="green">{fmtMoney(a.cashedIn)}</Badge>}>
          <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
            {a.days.map((d, i) => (
              <div key={d.iso} className="flex min-w-[18px] flex-1 flex-col items-center gap-1.5"
                title={`${fmtDate(d.iso, lang)} — ${fmtMoney(d.amount)}`}>
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(3, (d.amount / maxDay) * 120)}px` }}
                  transition={{ delay: i * 0.015, type: "spring", stiffness: 200, damping: 22 }}
                  className={`w-full rounded-t-md ${d.amount > 0 ? "grad-primary" : "bg-primary-100"}`} />
                <span className="text-[9px] text-slate-400">{d.iso.slice(8)}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* ===== what sells ===== */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel icon={Trophy} title={t("Produits qui se vendent le mieux")}
            extra={<Badge color="green">{a.topProducts.length}</Badge>}>
            {a.topProducts.length === 0
              ? <p className="text-xs text-slate-400">{t("Aucun mouvement sur la période")}</p>
              : a.topProducts.slice(0, 8).map((p) => (
                <RankBar key={p.id} label={p.name} value={p.revenue}
                  max={a.topProducts[0].revenue}
                  sub={`${p.qty} ${t("vendus")} · ${t("marge")} ${fmtMoney(p.margin)} · ${p.sales} ${t("POS")} / ${p.repairs} ${t("réparation(s)")}`} />
              ))}
          </Panel>

          <Panel icon={TrendingDown} tone="bg-gradient-to-br from-rose-500 to-red-600"
            title={t("Produits qui se vendent le moins")}>
            {a.weakProducts.length === 0
              ? <p className="text-xs text-slate-400">{t("Aucun mouvement sur la période")}</p>
              : a.weakProducts.slice(0, 8).map((p) => (
                <RankBar key={p.id} label={p.name} value={p.revenue}
                  max={a.topProducts[0]?.revenue || 1} color="bg-gradient-to-r from-rose-400 to-red-500"
                  sub={`${p.qty} ${t("vendus")}`} />
              ))}
          </Panel>

          <Panel icon={Sparkles} title={t("Services les plus demandés")}
            extra={<Badge color="green">{fmtMoney(a.servicesRevenue)}</Badge>}>
            {a.topServices.length === 0
              ? <p className="text-xs text-slate-400">{t("Aucun service sur la période")}</p>
              : a.topServices.slice(0, 8).map((s) => (
                <RankBar key={s.id} label={s.name} value={s.revenue} max={a.topServices[0].revenue}
                  sub={`${s.count} ${t("fois")}`} />
              ))}
          </Panel>

          <Panel icon={Ban} tone="bg-gradient-to-br from-slate-500 to-slate-700"
            title={t("Jamais utilisés sur la période")}>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("Services")} ({a.unusedServices.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.unusedServices.length === 0 && <p className="text-xs text-emerald-600">{t("Tous les services ont été vendus")}</p>}
                  {a.unusedServices.slice(0, 14).map((s) => (
                    <span key={s.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[11.5px] font-medium text-slate-600">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-t border-primary-50 pt-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("Produits")} ({a.deadProducts.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.deadProducts.length === 0 && <p className="text-xs text-emerald-600">{t("Tous les produits ont bougé")}</p>}
                  {a.deadProducts.slice(0, 14).map((p) => (
                    <span key={p.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[11.5px] font-medium text-slate-600">
                      {p.name} <span className="text-slate-400">· {p.qtyCurrent}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* ===== detail ===== */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel icon={PieChart} title={t("Répartition du chiffre d'affaires")}>
            <div className="space-y-2">
              <MoneyLine label={`${t("Ventes comptoir")} (${a.sales.length})`} value={fmtMoney(a.salesTotal)} />
              <MoneyLine label={`${t("Réparations")} (${a.repairs.length})`} value={fmtMoney(a.repairsTotal)} />
              <div className="my-2 flex h-2.5 w-full overflow-hidden rounded-full bg-primary-50">
                <div className="grad-primary h-full" style={{ width: `${revenue ? (a.salesTotal / revenue) * 100 : 0}%` }} />
                <div className="grad-accent h-full" style={{ width: `${revenue ? (a.repairsTotal / revenue) * 100 : 0}%` }} />
              </div>
              <div className="border-t border-primary-100 pt-2">
                <MoneyLine label={t("Pièces & produits")} value={fmtMoney(a.productsRevenue)} />
                <MoneyLine label={t("Main d'œuvre (services)")} value={fmtMoney(a.servicesRevenue)} />
                <MoneyLine label={t("Panier moyen (vente)")} value={fmtMoney(a.avgSale)} />
                <MoneyLine label={t("Ticket moyen (réparation)")} value={fmtMoney(a.avgRepair)} />
              </div>
            </div>
          </Panel>

          <Panel icon={Percent} title={t("Marge sur produits vendus")}
            extra={<Badge color={marginPct >= 0 ? "green" : "red"}>{marginPct}%</Badge>}>
            <div className="space-y-1.5">
              <MoneyLine label={t("Vendu (prix de vente)")} value={fmtMoney(a.productsRevenue)} />
              <MoneyLine label={t("Coût d'achat")} value={fmtMoney(a.productsRevenue - a.soldMargin)} color="text-slate-500" />
              <div className="border-t border-primary-100 pt-2">
                <MoneyLine label={t("Marge brute")} value={fmtMoney(a.soldMargin)}
                  color={a.soldMargin >= 0 ? "text-emerald-600" : "text-red-500"} big />
              </div>
              <p className="pt-1 text-[11px] leading-snug text-slate-400">
                {t("Écart entre le prix de vente encaissé et le prix d'achat des mêmes articles.")}
              </p>
            </div>
          </Panel>

          <Panel icon={Wallet} tone="bg-gradient-to-br from-rose-500 to-red-600" title={t("Où part l'argent")}>
            <div className="space-y-1.5">
              <MoneyLine label={`${t("Achats de la période")} (${a.purchases.length})`} value={fmtMoney(a.purchasesPaid)} />
              <MoneyLine label={`${t("Dépenses")} (${a.expenses.length})`} value={fmtMoney(a.expensesTotal)} />
              <MoneyLine label={t("Paiements employés")} value={fmtMoney(a.wagesTotal)} />
              <div className="border-t border-primary-100 pt-2">
                <MoneyLine label={t("Total décaissé")} value={fmtMoney(a.cashedOut)} color="text-red-500" big />
                <MoneyLine label={t("Engagé (achats facturés)")} value={fmtMoney(a.purchasesTotal)} color="text-slate-500" />
              </div>
            </div>
          </Panel>

          <Panel icon={Users} title={t("Meilleurs clients")}>
            {a.topClients.length === 0
              ? <p className="text-xs text-slate-400">{t("Aucun client sur la période")}</p>
              : a.topClients.slice(0, 7).map((c) => (
                <RankBar key={c.key} label={c.name} value={c.amount} max={a.topClients[0].amount}
                  sub={`${c.count} ${t("opération(s)")}`} />
              ))}
          </Panel>

          <Panel icon={UserX} tone="bg-gradient-to-br from-amber-500 to-orange-600"
            title={t("Dettes clients")} extra={<Badge color="red">{fmtMoney(a.clientDebtTotal)}</Badge>}>
            <div className="max-h-64 space-y-1 overflow-y-auto pe-1">
              {a.clientDebts.length === 0 && <p className="text-xs text-emerald-600">{t("Aucune dette client")}</p>}
              {a.clientDebts.slice(0, 12).map((c) => (
                <MoneyLine key={c.id} label={`${c.name}${c.phone ? ` · ${c.phone}` : ""}`}
                  value={fmtMoney(c.rest)} color="text-red-500" />
              ))}
            </div>
          </Panel>

          <Panel icon={Truck} tone="bg-gradient-to-br from-fuchsia-500 to-purple-600"
            title={t("Dettes fournisseurs")} extra={<Badge color="red">{fmtMoney(a.supplierDebtTotal)}</Badge>}>
            <div className="max-h-64 space-y-1 overflow-y-auto pe-1">
              {a.supplierDebts.length === 0 && <p className="text-xs text-emerald-600">{t("Aucune dette fournisseur")}</p>}
              {a.supplierDebts.slice(0, 12).map((s, i) => (
                <MoneyLine key={i} label={s.name} value={fmtMoney(s.rest)} color="text-red-500" />
              ))}
            </div>
          </Panel>
        </div>

        {/* ===== stock health ===== */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel icon={Boxes} title={t("Santé du stock")}>
            <div className="space-y-1.5">
              <MoneyLine label={t("Valeur du stock (achat)")} value={fmtMoney(a.stockValue)} big />
              <MoneyLine label={t("Valeur du stock (vente)")} value={fmtMoney(a.stockRetail)} color="text-emerald-600" />
              <MoneyLine label={t("Marge potentielle")} value={fmtMoney(a.stockRetail - a.stockValue)} color="text-primary-600" />
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-primary-100 pt-3 text-center">
                <div>
                  <p className="font-mono text-lg font-bold text-primary-900">{db.products.length}</p>
                  <p className="text-[10px] text-slate-400">{t("Produits")}</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-accent-600">{a.lowStock.length}</p>
                  <p className="text-[10px] text-slate-400">{t("Stock faible")}</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-red-500">{a.outOfStock.length}</p>
                  <p className="text-[10px] text-slate-400">{t("Rupture")}</p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel icon={AlertTriangle} tone="bg-gradient-to-br from-amber-500 to-orange-600"
            title={t("À réapprovisionner")} extra={<Badge color="orange">{a.lowStock.length}</Badge>}>
            <div className="max-h-64 space-y-1 overflow-y-auto pe-1">
              {a.lowStock.length === 0 && <p className="text-xs text-emerald-600">{t("Aucune alerte")}</p>}
              {a.lowStock.slice(0, 12).map((p) => (
                <MoneyLine key={p.id} label={p.name} value={`${p.qtyCurrent} / ${p.minQty}`}
                  color={Number(p.qtyCurrent) <= 0 ? "text-red-500" : "text-accent-600"} />
              ))}
            </div>
          </Panel>

          <Panel icon={CalendarClock} tone="bg-gradient-to-br from-sky-500 to-blue-600"
            title={t("Expirations proches")} extra={<Badge color="blue">{a.expiring.length}</Badge>}>
            <div className="max-h-64 space-y-1 overflow-y-auto pe-1">
              {a.expiring.length === 0 && <p className="text-xs text-emerald-600">{t("Aucune expiration dans les 30 jours")}</p>}
              {a.expiring.slice(0, 12).map((p) => (
                <MoneyLine key={p.id} label={p.name} value={fmtDate(p.expiration, lang)}
                  color={p.expiration <= todayISO() ? "text-red-500" : "text-sky-600"} />
              ))}
            </div>
          </Panel>
        </div>

        {/* ===== the two flows, side by side ===== */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel icon={Receipt} title={t("Ventes de la période")} extra={<Badge>{a.sales.length}</Badge>}>
            <div className="max-h-72 space-y-1 overflow-y-auto pe-1">
              {a.sales.length === 0 && <p className="text-xs text-slate-400">{t("Aucune vente pour le moment")}</p>}
              {a.sales.slice(0, 15).map((s) => {
                const { total, rest } = saleAmounts(s);
                return (
                  <MoneyLine key={s.id}
                    label={`${s.ref} · ${clientNameOf(db, s.clientId, t)}`}
                    value={`${fmtMoney(total)}${rest > 0 ? ` (−${fmtMoney(rest)})` : ""}`}
                    color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
                );
              })}
            </div>
          </Panel>

          <Panel icon={HardHat} tone="grad-accent" title={t("Réparations de la période")}
            extra={<Badge color="orange">{a.repairs.length}</Badge>}>
            <div className="max-h-72 space-y-1 overflow-y-auto pe-1">
              {a.repairs.length === 0 && <p className="text-xs text-slate-400">{t("Aucun résultat")}</p>}
              {a.repairs.slice(0, 15).map((r) => {
                const { total, rest } = repairAmounts(r);
                return (
                  <MoneyLine key={r.id}
                    label={`${clientNameOf(db, r.clientId, t)} · ${fmtDate(r.dateIn, lang)}`}
                    value={`${fmtMoney(total)}${rest > 0 ? ` (−${fmtMoney(rest)})` : ""}`}
                    color={rest > 0 ? "text-red-500" : "text-emerald-600"} />
                );
              })}
            </div>
          </Panel>
        </div>

        {revenue === 0 && a.cashedOut === 0 && (
          <Empty text={t("Aucune activité sur cette période")} />
        )}
      </motion.div>
    </div>
  );
}
