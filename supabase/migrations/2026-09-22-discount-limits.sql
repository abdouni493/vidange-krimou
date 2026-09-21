-- ============================================================================
-- Plafonds de reduction du point de vente
-- ----------------------------------------------------------------------------
-- A jouer une fois dans le SQL Editor du projet Supabase.
-- Idempotent : le rejouer ne casse rien.
--
--   settings.discount       plafond global, applique a tout article vendu
--   products.discount_rule  plafond propre a un article ; quand il est present
--                           il remplace le plafond global pour cet article
--                           uniquement, les autres continuent de suivre le
--                           reglage global.
--
-- Forme des deux colonnes : { "enabled": bool, "mode": "amount"|"percent",
--                             "value": number }
--   mode "amount"  -> `value` dinars de reduction au maximum, par article vendu
--   mode "percent" -> `value` % du prix de vente au maximum, par article vendu
-- `{}` sur un produit signifie « pas de reglage propre » : le global s'applique.
-- ============================================================================

alter table public.settings
  add column if not exists discount jsonb not null
  default '{"enabled": true, "mode": "amount", "value": 0}'::jsonb;

alter table public.products
  add column if not exists discount_rule jsonb not null default '{}'::jsonb;

-- ---- Garde-fou : seul un administrateur regle les plafonds ----------------
-- La RLS laisse un vendeur ecrire dans `products` (vendre baisse `qty_current`)
-- et un employe ayant « settings:edit » ecrire dans `settings`. Sans ce
-- declencheur, une requete faite a la main pourrait relever son propre plafond.
-- La comparaison porte sur la valeur : une vente qui reecrit la ligne sans
-- toucher au plafond ne declenche rien.

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
