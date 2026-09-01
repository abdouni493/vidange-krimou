import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Trash2, Printer, Shuffle, Barcode as BarcodeIcon, Check,
  Package, CheckCheck, Copy,
} from "lucide-react";
import { useApp } from "../context";
import { uid, todayISO, fmtMoney, fmtDate } from "../store";
import {
  randomEan13, normalizeEan13, isValidEan13, onlyDigits, DEFAULT_PREFIX,
  LABEL_SIZES as SIZES, DEFAULT_LABEL_OPTS as DEFAULT_OPTS, printLabels,
} from "../barcode";
import {
  Btn, IconBtn, Field, Input, Select, SearchBox, Confirm, Empty,
  PageHeader, CardGrid, itemRise, Badge, Seg, BarcodeLabel as LabelPreview,
} from "../components/ui";

export default function Barcodes() {
  const { db, update, t, lang, can } = useApp();
  const library = db.barcodes || [];

  const [form, setForm] = useState({ name: "", code: randomEan13(), price: "", productId: "" });
  const [syncProduct, setSyncProduct] = useState(true);
  const [q, setQ] = useState("");
  const [size, setSize] = useState("medium");
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const [copies, setCopies] = useState({});   // entryId -> number of labels
  const [picked, setPicked] = useState([]);   // selected entry ids
  const [confirm, setConfirm] = useState(null);
  const [flash, setFlash] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleOpt = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const notify = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 2200); };

  const codeValid = isValidEan13(form.code);
  const product = db.products.find((p) => p.id === form.productId);

  // Picking a stock product pre-fills the label. A product whose stored barcode isn't a
  // valid EAN-13 (legacy short codes) keeps it as a prefix and gets the rest generated,
  // so the printed code stays recognisable instead of being zero-padded.
  const pickProduct = (e) => {
    const p = db.products.find((x) => x.id === e.target.value);
    if (!p) { setForm((f) => ({ ...f, productId: "" })); return; }
    setForm({
      productId: p.id,
      name: p.name,
      price: p.salePrice || p.purchasePrice || "",
      code: isValidEan13(p.barcode)
        ? onlyDigits(p.barcode)
        : randomEan13(onlyDigits(p.barcode) || DEFAULT_PREFIX),
    });
  };

  const shuffle = () => setForm((f) => ({ ...f, code: randomEan13() }));

  const addToLibrary = () => {
    if (!form.name.trim()) return notify(t("Le nom du produit est obligatoire"));
    const entry = {
      id: uid(),
      name: form.name.trim(),
      code: normalizeEan13(form.code),
      price: Number(form.price) || 0,
      productId: form.productId || "",
      createdAt: todayISO(),
    };
    update((d) => {
      if (!Array.isArray(d.barcodes)) d.barcodes = [];
      d.barcodes.unshift(entry);
      // Optionally write the generated code back onto the stock product
      if (syncProduct && entry.productId) {
        const p = d.products.find((x) => x.id === entry.productId);
        if (p) p.barcode = entry.code;
      }
    });
    setPicked((s) => [...s, entry.id]);
    setForm({ name: "", code: randomEan13(), price: "", productId: "" });
    notify(t("Code-barres ajouté"));
  };

  const remove = (id) => {
    update((d) => { d.barcodes = (d.barcodes || []).filter((b) => b.id !== id); });
    setPicked((s) => s.filter((x) => x !== id));
  };

  const setCopy = (id, n) => setCopies((c) => ({ ...c, [id]: Math.max(1, Math.min(200, Number(n) || 1)) }));
  const copyOf = (id) => copies[id] || 1;
  const togglePick = (id) =>
    setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return library;
    return library.filter((b) => b.name.toLowerCase().includes(s) || b.code.includes(s));
  }, [library, q]);

  const selected = library.filter((b) => picked.includes(b.id));
  const totalLabels = selected.reduce((n, b) => n + copyOf(b.id), 0);

  // ---- print ----
  const print = (entries) =>
    printLabels((entries || []).map((e) => ({ ...e, copies: copyOf(e.id) })), {
      size, opts,
      store: db.settings.name || "",
      title: t("Étiquettes code-barres"),
      dir: lang === "ar" ? "rtl" : "ltr",
    });

  const canCreate = can("barcodes", "create");
  const canPrint = can("barcodes", "print");
  const canDelete = can("barcodes", "delete");

  const previewEntry = { name: form.name || t("Nom du produit"), code: form.code, price: form.price };

  return (
    <>
      <PageHeader
        title={t("Codes-barres")}
        subtitle={t("Générez des codes-barres EAN-13 et imprimez vos étiquettes")}
        actions={
          canPrint && (
            <Btn icon={Printer} onClick={() => print(selected)} disabled={!selected.length}>
              {t("Imprimer la sélection")}{selected.length ? ` (${totalLabels})` : ""}
            </Btn>
          )
        }
      />

      {flash && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <Check size={16} /> {flash}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
        {/* ===== Generator ===== */}
        {canCreate && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="card h-fit p-5 xl:sticky xl:top-24">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="rounded-xl grad-primary p-2 text-white shadow-lift"><BarcodeIcon size={18} /></div>
              <h2 className="text-base font-bold text-primary-900">{t("Générer un code-barres")}</h2>
            </div>

            <div className="space-y-4">
              <Field label={t("Produit du stock")} hint={t("Optionnel — pré-remplit le nom et le prix")}>
                <Select value={form.productId} onChange={pickProduct}>
                  <option value="">{t("Produit libre (saisie manuelle)")}</option>
                  {db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>

              <Field label={t("Nom du produit")} required>
                <Input value={form.name} onChange={set("name")} placeholder={t("Ex : Filtre à huile")} />
              </Field>

              <Field label={t("Code-barres (EAN-13)")}>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input value={form.code} onChange={set("code")} inputMode="numeric" className="input font-mono" />
                  </div>
                  <Btn variant="soft" icon={Shuffle} type="button" onClick={shuffle} title={t("Générer aléatoirement")}>
                    {t("Aléatoire")}
                  </Btn>
                </div>
                <div className="mt-1.5">
                  {codeValid
                    ? <Badge color="green"><Check size={11} /> {t("Code valide")}</Badge>
                    : <Badge color="orange">{t("Sera corrigé automatiquement")} → <span className="font-mono">{normalizeEan13(form.code)}</span></Badge>}
                </div>
              </Field>

              <Field label={t("Prix de vente")} hint={t("Laissez vide pour ne pas l'imprimer")}>
                <Input type="number" min="0" value={form.price} onChange={set("price")} />
              </Field>

              {product && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-primary-100 bg-primary-50/40 px-3.5 py-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-600"
                    checked={syncProduct} onChange={() => setSyncProduct((v) => !v)} />
                  <span className="text-[12.5px] leading-snug text-slate-600">
                    {t("Enregistrer ce code sur le produit du stock")}
                    <span className="block text-[11px] text-slate-400">
                      {t("Code actuel")} : <span className="font-mono">{product.barcode || "—"}</span>
                    </span>
                  </span>
                </label>
              )}

              <div>
                <p className="label">{t("Aperçu")}</p>
                <div className="rounded-xl bg-primary-50/50 p-3">
                  <LabelPreview entry={previewEntry} opts={opts} />
                </div>
              </div>

              <Btn icon={Plus} className="w-full" onClick={addToLibrary}>{t("Ajouter à la bibliothèque")}</Btn>
            </div>
          </motion.div>
        )}

        {/* ===== Library ===== */}
        <div className={canCreate ? "" : "xl:col-span-2"}>
          <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[200px] flex-1">
              <SearchBox value={q} onChange={setQ} placeholder={t("Rechercher un code ou un produit...")} />
            </div>
            <Seg
              value={size}
              onChange={setSize}
              options={Object.entries(SIZES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <div className="card mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Contenu de l'étiquette")}</span>
            {[
              ["showName", t("Nom")],
              ["showPrice", t("Prix")],
              ["showCode", t("Chiffres")],
              ["showStore", t("Nom du magasin")],
              ["cutLines", t("Bordures de découpe")],
            ].map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
                <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={opts[k]} onChange={() => toggleOpt(k)} />
                {label}
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl grad-primary px-4 py-3 text-white shadow-lift">
              <p className="text-sm font-semibold">
                {selected.length} {t("code(s) sélectionné(s)")} · {totalLabels} {t("étiquette(s) à imprimer")}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPicked([])}
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 cursor-pointer">
                  {t("Tout désélectionner")}
                </button>
                {canPrint && (
                  <button onClick={() => print(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:brightness-95 cursor-pointer">
                    <Printer size={14} /> {t("Imprimer")}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {!filtered.length ? (
            <Empty text={q ? t("Aucun résultat") : t("Aucun code-barres généré pour l'instant")} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400">
                  {filtered.length} {t("code(s)")}
                </p>
                <button onClick={() => setPicked(filtered.map((b) => b.id))}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800 cursor-pointer">
                  <CheckCheck size={14} /> {t("Tout sélectionner")}
                </button>
              </div>

              <CardGrid cols="sm:grid-cols-2 2xl:grid-cols-3">
                {filtered.map((b) => {
                  const on = picked.includes(b.id);
                  const linked = db.products.find((p) => p.id === b.productId);
                  return (
                    <motion.div key={b.id} variants={itemRise}
                      className={`card overflow-hidden transition-colors ${on ? "ring-2 ring-primary-400" : ""}`}>
                      <div className="flex items-start justify-between gap-2 border-b border-primary-50 px-4 py-3">
                        <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                            checked={on} onChange={() => togglePick(b.id)} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-primary-900">{b.name}</span>
                            <span className="block font-mono text-[11px] text-slate-400">{b.code}</span>
                          </span>
                        </label>
                        <div className="flex shrink-0 gap-1">
                          <IconBtn icon={Copy} title={t("Copier le code")}
                            onClick={() => { navigator.clipboard?.writeText(b.code); notify(t("Code copié")); }} />
                          {canPrint && <IconBtn icon={Printer} title={t("Imprimer")} onClick={() => print([b])} />}
                          {canDelete && (
                            <IconBtn icon={Trash2} variant="danger" title={t("Supprimer")}
                              onClick={() => setConfirm(b)} />
                          )}
                        </div>
                      </div>

                      <div className="bg-primary-50/40 px-4 py-3">
                        <LabelPreview entry={b} opts={opts} />
                      </div>

                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">{t("Copies")}</span>
                          <input type="number" min="1" max="200" value={copyOf(b.id)}
                            onChange={(e) => setCopy(b.id, e.target.value)}
                            className="input h-9 w-20 px-2 py-1 text-center text-sm" />
                        </div>
                        <div className="text-end">
                          {Number(b.price) > 0 && (
                            <p className="font-mono text-sm font-bold text-primary-900">{fmtMoney(b.price)}</p>
                          )}
                          <p className="text-[11px] text-slate-400">
                            {linked ? <span className="inline-flex items-center gap-1"><Package size={11} /> {t("Lié au stock")}</span> : fmtDate(b.createdAt, lang)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </CardGrid>
            </>
          )}
        </div>
      </div>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove(confirm.id)}
        title={t("Supprimer ce code-barres ?")}
        message={confirm ? `${confirm.name} — ${confirm.code}` : ""}
      />
    </>
  );
}
