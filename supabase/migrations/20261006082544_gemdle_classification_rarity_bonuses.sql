begin;

create schema if not exists gemdle_private;
revoke all on schema gemdle_private from public, anon, authenticated, service_role;

create table gemdle_private.gem_tags (
  gem_name text primary key,
  primary_classification text not null check (primary_classification in ('Real','Fictional','Stupid','Anomalous')),
  semantic_tags text[] not null default '{}'
);
alter table gemdle_private.gem_tags enable row level security;
revoke all on gemdle_private.gem_tags from public, anon, authenticated, service_role;

insert into gemdle_private.gem_tags(gem_name,primary_classification,semantic_tags) values
  ('Incandescity','Fictional',array['Radiant']::text[]),
  ('Reminiscite','Fictional',array[]::text[]),
  ('Heat Death','Fictional',array['Dark/Void']::text[]),
  ('Finality','Fictional',array[]::text[]),
  ('Glitched Gem','Fictional',array['Corrupted/Glitched']::text[]),
  ('Heart of the Deep','Fictional',array['Organic/Living']::text[]),
  ('almost secret','Stupid',array[]::text[]),
  ('tonalite-trondhjemite-granodiorite','Real',array[]::text[]),
  ('Ore+','Fictional',array['Celestial','Organic/Living']::text[]),
  ('Cat ore','Stupid',array['Organic/Living']::text[]),
  ('sutoronchiumushahouhoakinseki','Real',array[]::text[]),
  ('one singular grain of sand','Stupid',array[]::text[]),
  ('ton 618','Stupid',array['Celestial','Dark/Void']::text[]),
  ('Tranquillityite','Real',array['Celestial']::text[]),
  ('Reality Fragment','Fictional',array[]::text[]),
  ('Aurorite','Fictional',array['Radiant']::text[]),
  ('Liminalite','Fictional',array[]::text[]),
  ('Serpentite','Real',array[]::text[]),
  ('False Vacuum','Fictional',array['Dark/Void']::text[]),
  ('Netherwrong','Stupid',array[]::text[]),
  ('Armalcolite','Real',array['Celestial']::text[]),
  ('Last Light','Fictional',array['Radiant','Dark/Void']::text[]),
  ('where gem','Stupid',array[]::text[]),
  ('Edscottite','Real',array['Celestial']::text[]),
  ('Parallax','Fictional',array[]::text[]),
  ('Blacksite Crystal','Fictional',array[]::text[]),
  ('Hapkeite','Real',array['Celestial']::text[]),
  ('Fluorotetraferriphlogopite','Real',array[]::text[]),
  ('Thalassa','Fictional',array['Aquatic']::text[]),
  ('Aurorium','Fictional',array['Celestial','Radiant']::text[]),
  ('300','Stupid',array[]::text[]),
  ('Yttrocolumbite-(Y)','Real',array[]::text[]),
  ('Seraphite','Real',array[]::text[]),
  ('Chronofracture','Fictional',array[]::text[]),
  ('Panguite','Real',array['Celestial']::text[]),
  ('the last gem','Stupid',array[]::text[]),
  ('Crystalline Singularity','Fictional',array['Celestial']::text[]),
  ('Ontological Shard','Anomalous',array[]::text[]),
  ('Polaris','Fictional',array['Celestial','Frozen','Radiant']::text[]),
  ('Chromaflux','Fictional',array[]::text[]),
  ('Allendeite','Real',array['Celestial']::text[]),
  ('Ascendentite','Fictional',array['Celestial','Radiant']::text[]),
  ('Infernite','Fictional',array['Fiery']::text[]),
  ('Asterism','Fictional',array['Radiant']::text[]),
  ('Tistarite','Real',array['Celestial']::text[]),
  ('Deadstar','Fictional',array['Celestial','Dark/Void']::text[]),
  ('Eventide','Fictional',array['Radiant']::text[]),
  ('Seifertite','Real',array[]::text[]),
  ('Deepcore Geode','Fictional',array[]::text[]),
  ('Tuite','Real',array['Celestial']::text[]),
  ('Solarion','Fictional',array['Celestial','Radiant','Fiery']::text[]),
  ('Unobtainium','Fictional',array[]::text[]),
  ('Stishovite','Real',array[]::text[]),
  ('noobium','Stupid',array[]::text[]),
  ('First Light','Fictional',array['Radiant']::text[]),
  ('Heart of Xy','Fictional',array[]::text[]),
  ('Potassic-magnesio-fluoro-chloro-potassic-ferri-magnesiotaramite-potassic-chloro-ferri-magnesiotaramite','Stupid',array[]::text[]),
  ('touch grass','Stupid',array[]::text[]),
  ('Davemaoite','Real',array[]::text[]),
  ('Frostspike','Fictional',array['Frozen']::text[]),
  ('Osbornite','Real',array['Celestial']::text[]),
  ('Verity','Fictional',array[]::text[]),
  ('Bridgmanite','Real',array[]::text[]),
  ('Griceite','Real',array[]::text[]),
  ('Umbra shard','Fictional',array['Celestial','Dark/Void']::text[]),
  ('Långbanshyttanite','Real',array[]::text[]),
  ('Nullstone','Fictional',array['Dark/Void']::text[]),
  ('Krotite','Real',array['Celestial']::text[]),
  ('Akimotoite','Real',array[]::text[]),
  ('Redcanyonite','Real',array[]::text[]),
  ('Carmeltazite','Real',array[]::text[]),
  ('Calmarite','Fictional',array[]::text[]),
  ('Mantleheart','Fictional',array['Fiery']::text[]),
  ('Majorite','Real',array[]::text[]),
  ('Carbonado','Real',array[]::text[]),
  ('Kochkarite','Real',array[]::text[]),
  ('Fractured Reality','Fictional',array['Corrupted/Glitched']::text[]),
  ('Haggertyite','Real',array[]::text[]),
  ('Kuannersuite-(Ce)','Real',array[]::text[]),
  ('Bazzite','Real',array[]::text[]),
  ('Reidite','Real',array[]::text[]),
  ('Zigrasite','Real',array[]::text[]),
  ('Tazheranite','Real',array[]::text[]),
  ('Totality','Fictional',array['Radiant','Dark/Void']::text[]),
  ('Core of Oblivion','Fictional',array['Celestial','Dark/Void']::text[]),
  ('22 karat diamond','Stupid',array[]::text[]),
  ('Redshift Crystal','Fictional',array['Celestial']::text[]),
  ('Loveringite','Real',array[]::text[]),
  ('Hsianghualite','Real',array[]::text[]),
  ('Ammolite','Real',array['Ancient/Fossil']::text[]),
  ('Proustite','Real',array[]::text[]),
  ('Sundown Crystal','Fictional',array['Radiant']::text[]),
  ('Libyan Desert Glass','Real',array['Ancient/Fossil']::text[]),
  ('False Diamond','Fictional',array[]::text[]),
  ('Zirkelite','Real',array[]::text[]),
  ('Peatite-(Y)','Real',array[]::text[]),
  ('Neptunite','Real',array[]::text[]),
  ('Londonite','Real',array[]::text[]),
  ('Event Horizon','Fictional',array['Celestial','Dark/Void']::text[]),
  ('Lanky Gem','Fictional',array[]::text[]),
  ('Test Ore','Fictional',array[]::text[]),
  ('Volcanic Achalite','Fictional',array[]::text[]),
  ('Potassic-ferro-ferri-sadanagaite','Real',array[]::text[]),
  ('Paradoxite','Fictional',array[]::text[]),
  ('Nabesite','Real',array[]::text[]),
  ('Presolar Moissanite','Real',array['Celestial','Ancient/Fossil']::text[]),
  ('Routhierite','Real',array[]::text[]),
  ('Beryllonite','Real',array[]::text[]),
  ('Monochronite','Fictional',array[]::text[]),
  ('Georgbarsanovite','Real',array[]::text[]),
  ('Magnesiohögbomite','Real',array[]::text[]),
  ('Ja-ore','Fictional',array[]::text[]),
  ('Martian Opal','Fictional',array['Celestial']::text[]),
  ('Holtite','Real',array[]::text[]),
  ('Kornerupine','Real',array[]::text[]),
  ('Jadarite','Real',array[]::text[]),
  ('Hydroxycalciomicrolite','Real',array[]::text[]),
  ('Borealite','Fictional',array[]::text[]),
  ('Atlas Stone','Fictional',array[]::text[]),
  ('Bismuth','Real',array[]::text[]),
  ('Singularity Shard','Fictional',array['Celestial','Dark/Void']::text[]),
  ('Crocoite','Real',array[]::text[]),
  ('Nuummite','Real',array['Ancient/Fossil']::text[]),
  ('Bobfergusonite','Real',array[]::text[]),
  ('Chkalovite','Real',array[]::text[]),
  ('π','Stupid',array[]::text[]),
  ('Kurnakovite','Real',array[]::text[]),
  ('Fluorcalciobritholite','Real',array[]::text[]),
  ('e','Stupid',array[]::text[]),
  ('Wulfenite','Real',array[]::text[]),
  ('Raspite','Real',array[]::text[]),
  ('Lunar Diamond','Fictional',array['Celestial']::text[]),
  ('Afterglow','Fictional',array['Radiant']::text[]),
  ('Hutchinsonite','Real',array[]::text[]),
  ('Duolite','Fictional',array[]::text[]),
  ('Twentiethite','Fictional',array[]::text[]),
  ('Scheelite','Real',array[]::text[]),
  ('Antimatter Crystal','Fictional',array['Celestial']::text[]),
  ('Manganvesuvianite','Real',array[]::text[]),
  ('Ekanite','Real',array['Radioactive']::text[]),
  ('Moolooite','Real',array[]::text[]),
  ('Sugilite','Real',array[]::text[]),
  ('Pallasite Crystal','Real',array['Celestial']::text[]),
  ('Vesuvianite','Real',array[]::text[]),
  ('Paraershovite','Real',array[]::text[]),
  ('Monthstone','Stupid',array[]::text[]),
  ('cbf detected, loser!','Stupid',array[]::text[]),
  ('Dark Matter','Fictional',array['Celestial','Dark/Void']::text[]),
  ('Fate Crystal','Fictional',array[]::text[]),
  ('Loading...','Stupid',array[]::text[]),
  ('Ringwoodite','Real',array[]::text[]),
  ('Rainbow Lattice Sunstone','Real',array['Radiant']::text[]),
  ('Piemontite','Real',array[]::text[]),
  ('Tremolite','Real',array[]::text[]),
  ('Neutron Crystal','Fictional',array['Celestial']::text[]),
  ('Corona Shard','Fictional',array['Celestial','Radiant','Fiery']::text[]),
  ('Microlux','Fictional',array[]::text[]),
  ('Hydrokenoelsmoreite','Real',array[]::text[]),
  ('67','Stupid',array[]::text[]),
  ('Jeromite','Fictional',array[]::text[]),
  ('Meteorite Peridot','Real',array['Celestial']::text[]),
  ('Axinite','Real',array[]::text[]),
  ('Zektzerite','Real',array[]::text[]),
  ('Weloganite','Real',array[]::text[]),
  ('focus.','Stupid',array[]::text[]),
  ('Stardust Crystal','Fictional',array['Celestial','Ancient/Fossil']::text[]),
  ('Chronite','Fictional',array[]::text[]),
  ('Papagoite','Real',array[]::text[]),
  ('Seismic Crystal','Fictional',array[]::text[]),
  ('Boleite','Real',array[]::text[]),
  ('Chlorophoenicite','Real',array[]::text[]),
  ('Sinhalite','Real',array[]::text[]),
  ('Tugtupite','Real',array[]::text[]),
  ('Fukalite','Real',array[]::text[]),
  ('Fingerite','Real',array['Toxic']::text[]),
  ('Ajoite','Real',array[]::text[]),
  ('Probability Crystal','Fictional',array[]::text[]),
  ('Void Opal','Fictional',array['Dark/Void']::text[]),
  ('Euclase','Real',array[]::text[]),
  ('Magnesiochloritoid','Real',array[]::text[]),
  ('Black Diamond','Real',array[]::text[]),
  ('Hibonite','Real',array['Celestial']::text[]),
  ('Phenakite','Real',array[]::text[]),
  ('Aether Quartz','Fictional',array[]::text[]),
  ('Cryoshock','Fictional',array['Frozen','Dark/Void']::text[]),
  ('Hackmanite','Real',array[]::text[]),
  ('Natural Moissanite','Real',array[]::text[]),
  ('97%','Stupid',array[]::text[]),
  ('Carletonite','Real',array[]::text[]),
  ('Scapolite','Real',array[]::text[]),
  ('Kyawthuite','Real',array[]::text[]),
  ('Chambersite','Real',array[]::text[]),
  ('Umbrium','Fictional',array['Dark/Void']::text[]),
  ('Red Diamond','Real',array[]::text[]),
  ('Tinsleyite','Real',array[]::text[]),
  ('Blue Garnet','Real',array[]::text[]),
  ('Dioptase','Real',array[]::text[]),
  ('Void Pearl','Fictional',array['Dark/Void']::text[]),
  ('Charoite','Real',array[]::text[]),
  ('Paraíba Tourmaline','Real',array[]::text[]),
  ('Compression Quartz','Fictional',array[]::text[]),
  ('error 404','Stupid',array['Corrupted/Glitched']::text[]),
  ('Hauyne','Real',array[]::text[]),
  ('Pallasite','Real',array['Celestial']::text[]),
  ('Serendibite','Real',array[]::text[]),
  ('Cummingtonite','Real',array[]::text[]),
  ('Hemimorphite','Real',array[]::text[]),
  ('Tsavorite','Real',array[]::text[]),
  ('Diaspore','Real',array[]::text[]),
  ('Moltenite','Fictional',array['Fiery']::text[]),
  ('Star Fragment','Fictional',array['Celestial']::text[]),
  ('Poudretteite','Real',array[]::text[]),
  ('Eudialyte','Real',array[]::text[]),
  ('Smithsonite','Real',array[]::text[]),
  ('Uvarovite','Real',array[]::text[]),
  ('Clinohumite','Real',array[]::text[]),
  ('Amblygonite','Real',array[]::text[]),
  ('Titanite','Real',array[]::text[]),
  ('Eternal Glowstone','Fictional',array['Radiant']::text[]),
  ('Nyx Obsidian','Fictional',array['Dark/Void']::text[]),
  ('Jeremejevite','Real',array[]::text[]),
  ('Danburite','Real',array[]::text[]),
  ('hiding in your wifi','Stupid',array[]::text[]),
  ('Pezzottaite','Real',array[]::text[]),
  ('Amber','Real',array['Ancient/Fossil','Organic/Living']::text[]),
  ('Rhodochrosite','Real',array[]::text[]),
  ('Painite','Real',array[]::text[]),
  ('unlucky gem','Stupid',array[]::text[]),
  ('Musgravite','Real',array[]::text[]),
  ('Taaffeite','Real',array[]::text[]),
  ('Prehnite','Real',array[]::text[]),
  ('Lodestone','Real',array[]::text[]),
  ('Moonlit Quartz','Fictional',array['Celestial','Frozen','Radiant']::text[]),
  ('Grandidierite','Real',array[]::text[]),
  ('Demantoid','Real',array[]::text[]),
  ('Mythril','Fictional',array[]::text[]),
  ('Black Opal','Real',array[]::text[]),
  ('Morganite','Real',array[]::text[]),
  ('Red Beryl','Real',array[]::text[]),
  ('Unakite','Real',array[]::text[]),
  ('Uranium','Real',array['Radioactive']::text[]),
  ('Drillstone','Fictional',array[]::text[]),
  ('Benitoite','Real',array[]::text[]),
  ('Kunzite','Real',array[]::text[]),
  ('Alexandrite','Real',array[]::text[]),
  ('Lapis Lazuli','Real',array[]::text[]),
  ('Tektite','Real',array['Celestial']::text[]),
  ('Howlite','Real',array[]::text[]),
  ('Tanzanite','Real',array[]::text[]),
  ('Larvikite','Real',array[]::text[]),
  ('Iolite','Real',array[]::text[]),
  ('Diamond','Real',array[]::text[]),
  ('Lepidolite','Real',array[]::text[]),
  ('Labradorite','Real',array[]::text[]),
  ('The Bottom','Anomalous',array['Dark/Void']::text[]),
  ('Emerald','Real',array[]::text[]),
  ('Kyanite','Real',array[]::text[]),
  ('Ruby','Real',array[]::text[]),
  ('random rock I found outside','Stupid',array[]::text[]),
  ('Rhodonite','Real',array[]::text[]),
  ('Sapphire','Real',array[]::text[]),
  ('Zephyrion','Anomalous',array[]::text[]),
  ('Larimar','Real',array['Aquatic']::text[]),
  ('Spinel','Real',array[]::text[]),
  ('Eclipse Stone','Fictional',array['Celestial','Radiant','Dark/Void']::text[]),
  ('Moonstone','Real',array[]::text[]),
  ('Bloodstone','Real',array['Bloody']::text[]),
  ('Zircon','Real',array[]::text[]),
  ('Aventurine','Real',array[]::text[]),
  ('the clock','Fictional',array[]::text[]),
  ('Opal','Real',array[]::text[]),
  ('Sunstone','Real',array['Radiant']::text[]),
  ('Core Sample','Fictional',array[]::text[]),
  ('Meteorite Fragment','Real',array['Celestial']::text[]),
  ('Tourmaline','Real',array[]::text[]),
  ('Azurite','Real',array[]::text[]),
  ('Pyrite','Real',array[]::text[]),
  ('Aquamarine','Real',array['Aquatic']::text[]),
  ('Amazonite','Real',array[]::text[]),
  ('Topaz','Real',array[]::text[]),
  ('Jade','Real',array[]::text[]),
  ('Tiger''s Eye','Real',array[]::text[]),
  ('Peridot','Real',array[]::text[]),
  ('trashcan','Stupid',array[]::text[]),
  ('Hadopelagic','Anomalous',array['Aquatic','Dark/Void']::text[]),
  ('Citrine','Real',array[]::text[]),
  ('Carnelian','Real',array[]::text[]),
  ('Garnet','Real',array[]::text[]),
  ('Sodalite','Real',array[]::text[]),
  ('Amethyst','Real',array[]::text[]),
  ('Chalcedony','Real',array[]::text[]),
  ('Jasper','Real',array[]::text[]),
  ('Malachite','Real',array[]::text[]),
  ('Agate','Real',array[]::text[]),
  ('Obsidian','Real',array[]::text[]),
  ('Hematite','Real',array[]::text[]);


do $$
begin
  if (select count(*) from gemdle_private.gem_tags) <> 296 then
    raise exception 'gemdle canonical tag map must contain exactly 296 gems';
  end if;
end;
$$;

create function gemdle_private.has_mutation(p_mutations text[], variadic p_names text[])
returns boolean language sql immutable set search_path = '' as $$
  select exists(select 1 from unnest(p_names) n where lower(n) = any(p_mutations));
$$;

create function gemdle_private.award(p_id text,p_name text,p_family text,p_kind text,p_bonus double precision)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',p_id,'name',p_name,'family',p_family,'kind',p_kind,'bonus',p_bonus);
$$;

create function gemdle_private.classify_specimen(p_specimen jsonb,p_gem jsonb default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_name text := coalesce(p_specimen->>'gem_name','');
  v_primary text;
  v_semantic text[] := '{}';
  v_mutations text[] := '{}';
  v_awards jsonb := '[]'::jsonb;
  v_suppressed text[] := '{}';
  v_metadata jsonb := coalesce(p_gem->'metadata','{}'::jsonb);
  v_specific_source boolean := false;
  v_weight double precision;
  v_base double precision;
  v_bonus double precision := 0;
  v_overall double precision;
  v_structural text[] := '{}';
  v_contribution_gem double precision;
  v_contribution_weight double precision;
  v_contribution_mutations double precision;
begin
  select t.primary_classification,t.semantic_tags into v_primary,v_semantic
  from gemdle_private.gem_tags t where t.gem_name=v_name;
  if v_primary is null then raise exception 'unmapped_gemdle_gem:%',v_name; end if;

  select coalesce(array_agg(distinct lower(q.value)) filter(where q.value<>''),'{}') into v_mutations
  from (
    select coalesce(m->>'name','') value from jsonb_array_elements(coalesce(p_specimen->'mutations','[]'::jsonb)) m
    union all
    select coalesce(m->>'id','') value from jsonb_array_elements(coalesce(p_specimen->'mutations','[]'::jsonb)) m
  ) q;

  v_contribution_gem := (p_specimen#>>'{contributions,gem}')::double precision;
  v_contribution_weight := (p_specimen#>>'{contributions,weight}')::double precision;
  v_contribution_mutations := (p_specimen#>>'{contributions,mutations}')::double precision;
  if v_contribution_gem is null or v_contribution_weight is null or v_contribution_mutations is null
    or v_contribution_gem<=0 or v_contribution_weight<=0 or v_contribution_mutations<=0 then
    raise exception 'invalid_gemdle_contributions:%',v_name;
  end if;
  v_base := v_contribution_gem*v_contribution_weight*v_contribution_mutations;
  if not (v_base>=1 and v_base<'Infinity'::double precision) then raise exception 'invalid_gemdle_base_rarity:%',v_name; end if;

  -- 1. Exact overrides.
  if v_name='Meteorite Peridot' and gemdle_private.has_mutation(v_mutations,'Celestial') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('written_in_the_stars','Written in the Stars','alignment:celestial','exact',.18)); v_suppressed:=array_append(v_suppressed,'celestial');
  end if;
  if v_name='Uranium' and gemdle_private.has_mutation(v_mutations,'Radioactive') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('critical_mass','Critical Mass','alignment:radioactive','exact',.65)); v_suppressed:=array_append(v_suppressed,'radioactive');
  end if;
  if v_name='Bloodstone' and gemdle_private.has_mutation(v_mutations,'Bloody') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('bloodbath','Bloodbath','alignment:bloody','exact',.65)); v_suppressed:=array_append(v_suppressed,'bloody');
  end if;
  if v_name='Sunstone' and gemdle_private.has_mutation(v_mutations,'Radiant') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('solar_flare','Solar Flare','alignment:radiant','exact',.50)); v_suppressed:=array_append(v_suppressed,'radiant');
  end if;

  -- 2. Semantic contradictions and cross-semantic relationships.
  if (('Fiery'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Frozen')) or ('Frozen'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Heated','Blazing'))) then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('against_nature','Against Nature','relationship:thermal','relationship',.65));
  end if;
  if 'Radiant'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Shadowed','Voidtouched','Abyssal') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('radiant_paradox','Radiant Paradox','relationship:radiant_void','relationship',.65));
  end if;
  if 'Organic/Living'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Fossilised','Zombified','Withered') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('deathly_paradox','Deathly Paradox','relationship:living_dead','relationship',.65));
  end if;
  if 'Ancient/Fossil'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Alive','Verdant') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('living_fossil','Living Fossil','relationship:living_fossil','relationship',.75));
  end if;
  if 'Toxic'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Edible') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('toxic_cuisine','Toxic Cuisine','relationship:toxic_cuisine','relationship',.85));
  end if;
  if 'Corrupted/Glitched'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Balanced') then
    v_awards:=v_awards||jsonb_build_array(gemdle_private.award('perfectly_balanced','Perfectly Balanced','relationship:corrupted_balance','relationship',.30));
  end if;

  -- 3. Generic semantic alignments.
  if 'Aquatic'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Aquatic') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('aquatic_alignment','Aquatic Alignment','alignment:aquatic','alignment',.55)); end if;
  if 'Celestial'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Celestial','Cosmic','Starstruck') and not ('celestial'=any(v_suppressed)) then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('celestial_alignment','Celestial Alignment','alignment:celestial','alignment',.50)); end if;
  if 'Fiery'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Heated','Blazing') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('infernal_alignment','Infernal Alignment','alignment:infernal','alignment',.65)); end if;
  if 'Frozen'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Frozen') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('cryogenic_alignment','Cryogenic Alignment','alignment:cryogenic','alignment',.75)); end if;
  if 'Radioactive'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Radioactive') and not ('radioactive'=any(v_suppressed)) then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('radioactive_alignment','Radioactive Alignment','alignment:radioactive','alignment',1.00)); end if;
  if 'Radiant'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Radiant','Lit') and not ('radiant'=any(v_suppressed)) then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('radiant_alignment','Radiant Alignment','alignment:radiant','alignment',.50)); end if;
  if 'Dark/Void'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Shadowed','Voidtouched','Abyssal') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('void_alignment','Void Alignment','alignment:void','alignment',.50)); end if;
  if 'Organic/Living'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Alive','Verdant') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('living_alignment','Living Alignment','alignment:living','alignment',.75)); end if;
  if 'Ancient/Fossil'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Ancient','Fossilised') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('ancient_alignment','Ancient Alignment','alignment:ancient','alignment',.65)); end if;
  if 'Toxic'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Poisonous','Acidic') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('toxic_alignment','Toxic Alignment','alignment:toxic','alignment',.85)); end if;
  if 'Corrupted/Glitched'=any(v_semantic) and gemdle_private.has_mutation(v_mutations,'Corrupted','Discombobulated') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('corrupted_alignment','Corrupted Alignment','alignment:corrupted','alignment',.65)); end if;

  -- 4. Mutation pairs with family supersession.
  if gemdle_private.has_mutation(v_mutations,'Small') then
    if gemdle_private.has_mutation(v_mutations,'Gargantuan') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('tiny_gargantuan','Tiny Gargantuan','mutation:size','mutation_pair',.40));
    elsif gemdle_private.has_mutation(v_mutations,'Titanic') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('pocket_titanic','Pocket Titanic','mutation:size','mutation_pair',.30));
    elsif gemdle_private.has_mutation(v_mutations,'Colossal') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('tiny_colossus','Tiny Colossus','mutation:size','mutation_pair',.25));
    elsif gemdle_private.has_mutation(v_mutations,'Massive') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('size_paradox','Size Paradox','mutation:size','mutation_pair',.20));
    elsif gemdle_private.has_mutation(v_mutations,'Giant') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('tiny_giant','Tiny Giant','mutation:size','mutation_pair',.18));
    elsif gemdle_private.has_mutation(v_mutations,'Big') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('mixed_signals','Mixed Signals','mutation:size','mutation_pair',.075)); end if;
  end if;
  if gemdle_private.has_mutation(v_mutations,'Balanced') and gemdle_private.has_mutation(v_mutations,'Chaotic') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('perfect_chaos','Perfect Chaos','mutation:balance','mutation_pair',.25)); end if;
  if gemdle_private.has_mutation(v_mutations,'Frozen') and gemdle_private.has_mutation(v_mutations,'Heated','Blazing') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('thermal_paradox','Thermal Paradox','mutation:thermal','mutation_pair',.80)); end if;
  if gemdle_private.has_mutation(v_mutations,'Alive') and gemdle_private.has_mutation(v_mutations,'Fossilised','Zombified') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('living_dead','Living Dead','mutation:life','mutation_pair',1.10)); end if;
  if gemdle_private.has_mutation(v_mutations,'Angelic') and gemdle_private.has_mutation(v_mutations,'Devilish') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('divine_conflict','Divine Conflict','mutation:divine','mutation_pair',1.40)); end if;
  if gemdle_private.has_mutation(v_mutations,'Gilded') and gemdle_private.has_mutation(v_mutations,'Golden') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('fools_gold','Fool''s Gold','mutation:gold','mutation_pair',.65)); end if;
  if gemdle_private.has_mutation(v_mutations,'Edible') and gemdle_private.has_mutation(v_mutations,'Rotten') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('rotten_cuisine','Rotten Cuisine','mutation:cuisine','mutation_pair',1.05));
  elsif gemdle_private.has_mutation(v_mutations,'Edible') and gemdle_private.has_mutation(v_mutations,'Moldy') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('questionable_cuisine','Questionable Cuisine','mutation:cuisine','mutation_pair',.65)); end if;

  -- 5. Primary crosses.
  if v_primary='Real' and gemdle_private.has_mutation(v_mutations,'Fake') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('impostor','Impostor','primary:fake','primary_cross',.15)); end if;
  if v_primary='Fictional' and gemdle_private.has_mutation(v_mutations,'Fake') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('double_fiction','Double Fiction','primary:fake','primary_cross',.45)); end if;
  if v_primary='Stupid' and gemdle_private.has_mutation(v_mutations,'Godlike') then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('comedy_of_the_gods','Comedy of the Gods','primary:godlike','primary_cross',.65)); end if;

  -- 6. Raw weight patterns.
  v_weight:=(p_specimen->>'weight_multiplier')::double precision;
  if v_weight is null or not (v_weight>0 and v_weight<'Infinity'::double precision) then raise exception 'invalid_gemdle_weight:%',v_name; end if;
  if v_weight<=.510 then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('bare_minimum','Bare Minimum','weight:light','weight',.15));
  elsif v_weight<=.550 then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('very_light','Very Light','weight:light','weight',.06)); end if;
  if abs(v_weight-1)<=.005 then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('near_perfect','Near Perfect','weight:perfect','weight',.07)); end if;
  if v_weight>=2 and abs(v_weight-round(v_weight))<=.005 then v_awards:=v_awards||jsonb_build_array(gemdle_private.award('suspiciously_precise','Suspiciously Precise','weight:integer','weight',.25)); end if;

  -- 7. Structural/display-only classifications from backend catalogue fields.
  if v_metadata?'deepcore_stage' then v_specific_source:=true; v_structural:=array_append(v_structural,'Deepcore'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('deepcore','Deepcore','structural:deepcore','structural',0)); end if;
  if coalesce((v_metadata->>'sourceExclusive')::boolean,false) then v_specific_source:=true; v_structural:=array_append(v_structural,'Source-Exclusive'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('source_exclusive','Source-Exclusive','structural:source_exclusive','structural',0)); end if;
  if coalesce((v_metadata->>'abyssalPotionExclusive')::boolean,false) then v_specific_source:=true; v_structural:=array_append(v_structural,'Potion-Exclusive'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('potion_exclusive','Potion-Exclusive','structural:potion_exclusive','structural',0)); end if;
  if coalesce((v_metadata->>'milestone')::boolean,false) or coalesce((v_metadata->>'anniversary')::boolean,false) or coalesce((v_metadata->>'anniversaryMarker')::boolean,false) or coalesce((v_metadata->>'anniversary_marker')::boolean,false) or lower(coalesce(v_metadata->>'source',''))='anniversary' then v_specific_source:=true; v_structural:=array_append(v_structural,'Milestone'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('milestone','Milestone','structural:milestone','structural',0)); end if;
  if coalesce(p_gem->>'availability_mode','')='date_range' and not v_specific_source then v_structural:=array_append(v_structural,'Limited'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('limited','Limited','structural:limited','structural',0)); end if;
  if coalesce((p_gem->>'affected_by_luck')::boolean,true)=false then v_structural:=array_append(v_structural,'Flat'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('flat','Flat','structural:chance','structural',0)); end if;
  if coalesce(p_gem->>'availability_mode','')='daily' then v_structural:=array_append(v_structural,'Time-Gated'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('time_gated','Time-Gated','structural:availability','structural',0)); end if;
  if coalesce(p_gem->>'availability_mode','')='global_event' then v_structural:=array_append(v_structural,'Event-Exclusive'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('event_exclusive','Event-Exclusive','structural:availability','structural',0)); end if;
  if coalesce((v_metadata->>'community')::boolean,false) or nullif(trim(coalesce(v_metadata->>'creator','')),'') is not null or coalesce(p_gem->>'description','') ~* '\\(by[[:space:]]+@[^)]+\\)' then v_structural:=array_append(v_structural,'Community'); v_awards:=v_awards||jsonb_build_array(gemdle_private.award('community','Community','structural:attribution','structural',0)); end if;

  select coalesce(sum((a->>'bonus')::double precision),0) into v_bonus from jsonb_array_elements(v_awards) a;
  v_overall:=v_base*(1+v_bonus);
  if not (v_overall>=1 and v_overall<'Infinity'::double precision) then raise exception 'invalid_gemdle_final_rarity:%',v_name; end if;
  return jsonb_build_object(
    'gem_tags',jsonb_build_object('primary',v_primary,'semantic',to_jsonb(v_semantic),'structural',to_jsonb(v_structural)),
    'classifications',v_awards,
    'classification_bonus',v_bonus,
    'specimen_rarity',v_base,
    'overall_rarity',v_overall
  );
end;
$$;

revoke all on function gemdle_private.has_mutation(text[],text[]) from public,anon,authenticated,service_role;
revoke all on function gemdle_private.award(text,text,text,text,double precision) from public,anon,authenticated,service_role;
revoke all on function gemdle_private.classify_specimen(jsonb,jsonb) from public,anon,authenticated,service_role;

create table gemdle_private.classification_backfill_audit (
  result_id uuid primary key references public.gemdle_results(id) on delete cascade,
  original_overall_rarity double precision not null,
  recalculated_overall_rarity double precision not null,
  classifications jsonb not null,
  processed_at timestamptz not null default now()
);
alter table gemdle_private.classification_backfill_audit enable row level security;
revoke all on gemdle_private.classification_backfill_audit from public,anon,authenticated,service_role;

-- Refuse partial or guessed backfills if a historical specimen is outside the canonical map.
do $$
begin
  if exists(
    select 1 from public.gemdle_results r
    left join gemdle_private.gem_tags t on t.gem_name=r.specimen->>'gem_name'
    where t.gem_name is null
  ) then raise exception 'historical Gemdle specimen missing from canonical tag map'; end if;
end;
$$;

create temporary table gemdle_classification_backfill_work on commit drop as
select r.id,r.overall_rarity old_score,
  gemdle_private.classify_specimen(r.specimen,to_jsonb(g)) scored
from public.gemdle_results r
left join public.private_feature_gems g on g.name=r.specimen->>'gem_name';

insert into gemdle_private.classification_backfill_audit(result_id,original_overall_rarity,recalculated_overall_rarity,classifications)
select id,old_score,(scored->>'overall_rarity')::double precision,scored->'classifications'
from gemdle_classification_backfill_work
on conflict(result_id) do nothing;

update public.gemdle_results r set
  specimen=r.specimen||w.scored,
  overall_rarity=(w.scored->>'overall_rarity')::double precision
from gemdle_classification_backfill_work w where w.id=r.id;

commit;
