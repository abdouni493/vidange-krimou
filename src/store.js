// ===== Data layer: the database lives in Supabase (PostgreSQL) =====
//
// The UI keeps the whole database in memory as one document and mutates it, so
// persistence is a single read on start-up and a debounced write on change
// (see `context.jsx`). `lib/remote.js` translates that document to and from the
// relational tables described in `supabase/schema.sql`.
//
// Identity is handled by Supabase Auth; only the language preference stays in
// localStorage — it is a per-browser setting, not business data.

import { fetchAll, pushAll, resetAll } from "./lib/remote";

export const LANG_KEY = "garage_lang_v1";

// L'écran de connexion s'affiche avant toute session, et la RLS ne laisse rien
// lire à un visiteur anonyme : le logo et le nom du garage sont donc gardés ici
// à chaque chargement, pour être affichés immédiatement à la visite suivante.
export const BRANDING_KEY = "garage_branding_v1";

const cleanBranding = (s) => ({
  logo: s?.logo || "",
  name: s?.name || "",
  description: s?.description || "",
});

/** Dernière identité connue du garage, ou `null` sur un poste qui n'en a jamais vu. */
export function readBranding() {
  try {
    const raw = localStorage.getItem(BRANDING_KEY);
    const b = raw ? JSON.parse(raw) : null;
    return b && typeof b === "object" ? cleanBranding(b) : null;
  } catch {
    return null;
  }
}

/** Mémorise logo + nom + description ; renvoie la forme retenue. */
export function saveBranding(settings) {
  const b = cleanBranding(settings);
  try {
    localStorage.setItem(BRANDING_KEY, JSON.stringify(b));
  } catch {
    /* navigation privée, quota plein — l'affichage retombe sur les valeurs par défaut */
  }
  return b;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- date helpers ----
const pad = (n) => String(n).padStart(2, "0");
export const toISODate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISODate(new Date());

export const dayOffset = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
};

export const fmtMoney = (n) =>
  `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0))} DA`;

export const fmtDate = (iso, lang = "fr") => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "ar" ? "ar-DZ" : "fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

export const paidOf = (payments = []) =>
  payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

export const inRange = (iso, from, to) => {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

export const presetRange = (preset) => {
  const today = todayISO();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") return { from: dayOffset(-7), to: today };
  if (preset === "month") return { from: dayOffset(-30), to: today };
  return { from: "", to: "" };
};

// ---- permissions catalog ----
export const PAGES = [
  "dashboard", "repairs", "services", "stock", "barcodes", "purchases", "pos",
  "sales", "clients", "suppliers", "workers", "expenses", "caisse", "reports",
  "analytics", "settings",
];

export const PAGE_ACTIONS = {
  dashboard: ["view"],
  repairs: ["view", "create", "edit", "delete", "pay", "finalize", "cancel"],
  services: ["view", "create", "edit", "delete"],
  stock: ["view", "create", "edit", "delete"],
  barcodes: ["view", "create", "delete", "print"],
  purchases: ["view", "create", "edit", "delete", "pay", "print"],
  pos: ["view", "create"],
  sales: ["view", "edit", "delete", "pay", "print"],
  clients: ["view", "create", "edit", "delete", "history"],
  suppliers: ["view", "create", "edit", "delete", "history"],
  workers: ["view", "create", "edit", "delete", "permissions", "advance", "absence", "payment"],
  expenses: ["view", "create", "edit", "delete"],
  caisse: ["view", "create"],
  reports: ["view"],
  analytics: ["view"],
  settings: ["view", "edit"],
};

// ---- empty database ----
// Mirrors the server's `emptyDoc()`. Used as a local fallback so the interface
// still renders (read-only) if the server cannot be reached.
export const COLLECTIONS = [
  "users", "clients", "services", "categories", "products", "suppliers",
  "purchases", "sales", "repairs", "roles", "workers", "expenseCategories",
  "expenses", "caisseCategories", "caisse", "barcodes",
];

export function emptyDB() {
  const db = {};
  for (const name of COLLECTIONS) db[name] = [];
  db.counters = { purchase: 1, sale: 1 };
  db.settings = {
    logo: "", name: "", description: "", email: "", phone: "", address: "",
    nif: "", nis: "", article: "", rc: "",
    discount: { ...DEFAULT_DISCOUNT },
  };
  db.createdAt = new Date().toISOString();
  return db;
}

// Records written before a collection existed shouldn't crash the pages that read it.
export function normalizeDB(db) {
  const base = emptyDB();
  const out = { ...base, ...db };
  for (const name of COLLECTIONS) if (!Array.isArray(out[name])) out[name] = [];
  out.settings = { ...base.settings, ...(db?.settings || {}) };
  out.settings.discount = cleanDiscountRule(out.settings.discount);
  out.counters = { ...base.counters, ...(db?.counters || {}) };
  return out;
}

// ---- Supabase API ----
//
// `snapshot` is the last document known to be stored. Every write sends only
// the difference against it: that keeps saves small, and it keeps them legal
// for a worker whose permissions cover just one screen — pushing rows they
// never touched would be refused by row level security.
let snapshot = null;

export async function fetchDB() {
  const doc = normalizeDB(await fetchAll());
  snapshot = structuredClone(doc);
  return doc;
}

export async function pushDB(db) {
  // `pushAll` returns the document as the database now holds it — including the
  // row ranks it assigned — which is exactly what the next diff must compare to.
  snapshot = await pushAll(snapshot || emptyDB(), db);
}

export async function resetRemoteDB() {
  const doc = normalizeDB(await resetAll());
  snapshot = structuredClone(doc);
  return doc;
}

/** Forget the cached snapshot — used when signing out or switching account. */
export function clearSnapshot() {
  snapshot = null;
}

// ---- discount ceilings (point of sale) ----
//
// Un plafond dit, pour un article vendu, combien de dinars peuvent au maximum
// être retirés de son prix de vente. Le réglage global couvre tout le
// catalogue ; un article peut porter le sien, qui prend alors le pas — les
// autres articles continuent de suivre le global.
//
//   { enabled: bool, mode: "amount" | "percent", value: number }
//
//   "amount"  -> `value` dinars au maximum, par article vendu
//   "percent" -> `value` % du prix de vente au maximum, par article vendu

export const DEFAULT_DISCOUNT = { enabled: true, mode: "amount", value: 0 };

/** Forme sûre d'une règle, quelle que soit la façon dont elle a été saisie. */
export const cleanDiscountRule = (r) => ({
  enabled: r?.enabled !== false,
  mode: r?.mode === "percent" ? "percent" : "amount",
  value: Math.max(0, Number(r?.value) || 0),
});

/**
 * Un article porte-t-il son propre plafond ?
 *
 * `{}` — la valeur par défaut en base — signifie « pas de réglage propre » :
 * c'est ce qui distingue un article laissé au global d'un article dont
 * l'administrateur a explicitement fixé le plafond, fût-il à zéro.
 */
export const hasOwnDiscountRule = (p) =>
  !!p?.discountRule && typeof p.discountRule === "object" && p.discountRule.mode !== undefined;

/** Plafond global du garage. */
export const globalDiscountRule = (db) => cleanDiscountRule(db?.settings?.discount);

/** Plafond qui s'applique réellement à cet article. */
export const discountRuleFor = (db, product) =>
  hasOwnDiscountRule(product) ? cleanDiscountRule(product.discountRule) : globalDiscountRule(db);

/** Traduction d'une règle en dinars, pour un prix unitaire donné. */
export const ruleCapPerUnit = (rule, unitPrice) => {
  const r = cleanDiscountRule(rule);
  if (!r.enabled) return 0;
  const price = Math.max(0, Number(unitPrice) || 0);
  const cap = r.mode === "percent" ? (price * r.value) / 100 : r.value;
  // On ne peut pas retirer plus que le prix lui-même.
  return Math.min(price, Math.max(0, cap));
};

/** Plafond d'une ligne de ticket : le plafond unitaire, multiplié par la quantité. */
export const lineDiscountCap = (db, product, unitPrice, qty) =>
  ruleCapPerUnit(discountRuleFor(db, product), unitPrice) * Math.max(0, Number(qty) || 0);

/**
 * Plafond du ticket entier : la somme de ce que chaque ligne autorise.
 *
 * C'est ce montant qui est annoncé au vendeur quand il coche « réduction », et
 * c'est lui qui borne la saisie — y compris à l'enregistrement, pour qu'une
 * valeur tapée puis désarmée ne puisse pas passer.
 */
export const cartDiscountCap = (db, lines = []) =>
  Math.round(
    lines.reduce((sum, l) => {
      const p = db.products.find((x) => x.id === l.productId);
      return sum + lineDiscountCap(db, p, l.price, l.qty);
    }, 0)
  );

// ---- product search ----
//
// Searching the shelf has to forgive what people actually type: accents
// ("filtre à huile" typed without the accent), a different case, extra spaces,
// several words in any order, and a barcode read out loud with spaces in it.

/** Lower-case, accent-free form used for every text comparison. */
export const norm = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export const digits = (v) => String(v ?? "").replace(/\D/g, "");

/** Every text a product can be found by. */
const haystack = (p) =>
  norm([p?.name, p?.brand, p?.description, p?.barcode].filter(Boolean).join(" "));

/**
 * A product matches when every word of the query is found somewhere in its
 * name / brand / description, or when the query looks like its barcode.
 */
export const productMatches = (p, query) => {
  const q = norm(query);
  if (!q) return true;
  const code = digits(query);
  if (code.length >= 6 && digits(p?.barcode).includes(code)) return true;
  const hay = haystack(p);
  return q.split(/\s+/).every((word) => hay.includes(word));
};

export const searchProducts = (products = [], query, limit = 0) => {
  const q = norm(query);
  const found = products.filter((p) => productMatches(p, query));
  if (q) {
    // A name that starts with what was typed is almost always the one wanted.
    found.sort((a, b) => {
      const rank = (p) => (norm(p.name).startsWith(q) ? 0 : norm(p.name).includes(q) ? 1 : 2);
      return rank(a) - rank(b) || norm(a.name).localeCompare(norm(b.name));
    });
  }
  return limit > 0 ? found.slice(0, limit) : found;
};

/**
 * Resolve a scanned code to a product.
 *
 * Scanners hand back exactly what is printed, which is not always what was
 * typed into the product sheet: a UPC-A label reads as 13 digits with a leading
 * zero, and labels printed by the app live in the `barcodes` collection rather
 * than on the product itself. All three routes are tried.
 */
export const findProductByCode = (db, rawCode) => {
  const code = digits(rawCode);
  if (!code) return null;
  const variants = new Set([code, code.replace(/^0+/, ""), `0${code}`]);
  const direct = db.products.find((p) => variants.has(digits(p.barcode)));
  if (direct) return direct;
  const label = db.barcodes.find((b) => variants.has(digits(b.code)));
  if (label?.productId) return db.products.find((p) => p.id === label.productId) || null;
  return null;
};

// ---- derived helpers ----
export const repairTotalFromItems = (rep, db) => {
  const sTotal = (rep.services || []).reduce((s, it) => {
    if (it.serviceId) {
      const sv = db.services.find((x) => x.id === it.serviceId);
      return s + (sv ? Number(sv.price) : 0);
    }
    return s + (Number(it.price) || 0);
  }, 0);
  const pTotal = (rep.products || []).reduce((s, it) => {
    const p = db.products.find((x) => x.id === it.productId);
    return s + (p ? Number(p.salePrice || p.purchasePrice) * (Number(it.qty) || 1) : 0);
  }, 0);
  return sTotal + pTotal;
};

// TVA / totals breakdown of a repair — tolerant of old records without `tva`
export const DEFAULT_TVA_RATE = 19;

export const repairAmounts = (rep) => {
  const total = Number(rep?.total) || 0;
  const enabled = !!rep?.tva?.enabled;
  const rate = Number(rep?.tva?.rate ?? DEFAULT_TVA_RATE);
  const subtotal = Number(rep?.subtotal ?? total) || 0;
  const tva = enabled ? Number(rep?.tva?.amount ?? Math.round((subtotal * rate) / 100)) : 0;
  const paid = paidOf(rep?.payments);
  return { subtotal, tvaEnabled: enabled, tvaRate: rate, tva, total, paid, rest: Math.max(0, total - paid) };
};

export const serviceNamesOf = (rep, db) =>
  (rep.services || []).map((it) => {
    if (it.serviceId) {
      const sv = db.services.find((x) => x.id === it.serviceId);
      return sv ? sv.name : "?";
    }
    return it.name;
  });

// Restore stock quantities for a repair/purchase being edited or deleted
export const restockRepair = (db, rep) => {
  (rep.products || []).forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) p.qtyCurrent += Number(it.qty) || 0;
  });
};
export const consumeRepairStock = (db, products) => {
  (products || []).forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) p.qtyCurrent = Math.max(0, p.qtyCurrent - (Number(it.qty) || 0));
  });
};

/**
 * A purchase is what stocks a product: it moves the quantity in, and carries the
 * commercial data (buy/sell price, alert threshold, expiry) that the product
 * sheet no longer asks for at creation time.
 */
export const applyPurchaseToStock = (db, purchase, sign = 1) => {
  (purchase.items || []).forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (!p) return;
    const q = (Number(it.qty) || 0) * sign;
    p.qtyPrincipal = Math.max(0, (Number(p.qtyPrincipal) || 0) + q);
    p.qtyCurrent = Math.max(0, (Number(p.qtyCurrent) || 0) + q);
    if (sign > 0) {
      if (it.minQty !== undefined && it.minQty !== "") p.minQty = Number(it.minQty) || 0;
      if (it.price !== undefined && it.price !== "") p.purchasePrice = Number(it.price) || 0;
      if (it.salePrice !== undefined && it.salePrice !== "") p.salePrice = Number(it.salePrice) || 0;
      if (p.trackExpiration && it.expiration) p.expiration = it.expiration;
    }
  });
};

// ---- sales (POS) ----

// Unit price actually charged: whatever the counter typed, else the catalogue price.
export const productPrice = (p) => Number(p?.salePrice || p?.purchasePrice) || 0;

/** Totals of a sale — tolerant of records written before a field existed. */
export const saleAmounts = (sale) => {
  const subtotal = (sale?.items || []).reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0
  );
  const discount = sale?.discount?.enabled
    ? Math.min(subtotal, Math.max(0, Number(sale.discount.amount) || 0))
    : 0;
  const total = Number(sale?.total ?? subtotal - discount) || 0;
  const paid = paidOf(sale?.payments);
  return { subtotal, discount, total, paid, rest: Math.max(0, total - paid) };
};

/** sign -1 takes the sold items out of stock, +1 puts them back (edit / delete). */
export const applySaleToStock = (db, sale, sign = -1) => {
  (sale?.items || []).forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (!p) return;
    p.qtyCurrent = Math.max(0, (Number(p.qtyCurrent) || 0) + (Number(it.qty) || 0) * sign);
  });
};

// Sales and repairs both accept walk-in customers, so every screen that shows a
// client name goes through here rather than printing an empty cell.
export const clientNameOf = (db, clientId, t = (x) => x) =>
  db.clients.find((c) => c.id === clientId)?.name || t("Client de passage");

// ---- print helper (invoices / reports) ----

// Escape user-supplied values before injecting them into printed HTML
export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Shared masthead for printed documents (invoice, repair order, purchase bill).
 * The garage identity sits above the rule; the document title is centred
 * underneath it, with its reference below.
 */
export function docHead(settings, title, reference = "", t = (x) => x) {
  const s = settings || {};
  const pair = (label, value) => (value ? `<b>${esc(label)}:</b> ${esc(value)}` : "");
  const fiscal = [pair("NIF", s.nif), pair("NIS", s.nis)].filter(Boolean).join(" · ");
  const legal = [pair("RC", s.rc), pair(t("Article"), s.article)].filter(Boolean).join(" · ");
  const initial = (s.name || "G").trim().slice(0, 1).toUpperCase();

  return `
    <div class="doc-head">
      <div class="doc-brand">
        ${s.logo
          ? `<img src="${esc(s.logo)}" alt=""/>`
          : `<div class="logo-ph">${esc(initial)}</div>`}
        <div>
          <div class="nm">${esc(s.name || "—")}</div>
          ${s.description ? `<div class="tag">${esc(s.description)}</div>` : ""}
        </div>
      </div>
      <div class="doc-org">
        ${s.address ? `${esc(s.address)}<br/>` : ""}
        ${s.phone ? `${pair(t("Tél"), s.phone)}<br/>` : ""}
        ${s.email ? `${esc(s.email)}<br/>` : ""}
        ${fiscal ? `${fiscal}<br/>` : ""}
        ${legal}
      </div>
    </div>

    <div class="doc-title">
      <h1>${esc(title)}</h1>
      <div class="rule"></div>
      ${reference ? `<div class="ref">${esc(reference)}</div>` : ""}
    </div>`;
}

/** Paid / partial / unpaid stamp shown next to the totals. */
export const docStamp = (total, paid, t = (x) => x) => {
  if (paid >= total && total > 0) return `<span class="stamp paid">${esc(t("Payé"))}</span>`;
  if (paid > 0) return `<span class="stamp part">${esc(t("Partiel"))}</span>`;
  return `<span class="stamp due">${esc(t("Impayé"))}</span>`;
};

// Exported so `tools/preview-print.mjs` can render the exact same styles.
export const PRINT_CSS = `
    @page { size: A4; margin: 12mm; }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', 'Tajawal', Arial, sans-serif; color: #1f2937;
           padding: 28px; font-size: 12.5px; line-height: 1.55;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-size: 20px; } h2 { font-size: 13px; margin: 18px 0 2px; color: #4c1d95;
         text-transform: uppercase; letter-spacing: 1.1px; font-weight: 700; }

    /* ----- legacy tables (rapports, étiquettes) ----- */
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #f5f3ff; color: #4c1d95; text-align: start; }
    th, td { border: 1px solid #ddd6fe; padding: 7px 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 14px; margin-bottom: 18px; }
    .muted { color: #6b7280; font-size: 12px; }
    .tot { font-weight: 700; }
    .sig { display: flex; justify-content: space-between; margin-top: 54px; }
    .sig div { width: 220px; border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center;
               font-size: 11.5px; color: #4b5563; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: 600; }

    /* ===== Document layout (invoice / repair order / purchase bill) ===== */

    /* Identity on the left, coordinates on the right, separated by the rule. */
    .doc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 30px;
                border-bottom: 2.5px solid #7c3aed; padding-bottom: 15px; }
    .doc-brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
    .doc-brand img { width: 64px; height: 64px; object-fit: contain; border-radius: 11px;
                     border: 1px solid #ede9fe; background: #fff; }
    .doc-brand .logo-ph { width: 64px; height: 64px; border-radius: 11px;
                          background: #f5f3ff; border: 1px solid #ddd6fe;
                          display: flex; align-items: center; justify-content: center;
                          font-size: 24px; font-weight: 800; color: #7c3aed; }
    .doc-brand .nm { font-size: 18px; font-weight: 800; color: #4c1d95; line-height: 1.2; letter-spacing: -0.2px; }
    .doc-brand .tag { font-size: 11px; color: #6b7280; margin-top: 3px; max-width: 230px; }
    .doc-org { text-align: end; font-size: 10.5px; color: #4b5563; line-height: 1.8; }
    .doc-org b { color: #1f2937; font-weight: 600; }

    /* The title sits centred *below* the rule, with its reference underneath. */
    .doc-title { text-align: center; margin: 17px 0 3px; }
    .doc-title h1 { font-size: 23px; letter-spacing: 5px; text-transform: uppercase;
                    color: #4c1d95; font-weight: 800; }
    .doc-title .rule { height: 3px; width: 56px; margin: 9px auto 0; border-radius: 3px;
                       background: linear-gradient(90deg, #7c3aed, #c084fc); }
    .doc-title .ref { margin-top: 8px; font-size: 11.5px; font-weight: 600;
                      color: #6b7280; letter-spacing: 1.2px; }

    .doc-meta { display: flex; flex-wrap: wrap; gap: 6px 24px; justify-content: space-between;
                background: #faf9ff; border: 1px solid #ede9fe; border-inline-start: 3px solid #7c3aed;
                border-radius: 7px; padding: 10px 15px; margin: 16px 0 15px; font-size: 11.5px; }
    .doc-meta span { color: #6b7280; }
    .doc-meta b { color: #1f2937; font-weight: 600; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-bottom: 13px; }
    .box { border: 1px solid #e9e4fb; border-radius: 8px; padding: 12px 15px; background: #fdfcff; }
    .box h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.3px; color: #7c3aed;
              margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #f0edff; font-weight: 700; }
    .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 11.5px; }
    .kv span { color: #6b7280; }
    .kv b { color: #1f2937; text-align: end; font-weight: 600; }
    .note { font-size: 12px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dim { color: #9ca3af; font-size: 10.5px; font-weight: 400; }

    /* ----- document tables ----- */
    table.doc-table { width: 100%; border-collapse: collapse; margin: 8px 0 0;
                      font-size: 11.5px; border: 1px solid #e9e4fb; border-radius: 8px; overflow: hidden; }
    .doc-table thead th { background: #4c1d95; color: #fff; text-align: start; font-weight: 600;
                          font-size: 9.5px; text-transform: uppercase; letter-spacing: 1px;
                          padding: 9px 11px; border: none; }
    .doc-table thead th.num { text-align: end; }
    .doc-table tbody td { padding: 8px 11px; border: none; border-bottom: 1px solid #f1edfd; }
    .doc-table tbody tr:nth-child(even) td { background: #faf9ff; }
    .doc-table tbody tr:last-child td { border-bottom: none; }

    /* ----- totals ----- */
    .totals-wrap { display: flex; align-items: center; justify-content: space-between;
                   gap: 20px; margin: 14px 0 8px; }
    .stamp { display: inline-block; padding: 6px 16px; border: 2px solid; border-radius: 7px;
             font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
             transform: rotate(-4deg); }
    .stamp.paid { color: #047857; border-color: #047857; background: #ecfdf5; }
    .stamp.part { color: #b45309; border-color: #b45309; background: #fffbeb; }
    .stamp.due  { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }

    .totals { width: 305px; margin-inline-start: auto; }
    .totals .row { display: flex; justify-content: space-between; gap: 14px; padding: 6px 12px;
                   font-size: 12px; border-bottom: 1px solid #f1edfd; }
    .totals .row span { color: #6b7280; }
    .totals .row b { font-variant-numeric: tabular-nums; color: #1f2937; font-weight: 600; }
    .totals .grand { background: #4c1d95; border-radius: 8px; margin-top: 7px; padding: 11px 13px;
                     font-size: 14px; border-bottom: none; }
    .totals .grand span, .totals .grand b { color: #fff; font-weight: 800; }
    .totals .due b { color: #b91c1c; font-weight: 800; }

    .foot { margin-top: 24px; padding-top: 11px; border-top: 1px solid #ede9fe; text-align: center;
            font-size: 10px; color: #9ca3af; line-height: 1.7; }

    @media print {
      body { padding: 0; }
      .doc-head, .box, .totals-wrap, .sig, tr { break-inside: avoid; }
      .doc-table thead { display: table-header-group; }
    }
`;

export function printHTML(title, bodyHtml, dir = "ltr") {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${PRINT_CSS}</style></head><body>${bodyHtml}
  <script>window.onload = () => { window.print(); }<\/script></body></html>`);
  w.document.close();
}
