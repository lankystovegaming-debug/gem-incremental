-- Permanent gameplay Bundles. No currency/stat rewards. Deploy manually.
begin;
create table public.game_bundles (
 id text primary key, name text not null, icon text not null, sort_order integer not null unique,
 requires_first_six boolean not null default false
);
create table public.game_bundle_requirements (
 id text primary key, bundle_id text not null references public.game_bundles(id),
 section text not null, requirement_type text not null check (requirement_type in
 ('gem_quantity','gem_min_weight','gem_mutation','mutation_quantity','mutation_count','gem_rarity_weight_mutations')),
 gem_name text, mutation_id text, required_amount integer not null check(required_amount>0),
 minimum_weight_multiplier numeric check(minimum_weight_multiplier>0),
 minimum_mutation_count integer check(minimum_mutation_count>0),
 minimum_gem_rarity bigint check(minimum_gem_rarity>0),
 manual_only boolean not null default false, sort_order integer not null,
 check (requirement_type not in ('gem_quantity','gem_min_weight','gem_mutation') or gem_name is not null),
 check (requirement_type not in ('gem_mutation','mutation_quantity') or mutation_id is not null),
 check (requirement_type not in ('gem_min_weight','gem_rarity_weight_mutations') or minimum_weight_multiplier is not null),
 check (requirement_type not in ('mutation_count','gem_rarity_weight_mutations') or minimum_mutation_count is not null),
 check (requirement_type <> 'gem_rarity_weight_mutations' or (minimum_gem_rarity is not null and manual_only and required_amount=1))
);
create index game_bundle_requirements_bundle_idx on public.game_bundle_requirements(bundle_id,sort_order);
create table public.player_bundle_progress (
 player_id uuid not null references public.players(id) on delete cascade,
 requirement_id text not null references public.game_bundle_requirements(id),
 contributed integer not null default 0 check(contributed>=0), updated_at timestamptz not null default now(),
 primary key(player_id,requirement_id)
);
create table public.player_bundle_settings (
 player_id uuid not null references public.players(id) on delete cascade,
 requirement_id text not null references public.game_bundle_requirements(id),
 auto_contribute boolean not null default false, primary key(player_id,requirement_id)
);
create table public.player_bundle_completions (
 player_id uuid not null references public.players(id) on delete cascade,
 bundle_id text not null references public.game_bundles(id), completed_at timestamptz not null default now(),
 primary key(player_id,bundle_id)
);
create table public.player_bundle_special_submissions (
 player_id uuid not null references public.players(id) on delete cascade,
 requirement_id text not null references public.game_bundle_requirements(id),
 specimen_snapshot jsonb not null, submitted_at timestamptz not null default now(),
 primary key(player_id,requirement_id)
);
-- One bounded receipt per account: retries of the same accepted roll cannot donate twice.
create table public.player_bundle_roll_receipts (
 player_id uuid primary key references public.players(id) on delete cascade,
 lease_id uuid not null, result jsonb not null
);

insert into public.game_bundles values
 ('jewellers','Jeweller’s Collection','💎',1,false),('spectrum','Spectrum Collection','🌈',2,false),
 ('deep-earth','Deep Earth Collection','⛏️',3,false),('heavyweight','Heavyweight Collection','🏋️',4,false),
 ('mutated','Mutated Collection','✦',5,false),('cosmic','Cosmic Collection','🌌',6,false),
 ('master','Master Collection','👑',7,true);
insert into public.game_bundle_requirements select * from jsonb_populate_recordset(null::public.game_bundle_requirements, $catalog$
[
  {
    "id": "jewellers-01",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 6500,
    "manual_only": false,
    "sort_order": 1,
    "gem_name": "Amethyst"
  },
  {
    "id": "jewellers-02",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 30000,
    "manual_only": false,
    "sort_order": 2,
    "gem_name": "Aquamarine"
  },
  {
    "id": "jewellers-03",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 20000,
    "manual_only": false,
    "sort_order": 3,
    "gem_name": "Opal"
  },
  {
    "id": "jewellers-04",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 15000,
    "manual_only": false,
    "sort_order": 4,
    "gem_name": "Zircon"
  },
  {
    "id": "jewellers-05",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 15000,
    "manual_only": false,
    "sort_order": 5,
    "gem_name": "Moonstone"
  },
  {
    "id": "jewellers-06",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 10000,
    "manual_only": false,
    "sort_order": 6,
    "gem_name": "Sapphire"
  },
  {
    "id": "jewellers-07",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 8000,
    "manual_only": false,
    "sort_order": 7,
    "gem_name": "Ruby"
  },
  {
    "id": "jewellers-08",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 6000,
    "manual_only": false,
    "sort_order": 8,
    "gem_name": "Emerald"
  },
  {
    "id": "jewellers-09",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 5000,
    "manual_only": false,
    "sort_order": 9,
    "gem_name": "Diamond"
  },
  {
    "id": "jewellers-10",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 4000,
    "manual_only": false,
    "sort_order": 10,
    "gem_name": "Tanzanite"
  },
  {
    "id": "jewellers-11",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 3000,
    "manual_only": false,
    "sort_order": 11,
    "gem_name": "Alexandrite"
  },
  {
    "id": "jewellers-12",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 2500,
    "manual_only": false,
    "sort_order": 12,
    "gem_name": "Kunzite"
  },
  {
    "id": "jewellers-13",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 1500,
    "manual_only": false,
    "sort_order": 13,
    "gem_name": "Morganite"
  },
  {
    "id": "jewellers-14",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 1250,
    "manual_only": false,
    "sort_order": 14,
    "gem_name": "Mythril"
  },
  {
    "id": "jewellers-15",
    "bundle_id": "jewellers",
    "section": "The Stockpile",
    "requirement_type": "gem_quantity",
    "required_amount": 750,
    "manual_only": false,
    "sort_order": 15,
    "gem_name": "Painite"
  },
  {
    "id": "spectrum-01",
    "bundle_id": "spectrum",
    "section": "Red",
    "requirement_type": "gem_quantity",
    "required_amount": 15000,
    "manual_only": false,
    "sort_order": 16,
    "gem_name": "Carnelian"
  },
  {
    "id": "spectrum-02",
    "bundle_id": "spectrum",
    "section": "Red",
    "requirement_type": "gem_quantity",
    "required_amount": 8000,
    "manual_only": false,
    "sort_order": 17,
    "gem_name": "Ruby"
  },
  {
    "id": "spectrum-03",
    "bundle_id": "spectrum",
    "section": "Red",
    "requirement_type": "gem_quantity",
    "required_amount": 200,
    "manual_only": false,
    "sort_order": 18,
    "gem_name": "Red Diamond"
  },
  {
    "id": "spectrum-04",
    "bundle_id": "spectrum",
    "section": "Orange",
    "requirement_type": "gem_quantity",
    "required_amount": 18000,
    "manual_only": false,
    "sort_order": 19,
    "gem_name": "Citrine"
  },
  {
    "id": "spectrum-05",
    "bundle_id": "spectrum",
    "section": "Orange",
    "requirement_type": "gem_quantity",
    "required_amount": 1200,
    "manual_only": false,
    "sort_order": 20,
    "gem_name": "Amber"
  },
  {
    "id": "spectrum-06",
    "bundle_id": "spectrum",
    "section": "Orange",
    "requirement_type": "gem_quantity",
    "required_amount": 4,
    "manual_only": false,
    "sort_order": 21,
    "gem_name": "Crocoite"
  },
  {
    "id": "spectrum-07",
    "bundle_id": "spectrum",
    "section": "Yellow",
    "requirement_type": "gem_quantity",
    "required_amount": 35000,
    "manual_only": false,
    "sort_order": 22,
    "gem_name": "Topaz"
  },
  {
    "id": "spectrum-08",
    "bundle_id": "spectrum",
    "section": "Yellow",
    "requirement_type": "gem_quantity",
    "required_amount": 850,
    "manual_only": false,
    "sort_order": 23,
    "gem_name": "Titanite"
  },
  {
    "id": "spectrum-09",
    "bundle_id": "spectrum",
    "section": "Yellow",
    "requirement_type": "gem_quantity",
    "required_amount": 45,
    "manual_only": false,
    "sort_order": 24,
    "gem_name": "Fingerite"
  },
  {
    "id": "spectrum-10",
    "bundle_id": "spectrum",
    "section": "Green",
    "requirement_type": "gem_quantity",
    "required_amount": 250,
    "manual_only": false,
    "sort_order": 25,
    "gem_name": "Malachite"
  },
  {
    "id": "spectrum-11",
    "bundle_id": "spectrum",
    "section": "Green",
    "requirement_type": "gem_quantity",
    "required_amount": 6500,
    "manual_only": false,
    "sort_order": 26,
    "gem_name": "Emerald"
  },
  {
    "id": "spectrum-12",
    "bundle_id": "spectrum",
    "section": "Green",
    "requirement_type": "gem_quantity",
    "required_amount": 22,
    "manual_only": false,
    "sort_order": 27,
    "gem_name": "Meteorite Peridot"
  },
  {
    "id": "spectrum-13",
    "bundle_id": "spectrum",
    "section": "Blue",
    "requirement_type": "gem_quantity",
    "required_amount": 30000,
    "manual_only": false,
    "sort_order": 28,
    "gem_name": "Aquamarine"
  },
  {
    "id": "spectrum-14",
    "bundle_id": "spectrum",
    "section": "Blue",
    "requirement_type": "gem_quantity",
    "required_amount": 7000,
    "manual_only": false,
    "sort_order": 29,
    "gem_name": "Kyanite"
  },
  {
    "id": "spectrum-15",
    "bundle_id": "spectrum",
    "section": "Blue",
    "requirement_type": "gem_quantity",
    "required_amount": 350,
    "manual_only": false,
    "sort_order": 30,
    "gem_name": "Hauyne"
  },
  {
    "id": "spectrum-16",
    "bundle_id": "spectrum",
    "section": "Purple",
    "requirement_type": "gem_quantity",
    "required_amount": 5000,
    "manual_only": false,
    "sort_order": 31,
    "gem_name": "Amethyst"
  },
  {
    "id": "spectrum-17",
    "bundle_id": "spectrum",
    "section": "Purple",
    "requirement_type": "gem_quantity",
    "required_amount": 4500,
    "manual_only": false,
    "sort_order": 32,
    "gem_name": "Iolite"
  },
  {
    "id": "spectrum-18",
    "bundle_id": "spectrum",
    "section": "Purple",
    "requirement_type": "gem_quantity",
    "required_amount": 10,
    "manual_only": false,
    "sort_order": 33,
    "gem_name": "Sugilite"
  },
  {
    "id": "spectrum-19",
    "bundle_id": "spectrum",
    "section": "Monochrome",
    "requirement_type": "gem_quantity",
    "required_amount": 5000,
    "manual_only": false,
    "sort_order": 34,
    "gem_name": "Diamond"
  },
  {
    "id": "spectrum-20",
    "bundle_id": "spectrum",
    "section": "Monochrome",
    "requirement_type": "gem_quantity",
    "required_amount": 2000,
    "manual_only": false,
    "sort_order": 35,
    "gem_name": "Black Opal"
  },
  {
    "id": "spectrum-21",
    "bundle_id": "spectrum",
    "section": "Monochrome",
    "requirement_type": "gem_quantity",
    "required_amount": 75,
    "manual_only": false,
    "sort_order": 36,
    "gem_name": "Black Diamond"
  },
  {
    "id": "deep-earth-01",
    "bundle_id": "deep-earth",
    "section": "Upper Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 2500,
    "manual_only": false,
    "sort_order": 37,
    "gem_name": "Lodestone"
  },
  {
    "id": "deep-earth-02",
    "bundle_id": "deep-earth",
    "section": "Upper Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 2500,
    "manual_only": false,
    "sort_order": 38,
    "gem_name": "Grandidierite"
  },
  {
    "id": "deep-earth-03",
    "bundle_id": "deep-earth",
    "section": "Upper Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 1250,
    "manual_only": false,
    "sort_order": 39,
    "gem_name": "Titanite"
  },
  {
    "id": "deep-earth-04",
    "bundle_id": "deep-earth",
    "section": "Lower Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 125,
    "manual_only": false,
    "sort_order": 40,
    "gem_name": "Hibonite"
  },
  {
    "id": "deep-earth-05",
    "bundle_id": "deep-earth",
    "section": "Lower Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 65,
    "manual_only": false,
    "sort_order": 41,
    "gem_name": "Fingerite"
  },
  {
    "id": "deep-earth-06",
    "bundle_id": "deep-earth",
    "section": "Lower Crust",
    "requirement_type": "gem_quantity",
    "required_amount": 20,
    "manual_only": false,
    "sort_order": 42,
    "gem_name": "Ringwoodite"
  },
  {
    "id": "deep-earth-07",
    "bundle_id": "deep-earth",
    "section": "Upper Mantle",
    "requirement_type": "gem_quantity",
    "required_amount": 12,
    "manual_only": false,
    "sort_order": 43,
    "gem_name": "Moolooite"
  },
  {
    "id": "deep-earth-08",
    "bundle_id": "deep-earth",
    "section": "Upper Mantle",
    "requirement_type": "gem_quantity",
    "required_amount": 9,
    "manual_only": false,
    "sort_order": 44,
    "gem_name": "Hutchinsonite"
  },
  {
    "id": "deep-earth-09",
    "bundle_id": "deep-earth",
    "section": "Upper Mantle",
    "requirement_type": "gem_quantity",
    "required_amount": 7,
    "manual_only": false,
    "sort_order": 45,
    "gem_name": "Fluorcalciobritholite"
  },
  {
    "id": "deep-earth-10",
    "bundle_id": "deep-earth",
    "section": "Deep Mantle",
    "requirement_type": "gem_quantity",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 46,
    "gem_name": "Georgbarsanovite"
  },
  {
    "id": "deep-earth-11",
    "bundle_id": "deep-earth",
    "section": "Deep Mantle",
    "requirement_type": "gem_quantity",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 47,
    "gem_name": "Zirkelite"
  },
  {
    "id": "deep-earth-12",
    "bundle_id": "deep-earth",
    "section": "Deepest Specimen",
    "requirement_type": "gem_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 48,
    "gem_name": "Loveringite"
  },
  {
    "id": "heavyweight-01",
    "bundle_id": "heavyweight",
    "section": "Extreme Weight",
    "requirement_type": "gem_min_weight",
    "required_amount": 70,
    "manual_only": false,
    "sort_order": 49,
    "gem_name": "Diamond",
    "minimum_weight_multiplier": 10
  },
  {
    "id": "heavyweight-02",
    "bundle_id": "heavyweight",
    "section": "Extreme Weight",
    "requirement_type": "gem_min_weight",
    "required_amount": 32,
    "manual_only": false,
    "sort_order": 50,
    "gem_name": "Painite",
    "minimum_weight_multiplier": 9
  },
  {
    "id": "heavyweight-03",
    "bundle_id": "heavyweight",
    "section": "Extreme Weight",
    "requirement_type": "gem_min_weight",
    "required_amount": 20,
    "manual_only": false,
    "sort_order": 51,
    "gem_name": "Titanite",
    "minimum_weight_multiplier": 9
  },
  {
    "id": "heavyweight-04",
    "bundle_id": "heavyweight",
    "section": "Heavy Rares",
    "requirement_type": "gem_min_weight",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 52,
    "gem_name": "Hibonite",
    "minimum_weight_multiplier": 8
  },
  {
    "id": "heavyweight-05",
    "bundle_id": "heavyweight",
    "section": "Heavy Rares",
    "requirement_type": "gem_min_weight",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 53,
    "gem_name": "Fingerite",
    "minimum_weight_multiplier": 7
  },
  {
    "id": "heavyweight-06",
    "bundle_id": "heavyweight",
    "section": "Heavy Rares",
    "requirement_type": "gem_min_weight",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 54,
    "gem_name": "Ringwoodite",
    "minimum_weight_multiplier": 6
  },
  {
    "id": "heavyweight-07",
    "bundle_id": "heavyweight",
    "section": "Heavyweight Trophies",
    "requirement_type": "gem_min_weight",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 55,
    "gem_name": "Dark Matter",
    "minimum_weight_multiplier": 7
  },
  {
    "id": "heavyweight-08",
    "bundle_id": "heavyweight",
    "section": "Heavyweight Trophies",
    "requirement_type": "gem_min_weight",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 56,
    "gem_name": "Moolooite",
    "minimum_weight_multiplier": 5
  },
  {
    "id": "mutated-01",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 20000,
    "manual_only": false,
    "sort_order": 57,
    "mutation_id": "smooth"
  },
  {
    "id": "mutated-02",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 12000,
    "manual_only": false,
    "sort_order": 58,
    "mutation_id": "glossy"
  },
  {
    "id": "mutated-03",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 6000,
    "manual_only": false,
    "sort_order": 59,
    "mutation_id": "clear"
  },
  {
    "id": "mutated-04",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 4000,
    "manual_only": false,
    "sort_order": 60,
    "mutation_id": "lustrous"
  },
  {
    "id": "mutated-05",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 3000,
    "manual_only": false,
    "sort_order": 61,
    "mutation_id": "flawless"
  },
  {
    "id": "mutated-06",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 1200,
    "manual_only": false,
    "sort_order": 62,
    "mutation_id": "polished"
  },
  {
    "id": "mutated-07",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 600,
    "manual_only": false,
    "sort_order": 63,
    "mutation_id": "gilded"
  },
  {
    "id": "mutated-08",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 150,
    "manual_only": false,
    "sort_order": 64,
    "mutation_id": "charged"
  },
  {
    "id": "mutated-09",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 120,
    "manual_only": false,
    "sort_order": 65,
    "mutation_id": "prismatic"
  },
  {
    "id": "mutated-10",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 60,
    "manual_only": false,
    "sort_order": 66,
    "mutation_id": "radiant"
  },
  {
    "id": "mutated-11",
    "bundle_id": "mutated",
    "section": "Mutation Stockpile",
    "requirement_type": "mutation_quantity",
    "required_amount": 30,
    "manual_only": false,
    "sort_order": 67,
    "mutation_id": "celestial"
  },
  {
    "id": "mutated-12",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 68,
    "mutation_id": "enlightened"
  },
  {
    "id": "mutated-13",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 69,
    "mutation_id": "shiny"
  },
  {
    "id": "mutated-14",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 70,
    "mutation_id": "corrupted"
  },
  {
    "id": "mutated-15",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 71,
    "mutation_id": "sparkling"
  },
  {
    "id": "mutated-16",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 72,
    "mutation_id": "golden"
  },
  {
    "id": "mutated-17",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 73,
    "mutation_id": "eternal"
  },
  {
    "id": "mutated-18",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 74,
    "mutation_id": "verdant"
  },
  {
    "id": "mutated-19",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 75,
    "mutation_id": "devilish"
  },
  {
    "id": "mutated-20",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 76,
    "mutation_id": "abyssal"
  },
  {
    "id": "mutated-21",
    "bundle_id": "mutated",
    "section": "Mutation Showcase",
    "requirement_type": "mutation_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 77,
    "mutation_id": "chocolate"
  },
  {
    "id": "mutated-22",
    "bundle_id": "mutated",
    "section": "Mutation Fusion",
    "requirement_type": "mutation_count",
    "required_amount": 8000,
    "manual_only": false,
    "sort_order": 78,
    "minimum_mutation_count": 2
  },
  {
    "id": "mutated-23",
    "bundle_id": "mutated",
    "section": "Mutation Fusion",
    "requirement_type": "mutation_count",
    "required_amount": 250,
    "manual_only": false,
    "sort_order": 79,
    "minimum_mutation_count": 3
  },
  {
    "id": "mutated-24",
    "bundle_id": "mutated",
    "section": "Mutation Fusion",
    "requirement_type": "mutation_count",
    "required_amount": 4,
    "manual_only": false,
    "sort_order": 80,
    "minimum_mutation_count": 4
  },
  {
    "id": "cosmic-01",
    "bundle_id": "cosmic",
    "section": "Cosmic Sacrifices",
    "requirement_type": "gem_quantity",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 81,
    "gem_name": "Lanky Gem"
  },
  {
    "id": "cosmic-02",
    "bundle_id": "cosmic",
    "section": "Cosmic Sacrifices",
    "requirement_type": "gem_quantity",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 82,
    "gem_name": "Libyan Desert Glass"
  },
  {
    "id": "cosmic-03",
    "bundle_id": "cosmic",
    "section": "Cosmic Sacrifices",
    "requirement_type": "gem_quantity",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 83,
    "gem_name": "Ammolite"
  },
  {
    "id": "cosmic-04",
    "bundle_id": "cosmic",
    "section": "Cosmic Sacrifices",
    "requirement_type": "gem_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 84,
    "gem_name": "Core of Oblivion"
  },
  {
    "id": "cosmic-05",
    "bundle_id": "cosmic",
    "section": "Cosmic Sacrifices",
    "requirement_type": "gem_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 85,
    "gem_name": "Reidite"
  },
  {
    "id": "master-01",
    "bundle_id": "master",
    "section": "I. The Hoard",
    "requirement_type": "gem_quantity",
    "required_amount": 50000,
    "manual_only": false,
    "sort_order": 86,
    "gem_name": "Diamond"
  },
  {
    "id": "master-02",
    "bundle_id": "master",
    "section": "I. The Hoard",
    "requirement_type": "gem_quantity",
    "required_amount": 12500,
    "manual_only": false,
    "sort_order": 87,
    "gem_name": "Painite"
  },
  {
    "id": "master-03",
    "bundle_id": "master",
    "section": "I. The Hoard",
    "requirement_type": "gem_quantity",
    "required_amount": 800,
    "manual_only": false,
    "sort_order": 88,
    "gem_name": "Hibonite"
  },
  {
    "id": "master-04",
    "bundle_id": "master",
    "section": "I. The Hoard",
    "requirement_type": "gem_quantity",
    "required_amount": 430,
    "manual_only": false,
    "sort_order": 89,
    "gem_name": "Fingerite"
  },
  {
    "id": "master-05",
    "bundle_id": "master",
    "section": "I. The Hoard",
    "requirement_type": "gem_quantity",
    "required_amount": 145,
    "manual_only": false,
    "sort_order": 90,
    "gem_name": "Ringwoodite"
  },
  {
    "id": "master-06",
    "bundle_id": "master",
    "section": "II. Perfect Specimens",
    "requirement_type": "gem_min_weight",
    "required_amount": 300,
    "manual_only": false,
    "sort_order": 91,
    "gem_name": "Diamond",
    "minimum_weight_multiplier": 10
  },
  {
    "id": "master-07",
    "bundle_id": "master",
    "section": "II. Perfect Specimens",
    "requirement_type": "gem_min_weight",
    "required_amount": 80,
    "manual_only": false,
    "sort_order": 92,
    "gem_name": "Painite",
    "minimum_weight_multiplier": 10
  },
  {
    "id": "master-08",
    "bundle_id": "master",
    "section": "II. Perfect Specimens",
    "requirement_type": "gem_min_weight",
    "required_amount": 10,
    "manual_only": false,
    "sort_order": 93,
    "gem_name": "Hibonite",
    "minimum_weight_multiplier": 9
  },
  {
    "id": "master-09",
    "bundle_id": "master",
    "section": "II. Perfect Specimens",
    "requirement_type": "gem_min_weight",
    "required_amount": 5,
    "manual_only": false,
    "sort_order": 94,
    "gem_name": "Ringwoodite",
    "minimum_weight_multiplier": 7
  },
  {
    "id": "master-10",
    "bundle_id": "master",
    "section": "II. Perfect Specimens",
    "requirement_type": "gem_min_weight",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 95,
    "gem_name": "Dark Matter",
    "minimum_weight_multiplier": 8
  },
  {
    "id": "master-11",
    "bundle_id": "master",
    "section": "III. Altered Perfection",
    "requirement_type": "gem_mutation",
    "required_amount": 25,
    "manual_only": false,
    "sort_order": 96,
    "gem_name": "Painite",
    "mutation_id": "gilded"
  },
  {
    "id": "master-12",
    "bundle_id": "master",
    "section": "III. Altered Perfection",
    "requirement_type": "gem_mutation",
    "required_amount": 6,
    "manual_only": false,
    "sort_order": 97,
    "gem_name": "Painite",
    "mutation_id": "charged"
  },
  {
    "id": "master-13",
    "bundle_id": "master",
    "section": "III. Altered Perfection",
    "requirement_type": "gem_mutation",
    "required_amount": 5,
    "manual_only": false,
    "sort_order": 98,
    "gem_name": "Diamond",
    "mutation_id": "celestial"
  },
  {
    "id": "master-14",
    "bundle_id": "master",
    "section": "III. Altered Perfection",
    "requirement_type": "mutation_count",
    "required_amount": 20,
    "manual_only": false,
    "sort_order": 99,
    "minimum_mutation_count": 4
  },
  {
    "id": "master-15",
    "bundle_id": "master",
    "section": "IV. Cosmic Sacrifice",
    "requirement_type": "gem_quantity",
    "required_amount": 3,
    "manual_only": false,
    "sort_order": 100,
    "gem_name": "Carbonado"
  },
  {
    "id": "master-16",
    "bundle_id": "master",
    "section": "IV. Cosmic Sacrifice",
    "requirement_type": "gem_quantity",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 101,
    "gem_name": "Carmeltazite"
  },
  {
    "id": "master-17",
    "bundle_id": "master",
    "section": "IV. Cosmic Sacrifice",
    "requirement_type": "gem_quantity",
    "required_amount": 2,
    "manual_only": false,
    "sort_order": 102,
    "gem_name": "Krotite"
  },
  {
    "id": "master-18",
    "bundle_id": "master",
    "section": "IV. Cosmic Sacrifice",
    "requirement_type": "gem_quantity",
    "required_amount": 1,
    "manual_only": false,
    "sort_order": 103,
    "gem_name": "Osbornite"
  },
  {
    "id": "master-crown",
    "bundle_id": "master",
    "section": "V. The Crown Jewel",
    "requirement_type": "gem_rarity_weight_mutations",
    "required_amount": 1,
    "minimum_gem_rarity": 10000000,
    "minimum_weight_multiplier": 5,
    "minimum_mutation_count": 2,
    "manual_only": true,
    "sort_order": 104
  }
]
$catalog$::jsonb);

-- All manual and automatic matching uses stored final weight / base weight.
-- The legacy singular mutation is included, but duplicates/empty IDs never inflate counts.
create function public.bundle_mutation_ids(p_specimen jsonb) returns text[]
language sql immutable set search_path=public as $$
 select coalesce(array_agg(distinct id) filter(where id is not null and id<>''),'{}'::text[])
 from (select jsonb_array_elements_text(case when jsonb_typeof(p_specimen->'mutation_ids')='array'
 then p_specimen->'mutation_ids' else '[]'::jsonb end) id
 union all select p_specimen->>'mutation_id') mutations;
$$;
create function public.bundle_specimen_matches(p_requirement public.game_bundle_requirements,p_specimen jsonb)
returns boolean language sql immutable set search_path=public as $$
 select coalesce(
 p_specimen->>'gem_name' not in ('Enchant Relic','Ancient Relic')
 and not coalesce((p_specimen->>'locked')::boolean,false)
 and not coalesce((p_specimen->>'museum_locked')::boolean,false)
 and not coalesce((p_specimen->>'favorited')::boolean,false)
 and not coalesce((p_specimen->>'favorite')::boolean,false)
 and (p_requirement.gem_name is null or p_requirement.gem_name=p_specimen->>'gem_name')
 and (p_requirement.mutation_id is null or p_requirement.mutation_id=any(public.bundle_mutation_ids(p_specimen)))
 and (p_requirement.minimum_mutation_count is null or cardinality(public.bundle_mutation_ids(p_specimen))>=p_requirement.minimum_mutation_count)
 and (p_requirement.minimum_gem_rarity is null or (p_specimen->>'rarity')::numeric>=p_requirement.minimum_gem_rarity)
 and (p_requirement.minimum_weight_multiplier is null or (
 (p_specimen->>'base_weight')::numeric>0
 and (p_specimen->>'base_weight')::numeric < 'Infinity'::numeric
 and (p_specimen->>'final_weight')::numeric < 'Infinity'::numeric
 and (p_specimen->>'final_weight')::numeric / nullif((p_specimen->>'base_weight')::numeric,0)>=p_requirement.minimum_weight_multiplier)),false);
$$;
create function public.bundle_unlocked(p_player_id uuid,p_bundle_id text) returns boolean
language sql stable set search_path=public as $$
 select exists(select 1 from public.game_bundles b where b.id=p_bundle_id and
 (not b.requires_first_six or (select count(*) from public.player_bundle_completions c
 join public.game_bundles previous on previous.id=c.bundle_id
 where c.player_id=p_player_id and previous.sort_order between 1 and 6)=6));
$$;
create function public.bundle_record_completion(p_player_id uuid,p_bundle_id text) returns void
language sql set search_path=public as $$
 insert into public.player_bundle_completions(player_id,bundle_id)
 select p_player_id,p_bundle_id where exists(select 1 from public.game_bundle_requirements where bundle_id=p_bundle_id)
 and not exists(select 1 from public.game_bundle_requirements r
 left join public.player_bundle_progress p on p.player_id=p_player_id and p.requirement_id=r.id
 where r.bundle_id=p_bundle_id and coalesce(p.contributed,0)<r.required_amount)
 on conflict do nothing;
$$;

create function public.bundle_state(p_player_id uuid) returns jsonb
language sql stable set search_path=public as $$
 select jsonb_build_object('bundles',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'unlocked',public.bundle_unlocked(p_player_id,b.id),'completed_at',c.completed_at,
 'requirements',case when public.bundle_unlocked(p_player_id,b.id) then
 (select jsonb_agg(to_jsonb(r)||jsonb_build_object('contributed',coalesce(p.contributed,0),
 'auto_contribute',coalesce(s.auto_contribute,false)) order by r.sort_order)
 from public.game_bundle_requirements r
 left join public.player_bundle_progress p on p.player_id=p_player_id and p.requirement_id=r.id
 left join public.player_bundle_settings s on s.player_id=p_player_id and s.requirement_id=r.id
 where r.bundle_id=b.id) else '[]'::jsonb end) order by b.sort_order)
 from public.game_bundles b left join public.player_bundle_completions c on c.player_id=p_player_id and c.bundle_id=b.id),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(to_jsonb(s)-'player_id') from public.player_bundle_special_submissions s where s.player_id=p_player_id),'[]'::jsonb));
$$;

create function public.bundle_set_auto(p_player_id uuid,p_requirement_id text,p_enabled boolean) returns jsonb
language plpgsql set search_path=public as $$
declare r public.game_bundle_requirements;
begin
 perform 1 from public.players where id=p_player_id for update;
 if not found then raise exception 'player_not_found'; end if;
 select * into r from public.game_bundle_requirements where id=p_requirement_id;
 if not found then raise exception 'bundle_requirement_not_found'; end if;
 if not public.bundle_unlocked(p_player_id,r.bundle_id) then raise exception 'bundle_locked'; end if;
 if r.manual_only then raise exception 'bundle_manual_only'; end if;
 if p_enabled is null then raise exception 'invalid_request'; end if;
 insert into public.player_bundle_settings values(p_player_id,r.id,p_enabled)
 on conflict(player_id,requirement_id) do update set auto_contribute=excluded.auto_contribute;
 return jsonb_build_object('ok',true);
end;
$$;

-- Filter before pagination: large inventories cannot hide an eligible specimen.
create function public.bundle_candidates(p_player_id uuid,p_requirement_id text,p_offset integer default 0)
returns jsonb language plpgsql stable set search_path=public as $$
declare r public.game_bundle_requirements; candidates jsonb;
begin
 select * into r from public.game_bundle_requirements where id=p_requirement_id;
 if not found then raise exception 'bundle_requirement_not_found'; end if;
 if not public.bundle_unlocked(p_player_id,r.bundle_id) then raise exception 'bundle_locked'; end if;
 if coalesce((select contributed from public.player_bundle_progress where player_id=p_player_id and requirement_id=r.id),0)>=r.required_amount then
 return jsonb_build_object('specimens','[]'::jsonb); end if;
 select coalesce(jsonb_agg(specimen),'[]'::jsonb) into candidates from (
 select to_jsonb(g)||jsonb_build_object('id',g.id::text,'final_weight_multiplier',g.final_weight/nullif(g.base_weight,0),
 'mutation_ids',public.bundle_mutation_ids(to_jsonb(g))) specimen
 from public.inventory_gems g where g.player_id=p_player_id
 and not g.locked and not coalesce(g.museum_locked,false)
 and (r.gem_name is null or g.gem_name=r.gem_name)
 and public.bundle_specimen_matches(r,to_jsonb(g))
 order by g.value asc nulls last,g.rarity asc,g.final_weight/nullif(g.base_weight,0) asc,g.id
 limit 51 offset greatest(0,least(coalesce(p_offset,0),1000000))) page;
 return jsonb_build_object('specimens',candidates);
end;
$$;

create function public.bundle_contribute(p_player_id uuid,p_requirement_id text,p_specimen_ids bigint[],p_confirm_crown boolean default false)
returns jsonb language plpgsql set search_path=public as $$
declare r public.game_bundle_requirements; g public.inventory_gems; n integer; have integer; consumed integer:=0;
begin
 -- Consistent order across settings, manual contributions, and the roll path.
 perform 1 from public.players where id=p_player_id for update;
 if not found then raise exception 'player_not_found'; end if;
 select * into r from public.game_bundle_requirements where id=p_requirement_id;
 if not found then raise exception 'bundle_requirement_not_found'; end if;
 if not public.bundle_unlocked(p_player_id,r.bundle_id) then raise exception 'bundle_locked'; end if;
 n:=cardinality(p_specimen_ids);
 if n is null or n<1 or n>50 or n<>(select count(distinct id) from unnest(p_specimen_ids) id) then raise exception 'invalid_specimen_selection'; end if;
 if r.manual_only and (n<>1 or not coalesce(p_confirm_crown,false)) then raise exception 'crown_confirmation_required'; end if;
 select coalesce((select contributed from public.player_bundle_progress where player_id=p_player_id and requirement_id=r.id),0) into have;
 if have+n>r.required_amount then raise exception 'bundle_target_full'; end if;
 for g in select * from public.inventory_gems where player_id=p_player_id and id=any(p_specimen_ids) order by id for update loop
   if not public.bundle_specimen_matches(r,to_jsonb(g)) then raise exception 'bundle_specimen_ineligible'; end if;
   if r.manual_only then
     insert into public.player_bundle_special_submissions(player_id,requirement_id,specimen_snapshot)
     values(p_player_id,r.id,to_jsonb(g)||jsonb_build_object('id',g.id::text,'final_weight_multiplier',g.final_weight/nullif(g.base_weight,0),
       'mutation_ids',public.bundle_mutation_ids(to_jsonb(g))));
   end if;
   delete from public.inventory_gems where id=g.id and player_id=p_player_id;
   consumed:=consumed+1;
 end loop;
 if consumed<>n then raise exception 'specimen_not_found'; end if;
 insert into public.player_bundle_progress(player_id,requirement_id,contributed) values(p_player_id,r.id,have+n)
 on conflict(player_id,requirement_id) do update set contributed=excluded.contributed,updated_at=now();
 perform public.bundle_record_completion(p_player_id,r.bundle_id);
 return jsonb_build_object('ok',true,'contributed',have+n,'consumed',consumed,'bundle_id',r.bundle_id);
end;
$$;

-- Service-role only: never accept a client-authored specimen or lease through the bundles endpoint.
create function public.bundle_route_roll(p_player_id uuid,p_lease_id uuid,p_specimen jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare player public.players; r public.game_bundle_requirements; matches text[]; receipt jsonb; have integer;
begin
 select * into player from public.players where id=p_player_id for update;
 if not found or p_lease_id is null or player.roll_lease_id is distinct from p_lease_id
 or player.roll_lease_expires_at is null or player.roll_lease_expires_at<=clock_timestamp() then raise exception 'invalid_roll_lease'; end if;
 select result into receipt from public.player_bundle_roll_receipts where player_id=p_player_id and lease_id=p_lease_id;
 if found then return receipt; end if;
 receipt:='{"status":"none"}'::jsonb;
 if exists(select 1 from public.game_section_settings where id='collection-hall' and enabled=false) then return receipt; end if;
 -- Preserve Crown candidates even before Master unlocks and even if another row matches.
 if exists(select 1 from public.game_bundle_requirements c where c.id='master-crown' and public.bundle_specimen_matches(c,p_specimen)) then
   receipt:='{"status":"protected","keepInInventory":true}'::jsonb;
 else
   select array_agg(q.id) into matches from (
     select candidate.id from public.player_bundle_settings s
     join public.game_bundle_requirements candidate on candidate.id=s.requirement_id
     left join public.player_bundle_progress p on p.player_id=p_player_id and p.requirement_id=candidate.id
     where s.player_id=p_player_id and s.auto_contribute and not candidate.manual_only
     and coalesce(p.contributed,0)<candidate.required_amount
     and public.bundle_unlocked(p_player_id,candidate.bundle_id)
     and public.bundle_specimen_matches(candidate,p_specimen) limit 2) q;
   if cardinality(matches)>1 then receipt:='{"status":"ambiguous","keepInInventory":true}'::jsonb;
   elsif cardinality(matches)=1 then
     select * into r from public.game_bundle_requirements where id=matches[1];
     insert into public.player_bundle_progress(player_id,requirement_id,contributed) values(p_player_id,r.id,1)
     on conflict(player_id,requirement_id) do update set contributed=player_bundle_progress.contributed+1,updated_at=now()
     where player_bundle_progress.contributed<r.required_amount returning contributed into have;
     if have is null then raise exception 'bundle_target_full'; end if;
     perform public.bundle_record_completion(p_player_id,r.bundle_id);
     receipt:=jsonb_build_object('status','deposited','requirementId',r.id,'bundleId',r.bundle_id,'contributed',have);
   end if;
 end if;
 insert into public.player_bundle_roll_receipts values(p_player_id,p_lease_id,receipt)
 on conflict(player_id) do update set lease_id=excluded.lease_id,result=excluded.result;
 return receipt;
end;
$$;

-- Public prestige summary exposes neither inventory nor auto-contribution settings.
create function public.bundle_public_summary(p_player_id uuid) returns jsonb
language sql stable set search_path=public as $$
 select jsonb_build_object('completed',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'icon',b.icon,'completed_at',c.completed_at) order by b.sort_order)
 from public.player_bundle_completions c join public.game_bundles b on b.id=c.bundle_id where c.player_id=p_player_id),'[]'::jsonb),
 'crown', (select jsonb_build_object('gem_name',specimen_snapshot->>'gem_name','rarity',specimen_snapshot->'rarity',
 'final_weight_multiplier',specimen_snapshot->'final_weight_multiplier','mutation_ids',specimen_snapshot->'mutation_ids',
 'serial_number',specimen_snapshot->'serial_number','submitted_at',submitted_at)
 from public.player_bundle_special_submissions where player_id=p_player_id and requirement_id='master-crown'));
$$;

-- No direct client writes. Invoker functions run through the authenticated edge's service client.
do $$ declare t text; f regprocedure; begin
 foreach t in array array['game_bundles','game_bundle_requirements','player_bundle_progress','player_bundle_settings',
 'player_bundle_completions','player_bundle_special_submissions','player_bundle_roll_receipts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
 ('bundle_mutation_ids','bundle_specimen_matches','bundle_unlocked','bundle_record_completion','bundle_state','bundle_set_auto',
 'bundle_candidates','bundle_contribute','bundle_route_roll','bundle_public_summary') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
create index inventory_gems_bundle_candidates_idx on public.inventory_gems(player_id,gem_name,value,id)
 where not locked and not coalesce(museum_locked,false);
-- The existing Collection Hall navigation becomes available when this migration is deployed.
update public.game_section_settings set enabled=true,
 description='Seven permanent gem Bundles. Sacrifice specimens and earn collection bragging rights.'
 where id='collection-hall';
commit;
