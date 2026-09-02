-- ============================================================================
--  AutoGarage Pro — reprise des donnees du garage dans Supabase
--
--  A executer APRES supabase/schema.sql, en une fois dans
--  Supabase Dashboard > SQL Editor > New query.
--
--  Contenu repris depuis l'export JSON de l'application :
--     4 categories
--     9 prestations
--     1 fournisseur
--    30 produits
--     3 achats (23 lignes, 4 reglements)
--     1 reparation (4 prestations, 1 reglement)
--     1 compteur de references
--
--  Le script est IDEMPOTENT : on peut le rejouer sans creer de doublon.
--  Les documents (achats, reparations) voient leurs lignes filles reecrites
--  a chaque passage, car ces tables ont une cle technique auto-incrementee
--  et non l'identifiant metier.
--
--  CE QUE CE SCRIPT NE FAIT PAS
--    Le compte « admin » de l'export n'est pas cree ici : une identite vit
--    dans auth.users, avec un mot de passe chiffre que du SQL ne peut pas
--    fabriquer proprement. Creez-le depuis l'ecran « Creer un compte admin »
--    de l'application (ou Dashboard > Authentication > Add user) : le trigger
--    handle_new_user donne le role admin au tout premier compte de la base.
--    Le mot de passe « admin123 » de l'export circule en clair dans le JSON —
--    profitez de cette reprise pour en choisir un autre.
--
--  CONVERSIONS APPLIQUEES (le JSON n'a pas les types de PostgreSQL)
--    categoryId ""      -> NULL   (une chaine vide violerait la cle etrangere)
--    clientId   ""      -> NULL   (idem sur la reparation)
--    barcode/expiration -> NULL   (l'application relit NULL comme "")
--    trackExpiration 0  -> false  (la colonne est un boolean not null)
--    createdAt "JJ"     -> timestamptz
--    position           -> rang d'affichage attendu par src/lib/remote.js :
--                          ordre du tableau pour le catalogue, ordre inverse
--                          pour les listes empilees par la tete (achats,
--                          reparations), afin que la fiche la plus recente
--                          remonte en premier dans l'interface.
-- ============================================================================

begin;

-- Garde-fou : sans le schema, autant s'arreter avec un message clair.
do $guard$
begin
  if to_regclass('public.products') is null then
    raise exception 'Schema absent : executez d''abord supabase/schema.sql';
  end if;
end
$guard$;

-- --------------------------------------------------------------------------
-- 1. CATEGORIES (4)
-- --------------------------------------------------------------------------
insert into public.categories (id, name, position) values
  ('mryp01x3168prd', 'FILTRE A HUILE', 0),
  ('mryplsllcsb4fp', 'FILTRE A AIR', 1),
  ('ms1aa31vecqqy4', 'FILTRE A GASOIL', 2),
  ('ms2bahsmlklb8x', 'FILTRE A CLIM', 3)
on conflict (id) do update set name = excluded.name, position = excluded.position;

-- --------------------------------------------------------------------------
-- 2. PRESTATIONS (9)
-- --------------------------------------------------------------------------
insert into public.services (id, name, description, price, position) values
  ('ms1awo7g5mwuxo', 'CHANGEMENT KIT CHAINE', 'changement kit chaine de distribution', 5000, 0),
  ('ms1axpd8yydrpr', 'CHANGEMENT PLAQUETTES DE FREIN', 'CHAN/PLAQU/FREIN', 1000, 1),
  ('ms1ay5okq5v27u', 'VIDANGE MOTEUR', 'VIDANGE MOTEUR', 700, 2),
  ('ms1ayvxx2620or', 'VIDANGE BOITE MANUELLE', 'VIDANGE BOITE DE VITESSE MANUELLE', 1000, 3),
  ('ms1azs6sflnkka', 'SCANNER /DIAGNOSTIC', 'SCAN/DIAGNO/VERIFICATION', 1500, 4),
  ('ms1b0sskjrc4jp', 'CHANGEMENT FILTRE A GASOIL', 'CHANG FILTRE GASOIL', 1000, 5),
  ('ms1b20hlug5pzx', 'VIANGE+FILTRE HUILE+FILTRE A AIR +FILTRE A GASOIL', 'CHANGEMENT TT LES FILTRES ', 2500, 6),
  ('ms1b3354lgmy67', 'CHANGEMENT LIQUIDES DE REFROISSEMENT', 'CHANGEMNT GLACEOL', 1000, 7),
  ('ms1b426ngphr3c', 'CHANGMENT BOUGIES D''ALLUMAGE', 'CHANG BOUGIES', 1000, 8)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  price       = excluded.price,
  position    = excluded.position;

-- --------------------------------------------------------------------------
-- 3. FOURNISSEURS (1)
-- --------------------------------------------------------------------------
insert into public.suppliers (id, name, phone, address, email, note, position) values
  ('mryorgpaimktlm', 'HAMID BOSCH', '0550646426', 'BBZ', null, null, 0)
on conflict (id) do update set
  name     = excluded.name,
  phone    = excluded.phone,
  address  = excluded.address,
  position = excluded.position;

-- --------------------------------------------------------------------------
-- 4. PRODUITS (30)
-- --------------------------------------------------------------------------
-- qty_principal = quantite de reference, qty_current = quantite en rayon.
-- Les deux sont identiques dans l'export : aucun mouvement de sortie n'a
-- encore ete enregistre (0 vente).
insert into public.products (
  id, name, description, brand, category_id, barcode,
  purchase_price, sale_price, qty_principal, qty_current, min_qty,
  track_expiration, expiration, position, created_at
) values
  ('mryopv4qyv3lzq', 'FILTRE A HUILE G7/LEON/HU7020Z', 'FH GOLF 7 OE688/3', 'FILTRON ', null, null,
   620, 1200, 10, 10, 2,
   false, null, 0, timestamptz '2026-07-24'),
  ('mryouo5u0nr191', 'FILTRE A HUILE GOLF7/LEO NM/03N HU7020Z', 'FH GOLF 7 HU7020Z', 'MANN', null, null,
   980, 1500, 6, 6, 2,
   false, null, 1, timestamptz '2026-07-24'),
  ('mryp1hho7y9fu8', 'FILTRE A HUILE GOLF 6 TIGUAN CADDY HU7080Z.03L', 'FH GOLF 6 1.6 TDI OE688 ', 'FILTRON', 'mryp01x3168prd', null,
   0, 0, 10, 10, 0,
   false, null, 2, timestamptz '2026-07-24'),
  ('mryp5je1j02jtc', 'FILTRE A HUILE GOLF 4/A3 HU726/2X', 'FH GOLF 4 DISEL WL7008', 'WIX', 'mryp01x3168prd', null,
   550, 850, 6, 6, 1,
   false, null, 3, timestamptz '2026-07-24'),
  ('mryp8pdti34le3', 'FILTRE A HULE POLO IBIZA 1.4 ESS', 'FH POLO1.4 NC-FH52', 'INCI', 'mryp01x3168prd', null,
   550, 900, 20, 20, 2,
   false, null, 4, timestamptz '2026-07-24'),
  ('mrypck07b54blf', 'FILTRE AHUILE PICCANTO HYUNDAI ATOS', 'FH ATOS/PICCANTO/26300-02752', 'HYUNDAI OR', 'mryp01x3168prd', null,
   500, 850, 40, 40, 5,
   false, null, 5, timestamptz '2026-07-24'),
  ('mrypghesq0yul1', 'FILTRE A HUILE POLO/IBIZA/TFSI', 'FH T ROC TFSI MANNW712/95', 'MANN', 'mryp01x3168prd', null,
   1250, 1900, 4, 4, 1,
   false, null, 6, timestamptz '2026-07-24'),
  ('mrypjzd2nl5eyt', 'FILTRE A HUILE 207/C3/1109CK', 'FH 1109CK 207 ESS', 'MULLER', 'mryp01x3168prd', null,
   550, 850, 10, 10, 2,
   false, null, 7, timestamptz '2026-07-24'),
  ('mrypmjih2d7jgu', 'FILTRE A AIR GOLF6/G5/CADDY', 'FAIR GOLF5/6 1K0129620D', 'VW 1', 'mryplsllcsb4fp', null,
   600, 1200, 14, 14, 3,
   false, null, 8, timestamptz '2026-07-24'),
  ('mrypqi7enozu9q', 'FAIR GOLF 8ESS/TFSI', '5Q0129620G-5Q0129620E', 'VW1', 'mryplsllcsb4fp', null,
   750, 1200, 20, 20, 3,
   false, null, 9, timestamptz '2026-07-24'),
  ('mrypv1aqa1o71s', 'FILTRE A HUILE POLO1.6 IBIZANM', '109520338G01', 'VW', 'mryp01x3168prd', null,
   850, 1200, 10, 10, 2,
   false, null, 10, timestamptz '2026-07-24'),
  ('ms19vzwpfh2r9j', 'FILTRE A BERLINGO/PARTNER/208/1.6 HDI', '144TV', 'PEUGEOT 1', 'mryplsllcsb4fp', null,
   500, 1000, 20, 20, 3,
   false, null, 11, timestamptz '2026-07-26'),
  ('ms19y1jxwfn3ye', 'FILTRE A AIR KANGOO', '165467751R', 'RENEAULT', 'mryplsllcsb4fp', null,
   480, 1200, 10, 10, 2,
   false, null, 12, timestamptz '2026-07-26'),
  ('ms1a6i8n3rtcu2', 'FILTRE A AIR MEGAN/KANGOO NM/M', '165467751R-SMF2172HF', 'SMF', 'mryplsllcsb4fp', null,
   600, 1100, 10, 10, 2,
   false, null, 13, timestamptz '2026-07-26'),
  ('ms1ab8m8do2j94', 'FILTRE A GASOI HYUNDAI H1', 'KIA/27003031922-2E900', '7PARTS', 'ms1aa31vecqqy4', null,
   850, 1700, 4, 4, 1,
   false, null, 14, timestamptz '2026-07-26'),
  ('ms1adk95z1c1y6', 'FIULTRE A GASOIL TUCSSON/SPORTAGE', '2B900', '7PARTS', 'ms1aa31vecqqy4', null,
   850, 1700, 4, 4, 1,
   false, null, 15, timestamptz '2026-07-26'),
  ('ms1afxrtmkls3i', 'FILTRE A GASOIL POLO/IBIZA AM', '6Q0127401B', 'TECNO', 'ms1aa31vecqqy4', null,
   750, 1250, 4, 4, 1,
   false, null, 16, timestamptz '2026-07-26'),
  ('ms1apbz3qakh63', 'FILTRE A AIR EVOQUE LANDROVER', 'FILTRE A AIR EVOQUE', 'PROFIX UK', 'mryplsllcsb4fp', null,
   950, 1600, 4, 4, 1,
   false, null, 17, timestamptz '2026-07-26'),
  ('ms1arjtsrs2rc9', 'FILTRE A AIR KIAA PICCANTO NM', '28113-04000', 'ABS', 'mryplsllcsb4fp', null,
   350, 750, 20, 20, 4,
   false, null, 18, timestamptz '2026-07-26'),
  ('ms24xmi87l2k7d', 'FILTRE A AIR HYUNDAI', '28113-B4000', 'QUEENS', 'mryplsllcsb4fp', null,
   0, 0, 3, 3, 0,
   false, null, 19, timestamptz '2026-07-26'),
  ('ms24zr9d371rml', 'FILTRE A AIR 1.5DCI CLIO 4', 'VS-FA115', 'VESTAL', 'mryplsllcsb4fp', null,
   500, 950, 10, 10, 3,
   false, null, 20, timestamptz '2026-07-26'),
  ('ms2b3u0i1ro1t8', 'FILTRE A HUILE TOYOYA YARIS NM', '15613-YZZA6', 'TOYOTA', 'mryp01x3168prd', null,
   500, 950, 8, 8, 2,
   false, null, 21, timestamptz '2026-07-26'),
  ('ms2b69t1kqn9d7', 'FILTRE A AIR FIAT 500 1.0 HYBRID', '52112352', 'ABS', 'mryplsllcsb4fp', null,
   1150, 1500, 10, 10, 3,
   false, null, 22, timestamptz '2026-07-26'),
  ('ms2bawbeqx4ngm', 'FILTRE A CLIM SUZUKI-SWIF-PICCANTO NM', '9586058J00', 'HAMID SUZUKI', 'ms2bahsmlklb8x', null,
   480, 1000, 10, 10, 2,
   false, null, 23, timestamptz '2026-07-26'),
  ('ms2bdnf4xt6q0m', 'FILTRE A HUILE 1.6 HDI 207/307/1.4HDI', 'NC-FH06', 'INCI', 'mryp01x3168prd', null,
   400, 900, 10, 10, 2,
   false, null, 24, timestamptz '2026-07-26'),
  ('ms2bj0ne8bxbeg', 'F HUILE RENAULT SYMBOLE ISO 1.5DCI', 'RO928', 'ISO', 'mryp01x3168prd', null,
   0, 0, 10, 10, 0,
   false, null, 25, timestamptz '2026-07-26'),
  ('ms2bkdxlzupavf', 'F A HUILE 913 ISO', 'RO929', 'ISO', 'mryp01x3168prd', null,
   0, 0, 10, 10, 0,
   false, null, 26, timestamptz '2026-07-26'),
  ('ms2bmz5opagsfi', 'F HUILE CLIO 4 TCE ISO', 'OE1003', 'ISO', 'mryp01x3168prd', null,
   0, 0, 3, 3, 0,
   false, null, 27, timestamptz '2026-07-26'),
  ('ms2e1lfjsxl7gj', 'F A HULE 1.6HDI FIAT DOBLO', 'OE239', 'ISO FILTRE', 'mryp01x3168prd', null,
   0, 0, 5, 5, 0,
   false, null, 28, timestamptz '2026-07-27'),
  ('ms2e3viox67erz', 'F GASOIL GOLF 7 LEON SIRUM', 'NE814', 'ISO FILTER', 'ms1aa31vecqqy4', null,
   0, 0, 5, 5, 0,
   false, null, 29, timestamptz '2026-07-27')
on conflict (id) do update set
  name             = excluded.name,
  description      = excluded.description,
  brand            = excluded.brand,
  category_id      = excluded.category_id,
  barcode          = excluded.barcode,
  purchase_price   = excluded.purchase_price,
  sale_price       = excluded.sale_price,
  qty_principal    = excluded.qty_principal,
  qty_current      = excluded.qty_current,
  min_qty          = excluded.min_qty,
  track_expiration = excluded.track_expiration,
  expiration       = excluded.expiration,
  position         = excluded.position,
  created_at       = excluded.created_at;

-- --------------------------------------------------------------------------
-- 5. ACHATS (3)
-- --------------------------------------------------------------------------
insert into public.purchases (id, ref, supplier_id, date, total, note, position, created_at) values
  ('mryp70p60edleb', 'ACH-0003', 'mryorgpaimktlm', '2026-07-24', 1650, null, 2, timestamptz '2026-07-24'),
  ('mryovd2m56k7xn', 'ACH-0002', 'mryorgpaimktlm', '2026-07-24', 2940, null, 1, timestamptz '2026-07-24'),
  ('mryorv9o5r5pui', 'ACH-0001', 'mryorgpaimktlm', '2026-07-20', 75150, null, 0, timestamptz '2026-07-24')
on conflict (id) do update set
  ref         = excluded.ref,
  supplier_id = excluded.supplier_id,
  date        = excluded.date,
  total       = excluded.total,
  position    = excluded.position,
  created_at  = excluded.created_at;

-- Lignes d'achat : cle technique auto-incrementee, donc on repart a zero
-- pour ces trois documents plutot que de tenter un rapprochement ligne a ligne.
delete from public.purchase_items where purchase_id in ('mryp70p60edleb', 'mryovd2m56k7xn', 'mryorv9o5r5pui');

insert into public.purchase_items (purchase_id, product_id, qty, price, sale_price, min_qty, expiration, position) values
  ('mryp70p60edleb', 'mryp5je1j02jtc', 3, 550, 850, 1, null, 0),
  ('mryovd2m56k7xn', 'mryouo5u0nr191', 3, 980, 1500, 2, null, 0),
  ('mryorv9o5r5pui', 'mryopv4qyv3lzq', 5, 620, 1200, 2, null, 0),
  ('mryorv9o5r5pui', 'mryp8pdti34le3', 10, 550, 900, 2, null, 1),
  ('mryorv9o5r5pui', 'mrypck07b54blf', 20, 500, 850, 5, null, 2),
  ('mryorv9o5r5pui', 'mrypghesq0yul1', 2, 1250, 1900, 1, null, 3),
  ('mryorv9o5r5pui', 'mrypjzd2nl5eyt', 5, 550, 850, 2, null, 4),
  ('mryorv9o5r5pui', 'mrypmjih2d7jgu', 7, 600, 1200, 3, null, 5),
  ('mryorv9o5r5pui', 'mrypqi7enozu9q', 10, 750, 1200, 3, null, 6),
  ('mryorv9o5r5pui', 'mrypv1aqa1o71s', 5, 850, 1200, 2, null, 7),
  ('mryorv9o5r5pui', 'ms19vzwpfh2r9j', 10, 500, 1000, 3, null, 8),
  ('mryorv9o5r5pui', 'ms19y1jxwfn3ye', 5, 480, 1200, 2, null, 9),
  ('mryorv9o5r5pui', 'ms1a6i8n3rtcu2', 5, 600, 1100, 2, null, 10),
  ('mryorv9o5r5pui', 'ms1ab8m8do2j94', 2, 850, 1700, 1, null, 11),
  ('mryorv9o5r5pui', 'ms1adk95z1c1y6', 2, 850, 1700, 1, null, 12),
  ('mryorv9o5r5pui', 'ms1afxrtmkls3i', 2, 750, 1250, 1, null, 13),
  ('mryorv9o5r5pui', 'ms1apbz3qakh63', 2, 950, 1600, 1, null, 14),
  ('mryorv9o5r5pui', 'ms1arjtsrs2rc9', 10, 350, 750, 4, null, 15),
  ('mryorv9o5r5pui', 'ms24zr9d371rml', 5, 500, 950, 3, null, 16),
  ('mryorv9o5r5pui', 'ms2b3u0i1ro1t8', 4, 500, 950, 2, null, 17),
  ('mryorv9o5r5pui', 'ms2b69t1kqn9d7', 5, 1150, 1500, 3, null, 18),
  ('mryorv9o5r5pui', 'ms2bawbeqx4ngm', 5, 480, 1000, 2, null, 19),
  ('mryorv9o5r5pui', 'ms2bdnf4xt6q0m', 5, 400, 900, 2, null, 20);

insert into public.purchase_payments (id, purchase_id, amount, date, position) values
  ('mryp70p6e559k6', 'mryp70p60edleb', 1650, '2026-07-24', 0),
  ('mryovd2mvv6pe8', 'mryovd2m56k7xn', 2940, '2026-07-24', 0),
  ('mryorv9o9237te', 'mryorv9o5r5pui', 3100, '2026-07-20', 0),
  ('ms2bey2lxqrsxk', 'mryorv9o5r5pui', 72050, '2026-07-26', 1)
on conflict (id) do update set
  purchase_id = excluded.purchase_id,
  amount      = excluded.amount,
  date        = excluded.date,
  position    = excluded.position;

-- --------------------------------------------------------------------------
-- 6. REPARATIONS (1)
-- --------------------------------------------------------------------------
insert into public.repairs (
  id, type, status, date_in, date_out, client_id, car, problem,
  subtotal, tva, total, position, created_at
) values
  ('ms1b5yymc2cv80', 'repair', 'finalized', '2026-07-26T09:00', '2026-07-26T17:00', null, '{"name":"SYMBOLE","brand":"RENALAUT","color":"GRIS ","year":"2016","plate":"2016-16","description":""}'::jsonb, null,
   4200, '{"enabled":false,"rate":19,"amount":0}'::jsonb, 4200, 0, timestamptz '2026-07-26')
on conflict (id) do update set
  type       = excluded.type,
  status     = excluded.status,
  date_in    = excluded.date_in,
  date_out   = excluded.date_out,
  client_id  = excluded.client_id,
  car        = excluded.car,
  problem    = excluded.problem,
  subtotal   = excluded.subtotal,
  tva        = excluded.tva,
  total      = excluded.total,
  position   = excluded.position,
  created_at = excluded.created_at;

-- Seul le lien vers le catalogue est stocke : le libelle et le prix de la
-- prestation restent lus dans public.services.
delete from public.repair_services where repair_id in ('ms1b5yymc2cv80');
delete from public.repair_products where repair_id in ('ms1b5yymc2cv80');
delete from public.repair_workers  where repair_id in ('ms1b5yymc2cv80');

insert into public.repair_services (repair_id, service_id, position) values
  ('ms1b5yymc2cv80', 'ms1ay5okq5v27u', 0),
  ('ms1b5yymc2cv80', 'ms1ayvxx2620or', 1),
  ('ms1b5yymc2cv80', 'ms1azs6sflnkka', 2),
  ('ms1b5yymc2cv80', 'ms1b426ngphr3c', 3);

-- Aucune piece posee et aucun mecanicien affecte sur cette fiche :
-- repair_products et repair_workers restent vides.

insert into public.repair_payments (id, repair_id, amount, date, position) values
  ('ms1b5yymxfdk8q', 'ms1b5yymc2cv80', 4200, '2026-07-26', 0)
on conflict (id) do update set
  repair_id = excluded.repair_id,
  amount    = excluded.amount,
  date      = excluded.date,
  position  = excluded.position;

-- --------------------------------------------------------------------------
-- 7. COMPTEURS DE REFERENCES
-- --------------------------------------------------------------------------
-- Le prochain achat prendra la reference ACH-0004.
insert into public.counters (id, purchase, sale) values (1, 4, 1)
on conflict (id) do update set purchase = excluded.purchase, sale = excluded.sale;

-- Le bloc « settings » de l'export est entierement vide (nom du garage, NIF,
-- NIS, RC, adresse...). Rien a reprendre : la ligne existe deja avec ses
-- valeurs par defaut, et ces champs se saisissent dans « Parametres ».

commit;

-- ============================================================================
--  VERIFICATION — a lancer apres le commit, les compteurs doivent correspondre
-- ============================================================================
select 'categories'         as objet, count(*) as lignes, 4 as attendu from public.categories
union all select 'services',          count(*), 9  from public.services
union all select 'suppliers',         count(*), 1  from public.suppliers
union all select 'products',          count(*), 30 from public.products
union all select 'purchases',         count(*), 3  from public.purchases
union all select 'purchase_items',    count(*), 23 from public.purchase_items
union all select 'purchase_payments', count(*), 4  from public.purchase_payments
union all select 'repairs',           count(*), 1  from public.repairs
union all select 'repair_services',   count(*), 4  from public.repair_services
union all select 'repair_payments',   count(*), 1  from public.repair_payments;

-- Chaque achat doit retomber sur son total et etre solde.
select p.ref,
       sum(i.qty * i.price)                                as somme_lignes,
       p.total,
       (select coalesce(sum(pp.amount), 0)
          from public.purchase_payments pp
         where pp.purchase_id = p.id)                      as regle
  from public.purchases p
  join public.purchase_items i on i.purchase_id = p.id
 group by p.id, p.ref, p.total
 order by p.ref;

-- Valeur du stock repris.
select count(*)                                     as produits,
       sum(qty_current)                             as pieces,
       sum(purchase_price * qty_current)            as valeur_achat,
       sum(sale_price    * qty_current)             as valeur_vente,
       sum((sale_price - purchase_price) * qty_current) as marge_potentielle
  from public.products;

-- ============================================================================
--  CORRECTIONS FACULTATIVES
--
--  Ces trois blocs ne sont PAS executes : ils modifieraient des donnees que
--  l'export donne telles quelles. Chacun repare une anomalie reelle relevee
--  dans le JSON. Decommentez ce que vous voulez appliquer, une fois la reprise
--  verifiee ci-dessus.
-- ============================================================================

-- ---- A. Deux produits sans categorie ------------------------------------
--    FILTRE A HUILE G7/LEON/HU7020Z
--    FILTRE A HUILE GOLF7/LEO NM/03N HU7020Z
-- Ce sont des filtres a huile ; le JSON les laisse hors categorie, ils
-- n'apparaissent donc dans aucun filtre de la page « Gestion de stock ».
--
-- update public.products set category_id = 'mryp01x3168prd'   -- FILTRE A HUILE
--  where id in ('mryopv4qyv3lzq', 'mryouo5u0nr191');

-- ---- B. Marques ecrites de plusieurs facons ------------------------------
-- ["FILTRON ","VW 1","VW1","ISO FILTRE","ISO FILTER"] font double emploi avec
-- FILTRON / VW / ISO : le filtre « marque » de la page stock compare les
-- libelles a l'identique, chaque variante y ajoute donc une entree.
--
-- update public.products set brand = trim(brand) where brand <> trim(brand);
-- update public.products set brand = 'VW'  where brand in ('VW 1', 'VW1');
-- update public.products set brand = 'ISO' where brand in ('ISO FILTER', 'ISO FILTRE');

-- ---- C. Stock compte deux fois sur les produits achetes ------------------
-- Sur les 23 produits presents dans un achat, la quantite en rayon vaut
-- EXACTEMENT le double de la quantite achetee (5 -> 10, 20 -> 40, 7 -> 14...).
-- L'explication tient a l'ordre de saisie : la fiche produit a ete creee avec
-- sa quantite, puis le meme lot a ete saisi en achat — et enregistrer un achat
-- ajoute ses quantites au stock (store.js, applyPurchaseToStock). Le lot a donc
-- ete compte une fois a la main et une fois par l'achat.
-- Les 7 produits jamais achetes ne sont pas concernes et restent intacts.
--
-- update public.products p
--    set qty_current   = a.qte,
--        qty_principal = a.qte
--   from (select product_id, sum(qty)::int as qte
--           from public.purchase_items group by product_id) a
--  where a.product_id = p.id
--    and p.qty_current = a.qte * 2;   -- garde-fou : n'agit que sur le doublon exact

