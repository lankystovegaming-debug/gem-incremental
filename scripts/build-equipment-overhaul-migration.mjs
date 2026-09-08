import {readFileSync,writeFileSync} from 'node:fs';
import {secondaryRecipes,specialistRecipes,pickaxeBonus} from '../src/data/equipmentOverhaul.js';
const target=new URL('../supabase/migrations/20260908000001_equipment_overhaul.sql',import.meta.url);
const header=readFileSync(new URL('./equipment-overhaul-schema.sql',import.meta.url),'utf8');
const functions=readFileSync(new URL('./equipment-overhaul-functions.sql',import.meta.url),'utf8');
const q=s=>"'"+s.replaceAll("'","''")+"'";
let sql=header+'\n';
for(const r of [...secondaryRecipes,...specialistRecipes]) sql+=`insert into public.game_recipes(id,recipe) values(${q(r.id)},${q(JSON.stringify(r))}::jsonb) on conflict(id) do update set recipe=excluded.recipe;\n`;
for(const id of ['celestial-pickaxe','empyrean-pickaxe','eternity-pickaxe']) {
 sql+=`update public.game_recipes set recipe=jsonb_set(recipe,'{reward,bonus}',${q(JSON.stringify(pickaxeBonus(id)))}::jsonb)||'{"equipmentOverhaul":true}'::jsonb where id=${q(id)};\n`;
 if(id!=='celestial-pickaxe') sql+=`update public.game_recipes set recipe=jsonb_set(recipe,'{requirements}',(select jsonb_agg(r order by ord) from jsonb_array_elements(recipe->'requirements') with ordinality as x(r,ord) where r->>'type'<>'equipment'))||'{"horizontal":true}'::jsonb where id=${q(id)};\n`;
}
sql+=functions+'\ncommit;\n';writeFileSync(target,sql);
