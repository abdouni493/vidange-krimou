// ===== Lecture / écriture du document sur Supabase =====
//
// `fetchDB()` recompose le document que l'interface attend à partir des tables
// relationnelles ; `pushDB()` fait le chemin inverse en n'envoyant que ce qui a
// réellement changé depuis la dernière lecture.
//
// Pourquoi un diff plutôt qu'un « tout réécrire » : la RLS n'autorise l'écriture
// que sur ce que l'employé a le droit de modifier. Renvoyer des lignes
// inchangées ferait échouer l'enregistrement d'un vendeur qui n'a que le point
// de vente. Envoyer strictement le delta rend la sauvegarde à la fois rapide et
// compatible avec des permissions étroites.

import { supabase } from "./supabase.js";
import {
  COLLECTIONS, JSON_COLS, BOOL_COLS, NUM_COLS, SETTINGS_COLS,
} from "./mapping.js";

const PAGE = 1000;          // PostgREST plafonne une réponse à 1000 lignes
const CHUNK = 400;          // taille d'un lot d'écriture

const todayISO = () => new Date().toISOString().slice(0, 10);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const fail = (context, error) => {
  const msg = error?.message || String(error);
  const hint =
    error?.code === "42501" || /row-level security/i.test(msg)
      ? " — droits insuffisants pour cette opération"
      : "";
  throw new Error(`${context}: ${msg}${hint}`);
};

// ---------------------------------------------------------------- conversions

const readValue = (col, v) => {
  if (col === "created_at") return v ? String(v).slice(0, 10) : "";
  if (JSON_COLS.has(col)) return v ?? (col === "settled_repair_ids" ? [] : {});
  if (BOOL_COLS.has(col)) return !!v;
  if (NUM_COLS.has(col)) return Number(v) || 0;
  return v ?? "";
};

const writeValue = (col, v) => {
  if (col === "created_at") return v || todayISO();
  if (JSON_COLS.has(col)) return v ?? (col === "settled_repair_ids" ? [] : {});
  if (BOOL_COLS.has(col)) return !!v;
  if (NUM_COLS.has(col)) return Number(v) || 0;
  if (v === undefined || v === "") return col === "id" ? v : null;
  return v;
};

// Le mot de passe d'un employé vit dans Supabase Auth, jamais dans une table.
const scrubAccount = (account) => {
  const { password, ...rest } = account || {};
  return rest;
};

// `__pos` is the row's rank as the database actually stores it. It rides along
// inside the document — never as a column — so that a save can leave untouched
// records exactly as they are instead of renumbering a whole table.
const POS = "__pos";

const fromRow = (spec, row) => {
  const rec = { [POS]: Number(row.position) || 0 };
  for (const [field, col] of Object.entries(spec.cols)) {
    rec[field] = readValue(col, row[col]);
  }
  for (const child of spec.children || []) rec[child.field] = [];
  return rec;
};

const toRow = (spec, rec) => {
  const row = { position: Number(rec[POS]) || 0 };
  for (const [field, col] of Object.entries(spec.cols)) {
    let v = rec[field];
    if (col === "account") v = scrubAccount(v);
    row[col] = writeValue(col, v);
  }
  return row;
};

const childToRow = (child, parentId, item, position) => {
  if (child.scalar) return { [child.parent]: parentId, [child.scalar]: item, position };
  const row = { [child.parent]: parentId, position };
  for (const [field, col] of Object.entries(child.cols)) row[col] = writeValue(col, item[field]);
  return row;
};

const childFromRow = (child, row) => {
  if (child.scalar) return row[child.scalar];
  const rec = {};
  for (const [field, col] of Object.entries(child.cols)) rec[field] = readValue(col, row[col]);
  return rec;
};

// ------------------------------------------------------------------- lecture

async function selectAll(table, order = "position") {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(order, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) fail(`Lecture de « ${table} »`, error);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

/** Recompose le document complet attendu par l'interface. */
export async function fetchAll() {
  const doc = {};

  // Les collections sont indépendantes : on les lit en parallèle.
  const parents = await Promise.all(COLLECTIONS.map((s) => selectAll(s.table)));

  const childJobs = [];
  COLLECTIONS.forEach((spec, i) => {
    // Les listes empilées par la tête sont stockées dans l'ordre chronologique
    // et retournées à l'affichage : la fiche la plus récente arrive en premier.
    const list = parents[i].map((row) => fromRow(spec, row));
    if (spec.newestFirst) list.reverse();
    doc[spec.key] = list;
    for (const child of spec.children || []) {
      childJobs.push({ spec, child, index: new Map(list.map((r) => [r.id, r])) });
    }
  });

  await Promise.all(
    childJobs.map(async ({ child, index }) => {
      const rows = await selectAll(child.table, child.parent);
      // Un seul passage : les lignes arrivent déjà groupées par parent et
      // triées par `position`, il suffit de les distribuer.
      const buckets = new Map();
      for (const row of rows) {
        const key = row[child.parent];
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
      }
      for (const [parentId, list] of buckets) {
        const parent = index.get(parentId);
        if (!parent) continue;
        list.sort((a, b) => (a.position || 0) - (b.position || 0));
        parent[child.field] = list.map((row) => childFromRow(child, row));
      }
    })
  );

  // Comptes administrateurs — lecture seule, l'identité vit dans Supabase Auth.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, role, worker_id, active");
  doc.users = (profiles || [])
    .filter((p) => p.role === "admin")
    .map((p) => ({
      id: p.id, name: p.full_name, username: p.username || "",
      email: p.email || "", role: "admin", active: p.active,
    }));

  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  doc.settings = {};
  for (const col of SETTINGS_COLS) doc.settings[col] = settings?.[col] ?? "";

  const { data: counters } = await supabase.from("counters").select("*").eq("id", 1).maybeSingle();
  doc.counters = {
    purchase: Number(counters?.purchase) || 1,
    sale: Number(counters?.sale) || 1,
  };

  doc.createdAt = settings?.updated_at || new Date().toISOString();
  return doc;
}

// ------------------------------------------------------------------ écriture

const chunked = async (rows, run) => {
  for (let i = 0; i < rows.length; i += CHUNK) await run(rows.slice(i, i + CHUNK));
};

/**
 * Fige le rang de chaque fiche.
 *
 * Une fiche déjà connue garde exactement le rang qu'elle a en base ; seules les
 * nouvelles en reçoivent un, à la suite. Résultat : créer une réparation
 * n'écrit qu'une ligne, et en supprimer une n'en réécrit aucune — alors qu'un
 * rang recalculé depuis l'indice dans le tableau aurait renuméroté toute la
 * table à chaque fois.
 */
function assignPositions(spec, prevList = [], nextList = []) {
  const known = new Map();
  for (const rec of prevList) {
    const v = Number(rec?.[POS]);
    if (Number.isFinite(v)) known.set(rec.id, v);
  }
  let free = known.size ? Math.max(...known.values()) + 1 : 0;

  // Parcours dans l'ordre où la base doit ranger les fiches.
  const order = spec.newestFirst ? [...nextList].reverse() : nextList;
  for (const rec of order) {
    const seen = known.get(rec.id);
    rec[POS] = Number.isFinite(seen) ? seen : free++;
  }
}

/** Ce qui a bougé, pour une collection, entre `prevList` et `nextList`. */
function diffCollection(spec, prevList = [], nextList = []) {
  // La comparaison porte sur la forme « ligne SQL », jamais sur l'objet du
  // document : deux écritures équivalentes — un champ absent d'un côté, vide de
  // l'autre — donnent la même ligne et ne déclenchent donc aucune réécriture.
  const snapshotOf = (list) =>
    new Map(
      list.map((rec) => [
        rec.id,
        {
          row: toRow(spec, rec),
          children: (spec.children || []).map((c) =>
            (rec[c.field] || []).map((item, i) => childToRow(c, rec.id, item, i))
          ),
        },
      ])
    );

  const before = snapshotOf(prevList);
  const after = snapshotOf(nextList);

  const upserts = [];
  const childReplacements = [];
  for (const [id, entry] of after) {
    const old = before.get(id);
    if (!old || !same(old.row, entry.row)) upserts.push(entry.row);
    (spec.children || []).forEach((child, i) => {
      if (!old || !same(old.children[i], entry.children[i])) {
        childReplacements.push({ child, parentId: id, rows: entry.children[i] });
      }
    });
  }

  const removed = [...before.keys()].filter((id) => !after.has(id));
  return { upserts, childReplacements, removed };
}

/**
 * Envoie le delta entre le dernier document connu et `nextDoc`, et renvoie le
 * document tel que la base le contient désormais — à conserver comme point de
 * comparaison pour la sauvegarde suivante.
 */
export async function pushAll(prevDoc, nextDoc) {
  const stored = structuredClone(nextDoc);
  const diffs = new Map();
  for (const spec of COLLECTIONS) {
    assignPositions(spec, prevDoc?.[spec.key], stored?.[spec.key]);
    diffs.set(spec.key, diffCollection(spec, prevDoc?.[spec.key], stored?.[spec.key]));
  }

  // 1. suppressions, des feuilles vers les racines (les enfants tombent en cascade)
  for (const spec of [...COLLECTIONS].reverse()) {
    const { removed } = diffs.get(spec.key);
    if (!removed.length) continue;
    await chunked(removed, async (ids) => {
      const { error } = await supabase.from(spec.table).delete().in("id", ids);
      if (error) fail(`Suppression dans « ${spec.table} »`, error);
    });
  }

  // 2. créations et modifications, des racines vers les feuilles
  for (const spec of COLLECTIONS) {
    const { upserts, childReplacements } = diffs.get(spec.key);

    if (upserts.length) {
      await chunked(upserts, async (rows) => {
        const { error } = await supabase.from(spec.table).upsert(rows, { onConflict: "id" });
        if (error) fail(`Enregistrement de « ${spec.table} »`, error);
      });
    }

    // Les lignes d'un document sont remplacées en bloc : elles n'ont pas
    // d'identité propre côté interface, et un document en compte une poignée.
    for (const { child, parentId, rows } of childReplacements) {
      const { error: delErr } = await supabase.from(child.table).delete().eq(child.parent, parentId);
      if (delErr) fail(`Mise à jour de « ${child.table} »`, delErr);
      if (!rows.length) continue;
      const { error } = await supabase.from(child.table).insert(rows);
      if (error) fail(`Mise à jour de « ${child.table} »`, error);
    }
  }

  // 3. singletons
  if (!same(prevDoc?.settings, stored?.settings)) {
    const row = { id: 1, updated_at: new Date().toISOString() };
    for (const col of SETTINGS_COLS) row[col] = stored.settings?.[col] ?? "";
    const { error } = await supabase.from("settings").upsert(row, { onConflict: "id" });
    if (error) fail("Enregistrement des paramètres", error);
  }

  if (!same(prevDoc?.counters, stored?.counters)) {
    const { error } = await supabase.from("counters").upsert(
      {
        id: 1,
        purchase: Number(stored.counters?.purchase) || 1,
        sale: Number(stored.counters?.sale) || 1,
      },
      { onConflict: "id" }
    );
    if (error) fail("Enregistrement des compteurs", error);
  }

  return stored;
}

/** Vide toutes les tables métier (bouton « Réinitialiser » des paramètres). */
export async function resetAll() {
  for (const spec of [...COLLECTIONS].reverse()) {
    const { error } = await supabase.from(spec.table).delete().not("id", "is", null);
    if (error) fail(`Réinitialisation de « ${spec.table} »`, error);
  }
  await supabase.from("counters").upsert({ id: 1, purchase: 1, sale: 1 }, { onConflict: "id" });
  const blank = { id: 1, updated_at: new Date().toISOString() };
  for (const col of SETTINGS_COLS) blank[col] = "";
  await supabase.from("settings").upsert(blank, { onConflict: "id" });
  return fetchAll();
}
