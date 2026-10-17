begin;

-- Approved fixed simulation candidate. Preserve costs, ingredients and custom GP.
create temporary table dungeon_balance_recipe_changes (
  name text primary key, old_gp bigint not null, new_gp bigint not null
) on commit drop;
insert into dungeon_balance_recipe_changes values
('Broodmother Armor',5859000,6864000),
('Elder Wyrm Pendant',4980000,6864000),
('Dragonkin Mage Robe',4854000,6591000),
('Frost Dragon Pendant',4047000,6864000),
('Drake Knight Armor',4001000,6422000),
('Wyvern Leathers',3316000,6344000),
('Storm Dragon Pendant',3289000,6864000),
('Lich Acolyte Robe',2733000,5473000),
('Broodmother Pendant',2666000,6864000),
('Fallen Seraph Robe',2255000,5473000),
('Dragonkin Mage Pendant',2162000,6864000),
('Plague Doctor Robe',1867600,5473000),
('Drake Knight Pendant',1751000,6864000),
('Demon Knight Armor',1540500,5473000),
('Wyvern Pendant',1418000,6864000),
('Chain Devil Armor',1272100,5473000),
('Lich Acolyte Pendant',1148000,5473000),
('Bone Colossus Armor',1051000,4914000),
('Fallen Seraph Pendant',926000,5473000),
('Hellhound Leathers',867800,4810000),
('Plague Doctor Pendant',749000,5473000),
('Cinder Brute Armor',716800,3120000),
('Demon Knight Pendant',604000,5473000),
('Flame Salamander Armor',591900,3120000),
('Ash Wraith Robe',489300,3120000),
('Chain Devil Pendant',487000,5473000),
('Obsidian Golem Armor',404000,3120000),
('Bone Colossus Pendant',392700,5473000),
('Ember Hound Leathers',333600,3120000),
('Hellhound Pendant',315400,5473000),
('Magma Imp Leathers',274800,3094000),
('Cinder Brute Pendant',253400,3120000),
('Avalanche Beast Armor',227100,2002000),
('Flame Salamander Pendant',203400,3120000),
('Ice Wraith Robe',187500,1820000),
('Ash Wraith Pendant',162900,3120000),
('Abyssal Crown',135000,7397000),
('Abyssal Chestplate',133000,7397000),
('Abyssal Leggings',132000,7345000),
('Obsidian Golem Pendant',130200,3120000),
('Abyssal Boots',130000,7007000),
('Abyssal Helmet',129000,6955000),
('Dragon Crown',110000,5629000),
('Dragon Chestplate',107000,5642000),
('Dragon Leggings',106000,5629000),
('Ember Hound Pendant',104100,3120000),
('Dragon Helmet',104000,5577000),
('Dragon Boots',104000,5577000),
('Queen Spider Armor',85000,4862000),
('Blight Armor',85000,5135000),
('Necromancer Robe',84000,3471000),
('Magma Imp Pendant',83100,3120000),
('Reaper Armor',83000,3120000),
('Lava Armor',83000,2717000),
('Vampire Cloak',82000,3757000),
('Ghost Mantle',82000,4095000),
('Reaper Hood',80000,2938000),
('Avalanche Beast Pendant',66000,2002000),
('Mountain Crown',60000,1846000),
('Mountain Troll Armor',59000,1846000),
('Frostguard Armor',58000,1599000),
('Yeti Cloak',57000,1417000),
('Goat Horn Helm',55000,1430000),
('Yeti Boots',55000,1417000),
('Ice Wraith Pendant',52500,2002000),
('Shark Scale Armor',35000,1144000),
('Panda Hood',34000,715000),
('Crab Shell Armor',34000,949000),
('Bat Cloak',32000,299000),
('Troll Helmet',32000,377000),
('Bear Cloak',32000,585000),
('Spider Boots',31000,325000),
('Snake Hood',30000,286000);

update public.dungeon_workbench_recipes r
set gem_power = c.new_gp
from dungeon_balance_recipe_changes c
where r.name = c.name and r.gem_power = c.old_gp;

-- Boost matching existing crafts without consuming resources or touching drops.
update public.dungeon_gear g
set gem_power = c.new_gp
from dungeon_balance_recipe_changes c, public.dungeon_workbench_recipes r
where g.quality = 'Workbench' and g.room_number = 0
  and g.stats->>'recipe' = c.name and g.gem_power = c.old_gp
  and r.name = c.name and r.gem_power = c.new_gp;

-- All owned gear must be considered AFTER combat conversion, not just top raw GP.
create index if not exists dungeon_gear_player_id_idx on public.dungeon_gear(player_id,id);

commit;
