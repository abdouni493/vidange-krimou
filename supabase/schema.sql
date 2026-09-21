-- ============================================================================
--  AutoGarage Pro — schema complet Supabase / PostgreSQL
--  Projet : https://oyzbnolbwbrmdaskflbo.supabase.co
--
--  A executer EN UNE FOIS dans  Supabase Dashboard > SQL Editor > New query.
--  Le script est idempotent : on peut le rejouer sans perdre de donnees.
--
--  Contenu
--    1.  Extensions & nettoyage des policies
--    2.  Identite : profiles, helpers de permission, inscription
--    3.  Tables metier (une par interface) + relations
--    4.  Tables de liaison (lignes de documents, paiements, pointages)
--    5.  Singletons : settings, counters
--    6.  Journal des actions (audit des boutons)
--    7.  Vues de reporting (Dashboard / Rapports / Analyse)
--    8.  Row Level Security : lecture pour le personnel, ecriture par permission
--    9.  Buckets de stockage (logo, photos produits, photos employes, documents)
--   10.  Realtime + grants
--
--  Convention d'identifiants
--    Les tables metier utilisent des cles primaires TEXT : l'application genere
--    ses identifiants cote client (`uid()`), ce qui permet de composer un
--    document complet (achat + lignes + paiements) puis de le pousser d'un seul
--    bloc. Les identites (profiles.id) restent des UUID auth.users.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Les fonctions d'aide (section 2) referencent des tables creees en section 3.
-- On desactive la validation du corps le temps du script : l'ordre de lecture
-- reste logique (identite -> metier) sans casser l'execution.
set check_function_bodies = off;

-- ============================================================================
-- 1. NETTOYAGE DES POLITIQUES (permet de rejouer le script)
-- ============================================================================
do $cleanup$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and policyname like 'garage_%')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$cleanup$;

-- ============================================================================
-- 2. IDENTITE ET PERMISSIONS
-- ============================================================================

-- Un profil par compte Supabase Auth. `role` separe l'administrateur du
-- personnel ; `permissions` est le miroir des droits accordes a l'employe
-- (source de verite : workers.permissions, recopie ici pour les policies).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  username     text unique,
  email        text,
  role         text not null default 'worker' check (role in ('admin', 'worker')),
  worker_id    text,
  avatar_url   text,
  active       boolean not null default true,
  permissions  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_profiles_role      on public.profiles(role);
create index if not exists idx_profiles_worker_id on public.profiles(worker_id);

-- ---- helpers -------------------------------------------------------------
-- SECURITY DEFINER : appelables depuis une policy sans repasser par la RLS de
-- profiles (sinon la policy de profiles s'appellerait elle-meme -> recursion).

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.active
  );
$fn$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$fn$;

-- Identifiant de la fiche employe rattachee au compte connecte (NULL si admin).
create or replace function public.current_worker_id()
returns text language sql stable security definer set search_path = public as $fn$
  select w.id from public.workers w where w.user_id = auth.uid() limit 1;
$fn$;

-- Droits de l'utilisateur courant, au format { "page": ["view","create",...] }.
create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select w.permissions from public.workers w where w.user_id = auth.uid() limit 1),
    (select p.permissions from public.profiles p where p.id = auth.uid() limit 1),
    '{}'::jsonb
  );
$fn$;

-- Vrai si l'utilisateur peut executer `p_action` sur l'interface `p_page`.
-- Un admin peut tout ; un employe doit avoir la page cochee, et l'action
-- listee (l'action « view » est implicite des que la page est accordee).
create or replace function public.has_perm(p_page text, p_action text default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare acts jsonb;
begin
  if public.is_admin() then return true; end if;
  if not public.is_staff() then return false; end if;
  acts := public.my_permissions() -> p_page;
  if acts is null then return false; end if;
  if p_action = 'view' then return true; end if;
  return acts ? p_action;
end;
$fn$;

-- Variante « au moins une de ces actions » : un meme bouton peut etre couvert
-- par plusieurs droits (payer une dette, finaliser, annuler -> UPDATE).
create or replace function public.has_any_perm(p_page text, p_actions text[])
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare a text;
begin
  if public.is_admin() then return true; end if;
  foreach a in array p_actions loop
    if public.has_perm(p_page, a) then return true; end if;
  end loop;
  return false;
end;
$fn$;

-- Utilise par l'ecran de connexion pour masquer « Creer un compte admin »
-- des qu'un administrateur existe. Appelable sans etre connecte.
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.profiles where role = 'admin');
$fn$;

-- Resolution « nom d'utilisateur -> email » pour l'ecran de connexion.
-- Supabase Auth s'authentifie par email ; l'application accepte aussi le nom
-- d'utilisateur, il faut donc pouvoir traduire l'un en l'autre avant connexion.
create or replace function public.login_email(p_identifier text)
returns text language sql stable security definer set search_path = public as $fn$
  select p.email
  from public.profiles p
  where p.active
    and (lower(p.username) = lower(trim(p_identifier))
         or lower(p.email)  = lower(trim(p_identifier)))
  limit 1;
$fn$;

-- Identite du garage affichee par l'ecran de connexion, avant toute session.
-- La table `settings` reste fermee aux visiteurs anonymes : cette fonction
-- n'en laisse sortir que le logo, le nom et la description.
create or replace function public.garage_branding()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object('logo', s.logo, 'name', s.name, 'description', s.description)
  from public.settings s
  where s.id = 1;
$fn$;

-- ---- creation automatique du profil a l'inscription ----------------------
-- Le premier compte cree sur une base vierge devient administrateur.
-- Toute inscription ulterieure est un employe, meme si le client demande
-- « admin » : c'est ce qui protege le garage d'une escalade de privileges.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted      text  := coalesce(meta ->> 'role', 'worker');
  final_role  text;
begin
  if wanted = 'admin' and not exists (select 1 from public.profiles where role = 'admin') then
    final_role := 'admin';
  else
    final_role := 'worker';
  end if;

  insert into public.profiles (id, full_name, username, email, role, worker_id, permissions)
  values (
    new.id,
    coalesce(meta ->> 'full_name', ''),
    nullif(meta ->> 'username', ''),
    new.email,
    final_role,
    nullif(meta ->> 'worker_id', ''),
    coalesce(meta -> 'permissions', '{}'::jsonb)
  )
  on conflict (id) do update
    set full_name  = excluded.full_name,
        email      = excluded.email,
        worker_id  = coalesce(excluded.worker_id, public.profiles.worker_id),
        updated_at = now();

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garde-fou : un employe ne peut pas se promouvoir administrateur.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut changer un role';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ============================================================================
-- 3. TABLES METIER — une par interface de l'application
-- ============================================================================
-- `position` conserve l'ordre d'affichage voulu par l'interface : les nouvelles
-- reparations / ventes / achats sont empilees en tete de liste.

-- ---- Interface « Employes » ---------------------------------------------
create table if not exists public.roles (
  id         text primary key,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id                 text primary key,
  user_id            uuid unique references auth.users(id) on delete set null,
  full_name          text not null,
  birthday           text,
  id_card            text,
  phone              text,
  role_id            text references public.roles(id) on delete set null,
  start_date         text,
  photo_url          text,
  -- { enabled, mode: 'month'|'day', amount, percent }
  pay                jsonb not null default '{}'::jsonb,
  -- { enabled, email, username }  (le mot de passe vit dans auth.users)
  account            jsonb not null default '{}'::jsonb,
  -- { "repairs": ["view","create"], "stock": ["view"] , ... }
  permissions        jsonb not null default '{}'::jsonb,
  settled_repair_ids jsonb not null default '[]'::jsonb,
  position           integer not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists idx_workers_role_id on public.workers(role_id);
create index if not exists idx_workers_user_id on public.workers(user_id);

-- ---- Interface « Clients » ----------------------------------------------
create table if not exists public.clients (
  id         text primary key,
  name       text not null,
  phone      text,
  address    text,
  email      text,
  note       text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_clients_name on public.clients(name);

-- ---- Interface « Fournisseurs » -----------------------------------------
create table if not exists public.suppliers (
  id         text primary key,
  name       text not null,
  phone      text,
  address    text,
  email      text,
  note       text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppliers_name on public.suppliers(name);

-- ---- Interface « Services » ---------------------------------------------
create table if not exists public.services (
  id          text primary key,
  name        text not null,
  description text,
  price       numeric(14,2) not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---- Interface « Gestion de stock » -------------------------------------
create table if not exists public.categories (
  id         text primary key,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id               text primary key,
  name             text not null,
  description      text,
  brand            text,
  category_id      text references public.categories(id) on delete set null,
  barcode          text,
  image_url        text,
  purchase_price   numeric(14,2) not null default 0,
  sale_price       numeric(14,2) not null default 0,
  qty_principal    integer not null default 0,
  qty_current      integer not null default 0,
  min_qty          integer not null default 0,
  track_expiration boolean not null default false,
  expiration       text,
  -- Plafond de reduction propre a cet article, regle depuis le point de vente
  -- par un administrateur. `{}` : l'article suit le plafond global.
  discount_rule    jsonb not null default '{}'::jsonb,
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_barcode  on public.products(barcode);
create index if not exists idx_products_name     on public.products(name);

-- ---- Interface « Codes-barres » -----------------------------------------
create table if not exists public.barcodes (
  id         text primary key,
  name       text not null default '',
  code       text not null,
  price      numeric(14,2) not null default 0,
  product_id text references public.products(id) on delete set null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_barcodes_code on public.barcodes(code);

-- ---- Interface « Achats » -----------------------------------------------
create table if not exists public.purchases (
  id          text primary key,
  ref         text,
  supplier_id text references public.suppliers(id) on delete set null,
  date        text,
  total       numeric(14,2) not null default 0,
  note        text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_purchases_supplier on public.purchases(supplier_id);
create index if not exists idx_purchases_date     on public.purchases(date);

-- ---- Interface « Point de vente » / « Ventes » --------------------------
create table if not exists public.sales (
  id         text primary key,
  ref        text,
  client_id  text references public.clients(id) on delete set null,
  date       text,
  subtotal   numeric(14,2) not null default 0,
  -- { enabled: bool, amount: number }
  discount   jsonb not null default '{}'::jsonb,
  total      numeric(14,2) not null default 0,
  note       text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sales_client on public.sales(client_id);
create index if not exists idx_sales_date   on public.sales(date);

-- ---- Interface « Reparations & RDV » ------------------------------------
create table if not exists public.repairs (
  id         text primary key,
  type       text not null default 'repair'   check (type in ('repair', 'appointment')),
  status     text not null default 'pending'  check (status in ('pending', 'finalized', 'canceled')),
  date_in    text,
  date_out   text,
  client_id  text references public.clients(id) on delete set null,
  -- { name, brand, color, year, plate, description }
  car        jsonb not null default '{}'::jsonb,
  problem    text,
  subtotal   numeric(14,2) not null default 0,
  -- { enabled: bool, rate: number, amount: number }
  tva        jsonb not null default '{}'::jsonb,
  total      numeric(14,2) not null default 0,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_repairs_client  on public.repairs(client_id);
create index if not exists idx_repairs_status  on public.repairs(status);
create index if not exists idx_repairs_type    on public.repairs(type);
create index if not exists idx_repairs_date_in on public.repairs(date_in);

-- ---- Interface « Depenses » ---------------------------------------------
create table if not exists public.expense_categories (
  id         text primary key,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id          text primary key,
  name        text not null,
  description text,
  category_id text references public.expense_categories(id) on delete set null,
  amount      numeric(14,2) not null default 0,
  date        text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_expenses_category on public.expenses(category_id);
create index if not exists idx_expenses_date     on public.expenses(date);

-- ---- Interface « Caisse » -----------------------------------------------
create table if not exists public.caisse_categories (
  id         text primary key,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.caisse_entries (
  id          text primary key,
  type        text not null default 'in' check (type in ('in', 'out')),
  amount      numeric(14,2) not null default 0,
  date        text,
  description text,
  category_id text references public.caisse_categories(id) on delete set null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_caisse_date     on public.caisse_entries(date);
create index if not exists idx_caisse_category on public.caisse_entries(category_id);

-- ============================================================================
-- 4. TABLES DE LIAISON — le detail de chaque document
-- ============================================================================
-- Elles sont toutes en ON DELETE CASCADE : supprimer un document supprime ses
-- lignes, ses paiements et ses affectations en une seule instruction.

-- ---- lignes et reglements d'un achat ------------------------------------
create table if not exists public.purchase_items (
  id          bigint generated always as identity primary key,
  purchase_id text not null references public.purchases(id) on delete cascade,
  product_id  text references public.products(id) on delete set null,
  qty         numeric(14,3) not null default 1,
  price       numeric(14,2) not null default 0,   -- prix d'achat unitaire
  sale_price  numeric(14,2) not null default 0,   -- prix de vente applique au produit
  min_qty     integer not null default 0,         -- seuil d'alerte applique au produit
  expiration  text,
  position    integer not null default 0
);
create index if not exists idx_purchase_items_parent  on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

-- `method` et `note` sont prevus pour un futur choix « especes / cheque /
-- virement » : les colonnes existent, l'interface ne les saisit pas encore.
create table if not exists public.purchase_payments (
  id          text primary key,
  purchase_id text not null references public.purchases(id) on delete cascade,
  amount      numeric(14,2) not null default 0,
  date        text,
  method      text,
  note        text,
  position    integer not null default 0
);
create index if not exists idx_purchase_payments_parent on public.purchase_payments(purchase_id);

-- ---- lignes et reglements d'une vente -----------------------------------
create table if not exists public.sale_items (
  id         bigint generated always as identity primary key,
  sale_id    text not null references public.sales(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  name       text,                                -- libelle fige au moment de la vente
  qty        numeric(14,3) not null default 1,
  price      numeric(14,2) not null default 0,
  position   integer not null default 0
);
create index if not exists idx_sale_items_parent  on public.sale_items(sale_id);
create index if not exists idx_sale_items_product on public.sale_items(product_id);

create table if not exists public.sale_payments (
  id       text primary key,
  sale_id  text not null references public.sales(id) on delete cascade,
  amount   numeric(14,2) not null default 0,
  date     text,
  method   text,
  note     text,
  position integer not null default 0
);
create index if not exists idx_sale_payments_parent on public.sale_payments(sale_id);

-- ---- contenu d'une reparation -------------------------------------------
create table if not exists public.repair_services (
  id         bigint generated always as identity primary key,
  repair_id  text not null references public.repairs(id) on delete cascade,
  service_id text references public.services(id) on delete set null,
  name       text,                                -- service libre, hors catalogue
  price      numeric(14,2),
  position   integer not null default 0
);
create index if not exists idx_repair_services_parent  on public.repair_services(repair_id);
create index if not exists idx_repair_services_service on public.repair_services(service_id);

create table if not exists public.repair_products (
  id         bigint generated always as identity primary key,
  repair_id  text not null references public.repairs(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  qty        numeric(14,3) not null default 1,
  price      numeric(14,2),
  position   integer not null default 0
);
create index if not exists idx_repair_products_parent  on public.repair_products(repair_id);
create index if not exists idx_repair_products_product on public.repair_products(product_id);

create table if not exists public.repair_workers (
  repair_id text not null references public.repairs(id) on delete cascade,
  worker_id text not null references public.workers(id) on delete cascade,
  position  integer not null default 0,
  primary key (repair_id, worker_id)
);
create index if not exists idx_repair_workers_worker on public.repair_workers(worker_id);

create table if not exists public.repair_payments (
  id        text primary key,
  repair_id text not null references public.repairs(id) on delete cascade,
  amount    numeric(14,2) not null default 0,
  date      text,
  method    text,
  note      text,
  position  integer not null default 0
);
create index if not exists idx_repair_payments_parent on public.repair_payments(repair_id);

-- ---- paie du personnel ---------------------------------------------------
create table if not exists public.worker_advances (
  id          text primary key,
  worker_id   text not null references public.workers(id) on delete cascade,
  date        text,
  description text,
  amount      numeric(14,2) not null default 0,
  settled     boolean not null default false,
  position    integer not null default 0
);
create index if not exists idx_worker_advances_parent on public.worker_advances(worker_id);

create table if not exists public.worker_absences (
  id          text primary key,
  worker_id   text not null references public.workers(id) on delete cascade,
  date        text,
  description text,
  cost        numeric(14,2) not null default 0,
  settled     boolean not null default false,
  position    integer not null default 0
);
create index if not exists idx_worker_absences_parent on public.worker_absences(worker_id);

create table if not exists public.worker_payments (
  id          text primary key,
  worker_id   text not null references public.workers(id) on delete cascade,
  date        text,
  description text,
  amount      numeric(14,2) not null default 0,
  -- { base, commissions, advances, absences } : la decomposition affichee
  details     jsonb not null default '{}'::jsonb,
  position    integer not null default 0
);
create index if not exists idx_worker_payments_parent on public.worker_payments(worker_id);

-- ---- synchronisation employe -> profil -----------------------------------
-- `my_permissions()` lit la fiche employe, mais un profil a jour permet aux
-- policies de repondre meme si la fiche est renommee ou detachee.
create or replace function public.sync_worker_profile()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.user_id is not null then
    update public.profiles
       set permissions = new.permissions,
           worker_id   = new.id,
           full_name   = coalesce(nullif(new.full_name, ''), full_name),
           updated_at  = now()
     where id = new.user_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_sync_worker_profile on public.workers;
create trigger trg_sync_worker_profile
  after insert or update of permissions, user_id, full_name on public.workers
  for each row execute function public.sync_worker_profile();

-- ============================================================================
-- 5. SINGLETONS — identite du garage et compteurs de references
-- ============================================================================
create table if not exists public.settings (
  id          smallint primary key default 1 check (id = 1),
  logo        text  not null default '',   -- URL publique du bucket `logos`
  name        text  not null default '',
  description text  not null default '',
  email       text  not null default '',
  phone       text  not null default '',
  address     text  not null default '',
  nif         text  not null default '',
  nis         text  not null default '',
  article     text  not null default '',
  rc          text  not null default '',
  -- Plafond de reduction applique a tout article vendu au comptoir.
  -- { enabled, mode: 'amount'|'percent', value }
  discount    jsonb not null default '{"enabled": true, "mode": "amount", "value": 0}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.counters (
  id       smallint primary key default 1 check (id = 1),
  purchase integer not null default 1,
  sale     integer not null default 1
);
insert into public.counters (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- 6. JOURNAL DES ACTIONS — trace des boutons sensibles
-- ============================================================================
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  page       text,          -- 'repairs', 'pos', 'workers', ...
  action     text,          -- 'create', 'finalize', 'pay', 'delete', ...
  entity     text,          -- table concernee
  entity_id  text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user on public.audit_log(user_id);
create index if not exists idx_audit_date on public.audit_log(created_at desc);

create or replace function public.log_action(
  p_page text, p_action text, p_entity text default null,
  p_entity_id text default null, p_payload jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $fn$
  insert into public.audit_log (user_id, page, action, entity, entity_id, payload)
  values (auth.uid(), p_page, p_action, p_entity, p_entity_id, p_payload);
$fn$;

-- ============================================================================
-- 7. VUES DE REPORTING — alimentent Tableau de bord / Rapports / Analyse
-- ============================================================================

-- Etat de reglement de chaque reparation (total, paye, reste).
create or replace view public.v_repair_balances with (security_invoker = on) as
select r.id,
       r.type,
       r.status,
       r.date_in,
       r.client_id,
       r.total,
       coalesce(sum(p.amount), 0)              as paid,
       greatest(r.total - coalesce(sum(p.amount), 0), 0) as rest
from public.repairs r
left join public.repair_payments p on p.repair_id = r.id
group by r.id;

-- Idem pour les ventes du point de vente.
create or replace view public.v_sale_balances with (security_invoker = on) as
select s.id,
       s.ref,
       s.date,
       s.client_id,
       s.total,
       coalesce(sum(p.amount), 0)              as paid,
       greatest(s.total - coalesce(sum(p.amount), 0), 0) as rest
from public.sales s
left join public.sale_payments p on p.sale_id = s.id
group by s.id;

-- Idem pour les achats fournisseurs.
create or replace view public.v_purchase_balances with (security_invoker = on) as
select a.id,
       a.ref,
       a.date,
       a.supplier_id,
       a.total,
       coalesce(sum(p.amount), 0)              as paid,
       greatest(a.total - coalesce(sum(p.amount), 0), 0) as rest
from public.purchases a
left join public.purchase_payments p on p.purchase_id = a.id
group by a.id;

-- Produits sous le seuil d'alerte (widget « Stock faible »).
create or replace view public.v_low_stock with (security_invoker = on) as
select p.*, (p.qty_current <= p.min_qty) as is_low
from public.products p
where p.qty_current <= p.min_qty;

-- Chiffre d'affaires par jour, toutes origines confondues.
create or replace view public.v_daily_revenue with (security_invoker = on) as
select d.day, sum(d.amount) as amount
from (
  select left(coalesce(date, ''), 10) as day, total as amount from public.sales
  union all
  select left(coalesce(date_in, ''), 10) as day, total as amount
    from public.repairs where status = 'finalized'
) d
where d.day <> ''
group by d.day;

-- Commissions dues a chaque employe sur les reparations finalisees.
create or replace view public.v_worker_commissions with (security_invoker = on) as
select w.id                                     as worker_id,
       w.full_name,
       r.id                                     as repair_id,
       r.subtotal,
       coalesce((w.pay ->> 'percent')::numeric, 0)                as percent,
       round(r.subtotal * coalesce((w.pay ->> 'percent')::numeric, 0) / 100) as commission,
       (w.settled_repair_ids ? r.id)            as settled
from public.repair_workers rw
join public.workers w on w.id = rw.worker_id
join public.repairs r on r.id = rw.repair_id
where r.status = 'finalized';

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================
--  Modele retenu
--    LECTURE  : tout membre du personnel actif lit le referentiel partage.
--               L'application charge le dossier complet en memoire ; couper la
--               lecture casserait les pages auxquelles l'employe A droit
--               (le point de vente a besoin des produits, la reparation des
--               clients, etc.). Le masquage des interfaces se fait cote UI a
--               partir des memes permissions.
--    ECRITURE : strictement pilotee par les permissions accordees par l'admin,
--               action par action (create / edit / delete / pay / finalize...).
--    SENSIBLE : la paie (acomptes, absences, paiements) n'est lisible que par
--               un admin, par un employe ayant la page « workers », ou par
--               l'employe concerne pour ses propres lignes.

-- ---- profiles ------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.has_perm('workers', 'view'));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin() or id = auth.uid());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- ---- generateur de policies pour les tables metier -----------------------
-- Pour chaque table : SELECT ouvert au personnel, et une policy par verbe
-- d'ecriture reliee a la page et aux actions de l'interface correspondante.
do $rls$
declare
  r record;
begin
  for r in
    select * from (values
      -- table,               page,        actions INSERT,                    actions UPDATE,                              actions DELETE
      ('clients',             'clients',   array['create'],                    array['edit'],                                array['delete']),
      ('suppliers',           'suppliers', array['create'],                    array['edit'],                                array['delete']),
      ('services',            'services',  array['create'],                    array['edit'],                                array['delete']),
      ('categories',          'stock',     array['create'],                    array['edit'],                                array['delete']),
      ('roles',               'workers',   array['create'],                    array['edit'],                                array['delete']),
      ('barcodes',            'barcodes',  array['create'],                    array['edit'],                                array['delete']),
      ('expense_categories',  'expenses',  array['create'],                    array['edit'],                                array['delete']),
      ('expenses',            'expenses',  array['create'],                    array['edit'],                                array['delete']),
      ('caisse_categories',   'caisse',    array['create'],                    array['edit'],                                array['delete']),
      ('caisse_entries',      'caisse',    array['create'],                    array['edit'],                                array['delete']),
      ('purchases',           'purchases', array['create'],                    array['edit', 'pay'],                         array['delete']),
      ('purchase_items',      'purchases', array['create', 'edit'],            array['edit'],                                array['edit', 'delete']),
      ('purchase_payments',   'purchases', array['create', 'pay'],             array['edit', 'pay'],                         array['edit', 'delete']),
      ('repairs',             'repairs',   array['create'],                    array['edit', 'pay', 'finalize', 'cancel'],   array['delete']),
      ('repair_services',     'repairs',   array['create', 'edit', 'finalize'],array['edit', 'finalize'],                    array['edit', 'finalize', 'delete']),
      ('repair_products',     'repairs',   array['create', 'edit', 'finalize'],array['edit', 'finalize'],                    array['edit', 'finalize', 'delete']),
      ('repair_workers',      'repairs',   array['create', 'edit', 'finalize'],array['edit', 'finalize'],                    array['edit', 'finalize', 'delete']),
      ('repair_payments',     'repairs',   array['create', 'pay', 'finalize'], array['edit', 'pay', 'finalize'],             array['edit', 'delete']),
      ('workers',             'workers',   array['create'],                    array['edit', 'permissions', 'advance', 'absence', 'payment'], array['delete'])
    ) as t(tbl, page, ins, upd, del)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_staff())',
      r.tbl || '_select', r.tbl);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_any_perm(%L, %L::text[]))',
      r.tbl || '_insert', r.tbl, r.page, r.ins);

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_any_perm(%L, %L::text[])) with check (public.has_any_perm(%L, %L::text[]))',
      r.tbl || '_update', r.tbl, r.page, r.upd, r.page, r.upd);

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_any_perm(%L, %L::text[]))',
      r.tbl || '_delete', r.tbl, r.page, r.del);
  end loop;
end
$rls$;

-- ---- produits : le stock bouge depuis plusieurs interfaces ---------------
-- Vendre au comptoir, poser une piece sur une reparation ou receptionner un
-- achat modifie tous les trois `qty_current`. Exiger « stock:edit » bloquerait
-- un vendeur qui n'a que le point de vente.
alter table public.products enable row level security;

create policy products_select on public.products
  for select to authenticated using (public.is_staff());

create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.has_any_perm('stock',     array['create', 'edit'])
    or public.has_any_perm('purchases', array['create', 'edit'])
  );

create policy products_update on public.products
  for update to authenticated
  using (
    public.has_any_perm('stock',     array['edit', 'create'])
    or public.has_any_perm('pos',       array['create'])
    or public.has_any_perm('sales',     array['edit', 'delete'])
    or public.has_any_perm('purchases', array['create', 'edit', 'delete'])
    or public.has_any_perm('repairs',   array['create', 'edit', 'finalize', 'cancel', 'delete'])
  )
  with check (
    public.has_any_perm('stock',     array['edit', 'create'])
    or public.has_any_perm('pos',       array['create'])
    or public.has_any_perm('sales',     array['edit', 'delete'])
    or public.has_any_perm('purchases', array['create', 'edit', 'delete'])
    or public.has_any_perm('repairs',   array['create', 'edit', 'finalize', 'cancel', 'delete'])
  );

create policy products_delete on public.products
  for delete to authenticated using (public.has_perm('stock', 'delete'));

-- ---- plafonds de reduction : reglables par un administrateur seulement ---
-- La RLS ci-dessus laisse un vendeur ecrire dans `products` (encaisser baisse
-- `qty_current`) et un employe ayant « settings:edit » ecrire dans `settings`.
-- Ce declencheur empeche que l'un ou l'autre releve son propre plafond par une
-- requete faite a la main. Une ecriture qui ne touche pas au plafond passe.
create or replace function public.guard_discount_rule()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  before_val jsonb;
  after_val  jsonb;
begin
  if tg_table_name = 'products' then
    before_val := case when tg_op = 'UPDATE' then old.discount_rule else '{}'::jsonb end;
    after_val  := new.discount_rule;
  else
    before_val := case when tg_op = 'UPDATE' then old.discount end;
    after_val  := new.discount;
  end if;

  if after_val is distinct from before_val and not public.is_admin() then
    raise exception 'Seul un administrateur peut regler les plafonds de reduction';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_guard_product_discount on public.products;
create trigger trg_guard_product_discount
  before insert or update on public.products
  for each row execute function public.guard_discount_rule();

drop trigger if exists trg_guard_settings_discount on public.settings;
create trigger trg_guard_settings_discount
  before update on public.settings
  for each row execute function public.guard_discount_rule();

-- ---- ventes : creees au point de vente, gerees dans « Ventes » -----------
alter table public.sales enable row level security;

create policy sales_select on public.sales
  for select to authenticated using (public.is_staff());

create policy sales_insert on public.sales
  for insert to authenticated
  with check (public.has_perm('pos', 'create') or public.has_perm('sales', 'create'));

create policy sales_update on public.sales
  for update to authenticated
  using (public.has_any_perm('sales', array['edit', 'pay']))
  with check (public.has_any_perm('sales', array['edit', 'pay']));

create policy sales_delete on public.sales
  for delete to authenticated using (public.has_perm('sales', 'delete'));

do $sales_children$
declare tbl text;
begin
  foreach tbl in array array['sale_items', 'sale_payments'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', tbl || '_select', tbl);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.has_perm('pos','create') or public.has_any_perm('sales', array['create','edit','pay']))$p$, tbl || '_insert', tbl);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.has_any_perm('sales', array['edit','pay'])) with check (public.has_any_perm('sales', array['edit','pay']))$p$, tbl || '_update', tbl);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.has_any_perm('sales', array['edit','delete']))$p$, tbl || '_delete', tbl);
  end loop;
end
$sales_children$;

-- ---- paie : lecture restreinte ------------------------------------------
do $payroll$
declare tbl text;
begin
  foreach tbl in array array['worker_advances', 'worker_absences', 'worker_payments'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (public.has_perm('workers','view') or worker_id = public.current_worker_id())$p$, tbl || '_select', tbl);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.has_any_perm('workers', array['advance','absence','payment','edit','create']))$p$, tbl || '_insert', tbl);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.has_any_perm('workers', array['advance','absence','payment','edit']))
      with check (public.has_any_perm('workers', array['advance','absence','payment','edit']))$p$, tbl || '_update', tbl);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.has_any_perm('workers', array['edit','delete']))$p$, tbl || '_delete', tbl);
  end loop;
end
$payroll$;

-- ---- singletons ----------------------------------------------------------
alter table public.settings enable row level security;

create policy settings_select on public.settings
  for select to authenticated using (public.is_staff());
create policy settings_update on public.settings
  for update to authenticated
  using (public.has_perm('settings', 'edit')) with check (public.has_perm('settings', 'edit'));
create policy settings_insert on public.settings
  for insert to authenticated with check (public.has_perm('settings', 'edit'));

alter table public.counters enable row level security;

-- Le compteur avance des qu'une vente ou un achat est enregistre : tout membre
-- du personnel qui peut creer l'un ou l'autre doit pouvoir l'incrementer.
create policy counters_select on public.counters
  for select to authenticated using (public.is_staff());
create policy counters_update on public.counters
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy counters_insert on public.counters
  for insert to authenticated with check (public.is_staff());

-- ---- journal -------------------------------------------------------------
alter table public.audit_log enable row level security;

create policy audit_select on public.audit_log
  for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy audit_insert on public.audit_log
  for insert to authenticated with check (user_id = auth.uid());

-- ============================================================================
-- 9. STOCKAGE — buckets d'images et de documents
-- ============================================================================
--  logos      : logo du garage (affiche sur les factures et l'entete)  — public
--  products   : photos d'articles du stock                              — public
--  workers    : photos du personnel                                     — public
--  documents  : pieces jointes (devis signes, PV...)                    — prive

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos',     'logos',     true,  5242880,  array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('products',  'products',  true,  5242880,  array['image/png','image/jpeg','image/webp']),
  ('workers',   'workers',   true,  5242880,  array['image/png','image/jpeg','image/webp']),
  ('documents', 'documents', false, 20971520, null)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : les trois buckets d'images sont publics (les factures imprimees et
-- les etiquettes doivent afficher le logo sans jeton). Les documents restent
-- reserves au personnel connecte.
create policy garage_public_read on storage.objects
  for select to public
  using (bucket_id in ('logos', 'products', 'workers'));

create policy garage_documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_staff());

-- Ecriture : chaque bucket suit la permission de l'interface qui l'alimente.
create policy garage_logos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.has_perm('settings', 'edit'));

create policy garage_products_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.has_any_perm('stock', array['create', 'edit']));

create policy garage_workers_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workers' and public.has_any_perm('workers', array['create', 'edit']));

create policy garage_documents_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_staff());

create policy garage_update on storage.objects
  for update to authenticated
  using (
    (bucket_id = 'logos'     and public.has_perm('settings', 'edit')) or
    (bucket_id = 'products'  and public.has_any_perm('stock',   array['create', 'edit'])) or
    (bucket_id = 'workers'   and public.has_any_perm('workers', array['create', 'edit'])) or
    (bucket_id = 'documents' and public.is_staff())
  );

create policy garage_delete on storage.objects
  for delete to authenticated
  using (
    (bucket_id = 'logos'     and public.has_perm('settings', 'edit')) or
    (bucket_id = 'products'  and public.has_any_perm('stock',   array['edit', 'delete'])) or
    (bucket_id = 'workers'   and public.has_any_perm('workers', array['edit', 'delete'])) or
    (bucket_id = 'documents' and public.is_admin())
  );

-- ============================================================================
-- 10. REALTIME ET DROITS
-- ============================================================================
-- Deux postes qui travaillent en meme temps (comptoir + atelier) voient les
-- memes chiffres sans rafraichir la page.
do $realtime$
declare tbl text;
begin
  for tbl in
    select unnest(array[
      'clients','suppliers','services','categories','products','barcodes',
      'purchases','purchase_items','purchase_payments',
      'sales','sale_items','sale_payments',
      'repairs','repair_services','repair_products','repair_workers','repair_payments',
      'roles','workers','worker_advances','worker_absences','worker_payments',
      'expense_categories','expenses','caisse_categories','caisse_entries',
      'settings','counters'
    ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception when duplicate_object or undefined_object then
      null;  -- deja publiee, ou publication absente sur ce projet
    end;
  end loop;
end
$realtime$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_repair_balances, public.v_sale_balances,
                 public.v_purchase_balances, public.v_low_stock,
                 public.v_daily_revenue, public.v_worker_commissions to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.admin_exists() to anon, authenticated;
grant execute on function public.login_email(text) to anon, authenticated;
grant execute on function public.garage_branding() to anon, authenticated;
grant execute on function public.is_admin(), public.is_staff(),
                          public.my_permissions(), public.current_worker_id(),
                          public.has_perm(text, text), public.has_any_perm(text, text[]),
                          public.log_action(text, text, text, text, jsonb) to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============================================================================
--  FIN — verifications rapides
--
--    select public.admin_exists();               -- false sur une base neuve
--    select tablename from pg_tables where schemaname='public' order by 1;
--    select * from pg_policies where schemaname='public' order by tablename;
--    select id, name, public from storage.buckets;
-- ============================================================================
