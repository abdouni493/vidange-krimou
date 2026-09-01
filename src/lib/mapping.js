// ===== Correspondance document en mémoire <-> tables PostgreSQL =====
//
// L'interface travaille sur un seul document JavaScript (`db`) qu'elle mute
// librement. Côté Supabase, ce document est stocké dans de vraies tables
// reliées entre elles. Ce fichier décrit la traduction, une fois, pour que
// `remote.js` puisse lire et écrire sans connaître le métier.
//
// Un descripteur de collection :
//   key         clé du document ("repairs")
//   table       table PostgreSQL ("repairs")
//   cols        { champDocument: "colonne_sql" }
//   newestFirst la liste est empilée par la tête (les nouvelles fiches en haut)
//   children    sous-tables du document (lignes, paiements, affectations)
//
// Un descripteur d'enfant :
//   field       champ tableau du parent ("items")
//   table       table PostgreSQL ("purchase_items")
//   parent      colonne de rattachement ("purchase_id")
//   cols        { champDocument: "colonne_sql" }
//   scalar      l'enfant est un identifiant nu et non un objet ("workers")

export const COLLECTIONS = [
  {
    key: "categories",
    table: "categories",
    cols: { id: "id", name: "name", createdAt: "created_at" },
  },
  {
    key: "roles",
    table: "roles",
    cols: { id: "id", name: "name", createdAt: "created_at" },
  },
  {
    key: "clients",
    table: "clients",
    cols: {
      id: "id", name: "name", phone: "phone", address: "address",
      email: "email", note: "note", createdAt: "created_at",
    },
  },
  {
    key: "suppliers",
    table: "suppliers",
    cols: {
      id: "id", name: "name", phone: "phone", address: "address",
      email: "email", note: "note", createdAt: "created_at",
    },
  },
  {
    key: "services",
    table: "services",
    cols: {
      id: "id", name: "name", description: "description",
      price: "price", createdAt: "created_at",
    },
  },
  {
    key: "products",
    table: "products",
    cols: {
      id: "id", name: "name", description: "description", brand: "brand",
      categoryId: "category_id", barcode: "barcode", imageUrl: "image_url",
      purchasePrice: "purchase_price", salePrice: "sale_price",
      qtyPrincipal: "qty_principal", qtyCurrent: "qty_current", minQty: "min_qty",
      trackExpiration: "track_expiration", expiration: "expiration",
      createdAt: "created_at",
    },
  },
  {
    key: "barcodes",
    table: "barcodes",
    newestFirst: true,
    cols: {
      id: "id", name: "name", code: "code", price: "price",
      productId: "product_id", createdAt: "created_at",
    },
  },
  {
    key: "expenseCategories",
    table: "expense_categories",
    cols: { id: "id", name: "name", createdAt: "created_at" },
  },
  {
    key: "expenses",
    table: "expenses",
    newestFirst: true,
    cols: {
      id: "id", name: "name", description: "description",
      categoryId: "category_id", amount: "amount", date: "date",
      createdAt: "created_at",
    },
  },
  {
    key: "caisseCategories",
    table: "caisse_categories",
    cols: { id: "id", name: "name", createdAt: "created_at" },
  },
  {
    key: "caisse",
    table: "caisse_entries",
    newestFirst: true,
    cols: {
      id: "id", type: "type", amount: "amount", date: "date",
      description: "description", categoryId: "category_id",
      createdAt: "created_at",
    },
  },
  {
    key: "workers",
    table: "workers",
    cols: {
      id: "id", userId: "user_id", fullName: "full_name", birthday: "birthday",
      idCard: "id_card", phone: "phone", roleId: "role_id", startDate: "start_date",
      photoUrl: "photo_url", pay: "pay", account: "account",
      permissions: "permissions", settledRepairIds: "settled_repair_ids",
      createdAt: "created_at",
    },
    children: [
      {
        field: "advances", table: "worker_advances", parent: "worker_id",
        cols: { id: "id", date: "date", description: "description", amount: "amount", settled: "settled" },
      },
      {
        field: "absences", table: "worker_absences", parent: "worker_id",
        cols: { id: "id", date: "date", description: "description", cost: "cost", settled: "settled" },
      },
      {
        field: "payments", table: "worker_payments", parent: "worker_id",
        cols: { id: "id", date: "date", description: "description", amount: "amount", details: "details" },
      },
    ],
  },
  {
    key: "purchases",
    table: "purchases",
    newestFirst: true,
    cols: {
      id: "id", ref: "ref", supplierId: "supplier_id", date: "date",
      total: "total", note: "note", createdAt: "created_at",
    },
    children: [
      {
        field: "items", table: "purchase_items", parent: "purchase_id",
        cols: {
          productId: "product_id", qty: "qty", price: "price",
          salePrice: "sale_price", minQty: "min_qty", expiration: "expiration",
        },
      },
      {
        field: "payments", table: "purchase_payments", parent: "purchase_id",
        cols: { id: "id", amount: "amount", date: "date" },
      },
    ],
  },
  {
    key: "sales",
    table: "sales",
    newestFirst: true,
    cols: {
      id: "id", ref: "ref", clientId: "client_id", date: "date",
      subtotal: "subtotal", discount: "discount", total: "total",
      note: "note", createdAt: "created_at",
    },
    children: [
      {
        field: "items", table: "sale_items", parent: "sale_id",
        cols: { productId: "product_id", name: "name", qty: "qty", price: "price" },
      },
      {
        field: "payments", table: "sale_payments", parent: "sale_id",
        cols: { id: "id", amount: "amount", date: "date" },
      },
    ],
  },
  {
    key: "repairs",
    table: "repairs",
    newestFirst: true,
    cols: {
      id: "id", type: "type", status: "status", dateIn: "date_in", dateOut: "date_out",
      clientId: "client_id", car: "car", problem: "problem", subtotal: "subtotal",
      tva: "tva", total: "total", createdAt: "created_at",
    },
    children: [
      {
        // Le catalogue reste la source du libellé et du prix : on ne stocke
        // que le lien, ce qui évite un doublon qui divergerait à la première
        // modification du service.
        field: "services", table: "repair_services", parent: "repair_id",
        cols: { serviceId: "service_id" },
      },
      {
        field: "products", table: "repair_products", parent: "repair_id",
        cols: { productId: "product_id", qty: "qty" },
      },
      {
        field: "workers", table: "repair_workers", parent: "repair_id",
        scalar: "worker_id",
      },
      {
        field: "payments", table: "repair_payments", parent: "repair_id",
        cols: { id: "id", amount: "amount", date: "date" },
      },
    ],
  },
];

// `method` et `note` existent en base sur les tables de règlement mais ne sont
// pas cartographiées : l'interface ne les saisit pas, et les faire remonter
// ajouterait des champs vides au document sans rien apporter.

// Les colonnes JSON traversent la frontière telles quelles ; toutes les autres
// sont des scalaires. Utile pour ne pas transformer un objet en chaîne.
export const JSON_COLS = new Set([
  "pay", "account", "permissions", "settled_repair_ids",
  "car", "tva", "discount", "details",
]);

// Colonnes booléennes : PostgREST refuse une chaîne vide sur un boolean.
export const BOOL_COLS = new Set(["track_expiration", "settled"]);

// Colonnes numériques : une chaîne vide venue d'un <input> doit devenir 0.
export const NUM_COLS = new Set([
  "price", "amount", "cost", "total", "subtotal", "qty", "purchase_price",
  "sale_price", "qty_principal", "qty_current", "min_qty",
]);

export const SETTINGS_COLS = [
  "logo", "name", "description", "email", "phone", "address",
  "nif", "nis", "article", "rc",
];

/** Ordre d'écriture : un parent est inséré avant ce qui le référence. */
export const WRITE_ORDER = COLLECTIONS.map((c) => c.key);
