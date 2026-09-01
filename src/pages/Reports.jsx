import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Wallet, ShoppingCart, Receipt, TrendingUp, UserX, Truck,
  HardHat, Boxes, Landmark, Printer,
} from "lucide-react";
import { useApp } from "../context";
import {
  dayOffset, todayISO, fmtMoney, fmtDate, paidOf, inRange, printHTML, esc,
  saleAmounts, clientNameOf,
} from "../store";
import { Btn, Field, Input, PageHeader, MoneyLine, Badge, listStagger, itemRise } from "../components/ui";

function Section({ icon: Icon, title, children, extra }) {
  return (
    <motion.div variants={itemRise} className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg grad-primary p-1.5 text-white"><Icon size={14} /></div>
        <h3 className="text-sm font-bold text-primary-900">{title}</h3>
        {extra && <span className="ms-auto">{extra}</span>}
      </div>
      {children}
    </motion.div>
  );
}

export default function Reports() {
  const { db, t, lang } = useApp();
  const [from, setFrom] = useState(dayOffset(-30));
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState(null);

  const generate = () => {
    const repairs = db.repairs.filter((r) => inRange(r.dateIn, from, to));
    const finalized = repairs.filter((r) => r.status === "finalized");
    const pending = repairs.filter((r) => r.status === "pending");
    const canceled = repairs.filter((r) => r.status === "canceled");
    const active = repairs.filter((r) => r.status !== "canceled");

    // Repairs / appointments
    const repairsTotal = active.reduce((s, r) => s + Number(r.total), 0);
    const repairsPaid = db.repairs.filter((r) => r.status !== "canceled")
      .flatMap((r) => r.payments || []).filter((p) => inRange(p.date, from, to))
      .reduce((s, p) => s + Number(p.amount), 0);

    // Counter sales (POS)
    const sales = (db.sales || []).filter((s) => inRange(s.date, from, to));
    const posTotal = sales.reduce((s, x) => s + saleAmounts(x).total, 0);
    const posPaid = (db.sales || []).flatMap((s) => s.payments || [])
      .filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + Number(p.amount), 0);
    const posItems = sales.reduce((n, s) => n + (s.items || []).reduce((m, it) => m + (Number(it.qty) || 0), 0), 0);
    const posDiscount = sales.reduce((s, x) => s + saleAmounts(x).discount, 0);

    // Both streams together — this is the figure the "chiffre d'affaires" tile shows
    const salesTotal = repairsTotal + posTotal;
    const salesPaid = repairsPaid + posPaid;

    const purchases = db.purchases.filter((a) => inRange(a.date, from, to));
    const purchTotal = purchases.reduce((s, a) => s + Number(a.total), 0);
    const purchPaid = db.purchases.flatMap((a) => a.payments || [])
      .filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + Number(p.amount), 0);

    const expenses = db.expenses.filter((e) => inRange(e.date, from, to));
    const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const expByCat = {};
    expenses.forEach((e) => {
      const name = db.expenseCategories.find((c) => c.id === e.categoryId)?.name || "—";
      expByCat[name] = (expByCat[name] || 0) + Number(e.amount);
    });

    const caisse = db.caisse.filter((x) => inRange(x.date, from, to));
    const caisseByCat = {};
    caisse.forEach((x) => {
      const name = db.caisseCategories.find((c) => c.id === x.categoryId)?.name || "—";
      const key = `${x.type === "deposit" ? t("Dépôt") : t("Retrait")} · ${name}`;
      caisseByCat[key] = (caisseByCat[key] || 0) + Number(x.amount) * (x.type === "deposit" ? 1 : -1);
    });

    const workerPays = db.workers.flatMap((w) =>
      (w.payments || []).filter((p) => inRange(p.date, from, to))
        .map((p) => ({ ...p, worker: w.fullName }))
    );
    const workerTotal = workerPays.reduce((s, p) => s + Number(p.amount), 0);

    const clientDebts = db.clients.map((c) => {
      const rest = db.repairs
        .filter((r) => r.clientId === c.id && r.status !== "canceled")
        .reduce((s, r) => s + Math.max(0, Number(r.total) - paidOf(r.payments)), 0)
        + (db.sales || []).filter((s) => s.clientId === c.id)
          .reduce((s, x) => s + saleAmounts(x).rest, 0);
      return { name: c.name, phone: c.phone, rest };
    }).filter((x) => x.rest > 0);

    const supplierDebts = db.suppliers.map((s) => {
      const rest = db.purchases
        .filter((a) => a.supplierId === s.id)
        .reduce((sum, a) => sum + Math.max(0, Number(a.total) - paidOf(a.payments)), 0);
      return { name: s.name, rest };
    }).filter((x) => x.rest > 0);

    const stockValue = db.products.reduce((s, p) => s + Number(p.qtyCurrent) * Number(p.purchasePrice), 0);
    const lowStock = db.products.filter((p) => Number(p.qtyCurrent) <= Number(p.minQty));

    const gain = salesPaid - purchPaid - expTotal - workerTotal;

    setReport({
      finalized, pending, canceled, salesTotal, salesPaid,
      repairsTotal, repairsPaid, sales, posTotal, posPaid, posItems, posDiscount,
      purchases, purchTotal, purchPaid, expenses, expTotal, expByCat,
      caisseByCat, workerPays, workerTotal, clientDebts, supplierDebts,
      stockValue, lowStock, gain,
      clientDebtTotal: clientDebts.reduce((s, x) => s + x.rest, 0),
      supplierDebtTotal: supplierDebts.reduce((s, x) => s + x.rest, 0),
    });
  };

  const print = () => {
    if (!report) return;
    const line = (l, v) => `<tr><td>${l}</td><td style="text-align:end">${v}</td></tr>`;
    printHTML(`${t("Rapport de la période")} ${from} → ${to}`, `
      <div class="head"><div><h1>${db.settings.name}</h1><p class="muted">${db.settings.address || ""}</p></div>
      <div style="text-align:end"><span class="badge">${t("Rapports")}</span><p class="muted">${fmtDate(from)} → ${fmtDate(to)}</p></div></div>
      <h2>${t("Résumé")}</h2>
      <table>
        ${line(t("Chiffre d'affaires"), fmtMoney(report.salesPaid))}
        ${line(`&nbsp;&nbsp;${t("dont ventes comptoir")}`, fmtMoney(report.posPaid))}
        ${line(`&nbsp;&nbsp;${t("dont réparations")}`, fmtMoney(report.repairsPaid))}
        ${line(t("Achats de la période"), fmtMoney(report.purchPaid))}
        ${line(t("Dépenses"), fmtMoney(report.expTotal))}
        ${line(t("Paiements employés"), fmtMoney(report.workerTotal))}
        ${line(`<b>${t("Gains (bénéfice)")}</b>`, `<b>${fmtMoney(report.gain)}</b>`)}
        ${line(t("Dettes clients"), fmtMoney(report.clientDebtTotal))}
        ${line(t("Dettes fournisseurs"), fmtMoney(report.supplierDebtTotal))}
        ${line(t("Valeur du stock"), fmtMoney(report.stockValue))}
      </table>
      <h2>${t("Ventes comptoir")}</h2>
      <table>
        <tr><th>${t("Référence")}</th><th style="text-align:end">${t("Total")}</th></tr>
        ${report.sales.map((s) => line(esc(`${s.ref} — ${clientNameOf(db, s.clientId, t)}`), fmtMoney(saleAmounts(s).total))).join("")
          || line(t("Aucune vente pour le moment"), "—")}
      </table>
      <h2>${t("Dépenses par catégorie")}</h2>
      <table>${Object.entries(report.expByCat).map(([k, v]) => line(k, fmtMoney(v))).join("")}</table>
      <h2>${t("Dettes clients")}</h2>
      <table>${report.clientDebts.map((c) => line(esc(`${c.name} (${c.phone})`), fmtMoney(c.rest))).join("")}</table>
      <h2>${t("Dettes fournisseurs")}</h2>
      <table>${report.supplierDebts.map((s) => line(esc(s.name), fmtMoney(s.rest))).join("")}</table>
    `);
  };

  return (
    <div>
      <PageHeader title={t("Rapports")} subtitle={t("Analysez votre activité sur une période")} />

      <div className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        <Field label={t("Date de début")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-44" />
        </Field>
        <Field label={t("Date de fin")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-44" />
        </Field>
        <Btn icon={BarChart3} onClick={generate}>{t("Générer le rapport")}</Btn>
        {report && <Btn variant="soft" icon={Printer} onClick={print}>{t("Imprimer")}</Btn>}
      </div>

      {!report ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="py-16 text-center text-sm text-slate-400">
          {t("Sélectionnez une période et cliquez sur Générer")}
        </motion.p>
      ) : (
        <motion.div key={`${from}-${to}-${Date.now() % 1}`} variants={listStagger} initial="hidden" animate="show" className="space-y-5">
          {/* Summary tiles */}
          <motion.div variants={itemRise} className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              [t("Chiffre d'affaires"), fmtMoney(report.salesPaid), "grad-primary", Wallet],
              [t("Achats de la période"), fmtMoney(report.purchPaid), "bg-gradient-to-br from-sky-500 to-blue-600", ShoppingCart],
              [t("Dépenses"), fmtMoney(report.expTotal + report.workerTotal), "grad-accent", Receipt],
              [t("Gains (bénéfice)"), fmtMoney(report.gain), report.gain >= 0 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-rose-500 to-red-600", TrendingUp],
            ].map(([label, value, grad, Icon], i) => (
              <div key={i} className={`rounded-2xl ${grad} p-5 text-white shadow-lift`}>
                <Icon size={19} className="mb-2 opacity-80" />
                <p className="text-[11px] opacity-75">{label}</p>
                <p className="font-mono text-lg font-bold">{value}</p>
              </div>
            ))}
          </motion.div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section icon={Wallet} title={t("Réparations & RDV")}
              extra={<Badge>{report.finalized.length + report.pending.length + report.canceled.length}</Badge>}>
              <div className="space-y-1.5">
                <MoneyLine label={`${report.finalized.length} ${t("finalisées")}`} value={fmtMoney(report.finalized.reduce((s, r) => s + Number(r.total), 0))} />
                <MoneyLine label={`${report.pending.length} ${t("en attente")}`} value={fmtMoney(report.pending.reduce((s, r) => s + Number(r.total), 0))} />
                <MoneyLine label={`${report.canceled.length} ${t("annulées")}`} value="—" />
                <div className="border-t border-primary-100 pt-2">
                  <MoneyLine label={t("Total")} value={fmtMoney(report.repairsTotal)} big />
                  <MoneyLine label={t("Payé")} value={fmtMoney(report.repairsPaid)} color="text-emerald-600" />
                </div>
              </div>
            </Section>

            <Section icon={Receipt} title={t("Ventes comptoir")} extra={<Badge>{report.sales.length}</Badge>}>
              <div className="space-y-1.5">
                {report.sales.slice(0, 6).map((s) => (
                  <MoneyLine key={s.id} label={`${s.ref} · ${clientNameOf(db, s.clientId, t)}`}
                    value={fmtMoney(saleAmounts(s).total)} />
                ))}
                {report.sales.length === 0 && <p className="text-xs text-slate-400">{t("Aucune vente pour le moment")}</p>}
                <div className="border-t border-primary-100 pt-2">
                  <MoneyLine label={`${report.posItems} ${t("articles vendus")}`} value={fmtMoney(report.posTotal)} big />
                  <MoneyLine label={t("Payé")} value={fmtMoney(report.posPaid)} color="text-emerald-600" />
                  {report.posDiscount > 0 && (
                    <MoneyLine label={t("Réductions accordées")} value={fmtMoney(report.posDiscount)} color="text-accent-600" />
                  )}
                </div>
              </div>
            </Section>

            <Section icon={ShoppingCart} title={t("Achats de la période")} extra={<Badge>{report.purchases.length}</Badge>}>
              <div className="space-y-1.5">
                {report.purchases.slice(0, 6).map((a) => (
                  <MoneyLine key={a.id} label={`${a.ref} · ${db.suppliers.find((s) => s.id === a.supplierId)?.name || "—"}`} value={fmtMoney(a.total)} />
                ))}
                <div className="border-t border-primary-100 pt-2">
                  <MoneyLine label={t("Total")} value={fmtMoney(report.purchTotal)} big />
                  <MoneyLine label={t("Payé")} value={fmtMoney(report.purchPaid)} color="text-emerald-600" />
                </div>
              </div>
            </Section>

            <Section icon={Receipt} title={t("Dépenses par catégorie")} extra={<Badge color="orange">{report.expenses.length}</Badge>}>
              <div className="space-y-1.5">
                {Object.entries(report.expByCat).map(([k, v]) => <MoneyLine key={k} label={k} value={fmtMoney(v)} />)}
                {Object.keys(report.expByCat).length === 0 && <p className="text-xs text-slate-400">{t("Aucune dépense")}</p>}
                <div className="border-t border-primary-100 pt-2">
                  <MoneyLine label={t("Total")} value={fmtMoney(report.expTotal)} color="text-accent-600" big />
                </div>
              </div>
            </Section>

            <Section icon={Landmark} title={t("Caisse par catégorie")}>
              <div className="space-y-1.5">
                {Object.entries(report.caisseByCat).map(([k, v]) => (
                  <MoneyLine key={k} label={k} value={fmtMoney(Math.abs(v))} color={v >= 0 ? "text-emerald-600" : "text-red-500"} />
                ))}
                {Object.keys(report.caisseByCat).length === 0 && <p className="text-xs text-slate-400">{t("Aucune transaction")}</p>}
              </div>
            </Section>

            <Section icon={UserX} title={t("Dettes clients")} extra={<Badge color="red">{fmtMoney(report.clientDebtTotal)}</Badge>}>
              <div className="space-y-1.5">
                {report.clientDebts.map((c, i) => <MoneyLine key={i} label={`${c.name} · ${c.phone}`} value={fmtMoney(c.rest)} color="text-red-500" />)}
                {report.clientDebts.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </Section>

            <Section icon={Truck} title={t("Dettes fournisseurs")} extra={<Badge color="red">{fmtMoney(report.supplierDebtTotal)}</Badge>}>
              <div className="space-y-1.5">
                {report.supplierDebts.map((s, i) => <MoneyLine key={i} label={s.name} value={fmtMoney(s.rest)} color="text-red-500" />)}
                {report.supplierDebts.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </Section>

            <Section icon={HardHat} title={t("Paiements employés")} extra={<Badge>{report.workerPays.length}</Badge>}>
              <div className="space-y-1.5">
                {report.workerPays.map((p) => <MoneyLine key={p.id} label={`${p.worker} · ${fmtDate(p.date, lang)}`} value={fmtMoney(p.amount)} />)}
                <div className="border-t border-primary-100 pt-2">
                  <MoneyLine label={t("Total")} value={fmtMoney(report.workerTotal)} big />
                </div>
              </div>
            </Section>

            <Section icon={Boxes} title={t("Valeur du stock")}>
              <div className="space-y-1.5">
                <MoneyLine label={t("Valeur du stock")} value={fmtMoney(report.stockValue)} big />
                <p className="pt-1 text-xs font-semibold text-slate-500">{t("Produits en stock faible")} ({report.lowStock.length})</p>
                {report.lowStock.map((p) => (
                  <MoneyLine key={p.id} label={p.name} value={`${p.qtyCurrent} / ${p.minQty}`} color="text-red-500" />
                ))}
              </div>
            </Section>
          </div>
        </motion.div>
      )}
    </div>
  );
}
