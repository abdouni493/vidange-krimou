# AutoGarage Pro — Gestion de garage automobile

Application web complète de gestion de garage (réparations, rendez-vous, stock, codes-barres, achats, point de vente, clients, fournisseurs, employés, dépenses, caisse, rapports, analyse), en **français** avec bascule **arabe (RTL)**, mode clair avec dégradés et animations Framer Motion.

Les données vivent dans un **projet Supabase (PostgreSQL)** : comptes, permissions, documents et images. Aucune donnée de démonstration — la base démarre vide et se remplit avec vos données réelles.

---

## 1. Mettre en place la base (une seule fois)

1. Ouvrez le projet Supabase : <https://supabase.com/dashboard/project/oyzbnolbwbrmdaskflbo>
2. **SQL Editor → New query**, collez tout le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis **Run**.
   Le script crée les tables, les relations, les permissions, les vues de reporting et les buckets d'images. Il est **rejouable** sans perte de données.
3. **Authentication → Providers → Email** : décochez **Confirm email**.
   Sans cela, chaque compte créé (admin comme employé) doit d'abord cliquer un lien reçu par mail avant de pouvoir se connecter.

Vérification rapide, dans le SQL Editor :

```sql
select public.admin_exists();                          -- false sur une base neuve
select tablename from pg_tables where schemaname='public' order by 1;
select id, name, public from storage.buckets;
```

### Créer le compte administrateur

Lancez l'application : tant qu'aucun administrateur n'existe, l'écran de connexion affiche l'onglet **« Créer un compte admin »**. Renseignez nom, identifiant, email et mot de passe.

Dès que le compte est créé, **le bouton disparaît définitivement**. Ce n'est pas seulement cosmétique : la fonction `handle_new_user()` n'accorde le rôle `admin` que tant qu'aucun administrateur n'existe. Une inscription ultérieure est créée en `worker`, même si le navigateur demande autre chose.

### Créer les comptes employés

**Employés → Nouvel employé → Compte de connexion**. Le compte est créé dans Supabase Auth ; le mot de passe n'est **jamais** stocké dans une table.

Ensuite, **Permissions** sur la fiche : cochez les interfaces visibles, puis les actions autorisées (créer, modifier, supprimer, payer, finaliser, annuler, imprimer…). L'employé ne voit que ces rubriques dans le menu, et seulement ces boutons dans les pages — et la base refuse de son côté toute écriture non accordée.

---

## 2. Démarrage

### Windows

Double-cliquez sur le raccourci **AutoGarage Pro**, ou sur `AutoGarage.bat`. Le lanceur installe les dépendances, compile, démarre le serveur et ouvre <http://localhost:5180>.

Pour (re)créer les raccourcis Bureau et menu Démarrer :

```bash
powershell -ExecutionPolicy Bypass -File tools\create-shortcut.ps1
```

### En ligne de commande

```bash
npm install
npm run serve      # compile puis sert sur http://localhost:5180
npm run dev        # développement, rechargement à chaud, http://localhost:5173
```

| Script | Rôle |
|---|---|
| `npm start` | sert `dist/` (port 5180) |
| `npm run build` | compile l'interface dans `dist/` |
| `npm run serve` | compile puis sert — le plus simple |
| `npm run dev` | serveur de développement Vite (port 5173) |
| `npm test` | vérifie la couche Supabase sans réseau (voir §6) |

Le serveur Node ne fait plus que livrer les fichiers compilés : le navigateur parle directement à Supabase. L'application peut donc aussi être publiée telle quelle sur n'importe quel hébergeur statique (Vercel, Netlify, GitHub Pages) — voir §5.

### Pointer un autre projet Supabase

Les identifiants du projet sont dans `src/lib/supabase.js`. Pour en viser un autre (recette, second garage), copiez `.env.example` en `.env` et renseignez `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

La clé **anon** est publique par nature — elle part dans le bundle du navigateur. Ce qui protège les données, ce sont les politiques RLS de `schema.sql`. N'utilisez **jamais** la clé `service_role` dans cette application.

---

## 3. Scanner les codes-barres avec le téléphone

Un bouton **Scanner** ouvre la caméra dans trois endroits :

- **Réparations & RDV** → assistant de création, étape *Services* → **Produits du stock**
- **Réparations & RDV** → **Finalisation** d'un rendez-vous
- **Point de vente**

Chaque code reconnu ajoute la pièce à la fiche (ou incrémente sa quantité) et affiche le nom du produit. Le scanner reste ouvert pour enchaîner plusieurs articles.

- Sur Chrome / Android, le décodage utilise `BarcodeDetector`, intégré au système.
- Ailleurs (Safari iOS, Firefox, ordinateurs), ZXing est chargé à la demande — il n'entre dans le bundle que s'il sert.
- Formats lus : EAN-13, EAN-8, UPC-A/E, Code 128, Code 39, ITF, Codabar.
- Un champ de saisie manuelle accepte aussi une **douchette USB** ou un code tapé au clavier.
- Au point de vente, taper un code puis **Entrée** dans la recherche ajoute directement l'article.

> **La caméra exige une origine sécurisée.** `http://localhost` convient ; `http://192.168.x.x` **non** — les navigateurs bloquent `getUserMedia` hors HTTPS. Pour scanner depuis un téléphone, publiez l'application en HTTPS (§5). Le scanner l'explique à l'écran le cas échéant, et la saisie manuelle reste disponible.

### Retrouver un produit

La recherche du stock est insensible aux accents et à la casse, accepte les mots dans n'importe quel ordre, et cherche dans le **nom, la marque, la description et le code-barres**. Un code scanné est également rapproché des étiquettes créées dans **Codes-barres**, et tolère la variante à 12/13 chiffres (UPC-A ↔ EAN-13).

---

## 4. Ce que contient la base

`supabase/schema.sql` est commenté section par section.

| Domaine | Tables |
|---|---|
| Identité | `profiles` (lié à `auth.users`) |
| Employés | `roles`, `workers`, `worker_advances`, `worker_absences`, `worker_payments` |
| Tiers | `clients`, `suppliers` |
| Catalogue | `categories`, `products`, `services`, `barcodes` |
| Achats | `purchases`, `purchase_items`, `purchase_payments` |
| Ventes | `sales`, `sale_items`, `sale_payments` |
| Atelier | `repairs`, `repair_services`, `repair_products`, `repair_workers`, `repair_payments` |
| Trésorerie | `expense_categories`, `expenses`, `caisse_categories`, `caisse_entries` |
| Réglages | `settings`, `counters`, `audit_log` |

Vues de reporting : `v_repair_balances`, `v_sale_balances`, `v_purchase_balances`, `v_low_stock`, `v_daily_revenue`, `v_worker_commissions`.

### Permissions

| Fonction | Rôle |
|---|---|
| `is_admin()` | l'utilisateur courant est administrateur |
| `is_staff()` | compte actif du garage |
| `has_perm(page, action)` | droit sur une action précise d'une interface |
| `has_any_perm(page, actions[])` | un bouton couvert par plusieurs droits |
| `admin_exists()` | utilisée par l'écran de connexion, appelable sans être connecté |
| `login_email(identifiant)` | traduit un nom d'utilisateur en email pour la connexion |

Le modèle retenu : **lecture** ouverte à tout membre du personnel actif (l'application charge le dossier complet en mémoire ; couper la lecture casserait les pages auxquelles l'employé *a* droit), **écriture** strictement pilotée par les permissions accordées, action par action. La paie fait exception : acomptes, absences et paiements ne sont lisibles que par un administrateur, par un employé ayant la page « Employés », ou par l'intéressé pour ses propres lignes.

### Images

| Bucket | Contenu | Accès |
|---|---|---|
| `logos` | logo du garage (entête et factures) | lecture publique |
| `products` | photos d'articles | lecture publique |
| `workers` | photos du personnel | lecture publique |
| `documents` | pièces jointes | personnel connecté |

L'écriture suit la permission de l'interface qui alimente le bucket. Le logo envoyé depuis **Paramètres** est stocké dans `logos` et seule son URL est enregistrée — une facture ou un poste distant l'affiche sans transporter l'image dans chaque lecture.

---

## 5. Publier en HTTPS

Nécessaire pour scanner depuis un téléphone. L'application est un site statique :

```bash
npm run build     # produit dist/
```

Déposez `dist/` sur Vercel, Netlify, Cloudflare Pages ou GitHub Pages. Aucune variable d'environnement n'est requise — les identifiants Supabase sont déjà dans le bundle ; ajoutez `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` seulement pour viser un autre projet.

---

## 6. Comment les données circulent

L'interface travaille sur **un seul document en mémoire** qu'elle mute librement ; la persistance est une lecture au démarrage et une écriture groupée (400 ms) à chaque changement. `src/lib/mapping.js` décrit la traduction document ↔ tables, `src/lib/remote.js` l'exécute.

Une sauvegarde n'envoie **que le delta** : c'est ce qui la rend rapide, et surtout compatible avec des permissions étroites — renvoyer des lignes inchangées ferait échouer l'enregistrement d'un vendeur qui n'a que le point de vente.

```bash
npm test
```

Le test remplace le client Supabase par un faux — un enregistreur d'appels, puis une base en mémoire — et vérifie qu'une nouvelle réparation n'écrit qu'une ligne, qu'une suppression n'en renumérote aucune, qu'un mot de passe employé ne part jamais en base, et qu'un document rechargé depuis les tables est identique à celui qu'avait l'interface.

**Paramètres → Base de données** offre en plus la sauvegarde / restauration JSON et la remise à zéro complète.

---

## 7. Codes-barres et impression

L'interface **Codes-barres** génère des codes **EAN-13 valides** (préfixe GS1 `613`, chiffre de contrôle calculé) et imprime des planches d'étiquettes : génération aléatoire ou saisie manuelle corrigée, pré-remplissage depuis un produit du stock, 3 formats d'étiquettes (38×24, 50×30, 70×40 mm), contenu configurable, impression par lot. Le rendu est fait maison (`src/barcode.js`, SVG, sans dépendance) et sert à l'écran comme au papier.

Facture, bon de réparation et facture d'achat partagent une même mise en page (`docHead` / `PRINT_CSS` dans `src/store.js`) : identité du garage au-dessus du filet, titre centré sous le filet avec sa référence, encadrés client / véhicule, tableau à en-tête violet, cachet *Payé / Partiel / Impayé*, bloc de totaux. Le sens RTL est géré pour l'arabe.

```bash
node tools/preview-print.mjs   # exemples HTML dans ./preview-print
node tools/make-icon.mjs       # régénère assets/autogarage.ico
```

---

## Stack

- React 18 + Vite
- Supabase (PostgreSQL, Auth, Storage, RLS)
- Tailwind CSS · Framer Motion · Emotion · Lucide React
- `BarcodeDetector` natif, ZXing en repli chargé à la demande
- Serveur : Node `node:http` — fichiers statiques uniquement

**Prérequis :** Node.js 18 ou plus récent.
