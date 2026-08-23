begin;

alter table if exists public.private_feature_gems
  add column if not exists hide_rarity_until_discovered boolean not null default false;

update public.private_feature_gems
set hide_rarity_until_discovered = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('hideRarityUntilDiscovered', true),
    updated_at = now()
where rarity >= 10000000
  and (
    hide_rarity_until_discovered is distinct from true
    or coalesce((metadata ->> 'hideRarityUntilDiscovered')::boolean, false) is distinct from true
  );

commit;
