CREATE OR REPLACE FUNCTION public.bundle_public_summary(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 select jsonb_build_object('completed',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'icon',b.icon,'completed_at',c.completed_at) order by b.sort_order)
 from public.player_bundle_completions c join public.game_bundles b on b.id=c.bundle_id where c.player_id=p_player_id),'[]'::jsonb),
 'crown', (select jsonb_build_object('gem_name',specimen_snapshot->>'gem_name','rarity',specimen_snapshot->'rarity',
 'final_weight_multiplier',specimen_snapshot->'final_weight_multiplier','mutation_ids',specimen_snapshot->'mutation_ids',
 'serial_number',specimen_snapshot->'serial_number','submitted_at',submitted_at)
 from public.player_bundle_special_submissions where player_id=p_player_id and requirement_id='master-crown'));
$function$;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'id', p.id::text,
      'username', coalesce(nullif(p.username,''), 'Guest Player'),
      'avatar_url', coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ),
      'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
      'title_color', coalesce(
        nullif(t.color,''),
        nullif(p.display_title_color,''),
        '#ffd166'
      ),
      'total_rolls', coalesce(p.total_rolls,0),
      'lifetime_earnings', coalesce(p.lifetime_earnings,0),
      'inventory_count', (
        select count(*) from public.inventory_gems ig
        where ig.player_id = p.id
      ),
      'inventory_capacity', coalesce(p.inventory_capacity,0),
      'rarest_gem_name', p.rarest_gem_name,
      'rarest_gem_rarity', p.rarest_gem_rarity,
      'mutation_luck', coalesce(p.mutation_luck,1),
      'showcase', coalesce(p.showcase,'[]'::jsonb),
      'best_roll', (
        select jsonb_build_object(
          'gem_name',g.gem_name,
          'rarity',g.rarity,
          'final_weight',g.final_weight,
          'value',g.value,
          'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])
        )
        from public.inventory_gems g
        where g.player_id=p.id
        order by g.rarity desc,g.value desc,g.id desc
        limit 1
      )
    )
  end
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = p_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.achievement_milestones_v013()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select jsonb_agg(jsonb_build_object('ap',ap,'rewards',rewards)order by ap)from(values(100,'[{"type":"money","amount":100000}]'::jsonb),(250,'[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":2}]'),(500,'[{"type":"cosmetic","cosmeticType":"badge","id":"achievement-novice","name":"Achievement Novice"}]'),(1000,'[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":2}]'),(2000,'[{"type":"cosmetic","cosmeticType":"border","id":"milestone-bronze","name":"Milestone Bronze"}]'),(3500,'[{"type":"potion","consumableId":"mythic-potion","name":"Mythic Potion","amount":1}]'),(5000,'[{"type":"cosmetic","cosmeticType":"title","id":"achievement-hunter","name":"Achievement Hunter"}]'),(7500,'[{"type":"cosmetic","cosmeticType":"border","id":"milestone-diamond","name":"Milestone Diamond"}]'),(10000,'[{"type":"cosmetic","cosmeticType":"badge","id":"master-gem-incremental","name":"Master of Gem Incremental"},{"type":"cosmetic","cosmeticType":"title","id":"master-gem-incremental","name":"Master of Gem Incremental"}]'))x(ap,rewards)$function$;

CREATE OR REPLACE FUNCTION public.museum_collection_matches(p_requirements jsonb, p_specimens jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_type text := p_requirements->>'type';
  v_count integer := coalesce((p_requirements->>'count')::integer, 1);
  v_result integer := 0;
begin
  if v_type = 'count' then
    v_result := jsonb_array_length(coalesce(p_specimens, '[]'::jsonb));
  elsif v_type = 'unique_gems' then
    select count(distinct x->>'gem_name') into v_result from jsonb_array_elements(coalesce(p_specimens, '[]'::jsonb)) x;
  elsif v_type = 'unique_mutations' then
    select count(distinct m) into v_result
    from jsonb_array_elements(coalesce(p_specimens, '[]'::jsonb)) x,
         jsonb_array_elements_text(coalesce(x->'mutation_ids', '[]'::jsonb)) m;
  elsif v_type = 'serial_count' then
    select count(*) into v_result from jsonb_array_elements(coalesce(p_specimens, '[]'::jsonb)) x
    where nullif(x->>'serial_number', '') is not null;
  elsif v_type = 'min_rarity' then
    select count(*) into v_result from jsonb_array_elements(coalesce(p_specimens, '[]'::jsonb)) x
    where coalesce((x->>'rarity')::numeric, 0) >= coalesce((p_requirements->>'min')::numeric, 0);
  end if;
  return v_result >= v_count;
end $function$;

