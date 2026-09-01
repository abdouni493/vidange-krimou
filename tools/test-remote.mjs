// ===== Vérification de la couche Supabase, sans réseau =====
//
//   node tools/test-remote.mjs      (ou : npm test)
//
// Deux angles :
//   A. le delta — une sauvegarde ne doit envoyer que ce qui a bougé, sinon la
//      RLS refuserait l'enregistrement d'un employé aux droits étroits ;
//   B. l'aller-retour — le document rechargé depuis les tables doit être
//      identique à celui que l'interface avait en mémoire.
//
// Le client Supabase est remplacé par un faux : ici, un enregistreur d'appels ;
// là, une base en mémoire qui applique vraiment les écritures.

import { supabase } from "../src/lib/supabase.js";
import { pushAll, fetchAll } from "../src/lib/remote.js";

let failures = 0;
const check = (label, ok, extra = "") => {
  if (ok) console.log("  ok   ", label);
  else { failures++; console.log("  FAIL ", label, extra); }
};
const section = (title) => console.log(`\n${title}`);

const blank = () => ({
  categories: [], roles: [], clients: [], suppliers: [], services: [], products: [],
  barcodes: [], expenseCategories: [], expenses: [], caisseCategories: [], caisse: [],
  workers: [], purchases: [], sales: [], repairs: [],
  settings: {
    logo: "", name: "", description: "", email: "", phone: "",
    address: "", nif: "", nis: "", article: "", rc: "",
  },
  counters: { purchase: 1, sale: 1 },
});

// Les listes que l'interface empile par la tête.
const STACKED = ["repairs", "sales", "purchases", "barcodes", "expenses", "caisse"];

// Un document venu de `fetchAll` porte le rang de chaque ligne : on le simule
// pour les jeux d'essai écrits à la main.
const asFetched = (doc) => {
  for (const [key, list] of Object.entries(doc)) {
    if (!Array.isArray(list)) continue;
    const order = STACKED.includes(key) ? [...list].reverse() : list;
    order.forEach((rec, i) => { rec.__pos = i; });
  }
  return doc;
};

// ===========================================================================
// A. Le delta
// ===========================================================================
const ops = [];
const thenable = (value) => ({ then: (res) => Promise.resolve(value).then(res) });

const recorder = (table) => ({
  upsert: (rows, opts) => { ops.push({ op: "upsert", table, rows, opts }); return thenable({ error: null }); },
  insert: (rows) => { ops.push({ op: "insert", table, rows }); return thenable({ error: null }); },
  delete: () => ({
    in: (col, ids) => { ops.push({ op: "delete.in", table, col, ids }); return thenable({ error: null }); },
    eq: (col, val) => { ops.push({ op: "delete.eq", table, col, val }); return thenable({ error: null }); },
    not: () => thenable({ error: null }),
  }),
});
supabase.from = recorder;

section("A1. Une nouvelle réparation n'écrit qu'une ligne");

const prev = asFetched({
  ...blank(),
  clients: [{ id: "c1", name: "Ali", phone: "0555", address: "", email: "", note: "", createdAt: "2026-01-01" }],
  products: [
    { id: "p1", name: "Filtre", description: "", brand: "Bosch", categoryId: "", barcode: "6130045000123",
      imageUrl: "", purchasePrice: 500, salePrice: 900, qtyPrincipal: 10, qtyCurrent: 10, minQty: 2,
      trackExpiration: false, expiration: "", createdAt: "2026-01-01" },
    { id: "p2", name: "Huile", description: "", brand: "Total", categoryId: "", barcode: "6130045000130",
      imageUrl: "", purchasePrice: 1800, salePrice: 2500, qtyPrincipal: 4, qtyCurrent: 4, minQty: 1,
      trackExpiration: false, expiration: "", createdAt: "2026-01-01" },
  ],
  services: [{ id: "s1", name: "Vidange", description: "", price: 1500, createdAt: "2026-01-01" }],
  repairs: [
    { id: "r1", type: "repair", status: "finalized", dateIn: "2026-01-02T09:00", dateOut: "2026-01-02T17:00",
      clientId: "c1", car: {}, problem: "", services: [{ serviceId: "s1" }], products: [], workers: [],
      payments: [], subtotal: 1500, tva: {}, total: 1500, createdAt: "2026-01-02" },
  ],
});

const next = structuredClone(prev);
next.repairs.unshift({
  id: "r2", type: "appointment", status: "pending", dateIn: "2026-02-01T10:00", dateOut: "2026-02-01T17:00",
  clientId: "c1", car: { brand: "Renault", plate: "12345-116-31" }, problem: "Bruit",
  services: [{ serviceId: "s1" }], products: [{ productId: "p1", qty: 2 }], workers: [],
  payments: [{ id: "pay1", amount: 1000, date: "2026-02-01" }],
  subtotal: 3300, tva: { enabled: false, rate: 19, amount: 0 }, total: 3300, createdAt: "2026-02-01",
});
next.products[0].qtyCurrent = 8; // la pièce sort du stock

ops.length = 0;
const stored1 = await pushAll(prev, next);

const repairUpserts = ops.filter((o) => o.op === "upsert" && o.table === "repairs");
check("une seule fiche réparation écrite",
  repairUpserts.length === 1 && repairUpserts[0].rows.length === 1);
check("c'est bien la nouvelle", repairUpserts[0]?.rows[0]?.id === "r2");
check("la fiche existante n'est pas renumérotée", !JSON.stringify(repairUpserts).includes('"r1"'));
check("seul le produit dont le stock bouge est écrit",
  ops.filter((o) => o.op === "upsert" && o.table === "products")
     .flatMap((o) => o.rows.map((r) => r.id)).join() === "p1");
check("les clients inchangés ne sont pas réécrits", !ops.some((o) => o.table === "clients"));
check("les services inchangés ne sont pas réécrits", !ops.some((o) => o.table === "services"));

const inserted = ops.filter((o) => o.op === "insert").map((o) => o.table);
check("prestations, pièces et règlement liés à la fiche",
  ["repair_services", "repair_products", "repair_payments"].every((tb) => inserted.includes(tb)));
check("aucune ligne pour une liste d'employés vide", !inserted.includes("repair_workers"));
check("les lignes de la fiche existante ne sont pas retouchées",
  !ops.some((o) => o.op === "delete.eq" && o.val === "r1"));

section("A2. Suppression et compteurs");
const next2 = structuredClone(stored1);
next2.repairs = next2.repairs.filter((r) => r.id !== "r1");
next2.counters.sale = 2;

ops.length = 0;
await pushAll(stored1, next2);
check("la fiche supprimée part par son identifiant",
  ops.some((o) => o.op === "delete.in" && o.table === "repairs" && o.ids.includes("r1")));
check("le compteur de ventes est enregistré",
  ops.some((o) => o.op === "upsert" && o.table === "counters" && o.rows.sale === 2));
check("supprimer une fiche n'en réécrit aucune autre",
  !ops.some((o) => o.op === "upsert" && o.table === "repairs"));

section("A3. Le mot de passe d'un employé ne part jamais en base");
const next3 = blank();
next3.workers = [{
  id: "w1", userId: "11111111-1111-1111-1111-111111111111", fullName: "Karim", birthday: "", idCard: "",
  phone: "0661", roleId: "", startDate: "2026-01-01", photoUrl: "",
  pay: { enabled: true, mode: "month", amount: 40000, percent: 5 },
  account: { enabled: true, email: "karim@garage.dz", username: "karim", password: "secret123" },
  permissions: { pos: ["view", "create"] }, advances: [], absences: [], payments: [],
  settledRepairIds: [], createdAt: "2026-01-01",
}];

ops.length = 0;
const stored3 = await pushAll(blank(), next3);
const workerRow = ops.find((o) => o.op === "upsert" && o.table === "workers")?.rows[0];
check("la fiche employé est écrite", !!workerRow);
check("le mot de passe est retiré du compte", workerRow && !("password" in workerRow.account));
check("les permissions partent en JSON", workerRow?.permissions?.pos?.includes("create"));
check("le mot de passe n'apparaît nulle part", !JSON.stringify(ops).includes("secret123"));

section("A4. Vente au comptoir");
const next4 = structuredClone(stored3);
next4.sales = [{
  id: "v1", ref: "VNT-0001", clientId: "", date: "2026-02-02",
  items: [{ productId: "p1", name: "Filtre", qty: 1, price: 900 }],
  subtotal: 900, discount: { enabled: false, amount: 0 }, total: 900, note: "",
  payments: [{ id: "sp1", amount: 900, date: "2026-02-02" }], createdAt: "2026-02-02",
}];

ops.length = 0;
await pushAll(stored3, next4);
const saleRow = ops.find((o) => o.op === "upsert" && o.table === "sales")?.rows[0];
check("la vente est écrite", saleRow?.id === "v1");
check("un client de passage devient NULL, pas une chaîne vide", saleRow?.client_id === null);
check("la remise part en JSON", saleRow?.discount?.enabled === false);
check("les lignes de vente sont insérées",
  ops.some((o) => o.op === "insert" && o.table === "sale_items" && o.rows[0].name === "Filtre"));

// ===========================================================================
// B. Aller-retour sur une base en mémoire
// ===========================================================================
const tables = new Map();
const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t); };

const query = (table) => {
  const state = { filters: [], order: null, range: null };
  const run = () => {
    let data = rowsOf(table).filter((row) =>
      state.filters.every(([col, val]) => row[col] === val));
    if (state.order) {
      const { col, asc } = state.order;
      data = [...data].sort((a, b) => ((a[col] ?? 0) > (b[col] ?? 0) ? 1 : -1) * (asc ? 1 : -1));
    }
    if (state.range) data = data.slice(state.range[0], state.range[1] + 1);
    return { data, error: null };
  };
  const api = {
    select: () => api,
    eq: (col, val) => { state.filters.push([col, val]); return api; },
    order: (col, opts) => { state.order = { col, asc: opts?.ascending !== false }; return api; },
    range: (a, b) => { state.range = [a, b]; return api; },
    maybeSingle: () => thenable({ data: run().data[0] ?? null, error: null }),
    then: (res) => Promise.resolve(run()).then(res),

    upsert: (rows) => {
      for (const row of [].concat(rows)) {
        const list = rowsOf(table);
        const i = list.findIndex((r) => r.id === row.id);
        if (i >= 0) list[i] = { ...list[i], ...row };
        else list.push({ ...row });
      }
      return thenable({ error: null });
    },
    insert: (rows) => { rowsOf(table).push(...[].concat(rows).map((r) => ({ ...r }))); return thenable({ error: null }); },
    delete: () => ({
      in: (col, ids) => { tables.set(table, rowsOf(table).filter((r) => !ids.includes(r[col]))); return thenable({ error: null }); },
      eq: (col, val) => { tables.set(table, rowsOf(table).filter((r) => r[col] !== val)); return thenable({ error: null }); },
      not: () => { tables.set(table, []); return thenable({ error: null }); },
    }),
  };
  return api;
};
supabase.from = query;

section("B1. Le document rechargé est identique");

const source = structuredClone(next4);
source.settings.name = "Garage Krimou";
source.settings.logo = "https://example.supabase.co/storage/v1/object/public/logos/logo.png";
source.counters = { purchase: 3, sale: 2 };
source.clients = [{ id: "c1", name: "Ali", phone: "0555", address: "Blida", email: "", note: "", createdAt: "2026-01-01" }];
source.services = [{ id: "s1", name: "Vidange", description: "Huile + filtre", price: 1500, createdAt: "2026-01-01" }];
source.products = structuredClone(prev.products);
source.repairs = [{
  id: "r9", type: "repair", status: "finalized", dateIn: "2026-03-01T08:30", dateOut: "2026-03-01T16:00",
  clientId: "c1",
  car: { brand: "Peugeot", name: "208", color: "Blanc", year: "2019", plate: "00123-116-09", description: "" },
  problem: "Freins", services: [{ serviceId: "s1" }], products: [{ productId: "p1", qty: 3 }],
  workers: ["w1"], payments: [{ id: "rp1", amount: 2000, date: "2026-03-01" }],
  subtotal: 4200, tva: { enabled: true, rate: 19, amount: 798 }, total: 4998, createdAt: "2026-03-01",
}];

await pushAll(blank(), source);
const roundTrip = await fetchAll();

const compare = (key, pick) => {
  const a = JSON.stringify((source[key] || []).map(pick));
  const b = JSON.stringify((roundTrip[key] || []).map(pick));
  check(`${key} identique après rechargement`, a === b, `\n     avant ${a}\n     après ${b}`);
};

compare("clients", (c) => [c.id, c.name, c.phone, c.address, c.createdAt]);
compare("products", (p) => [p.id, p.name, p.brand, p.barcode, p.qtyCurrent, p.salePrice, p.trackExpiration]);
compare("services", (s) => [s.id, s.name, s.description, s.price]);
compare("workers", (w) => [w.id, w.fullName, w.userId, w.pay, w.permissions]);
compare("sales", (s) => [s.id, s.ref, s.total, s.items, s.payments, s.discount]);
compare("repairs", (r) => [r.id, r.type, r.status, r.car, r.tva, r.total, r.services, r.products, r.workers, r.payments]);

check("le nom du garage revient", roundTrip.settings.name === "Garage Krimou");
check("l'URL du logo revient", roundTrip.settings.logo === source.settings.logo);
check("les compteurs reviennent", roundTrip.counters.purchase === 3 && roundTrip.counters.sale === 2);
check("le compte employé revient sans mot de passe",
  roundTrip.workers[0]?.account?.username === "karim" && !("password" in roundTrip.workers[0].account));

section("B2. L'ordre d'affichage survit à l'aller-retour");
// Les listes empilées par la tête doivent revenir avec la fiche la plus
// récente en premier : un rang mal attribué la renverrait en bas de page.
tables.clear();
const stacked = blank();
stacked.expenses = [
  { id: "e2", name: "Loyer", description: "", categoryId: "", amount: 30000, date: "2026-03-01", createdAt: "2026-03-01" },
  { id: "e1", name: "Électricité", description: "", categoryId: "", amount: 4200, date: "2026-02-01", createdAt: "2026-02-01" },
];
stacked.caisse = [
  { id: "k2", type: "out", amount: 500, date: "2026-03-02", description: "Café", categoryId: "", createdAt: "2026-03-02" },
  { id: "k1", type: "in", amount: 9000, date: "2026-03-01", description: "Apport", categoryId: "", createdAt: "2026-03-01" },
];

const storedStack = await pushAll(blank(), stacked);
const reloaded = await fetchAll();
check("dépense la plus récente en tête",
  reloaded.expenses.map((e) => e.id).join() === "e2,e1", reloaded.expenses.map((e) => e.id).join());
check("mouvement de caisse le plus récent en tête",
  reloaded.caisse.map((k) => k.id).join() === "k2,k1", reloaded.caisse.map((k) => k.id).join());

const withNew = structuredClone(storedStack);
withNew.expenses.unshift({
  id: "e3", name: "Pièces", description: "", categoryId: "",
  amount: 1200, date: "2026-03-05", createdAt: "2026-03-05",
});
await pushAll(storedStack, withNew);
const reloaded2 = await fetchAll();
check("une dépense ajoutée reste en tête après rechargement",
  reloaded2.expenses.map((e) => e.id).join() === "e3,e2,e1", reloaded2.expenses.map((e) => e.id).join());

section("B3. Une sauvegarde qui suit un rechargement n'écrit rien");
ops.length = 0;
supabase.from = (table) => {
  const q = query(table);
  return { ...q, upsert: recorder(table).upsert, insert: recorder(table).insert };
};
await pushAll(reloaded2, structuredClone(reloaded2));
check("aucune écriture inutile", ops.length === 0, JSON.stringify(ops.map((o) => `${o.op} ${o.table}`)));

console.log(failures ? `\n${failures} vérification(s) en échec\n` : "\nToutes les vérifications passent\n");
process.exit(failures ? 1 : 0);
