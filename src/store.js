// ===== Data layer: localStorage persistence + seeded demo data =====

const DB_KEY = "garage_db_v3";
export const SESSION_KEY = "garage_session_v1";
export const LANG_KEY = "garage_lang_v1";

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
  "dashboard", "repairs", "services", "stock", "barcodes", "purchases", "clients",
  "suppliers", "workers", "expenses", "caisse", "reports", "settings",
];

export const PAGE_ACTIONS = {
  dashboard: ["view"],
  repairs: ["view", "create", "edit", "delete", "pay", "finalize", "cancel"],
  services: ["view", "create", "edit", "delete"],
  stock: ["view", "create", "edit", "delete"],
  barcodes: ["view", "create", "delete", "print"],
  purchases: ["view", "create", "edit", "delete", "pay", "print"],
  clients: ["view", "create", "edit", "delete", "history"],
  suppliers: ["view", "create", "edit", "delete", "history"],
  workers: ["view", "create", "edit", "delete", "permissions", "advance", "absence", "payment"],
  expenses: ["view", "create", "edit", "delete"],
  caisse: ["view", "create"],
  reports: ["view"],
  settings: ["view", "edit"],
};

// ---- seed (constant demo data for tests) ----
export function seedDB() {
  const now = new Date().toISOString();
  const dt = (off, h = 9, m = 0) => `${dayOffset(off)}T${pad(h)}:${pad(m)}`;
  const pay = (amount, off) => ({ id: uid(), amount, date: dayOffset(off) });

  const clients = [
    { id: "c1", name: "Karim Benali", phone: "0550 12 34 56", createdAt: dayOffset(-120) },
    { id: "c2", name: "Amine Haddad", phone: "0661 23 45 67", createdAt: dayOffset(-105) },
    { id: "c3", name: "Sofiane Merabet", phone: "0770 34 56 78", createdAt: dayOffset(-90) },
    { id: "c4", name: "Yacine Boudiaf", phone: "0555 45 67 89", createdAt: dayOffset(-72) },
    { id: "c5", name: "Nassim Cherif", phone: "0662 56 78 90", createdAt: dayOffset(-55) },
    { id: "c6", name: "Walid Saadi", phone: "0771 67 89 01", createdAt: dayOffset(-38) },
    { id: "c7", name: "Lamia Bouzid", phone: "0556 78 90 12", createdAt: dayOffset(-26) },
    { id: "c8", name: "Farid Zerhouni", phone: "0663 89 01 23", createdAt: dayOffset(-14) },
    { id: "c9", name: "Meriem Kaci", phone: "0772 90 12 34", createdAt: dayOffset(-7) },
    { id: "c10", name: "Hocine Belkacem", phone: "0557 01 23 45", createdAt: dayOffset(-2) },
  ];

  const services = [
    { id: "s1", name: "Vidange complète", description: "Huile moteur + filtre à huile", price: 2500 },
    { id: "s2", name: "Freins — plaquettes", description: "Remplacement plaquettes avant", price: 4500 },
    { id: "s3", name: "Diagnostic électronique", description: "Lecture OBD et diagnostic complet", price: 2000 },
    { id: "s4", name: "Équilibrage + rotation pneus", description: "4 roues", price: 1800 },
    { id: "s5", name: "Recharge climatisation", description: "Gaz R134a + contrôle fuites", price: 5500 },
    { id: "s6", name: "Courroie de distribution", description: "Kit distribution + pompe à eau", price: 12000 },
    { id: "s7", name: "Parallélisme / géométrie", description: "Réglage train avant", price: 3000 },
    { id: "s8", name: "Embrayage complet", description: "Kit embrayage + main d'œuvre", price: 18000 },
  ];

  const categories = [
    { id: "cat1", name: "Huiles & lubrifiants" },
    { id: "cat2", name: "Filtres" },
    { id: "cat3", name: "Freinage" },
    { id: "cat4", name: "Pneumatiques" },
    { id: "cat5", name: "Électricité" },
    { id: "cat6", name: "Refroidissement" },
  ];

  const products = [
    { id: "p1", name: "Huile moteur 5W40 (5L)", description: "Huile synthétique", brand: "Total", categoryId: "cat1", barcode: "6130001001", purchasePrice: 3200, salePrice: 4200, qtyPrincipal: 40, qtyCurrent: 14, minQty: 10, expiration: dayOffset(300), createdAt: dayOffset(-110) },
    { id: "p2", name: "Filtre à huile", description: "Filtre standard multi-marques", brand: "Bosch", categoryId: "cat2", barcode: "6130001002", purchasePrice: 450, salePrice: 800, qtyPrincipal: 60, qtyCurrent: 8, minQty: 12, expiration: "", createdAt: dayOffset(-110) },
    { id: "p3", name: "Plaquettes de frein avant", description: "Jeu de 4 plaquettes", brand: "Valeo", categoryId: "cat3", barcode: "6130001003", purchasePrice: 2800, salePrice: 4000, qtyPrincipal: 30, qtyCurrent: 17, minQty: 6, expiration: "", createdAt: dayOffset(-95) },
    { id: "p4", name: "Disque de frein ventilé 280mm", description: "Disque ventilé", brand: "Valeo", categoryId: "cat3", barcode: "6130001004", purchasePrice: 3500, salePrice: 5200, qtyPrincipal: 20, qtyCurrent: 11, minQty: 4, expiration: "", createdAt: dayOffset(-95) },
    { id: "p5", name: "Batterie 60Ah", description: "12V 60Ah 540A", brand: "Varta", categoryId: "cat5", barcode: "6130001005", purchasePrice: 8500, salePrice: 11500, qtyPrincipal: 12, qtyCurrent: 3, minQty: 4, expiration: "", createdAt: dayOffset(-80) },
    { id: "p6", name: "Pneu 195/65 R15", description: "Pneu tourisme", brand: "Michelin", categoryId: "cat4", barcode: "6130001006", purchasePrice: 9800, salePrice: 12500, qtyPrincipal: 16, qtyCurrent: 9, minQty: 4, expiration: "", createdAt: dayOffset(-75) },
    { id: "p7", name: "Filtre à air", description: "Filtre à air moteur", brand: "Mann", categoryId: "cat2", barcode: "6130001007", purchasePrice: 700, salePrice: 1200, qtyPrincipal: 35, qtyCurrent: 21, minQty: 8, expiration: "", createdAt: dayOffset(-70) },
    { id: "p8", name: "Liquide de refroidissement (5L)", description: "Antigel -25°C", brand: "Total", categoryId: "cat6", barcode: "6130001008", purchasePrice: 1100, salePrice: 1800, qtyPrincipal: 25, qtyCurrent: 18, minQty: 6, expiration: dayOffset(500), createdAt: dayOffset(-60) },
    { id: "p9", name: "Bougies d'allumage (x4)", description: "Jeu de 4 bougies iridium", brand: "NGK", categoryId: "cat5", barcode: "6130001009", purchasePrice: 1600, salePrice: 2600, qtyPrincipal: 28, qtyCurrent: 19, minQty: 6, expiration: "", createdAt: dayOffset(-50) },
    { id: "p10", name: "Courroie accessoire", description: "Courroie poly-V", brand: "Gates", categoryId: "cat5", barcode: "6130001010", purchasePrice: 1200, salePrice: 2000, qtyPrincipal: 15, qtyCurrent: 2, minQty: 3, expiration: "", createdAt: dayOffset(-45) },
    { id: "p11", name: "Filtre habitacle", description: "Filtre à pollen charbon actif", brand: "Mann", categoryId: "cat2", barcode: "6130001011", purchasePrice: 550, salePrice: 950, qtyPrincipal: 30, qtyCurrent: 24, minQty: 8, expiration: "", createdAt: dayOffset(-40) },
    { id: "p12", name: "Radiateur moteur", description: "Radiateur aluminium", brand: "Nissens", categoryId: "cat6", barcode: "6130001012", purchasePrice: 12500, salePrice: 16800, qtyPrincipal: 6, qtyCurrent: 4, minQty: 2, expiration: "", createdAt: dayOffset(-35) },
  ];

  const suppliers = [
    { id: "f1", name: "SARL Pièces Auto Alger", phone: "021 55 44 33", address: "Zone industrielle, Rouiba, Alger" },
    { id: "f2", name: "EURL AutoParts Oran", phone: "041 33 22 11", address: "Rue des frères Bouadou, Oran" },
    { id: "f3", name: "Lubrifiants du Centre", phone: "025 66 77 88", address: "Blida, centre-ville" },
    { id: "f4", name: "ETS Batteries & Électricité", phone: "021 77 88 99", address: "El Harrach, Alger" },
  ];

  const purchases = [
    {
      id: "a1", ref: "ACH-0001", supplierId: "f1", date: dayOffset(-45),
      items: [
        { productId: "p3", qty: 20, price: 2800, minQty: 6 },
        { productId: "p4", qty: 12, price: 3500, minQty: 4 },
      ],
      total: 98000, payments: [pay(98000, -45)], createdAt: dayOffset(-45),
    },
    {
      id: "a2", ref: "ACH-0002", supplierId: "f3", date: dayOffset(-25),
      items: [
        { productId: "p1", qty: 30, price: 3200, minQty: 10 },
        { productId: "p8", qty: 15, price: 1100, minQty: 6 },
      ],
      total: 112500, payments: [pay(80000, -25), pay(20000, -10)], createdAt: dayOffset(-25),
    },
    {
      id: "a3", ref: "ACH-0003", supplierId: "f2", date: dayOffset(-14),
      items: [
        { productId: "p6", qty: 8, price: 9800, minQty: 4 },
        { productId: "p9", qty: 20, price: 1600, minQty: 6 },
      ],
      total: 110400, payments: [pay(110400, -14)], createdAt: dayOffset(-14),
    },
    {
      id: "a4", ref: "ACH-0004", supplierId: "f4", date: dayOffset(-6),
      items: [{ productId: "p5", qty: 8, price: 8500, minQty: 4 }],
      total: 68000, payments: [pay(40000, -6)], createdAt: dayOffset(-6),
    },
    {
      id: "a5", ref: "ACH-0005", supplierId: "f1", date: dayOffset(-2),
      items: [
        { productId: "p2", qty: 40, price: 450, minQty: 12 },
        { productId: "p7", qty: 20, price: 700, minQty: 8 },
      ],
      total: 32000, payments: [pay(15000, -2)], createdAt: dayOffset(-2),
    },
  ];

  const car = (name, brand, color, year, plate) => ({ name, brand, color, year, plate, description: "" });

  const repairs = [
    // --- pending appointments (upcoming / today) ---
    {
      id: "r1", type: "appointment", status: "pending",
      dateIn: dt(0, 10), dateOut: dt(0, 16),
      clientId: "c5", car: car("Golf 7", "Volkswagen", "Gris", "2018", "00123-118-16"),
      problem: "Bruit au freinage + voyant moteur allumé",
      services: [{ serviceId: "s2" }, { serviceId: "s3" }],
      products: [], total: 6500, payments: [pay(2000, 0)],
      workers: [], createdAt: dayOffset(-1),
    },
    {
      id: "r2", type: "appointment", status: "pending",
      dateIn: dt(0, 14, 30), dateOut: dt(0, 17),
      clientId: "c7", car: car("Captur", "Renault", "Orange", "2021", "00852-121-16"),
      problem: "Climatisation faible + odeur habitacle",
      services: [{ serviceId: "s5" }],
      products: [{ productId: "p11", qty: 1 }], total: 6450, payments: [],
      workers: [], createdAt: dayOffset(-1),
    },
    {
      id: "r3", type: "appointment", status: "pending",
      dateIn: dt(1, 9), dateOut: dt(1, 12),
      clientId: "c6", car: car("Clio 4", "Renault", "Blanc", "2019", "00456-119-31"),
      problem: "Vidange périodique",
      services: [{ serviceId: "s1" }],
      products: [{ productId: "p1", qty: 1 }, { productId: "p2", qty: 1 }],
      total: 7500, payments: [],
      workers: [], createdAt: dayOffset(-2),
    },
    {
      id: "r4", type: "appointment", status: "pending",
      dateIn: dt(2, 11), dateOut: dt(2, 18),
      clientId: "c8", car: car("308", "Peugeot", "Bleu nuit", "2016", "00963-116-09"),
      problem: "Embrayage qui patine en côte",
      services: [{ serviceId: "s8" }],
      products: [], total: 18000, payments: [pay(5000, -1)],
      workers: [], createdAt: dayOffset(-3),
    },
    // --- finalized ---
    {
      id: "r5", type: "repair", status: "finalized",
      dateIn: dt(-1, 9), dateOut: dt(-1, 15),
      clientId: "c1", car: car("208", "Peugeot", "Noir", "2017", "00789-117-16"),
      problem: "Climatisation ne refroidit plus",
      services: [{ serviceId: "s5" }, { serviceId: "s3" }],
      products: [], total: 7500, payments: [pay(7500, -1)],
      workers: ["w1"], createdAt: dayOffset(-1),
    },
    {
      id: "r6", type: "appointment", status: "finalized",
      dateIn: dt(-2, 10), dateOut: dt(-2, 17),
      clientId: "c2", car: car("Symbol", "Renault", "Bleu", "2016", "00951-116-09"),
      problem: "Distribution + vidange",
      services: [{ serviceId: "s6" }, { serviceId: "s1" }],
      products: [{ productId: "p1", qty: 1 }],
      total: 18700, payments: [pay(10000, -2), pay(3000, 0)],
      workers: ["w1", "w2"], createdAt: dayOffset(-2),
    },
    {
      id: "r7", type: "repair", status: "finalized",
      dateIn: dt(-3, 8), dateOut: dt(-3, 12),
      clientId: "c3", car: car("i10", "Hyundai", "Rouge", "2020", "01234-120-25"),
      problem: "Batterie HS, ne démarre plus",
      services: [{ serviceId: "s3" }],
      products: [{ productId: "p5", qty: 1 }],
      total: 13500, payments: [pay(13500, -3)],
      workers: ["w2"], createdAt: dayOffset(-3),
    },
    {
      id: "r8", type: "repair", status: "finalized",
      dateIn: dt(-4, 13), dateOut: dt(-4, 18),
      clientId: "c9", car: car("Polo", "Volkswagen", "Blanc", "2015", "00147-115-16"),
      problem: "Freins avant usés + disques rayés",
      services: [{ serviceId: "s2" }],
      products: [{ productId: "p3", qty: 1 }, { productId: "p4", qty: 2 }],
      total: 18900, payments: [pay(10000, -4), pay(4000, -1)],
      workers: ["w3"], createdAt: dayOffset(-4),
    },
    {
      id: "r9", type: "appointment", status: "finalized",
      dateIn: dt(-6, 9), dateOut: dt(-6, 11),
      clientId: "c4", car: car("Ibiza", "Seat", "Gris", "2015", "00654-115-31"),
      problem: "Vibrations au volant à 100 km/h",
      services: [{ serviceId: "s4" }, { serviceId: "s7" }],
      products: [], total: 4800, payments: [pay(4800, -6)],
      workers: ["w2"], createdAt: dayOffset(-7),
    },
    {
      id: "r10", type: "repair", status: "finalized",
      dateIn: dt(-12, 9), dateOut: dt(-12, 17),
      clientId: "c6", car: car("Clio 4", "Renault", "Blanc", "2019", "00456-119-31"),
      problem: "Surchauffe moteur — radiateur percé",
      services: [{ serviceId: "s3" }],
      products: [{ productId: "p12", qty: 1 }, { productId: "p8", qty: 1 }],
      total: 20600, payments: [pay(20600, -12)],
      workers: ["w1"], createdAt: dayOffset(-12),
    },
    {
      id: "r11", type: "appointment", status: "finalized",
      dateIn: dt(-20, 10), dateOut: dt(-20, 16),
      clientId: "c1", car: car("208", "Peugeot", "Noir", "2017", "00789-117-16"),
      problem: "Révision 60 000 km",
      services: [{ serviceId: "s1" }, { serviceId: "s4" }],
      products: [{ productId: "p1", qty: 1 }, { productId: "p2", qty: 1 }, { productId: "p7", qty: 1 }],
      total: 10500, payments: [pay(10500, -20)],
      workers: ["w1", "w3"], createdAt: dayOffset(-21),
    },
    {
      id: "r12", type: "repair", status: "finalized",
      dateIn: dt(-28, 8), dateOut: dt(-28, 18),
      clientId: "c10", car: car("Tucson", "Hyundai", "Gris foncé", "2022", "01597-122-16"),
      problem: "Bougies + courroie accessoire",
      services: [{ serviceId: "s3" }],
      products: [{ productId: "p9", qty: 1 }, { productId: "p10", qty: 1 }],
      total: 6600, payments: [pay(3000, -28)],
      workers: ["w2"], createdAt: dayOffset(-28),
    },
    // --- canceled ---
    {
      id: "r13", type: "appointment", status: "canceled",
      dateIn: dt(-5, 14), dateOut: dt(-5, 17),
      clientId: "c4", car: car("Ibiza", "Seat", "Gris", "2015", "00654-115-31"),
      problem: "Équilibrage",
      services: [{ serviceId: "s4" }],
      products: [], total: 1800, payments: [],
      workers: [], createdAt: dayOffset(-6),
    },
  ];

  const roles = [
    { id: "role1", name: "Mécanicien" },
    { id: "role2", name: "Électricien auto" },
    { id: "role3", name: "Chef d'atelier" },
    { id: "role4", name: "Apprenti" },
  ];

  const workers = [
    {
      id: "w1", fullName: "Mohamed Larbi", birthday: "1990-05-14", idCard: "109254877",
      phone: "0552 11 22 33", roleId: "role3", startDate: dayOffset(-150),
      pay: { enabled: true, mode: "month", amount: 45000, percent: 10 },
      account: { enabled: true, email: "mohamed@garage.dz", username: "mohamed", password: "worker123" },
      permissions: { dashboard: ["view"], repairs: ["view", "create", "pay", "finalize"], services: ["view"], stock: ["view"] },
      advances: [{ id: uid(), date: dayOffset(-10), description: "Avance sur salaire", amount: 5000, settled: false }],
      absences: [{ id: uid(), date: dayOffset(-6), description: "Absence non justifiée", cost: 1500, settled: false }],
      payments: [{ id: uid(), date: dayOffset(-35), description: "Salaire mensuel", amount: 45000, details: null }],
      settledRepairIds: [],
    },
    {
      id: "w2", fullName: "Riad Bousmaha", birthday: "1995-11-02", idCard: "115487236",
      phone: "0663 44 55 66", roleId: "role2", startDate: dayOffset(-120),
      pay: { enabled: true, mode: "day", amount: 2000, percent: 8 },
      account: { enabled: false, email: "", username: "", password: "" },
      permissions: {},
      advances: [{ id: uid(), date: dayOffset(-4), description: "Acompte semaine", amount: 3000, settled: false }],
      absences: [],
      payments: [{ id: uid(), date: dayOffset(-30), description: "Paie journalière cumulée", amount: 40000, details: null }],
      settledRepairIds: [],
    },
    {
      id: "w3", fullName: "Sami Guettouche", birthday: "2001-03-25", idCard: "",
      phone: "0774 55 66 77", roleId: "role4", startDate: dayOffset(-60),
      pay: { enabled: true, mode: "month", amount: 28000, percent: 5 },
      account: { enabled: false, email: "", username: "", password: "" },
      permissions: {},
      advances: [], absences: [{ id: uid(), date: dayOffset(-15), description: "Maladie", cost: 1000, settled: false }],
      payments: [], settledRepairIds: [],
    },
  ];

  const expenseCategories = [
    { id: "ec1", name: "Loyer" },
    { id: "ec2", name: "Électricité & eau" },
    { id: "ec3", name: "Fournitures atelier" },
    { id: "ec4", name: "Entretien équipement" },
  ];

  const expenses = [
    { id: "e1", name: "Loyer du local", description: "Loyer mensuel", categoryId: "ec1", amount: 60000, date: dayOffset(-28) },
    { id: "e2", name: "Facture Sonelgaz", description: "Électricité bimestrielle", categoryId: "ec2", amount: 9800, date: dayOffset(-18) },
    { id: "e3", name: "Chiffons + dégraissant", description: "", categoryId: "ec3", amount: 3500, date: dayOffset(-12) },
    { id: "e4", name: "Révision pont élévateur", description: "Maintenance annuelle", categoryId: "ec4", amount: 15000, date: dayOffset(-9) },
    { id: "e5", name: "Visserie & consommables", description: "", categoryId: "ec3", amount: 4200, date: dayOffset(-5) },
    { id: "e6", name: "Facture eau (SEAAL)", description: "", categoryId: "ec2", amount: 2400, date: dayOffset(-3) },
    { id: "e7", name: "Gants + lunettes protection", description: "EPI atelier", categoryId: "ec3", amount: 2800, date: dayOffset(-1) },
  ];

  const caisseCategories = [
    { id: "cc1", name: "Apport personnel" },
    { id: "cc2", name: "Versement banque" },
    { id: "cc3", name: "Divers" },
  ];

  const caisse = [
    { id: "t1", type: "deposit", amount: 600000, date: dayOffset(-40), description: "Fonds de caisse initial", categoryId: "cc1" },
    { id: "t2", type: "withdraw", amount: 50000, date: dayOffset(-16), description: "Versement au compte bancaire", categoryId: "cc2" },
    { id: "t3", type: "deposit", amount: 30000, date: dayOffset(-8), description: "Apport complémentaire", categoryId: "cc1" },
    { id: "t4", type: "withdraw", amount: 12000, date: dayOffset(-2), description: "Petites dépenses diverses", categoryId: "cc3" },
  ];

  return {
    users: [
      { id: "u-demo", name: "Admin Démo", username: "demo", email: "demo@garage.dz", password: "demo123", role: "admin" },
    ],
    clients, services, categories, products, suppliers, purchases, repairs,
    workers, roles, expenseCategories, expenses, caisseCategories, caisse,
    barcodes: [],
    counters: { purchase: 6 },
    settings: {
      logo: "",
      name: "AutoGarage Pro",
      description: "Atelier de mécanique et entretien automobile",
      email: "contact@autogarage.dz",
      phone: "021 44 55 66",
      address: "12 Rue des Ateliers, Bab Ezzouar, Alger",
      nif: "000016001234567", nis: "000016009876543", article: "16014123456", rc: "16/00-1234567A25",
    },
    createdAt: now,
  };
}

export function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      // Collections added after a database was first saved
      if (!Array.isArray(db.barcodes)) db.barcodes = [];
      return db;
    }
  } catch (e) { /* corrupted -> reseed */ }
  const db = seedDB();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

export function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function resetDB() {
  const db = seedDB();
  saveDB(db);
  return db;
}

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

export const applyPurchaseToStock = (db, purchase, sign = 1) => {
  purchase.items.forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (!p) return;
    const q = (Number(it.qty) || 0) * sign;
    p.qtyPrincipal += q;
    p.qtyCurrent += q;
    if (sign > 0) {
      p.minQty = Number(it.minQty ?? p.minQty);
      p.purchasePrice = Number(it.price ?? p.purchasePrice);
      if (it.expiration) p.expiration = it.expiration;
    }
  });
};

// ---- print helper (invoices / reports) ----

// Escape user-supplied values before injecting them into printed HTML
export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function printHTML(title, bodyHtml, dir = "ltr") {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e1b31; padding: 32px; font-size: 13px; }
    h1 { font-size: 20px; } h2 { font-size: 15px; margin: 14px 0 6px; color: #4c1d95; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #f5f3ff; color: #4c1d95; text-align: start; }
    th, td { border: 1px solid #ddd6fe; padding: 7px 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 14px; margin-bottom: 18px; }
    .muted { color: #6b7280; font-size: 12px; }
    .tot { font-weight: 700; }
    .sig { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig div { width: 220px; border-top: 1px solid #999; padding-top: 6px; text-align: center; font-size: 12px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: 600; }

    /* ===== Document layout (invoice / repair order) ===== */
    .doc-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px;
                border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 4px; }
    .doc-brand { display: flex; align-items: center; gap: 12px; }
    .doc-brand img { width: 66px; height: 66px; object-fit: contain; border-radius: 10px; border: 1px solid #ede9fe; background: #fff; }
    .doc-brand .logo-ph { width: 66px; height: 66px; border-radius: 10px; background: #f5f3ff; border: 1px solid #ddd6fe;
                          display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #7c3aed; }
    .doc-brand .nm { font-size: 17px; font-weight: 800; color: #4c1d95; line-height: 1.25; }
    .doc-brand .tag { font-size: 11px; color: #6b7280; margin-top: 2px; max-width: 210px; }
    .doc-title { text-align: center; }
    .doc-title h1 { font-size: 25px; letter-spacing: 3px; text-transform: uppercase; color: #4c1d95; font-weight: 800; white-space: nowrap; }
    .doc-title .rule { height: 3px; width: 62px; margin: 7px auto 0; background: #7c3aed; border-radius: 3px; }
    .doc-org { text-align: end; font-size: 11px; color: #4b5563; line-height: 1.75; }
    .doc-org b { color: #1e1b31; }

    .doc-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; justify-content: space-between;
                background: #faf9ff; border: 1px solid #ede9fe; border-radius: 8px;
                padding: 9px 14px; margin: 14px 0 16px; font-size: 12px; }
    .doc-meta span { color: #6b7280; }
    .doc-meta b { color: #1e1b31; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .box { border: 1px solid #ddd6fe; border-radius: 8px; padding: 11px 14px; }
    .box h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #7c3aed;
              margin-bottom: 7px; padding-bottom: 5px; border-bottom: 1px solid #f0edff; }
    .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3.5px 0; font-size: 12px; }
    .kv span { color: #6b7280; }
    .kv b { color: #1e1b31; text-align: end; font-weight: 600; }
    .note { font-size: 12.5px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dim { color: #9ca3af; font-size: 11px; }

    .totals { width: 320px; margin-inline-start: auto; margin-top: 12px; }
    .totals .row { display: flex; justify-content: space-between; gap: 14px; padding: 7px 12px;
                   font-size: 12.5px; border-bottom: 1px solid #f0edff; }
    .totals .row span { color: #6b7280; }
    .totals .row b { font-variant-numeric: tabular-nums; }
    .totals .grand { background: #f5f3ff; border: 1.5px solid #7c3aed; border-radius: 8px;
                     margin-top: 6px; padding: 10px 12px; font-size: 15px; font-weight: 800; color: #4c1d95; }
    .totals .grand span { color: #4c1d95; font-weight: 800; }
    .totals .due { font-weight: 700; }

    .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #ede9fe; text-align: center;
            font-size: 10.5px; color: #9ca3af; line-height: 1.7; }

    @media print {
      body { padding: 10px; }
      .doc-head, .box, .totals, table { break-inside: avoid; }
    }
  </style></head><body>${bodyHtml}
  <script>window.onload = () => { window.print(); }<\/script></body></html>`);
  w.document.close();
}
