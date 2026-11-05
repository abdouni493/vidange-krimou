-- ============================================================================
-- Interface « Inventaire » — comptage physique du stock & ecarts
-- ----------------------------------------------------------------------------
-- A jouer une fois dans le SQL Editor du projet Supabase.
-- Idempotent : le rejouer ne casse rien.
--
--   inventaires.lines       [{ productId, productName, barcode, categoryId,
--                              categoryName, countedQty, purchasePrice,
--                              salePrice, systemQtyAtEntry }]
--   inventaires.comparison  rapport d'ecarts (null tant que non compare)
--   inventaires.backup      quantites d'avant correction (null si non corrige)
--   status                  draft | completed | compared | corrected
-- ============================================================================

create table if not exists public.inventaires (
  id            text primary key,
  ref           text not null default '',
  date          date not null default current_date,
  status        text not null default 'draft'
                check (status in ('draft', 'completed', 'compared', 'corrected')),
  lines         jsonb not null default '[]'::jsonb,
  notes         text,
  created_by    text,
  completed_at  timestamptz,
  comparison    jsonb,
  corrected_at  timestamptz,
  corrected_by  text,
  backup        jsonb,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_inventaires_date   on public.inventaires(date);
create index if not exists idx_inventaires_status on public.inventaires(status);

-- ---- RLS : lecture pour le personnel, ecriture selon la page « inventaire » --
alter table public.inventaires enable row level security;

drop policy if exists inventaires_select on public.inventaires;
create policy inventaires_select on public.inventaires
  for select to authenticated using (public.is_staff());

drop policy if exists inventaires_insert on public.inventaires;
create policy inventaires_insert on public.inventaires
  for insert to authenticated
  with check (public.has_any_perm('inventaire', array['create']));

-- Comparer / corriger / annuler reecrit la ligne : un employe qui peut creer,
-- modifier ou corriger doit pouvoir la mettre a jour.
drop policy if exists inventaires_update on public.inventaires;
create policy inventaires_update on public.inventaires
  for update to authenticated
  using (public.has_any_perm('inventaire', array['create', 'edit', 'correct']))
  with check (public.has_any_perm('inventaire', array['create', 'edit', 'correct']));

drop policy if exists inventaires_delete on public.inventaires;
create policy inventaires_delete on public.inventaires
  for delete to authenticated
  using (public.has_any_perm('inventaire', array['delete']));

-- ---- Produits : « Corriger le stock » ecrit qty_current / qty_principal ----
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (
    public.has_any_perm('stock',      array['edit', 'create'])
    or public.has_any_perm('pos',        array['create'])
    or public.has_any_perm('sales',      array['edit', 'delete'])
    or public.has_any_perm('purchases',  array['create', 'edit', 'delete'])
    or public.has_any_perm('repairs',    array['create', 'edit', 'finalize', 'cancel', 'delete'])
    or public.has_any_perm('inventaire', array['correct'])
  )
  with check (
    public.has_any_perm('stock',      array['edit', 'create'])
    or public.has_any_perm('pos',        array['create'])
    or public.has_any_perm('sales',      array['edit', 'delete'])
    or public.has_any_perm('purchases',  array['create', 'edit', 'delete'])
    or public.has_any_perm('repairs',    array['create', 'edit', 'finalize', 'cancel', 'delete'])
    or public.has_any_perm('inventaire', array['correct'])
  );

-- ---- Droits API et temps reel --------------------------------------------
grant select, insert, update, delete on public.inventaires to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.inventaires;
exception when duplicate_object or undefined_object then
  null;
end
$$;

-- PostgREST relit son cache de schema : la table est visible tout de suite.
notify pgrst, 'reload schema';
