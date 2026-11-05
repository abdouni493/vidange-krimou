// ===== Interface « Inventaire » — comptage physique & écarts =====
//
// Le parcours complet :
//   1. ASSISTANT — on choisit la date, le nom se déduit tout seul
//      (`invnt-05-11-2026`), puis on sélectionne les produits et on saisit ce
//      qu'on a trouvé en rayon. Entrée passe au produit suivant.
//   2. BROUILLON — un comptage peut être laissé en plan et repris plus tard ;
//      « Terminer le comptage » le fige.
//   3. COMPARAISON — le comptage est confronté au stock du moment : chaque
//      produit reçoit son DÉCALAGE, valorisé au prix d'achat.
//   4. CORRECTION — sur confirmation, et APRÈS une sauvegarde des quantités
//      d'avant, le stock est aligné sur le comptage. Réversible.
//
// Chaque étape s'imprime : feuille de comptage et rapport des écarts en A4.

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardList, Plus, Calendar, CheckCircle2, ArrowRight, ArrowLeft, X, Printer,
  Scale, AlertTriangle, TrendingDown, TrendingUp, Save, ShieldCheck, Layers, PackageCheck,
  FileText, Undo2, Ban, Boxes, ListChecks, RotateCcw, Eye, Pencil, Trash2, Check,
} from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate, inRange, presetRange, esc, docHead, printHTML, productMatches } from "../store";
import {
  STATUS_META, inventaireRefFor, countedQtyOf, countedValueOf, buildComparison,
  correctionDeltas, buildBackup, applyCorrection, restoreBackup, fmtQty, round,
} from "../lib/inventaire";
import {
  Btn, IconBtn, Modal, Confirm, Field, Input, Textarea, Select, SearchBox, Empty,
  PageHeader, CardGrid, itemRise, Badge, Seg, ViewToggle, Steps, StepPane,
} from "../components/ui";

const catName = (db, id) => db.categories.find((c) => c.id === id)?.name || "";

// ---------------------------------------------------------------- page

export default function Inventaire() {
  const { db, update, t, lang, can, currentUser } = useApp();
  const inventaires = db.inventaires || [];
  const author = currentUser?.name || "Admin";

  const [q, setQ] = useState("");
  const [preset, setPreset] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("table");
  const [wizard, setWizard] = useState(null);       // { editing }
  const [viewing, setViewing] = useState(null);     // id
  const [comparing, setComparing] = useState(null); // id
  const [toDelete, setToDelete] = useState(null);
  const [flash, setFlash] = useState("");
  const notify = (m) => { setFlash(m); setTimeout(() => setFlash(""), 2600); };

  const canCreate = can("inventaire", "create");
  const canEdit = can("inventaire", "edit");
  const canDelete = can("inventaire", "delete");
  const canCorrect = can("inventaire", "correct");
  const canPrint = can("inventaire", "print");

  const range = presetRange(preset);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...inventaires]
      .filter((i) =>
        (!s || [i.ref, i.notes, i.createdBy].some((v) => String(v || "").toLowerCase().includes(s))
          || (i.lines || []).some((l) => String(l.productName || "").toLowerCase().includes(s)))
        && (statusFilter === "all" || i.status === statusFilter)
        && inRange(i.date, range.from, range.to))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [inventaires, q, statusFilter, range.from, range.to]);

  const stats = useMemo(() => {
    const compared = inventaires.filter((i) => i.comparison);
    return {
      total: inventaires.length,
      drafts: inventaires.filter((i) => i.status === "draft").length,
      pending: inventaires.filter((i) => i.status === "completed").length,
      loss: compared.reduce((s, i) => s + (i.comparison.lossValue || 0), 0),
      gain: compared.reduce((s, i) => s + (i.comparison.gainValue || 0), 0),
    };
  }, [inventaires]);

  /** Confronte le comptage au stock ACTUEL ; l'inventaire passe à « comparé ». */
  const runComparison = (inv) => {
    const comparison = buildComparison(inv, db.products, author);
    update((d) => {
      const x = d.inventaires.find((i) => i.id === inv.id);
      if (!x) return;
      x.comparison = comparison;
      if (x.status !== "corrected") x.status = "compared";
    });
    setComparing(inv.id);
    notify(comparison.productsWithEcart > 0
      ? `${comparison.productsWithEcart} ${t("produit(s) avec décalage")} — ${fmtMoney(comparison.lossValue)} ${t("de manquants")}`
      : t("Aucun décalage — le stock correspond au comptage"));
  };

  const del = () => {
    update((d) => { d.inventaires = d.inventaires.filter((i) => i.id !== toDelete.id); });
    notify(`${t("Inventaire supprimé")} — ${toDelete.ref}`);
  };

  const dir = lang === "ar" ? "rtl" : "ltr";
  const printCount = (inv) => printCountSheet(inv, db.settings, t, dir);
  const printReport = (inv) => printComparisonSheet(inv, db.settings, t, dir);

  const actions = (inv) => (
    <div className="flex justify-end gap-1">
      <IconBtn icon={Eye} title={t("Voir tout le détail")} onClick={() => setViewing(inv.id)} />
      {canEdit && inv.status !== "corrected" && (
        <IconBtn icon={Pencil} title={t("Modifier le comptage")} onClick={() => setWizard({ editing: inv })} />
      )}
      {canPrint && <IconBtn icon={Printer} title={t("Imprimer la feuille de comptage")} onClick={() => printCount(inv)} />}
      <IconBtn icon={Scale} variant="soft"
        title={inv.comparison ? t("Voir la comparaison") : t("Comparer au stock de l'application")}
        onClick={() => (inv.comparison ? setComparing(inv.id) : runComparison(inv))} />
      {inv.comparison && (
        <IconBtn icon={ListChecks} title={t("Rapport des écarts")} onClick={() => setComparing(inv.id)} />
      )}
      {canDelete && <IconBtn icon={Trash2} variant="danger" title={t("Supprimer")} onClick={() => setToDelete(inv)} />}
    </div>
  );

  const viewingInv = inventaires.find((i) => i.id === viewing);
  const comparingInv = inventaires.find((i) => i.id === comparing);

  return (
    <>
      <PageHeader
        title={t("Inventaire")}
        subtitle={t("Comptage physique du stock & écarts")}
        actions={canCreate && <Btn icon={Plus} onClick={() => setWizard({ editing: null })}>{t("Nouvel inventaire")}</Btn>}
      />

      {flash && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700">
          <Check size={16} /> {flash}
        </motion.div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={ClipboardList} label={t("Inventaires")} value={stats.total} tone="violet" />
        <Stat icon={FileText} label={t("Brouillons")} value={stats.drafts} tone="orange" sub={t("comptage à reprendre")} />
        <Stat icon={Scale} label={t("À comparer")} value={stats.pending} tone="blue" sub={t("comptage figé")} />
        <Stat icon={TrendingDown} label={t("Manquants")} value={fmtMoney(stats.loss)} tone="red" sub={t("au prix d'achat")} />
        <Stat icon={TrendingUp} label={t("Surplus")} value={fmtMoney(stats.gain)} tone="green" sub={t("au prix d'achat")} />
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <SearchBox value={q} onChange={setQ} placeholder={t("Nom d'inventaire, produit ou agent…")} />
        </div>
        <div className="w-auto min-w-[170px]">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t("Tous les états")}</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{t(m.label)}</option>)}
          </Select>
        </div>
        <Seg value={preset} onChange={setPreset} options={[
          { value: "all", label: t("Tout") }, { value: "today", label: t("Aujourd'hui") },
          { value: "week", label: t("7 jours") }, { value: "month", label: t("30 jours") },
        ]} />
        <div className="ms-auto"><ViewToggle view={view === "table" ? "table" : "cards"} onChange={(v) => setView(v)} /></div>
      </div>

      {!filtered.length ? (
        <Empty text={t("Aucun inventaire. Créez-en un pour compter ce qu'il y a réellement en rayon et le confronter au stock de l'application.")} />
      ) : view === "cards" ? (
        <CardGrid>
          {filtered.map((inv) => {
            const meta = STATUS_META[inv.status] || STATUS_META.draft;
            return (
              <motion.div key={inv.id} variants={itemRise} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-primary-900">{inv.ref}</h3>
                    <p className="text-[11px] text-slate-400">
                      {fmtDate(inv.date, lang)}{inv.createdBy ? ` • ${t("par")} ${inv.createdBy}` : ""}
                    </p>
                  </div>
                  <Badge color={meta.color}>{t(meta.label)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniBox label={t("Produits")} value={(inv.lines || []).length} />
                  <MiniBox label={t("Manquants")} tone="red" value={inv.comparison ? fmtMoney(inv.comparison.lossValue) : "—"} />
                  <MiniBox label={t("Surplus")} tone="green" value={inv.comparison ? fmtMoney(inv.comparison.gainValue) : "—"} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-primary-50 pt-3">
                  <span className="text-[11px] font-bold text-amber-700">{t("Compté")} {fmtMoney(countedValueOf(inv))}</span>
                  {actions(inv)}
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="thead bg-primary-50/60">
              <tr>
                <th>{t("Inventaire")}</th><th>{t("Date")}</th><th className="text-end">{t("Produits")}</th>
                <th className="text-end">{t("Valeur comptée")}</th><th className="text-end">{t("Manquants")}</th>
                <th className="text-end">{t("Surplus")}</th><th>{t("État")}</th><th className="text-end">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const meta = STATUS_META[inv.status] || STATUS_META.draft;
                return (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-bold text-primary-900">{inv.ref}</div>
                      <div className="text-[11px] text-slate-400">{inv.createdBy ? `${t("par")} ${inv.createdBy}` : "—"}</div>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(inv.date, lang)}</td>
                    <td className="text-end font-mono">{(inv.lines || []).length}</td>
                    <td className="text-end font-mono text-amber-700">{fmtMoney(countedValueOf(inv))}</td>
                    <td className="text-end font-mono text-red-600">{inv.comparison ? fmtMoney(inv.comparison.lossValue) : "—"}</td>
                    <td className="text-end font-mono text-green-600">{inv.comparison ? fmtMoney(inv.comparison.gainValue) : "—"}</td>
                    <td><Badge color={meta.color}>{t(meta.label)}</Badge></td>
                    <td>{actions(inv)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {wizard && (
        <InventaireWizard initial={wizard.editing} author={author} onClose={() => setWizard(null)} notify={notify} />
      )}

      {viewingInv && (
        <InventaireDetail inv={viewingInv} canPrint={canPrint}
          onClose={() => setViewing(null)}
          onPrint={() => printCount(viewingInv)}
          onCompare={() => { setViewing(null); runComparison(viewingInv); }} />
      )}

      {comparingInv?.comparison && (
        <ComparisonModal inv={comparingInv} author={author} canCorrect={canCorrect} canPrint={canPrint}
          notify={notify}
          onClose={() => setComparing(null)}
          onPrint={() => printReport(comparingInv)}
          onRecompare={() => runComparison(comparingInv)} />
      )}

      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={del}
        title={t("Supprimer l'inventaire")}
        message={`${toDelete?.ref || ""} — ${(toDelete?.lines || []).length} ${t("produit(s) comptés.")} `
          + (toDelete?.status === "corrected"
            ? t("Le stock a déjà été corrigé à partir de cet inventaire : le supprimer ne remet PAS les quantités d'avant. Utilisez « Annuler la correction » depuis le rapport des écarts.")
            : t("Le comptage et son rapport d'écarts seront perdus. Le stock n'est pas modifié."))} />
    </>
  );
}

// ---------------------------------------------------------------- petits blocs

const TONES = {
  violet: "from-primary-500 to-primary-700",
  orange: "from-amber-400 to-orange-500",
  blue: "from-sky-500 to-blue-600",
  red: "from-rose-500 to-red-600",
  green: "from-emerald-500 to-green-600",
};

function Stat({ icon: Icon, label, value, sub, tone = "violet" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lift ${TONES[tone]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate font-mono text-base font-extrabold text-primary-900">{value}</p>
        {sub && <p className="truncate text-[10.5px] text-slate-400">{sub}</p>}
      </div>
    </motion.div>
  );
}

function MiniBox({ label, value, tone }) {
  const cls = tone === "red" ? "bg-red-50 text-red-600" : tone === "green" ? "bg-green-50 text-green-600" : "bg-primary-50/60 text-primary-900";
  return (
    <div className={`rounded-xl p-2 text-center ${cls}`}>
      <p className="text-[9px] font-bold uppercase text-slate-400">{label}</p>
      <p className="font-mono text-xs font-extrabold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------- assistant

function InventaireWizard({ initial, author, onClose, notify }) {
  const { db, update, t } = useApp();
  const products = db.products;

  const [step, setStep] = useState(initial ? 1 : 0);
  const [date, setDate] = useState(initial?.date || todayISO());
  const [notes, setNotes] = useState(initial?.notes || "");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  // Lignes retenues, dans l'ordre de sélection : productId -> valeur saisie
  const [lines, setLines] = useState(() => {
    const m = new Map();
    (initial?.lines || []).forEach((l) => {
      if (products.some((p) => p.id === l.productId)) m.set(l.productId, String(l.countedQty ?? ""));
    });
    return m;
  });

  const ref = useMemo(() => inventaireRefFor(date), [date]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const visible = useMemo(() => products.filter((p) =>
    (catFilter === "all" || p.categoryId === catFilter) && productMatches(p, query)), [products, query, catFilter]);

  const ordered = useMemo(() => [...lines.keys()].map((id) => byId.get(id)).filter(Boolean), [lines, byId]);

  const toggle = (p) => setLines((prev) => {
    const n = new Map(prev);
    n.has(p.id) ? n.delete(p.id) : n.set(p.id, "");
    return n;
  });
  const addMany = (list) => setLines((prev) => {
    const n = new Map(prev);
    list.forEach((p) => { if (!n.has(p.id)) n.set(p.id, ""); });
    return n;
  });
  const removeMany = (list) => setLines((prev) => {
    const n = new Map(prev);
    list.forEach((p) => n.delete(p.id));
    return n;
  });
  const setValue = (id, v) => setLines((prev) => new Map(prev).set(id, v));

  // Entrée passe au champ suivant ; sur le dernier, revient au premier.
  const qtyRefs = useRef({});
  const focusNext = (idx) => {
    const next = ordered[idx + 1] || ordered[0];
    const el = next && qtyRefs.current[next.id];
    el?.focus(); el?.select();
  };

  const filled = ordered.filter((p) => String(lines.get(p.id)).trim() !== "").length;
  const countedValue = ordered.reduce((s, p) => s + (Number(lines.get(p.id)) || 0) * (Number(p.purchasePrice) || 0), 0);

  const save = (status) => {
    if (!ordered.length) return notify(t("Sélectionnez au moins un produit à compter"));
    const now = new Date().toISOString();
    const inv = {
      id: initial?.id || uid(),
      ref,
      date,
      status,
      lines: ordered.map((p) => ({
        productId: p.id,
        productName: p.name,
        barcode: p.barcode || "",
        categoryId: p.categoryId || "",
        categoryName: catName(db, p.categoryId),
        countedQty: round(Math.max(0, Number(lines.get(p.id)) || 0)),
        purchasePrice: Number(p.purchasePrice) || 0,
        salePrice: Number(p.salePrice) || 0,
        systemQtyAtEntry: round(p.qtyCurrent),
      })),
      notes: notes.trim(),
      createdBy: initial?.createdBy || author,
      completedAt: status === "completed" ? now : (initial?.completedAt || ""),
      // Un comptage modifié invalide son ancien rapport : il faudra le relancer.
      comparison: null,
      correctedAt: "",
      correctedBy: "",
      backup: null,
      createdAt: initial?.createdAt || todayISO(),
    };
    update((d) => {
      if (!Array.isArray(d.inventaires)) d.inventaires = [];
      const i = d.inventaires.findIndex((x) => x.id === inv.id);
      if (i >= 0) d.inventaires[i] = { ...d.inventaires[i], ...inv };
      else d.inventaires.unshift(inv);
    });
    notify(status === "draft" ? `${t("Brouillon enregistré")} — ${ref}` : `${t("Inventaire terminé")} — ${ref}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} width="max-w-4xl"
      title={initial ? `${t("Modifier")} ${initial.ref}` : t("Nouvel inventaire")}
      footer={<>
        <div className="me-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
          <span className="uppercase tracking-widest text-slate-400">{ordered.length} {t("produit(s)")}</span>
          {step === 1 && <span className="text-primary-700">{filled} {t("saisi(s)")}</span>}
          {step === 1 && <span className="text-amber-700">{t("Valeur")} {fmtMoney(countedValue)}</span>}
        </div>
        {step === 1 && <Btn variant="ghost" icon={ArrowLeft} onClick={() => setStep(0)}>{t("Retour")}</Btn>}
        <Btn variant="ghost" onClick={onClose}>{t("Annuler")}</Btn>
        {step === 0 ? (
          <Btn onClick={() => setStep(1)}>{t("Étape suivante")} <ArrowRight size={16} /></Btn>
        ) : (
          <>
            <Btn variant="soft" icon={Save} onClick={() => save("draft")}>{t("Enregistrer le brouillon")}</Btn>
            <Btn icon={CheckCircle2} onClick={() => save("completed")}>{t("Terminer le comptage")}</Btn>
          </>
        )}
      </>}>
      <Steps labels={[t("Date et nom"), t("Produits et quantités")]} current={step} />

      {step === 0 && (
        <StepPane step={0}>
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
              <Calendar size={20} className="mt-0.5 shrink-0 text-primary-600" />
              <div>
                <p className="text-sm font-bold text-primary-800">{t("La date décide du nom")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {t("Le nom d'un inventaire n'est jamais tapé à la main : il se déduit de la date du comptage, toujours sous la même forme.")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("Date de l'inventaire")} required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t("Nom généré automatiquement")}>
                <div className="input flex items-center bg-primary-50 font-mono font-bold tracking-wide text-primary-800">{ref}</div>
              </Field>
            </div>
            <Field label={t("Observations (optionnel)")} hint={t("Rayon concerné, incident, présence d'un contrôleur…")}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Précisions sur ce comptage…")} />
            </Field>
          </div>
        </StepPane>
      )}

      {step === 1 && (
        <StepPane step={1}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-primary-100 bg-primary-50/40 px-4 py-3">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary-700">{ref}</span>
              <span className="text-xs text-slate-500">{fmtDate(date)}</span>
              <span className="ms-auto text-xs text-slate-500">
                {t("Astuce : appuyez sur Entrée pour passer au produit suivant.")}
              </span>
            </div>

            {/* Sélection */}
            <div className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
              <div className="space-y-3 border-b border-primary-100 bg-primary-50/30 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[220px] flex-1">
                    <SearchBox value={query} onChange={setQuery} placeholder={t("Rechercher un produit par nom ou code-barres…")} />
                  </div>
                  <div className="min-w-[180px]">
                    <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                      <option value="all">{t("Toutes les catégories")}</option>
                      {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="soft" icon={Boxes} className="!px-3 !py-2 text-xs" onClick={() => addMany(products)}>
                    {t("Tous les produits")} ({products.length})
                  </Btn>
                  <Btn variant="outline" icon={Layers} className="!px-3 !py-2 text-xs" disabled={!visible.length} onClick={() => addMany(visible)}>
                    {t("Ajouter les produits affichés")} ({visible.length})
                  </Btn>
                  <Btn variant="outline" icon={X} className="!px-3 !py-2 text-xs" disabled={!visible.length} onClick={() => removeMany(visible)}>
                    {t("Retirer les produits affichés")}
                  </Btn>
                  <Btn variant="ghost" icon={Ban} className="!px-3 !py-2 text-xs" disabled={!ordered.length} onClick={() => setLines(new Map())}>
                    {t("Tout désélectionner")}
                  </Btn>
                </div>
              </div>

              <div className="max-h-64 divide-y divide-primary-50 overflow-y-auto">
                {!visible.length ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">{t("Aucun produit ne correspond.")}</p>
                ) : visible.map((p) => {
                  const on = lines.has(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start transition-colors ${on ? "bg-primary-50/70" : "hover:bg-slate-50"}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-primary-600 bg-primary-600" : "border-slate-300 bg-white"}`}>
                        {on && <Check size={13} className="text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-primary-900">{p.name}</span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {catName(db, p.categoryId) || t("Sans catégorie")}{p.barcode ? ` · ${p.barcode}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-end font-mono text-[11px] text-slate-400">
                        <span className="block">{t("Stock")} {fmtQty(p.qtyCurrent)}</span>
                        <span className="block">{t("Achat")} {fmtMoney(p.purchasePrice)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Saisie des quantités */}
            <div className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
              <div className="flex flex-wrap items-center gap-3 border-b border-primary-100 bg-primary-50/30 px-4 py-3">
                <PackageCheck size={16} className="shrink-0 text-primary-700" />
                <p className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wider text-primary-800">
                  {t("Quantités trouvées en rayon")} — {filled} / {ordered.length} {t("saisie(s)")}
                </p>
                <span className="font-mono text-xs font-bold text-amber-700">{fmtMoney(countedValue)}</span>
              </div>
              {!ordered.length ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">
                  {t("Sélectionnez des produits ci-dessus pour saisir ce que vous avez compté.")}
                </p>
              ) : (
                <div className="max-h-[420px] divide-y divide-primary-50 overflow-y-auto">
                  {ordered.map((p, idx) => {
                    const qty = Number(lines.get(p.id)) || 0;
                    return (
                      <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl grad-primary text-xs font-bold text-white">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-primary-900">{p.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{t("Stock application")} {fmtQty(p.qtyCurrent)}</p>
                        </div>
                        <input
                          ref={(el) => { qtyRefs.current[p.id] = el; }}
                          type="number" min="0" step="0.01" inputMode="decimal" placeholder="0"
                          value={lines.get(p.id)}
                          onChange={(e) => setValue(p.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(idx); } }}
                          className="input w-28 text-end font-mono font-bold" />
                        <span className="w-24 shrink-0 text-end font-mono text-xs font-bold text-amber-700">
                          {fmtMoney(qty * (Number(p.purchasePrice) || 0))}
                        </span>
                        <IconBtn icon={X} variant="danger" title={t("Retirer ce produit")} onClick={() => toggle(p)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </StepPane>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- détail

function InventaireDetail({ inv, canPrint, onClose, onPrint, onCompare }) {
  const { t, lang } = useApp();
  const meta = STATUS_META[inv.status] || STATUS_META.draft;
  const lines = inv.lines || [];
  const totalSale = lines.reduce((s, l) => s + countedQtyOf(l) * (Number(l.salePrice) || 0), 0);
  return (
    <Modal open onClose={onClose} width="max-w-3xl" title={`${inv.ref} — ${t("inventaire du")} ${fmtDate(inv.date, lang)}`}
      footer={<>
        <div className="me-auto flex items-center gap-2">
          <Badge color={meta.color}>{t(meta.label)}</Badge>
          <span className="hidden text-[11px] text-slate-400 sm:inline">{t(meta.hint)}</span>
        </div>
        {canPrint && <Btn variant="outline" icon={Printer} onClick={onPrint}>{t("Imprimer")}</Btn>}
        <Btn icon={Scale} onClick={onCompare}>{t("Comparer au stock")}</Btn>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniBox label={t("Produits comptés")} value={lines.length} />
          <MiniBox label={t("Valeur (prix d'achat)")} value={fmtMoney(countedValueOf(inv))} />
          <MiniBox label={t("Valeur (prix de vente)")} tone="green" value={fmtMoney(totalSale)} />
          <MiniBox label={t("Établi par")} value={inv.createdBy || "—"} />
        </div>
        {inv.notes && (
          <div className="rounded-xl bg-primary-50/50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">{t("Observations")}</p>
            <p className="text-sm text-slate-600">{inv.notes}</p>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-primary-100">
          <table className="w-full min-w-[560px]">
            <thead className="thead bg-primary-50/60">
              <tr>
                <th>{t("Produit")}</th><th>{t("Catégorie")}</th><th className="text-end">{t("Quantité comptée")}</th>
                <th className="text-end">{t("Prix d'achat")}</th><th className="text-end">{t("Valeur")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>
                    <div className="font-bold text-primary-900">{l.productName}</div>
                    {l.barcode && <div className="font-mono text-[11px] text-slate-400">{l.barcode}</div>}
                  </td>
                  <td className="text-slate-500">{l.categoryName || "—"}</td>
                  <td className="text-end font-mono">{fmtQty(l.countedQty)}</td>
                  <td className="text-end font-mono text-slate-500">{fmtMoney(l.purchasePrice)}</td>
                  <td className="text-end font-mono font-bold text-amber-700">{fmtMoney(countedQtyOf(l) * (Number(l.purchasePrice) || 0))}</td>
                </tr>
              ))}
              <tr className="bg-primary-50/60">
                <td colSpan={4} className="font-bold text-primary-800">{t("TOTAL COMPTÉ")}</td>
                <td className="text-end font-mono font-bold text-amber-700">{fmtMoney(countedValueOf(inv))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- comparaison & correction

function ComparisonModal({ inv, author, canCorrect, canPrint, notify, onClose, onPrint, onRecompare }) {
  const { db, update, t, lang } = useApp();
  const cmp = inv.comparison;
  const [confirmCorrect, setConfirmCorrect] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [filter, setFilter] = useState("all");

  const deltas = useMemo(() => correctionDeltas(cmp, db.products), [cmp, db.products]);
  const rows = useMemo(() => (cmp.lines || [])
    .filter((l) => filter === "all" || l.kind === filter)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)), [cmp, filter]);
  const count = (k) => (cmp.lines || []).filter((l) => l.kind === k).length;
  const corrected = inv.status === "corrected";

  /** 1. sauvegarde des quantités d'avant  2. alignement  3. statut « corrigé ». */
  const correct = () => {
    const backup = buildBackup(deltas);
    update((d) => {
      applyCorrection(d, deltas);
      const x = d.inventaires.find((i) => i.id === inv.id);
      if (!x) return;
      x.status = "corrected";
      x.correctedAt = new Date().toISOString();
      x.correctedBy = author;
      x.backup = backup;
    });
    notify(deltas.length
      ? `${t("Stock corrigé")} — ${deltas.length} ${t("produit(s) alignés sur le comptage")}`
      : t("Aucun décalage à corriger"));
  };

  const restore = () => {
    let n = 0;
    update((d) => {
      n = restoreBackup(d, inv.backup);
      const x = d.inventaires.find((i) => i.id === inv.id);
      if (!x) return;
      x.status = "compared";
      x.correctedAt = "";
      x.correctedBy = "";
      x.backup = null;
    });
    notify(`${t("Correction annulée")} — ${n} ${t("produit(s) remis à leur quantité d'avant")}`);
  };

  const fmtLine = (d) => `${d.product.name} : ${fmtQty(d.before)} → ${fmtQty(d.after)} (${d.ecart > 0 ? "+" : "−"}${fmtQty(Math.abs(d.ecart))})`;

  return (
    <>
      <Modal open onClose={onClose} width="max-w-4xl"
        title={`${t("Écarts")} — ${inv.ref} · ${t("comparé le")} ${fmtDate(String(cmp.at).slice(0, 10), lang)}${cmp.by ? ` ${t("par")} ${cmp.by}` : ""}`}
        footer={<>
          <div className="me-auto">
            {corrected ? <Badge color="green">{t("Stock corrigé")}</Badge> : <Badge color="orange">{t("Stock non corrigé")}</Badge>}
          </div>
          <Btn variant="ghost" icon={RotateCcw} onClick={onRecompare}>{t("Recomparer")}</Btn>
          {canPrint && <Btn variant="outline" icon={Printer} onClick={onPrint}>{t("Imprimer le rapport")}</Btn>}
          {canCorrect && !corrected && (
            <Btn icon={ShieldCheck} disabled={!deltas.length} onClick={() => setConfirmCorrect(true)}>{t("Corriger le stock")}</Btn>
          )}
          {canCorrect && corrected && inv.backup && (
            <Btn variant="soft" icon={Undo2} onClick={() => setConfirmRestore(true)}>{t("Annuler la correction")}</Btn>
          )}
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BigBox tone="red" icon={TrendingDown} label={t("Manquants (pertes)")} value={fmtMoney(cmp.lossValue)}
              sub={`${count("perte")} ${t("produit(s)")} · ${fmtQty(cmp.lossQty)} ${t("unité(s)")}`} />
            <BigBox tone="green" icon={TrendingUp} label={t("Surplus (gains)")} value={fmtMoney(cmp.gainValue)}
              sub={`${count("gain")} ${t("produit(s)")} · ${fmtQty(cmp.gainQty)} ${t("unité(s)")}`} />
            <BigBox tone={cmp.netValue >= 0 ? "violet" : "red"} icon={Scale} label={t("Impact net")} value={fmtMoney(cmp.netValue)}
              sub={`${cmp.productsWithEcart} ${t("décalage(s) sur")} ${cmp.productsCounted} ${t("produit(s)")}`} />
          </div>

          {corrected && (
            <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-bold text-green-800">
                  {t("Stock corrigé le")} {fmtDate(String(inv.correctedAt || "").slice(0, 10), lang)}{inv.correctedBy ? ` ${t("par")} ${inv.correctedBy}` : ""}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-green-700">
                  {(inv.backup?.lines || []).length} {t("produit(s) ont été alignés sur le comptage. Les quantités d'avant sont sauvegardées : « Annuler la correction » les remet en place.")}
                </p>
              </div>
            </div>
          )}

          <Seg value={filter} onChange={setFilter} options={[
            { value: "all", label: `${t("Tous")} (${(cmp.lines || []).length})` },
            { value: "perte", label: `${t("Manquants")} (${count("perte")})` },
            { value: "gain", label: `${t("Surplus")} (${count("gain")})` },
            { value: "exact", label: `${t("Conformes")} (${count("exact")})` },
          ]} />

          <div className="overflow-x-auto rounded-xl border border-primary-100">
            <table className="w-full min-w-[680px]">
              <thead className="thead bg-primary-50/60">
                <tr>
                  <th>{t("Produit")}</th><th className="text-end">{t("Compté")}</th><th className="text-end">{t("Application")}</th>
                  <th className="text-end">{t("Décalage")}</th><th className="text-end">{t("Prix d'achat")}</th>
                  <th className="text-end">{t("Valeur")}</th><th>{t("État")}</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (
                  <tr><td colSpan={7} className="text-center text-slate-400">{t("Aucune ligne dans ce filtre.")}</td></tr>
                ) : rows.map((l) => (
                  <tr key={l.productId} className={l.kind === "perte" ? "bg-red-50/40" : l.kind === "gain" ? "bg-green-50/40" : ""}>
                    <td>
                      <div className="font-bold text-primary-900">{l.productName}</div>
                      <div className="text-[11px] text-slate-400">{l.categoryName || "—"}</div>
                    </td>
                    <td className="text-end font-mono">{fmtQty(l.countedQty)}</td>
                    <td className="text-end font-mono text-slate-500">{fmtQty(l.systemQty)}</td>
                    <td className={`text-end font-mono font-bold ${l.ecart < 0 ? "text-red-600" : l.ecart > 0 ? "text-green-600" : "text-slate-400"}`}>
                      {l.ecart > 0 ? "+" : ""}{fmtQty(l.ecart)}
                    </td>
                    <td className="text-end font-mono text-slate-500">{fmtMoney(l.purchasePrice)}</td>
                    <td className={`text-end font-mono font-bold ${l.value < 0 ? "text-red-600" : l.value > 0 ? "text-green-600" : "text-slate-400"}`}>
                      {fmtMoney(Math.abs(l.value))}
                    </td>
                    <td>
                      {l.kind === "perte" ? <Badge color="red">{t("Perte")}</Badge>
                        : l.kind === "gain" ? <Badge color="green">{t("Surplus")}</Badge>
                          : <Badge color="gray">{t("Conforme")}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] italic text-slate-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t("Le décalage est la quantité comptée MOINS la quantité annoncée par l'application. Tant que le stock n'est pas corrigé, ce rapport constate l'écart, il ne le règle pas.")}
          </p>
        </div>
      </Modal>

      <Confirm open={confirmCorrect} onClose={() => setConfirmCorrect(false)} onConfirm={correct}
        title={t("Corriger le stock")} confirmLabel={t("Corriger le stock")}
        message={`${deltas.length} ${t("produit(s) vont passer à la quantité comptée.")} ${t("Manquants")} : ${fmtMoney(cmp.lossValue)} — ${t("Surplus")} : ${fmtMoney(cmp.gainValue)}. `
          + `${t("Une SAUVEGARDE des quantités actuelles est prise avant l'écriture : vous pourrez revenir en arrière.")} `
          + deltas.slice(0, 8).map(fmtLine).join(" · ") + (deltas.length > 8 ? " …" : "")} />

      <Confirm open={confirmRestore} onClose={() => setConfirmRestore(false)} onConfirm={restore}
        title={t("Annuler la correction")} confirmLabel={t("Remettre les quantités")}
        message={`${(inv.backup?.lines || []).length} ${t("produit(s) retrouveront la quantité qu'ils avaient avant la correction. L'inventaire repasse à « comparé » et son rapport d'écarts est conservé.")}`} />
    </>
  );
}

function BigBox({ tone, icon: Icon, label, value, sub }) {
  const bg = tone === "red" ? "from-red-800 to-red-600" : tone === "green" ? "from-emerald-800 to-emerald-600" : "from-primary-800 to-primary-600";
  return (
    <div className={`rounded-2xl bg-gradient-to-br p-4 text-white ${bg}`}>
      <div className="flex items-center gap-2 opacity-85">
        <Icon size={16} />
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-extrabold">{value}</p>
      <p className="mt-0.5 text-[11px] opacity-80">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------- impression A4

function printCountSheet(inv, settings, t, dir) {
  const lines = inv.lines || [];
  const rows = lines.map((l, i) => `
    <tr><td>${i + 1}</td><td><b>${esc(l.productName)}</b>${l.barcode ? `<br/><span class="muted">${esc(l.barcode)}</span>` : ""}</td>
    <td>${esc(l.categoryName || "—")}</td><td style="text-align:end">${esc(fmtQty(l.countedQty))}</td>
    <td style="text-align:end">${esc(fmtMoney(l.purchasePrice))}</td>
    <td style="text-align:end"><b>${esc(fmtMoney(countedQtyOf(l) * (Number(l.purchasePrice) || 0)))}</b></td></tr>`).join("");
  printHTML(`${t("Inventaire")} ${inv.ref}`, `
    ${docHead(settings, t("Feuille d'inventaire"), `${inv.ref} — ${fmtDate(inv.date)}`, t)}
    <p class="muted">${esc(t("État"))} : <b>${esc(t((STATUS_META[inv.status] || STATUS_META.draft).label))}</b>
      ${inv.createdBy ? ` · ${esc(t("Établi par"))} : <b>${esc(inv.createdBy)}</b>` : ""}</p>
    ${inv.notes ? `<p class="muted">${esc(t("Observations"))} : ${esc(inv.notes)}</p>` : ""}
    <table><thead><tr><th>#</th><th>${esc(t("Produit"))}</th><th>${esc(t("Catégorie"))}</th>
      <th style="text-align:end">${esc(t("Quantité comptée"))}</th><th style="text-align:end">${esc(t("Prix d'achat"))}</th>
      <th style="text-align:end">${esc(t("Valeur"))}</th></tr></thead>
      <tbody>${rows}
      <tr><td colspan="5"><b>${esc(t("TOTAL COMPTÉ"))}</b></td><td style="text-align:end"><b>${esc(fmtMoney(countedValueOf(inv)))}</b></td></tr>
      </tbody></table>
    <div style="display:flex;justify-content:space-between;margin-top:40px">
      <div>${esc(t("Signature du compteur"))}<br/><br/>____________________</div>
      <div>${esc(t("Signature du responsable"))}<br/><br/>____________________</div>
    </div>`, dir);
}

function printComparisonSheet(inv, settings, t, dir) {
  const c = inv.comparison;
  if (!c) return;
  const kind = (k) => (k === "perte" ? t("Perte") : k === "gain" ? t("Surplus") : t("Conforme"));
  const rows = [...c.lines].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).map((l) => `
    <tr><td><b>${esc(l.productName)}</b></td><td style="text-align:end">${esc(fmtQty(l.countedQty))}</td>
    <td style="text-align:end">${esc(fmtQty(l.systemQty))}</td>
    <td style="text-align:end;color:${l.ecart < 0 ? "#dc2626" : l.ecart > 0 ? "#059669" : "#6b7280"}"><b>${l.ecart > 0 ? "+" : ""}${esc(fmtQty(l.ecart))}</b></td>
    <td style="text-align:end">${esc(fmtMoney(l.purchasePrice))}</td>
    <td style="text-align:end">${esc(fmtMoney(Math.abs(l.value)))}</td><td>${esc(kind(l.kind))}</td></tr>`).join("");
  printHTML(`${t("Rapport des écarts")} ${inv.ref}`, `
    ${docHead(settings, t("Rapport des écarts d'inventaire"), `${inv.ref} — ${fmtDate(inv.date)}`, t)}
    <table><tbody>
      <tr><th>${esc(t("Manquants (pertes)"))}</th><td style="color:#dc2626"><b>${esc(fmtMoney(c.lossValue))}</b></td>
          <th>${esc(t("Surplus (gains)"))}</th><td style="color:#059669"><b>${esc(fmtMoney(c.gainValue))}</b></td>
          <th>${esc(t("Impact net"))}</th><td><b>${esc(fmtMoney(c.netValue))}</b></td></tr>
    </tbody></table>
    <p class="muted">${esc(String(c.productsWithEcart))} ${esc(t("décalage(s) sur"))} ${esc(String(c.productsCounted))} ${esc(t("produit(s)"))}
      · ${inv.status === "corrected" ? esc(t("Stock corrigé")) : esc(t("Stock non corrigé"))}</p>
    <table><thead><tr><th>${esc(t("Produit"))}</th><th style="text-align:end">${esc(t("Compté"))}</th>
      <th style="text-align:end">${esc(t("Application"))}</th><th style="text-align:end">${esc(t("Décalage"))}</th>
      <th style="text-align:end">${esc(t("Prix d'achat"))}</th><th style="text-align:end">${esc(t("Valeur"))}</th><th>${esc(t("État"))}</th></tr></thead>
      <tbody>${rows}</tbody></table>`, dir);
}
