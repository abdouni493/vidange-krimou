// ===== Connexion au projet Supabase =====
//
// Les identifiants sont ceux d'un client public (clé « anon ») : ils sont
// destinés à être embarqués dans le bundle. Ce qui protège réellement les
// données, ce sont les politiques RLS de `supabase/schema.sql`, pas le secret
// de cette clé. Un `.env` local peut les remplacer pour pointer un autre projet.

import { createClient } from "@supabase/supabase-js";

const env = import.meta.env || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL || "https://oyzbnolbwbrmdaskflbo.supabase.co";

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95emJub2xid2JybWRhc2tmbGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTA2ODksImV4cCI6MjEwMzg2NjY4OX0.7hTRGzQnpsfsYn4ljkHRDQf_teyABhw4yZqOIhcWJLU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "garage_auth_v1",
  },
});

/**
 * Client jetable, sans session persistée.
 *
 * `signUp()` remplace la session du client qui l'émet : un administrateur qui
 * crée le compte d'un employé se retrouverait connecté à la place de cet
 * employé. En passant par une instance isolée, le compte est bien créé côté
 * Supabase mais la session de l'admin reste intacte.
 */
export const createSignupClient = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

// ---- stockage de fichiers ----

/** URL publique d'un objet des buckets `logos` / `products` / `workers`. */
export const publicUrl = (bucket, path) =>
  path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : "";

const slug = (name = "") =>
  name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "fichier";

/**
 * Envoie une image dans un bucket et renvoie son URL publique.
 * Le chemin porte un horodatage : remplacer un logo n'écrase pas l'ancien
 * fichier encore référencé par une facture déjà imprimée.
 */
export async function uploadImage(bucket, file, folder = "") {
  const path = `${folder ? `${folder}/` : ""}${Date.now()}-${slug(file.name)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { path, url: publicUrl(bucket, path) };
}
