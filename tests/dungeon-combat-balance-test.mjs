import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { balancedEnemyHealth, bestCombatGemPower, combatGemPower, combatMutationMultiplier } from '../supabase/functions/dungeons/balance.js';
import { equipmentGemPower, parseStatMultiplier, canonicalEnemyName } from '../supabase/functions/dungeons/formulas.js';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const reference = JSON.parse(read('supabase/functions/dungeons/balance-reference.json'));
assert.equal(reference.length, 1500);
assert.equal(createHash('sha256').update(JSON.stringify(reference)).digest('hex'),
  '037163e443d2762712a782526c7ff00277f06845e1c6e56ace528b90b35b4cc6',
  'reference must match the approved final simulation, not adapt to player gear');
for (let i = 0; i < reference.length; i++) {
  assert(Number.isFinite(reference[i]) && reference[i] >= 10);
  if (i) assert(reference[i] >= reference[i-1] && reference[i] <= reference[i-1] * 1.020000001);
}
const mutations = new Map([['Chocolate',{value_multiplier:300}],['Aether',{value_multiplier:1500}],['Curse',{value_multiplier:.95}]]);
const item = { room_number:449, quality:'75%', upgrade_level:3, stats:{components:9}, mutation_name:'Chocolate', gem_power:104560875 };
assert.equal(combatGemPower(item,mutations),3216578);
assert.equal(item.gem_power,104560875,'stored raw GP must not change');
assert.equal(10+Math.floor(combatGemPower(item,mutations)/10000),331);
assert.equal(100+Math.floor(combatGemPower(item,mutations)/5000),743);
assert.equal(combatMutationMultiplier(4096),12);
assert(combatMutationMultiplier(.95)<1,'negative-value mutations retain their penalty');
assert.throws(()=>combatMutationMultiplier(0));
assert.equal(combatGemPower({...item,quality:'Workbench',room_number:0},mutations),item.gem_power);
assert.equal(combatGemPower({...item,mutation_name:null},mutations),item.gem_power);
for (const value of [.95,1.08,2.75,16,65,300,1500]) for (const room of [1,449,1500]) {
  const table={quality:'94%',components:7,level:'+8'};
  const map=new Map([['test',{value_multiplier:value}]]);
  const gear={room_number:room,quality:table.quality,upgrade_level:8,stats:{components:7},mutation_name:'test',gem_power:equipmentGemPower(room,table,value)};
  assert.equal(combatGemPower(gear,map),equipmentGemPower(room,table,combatMutationMultiplier(value)));
}
assert.equal(combatGemPower({...item,gem_power:300000},mutations),Math.round(1000*combatMutationMultiplier(300)),'custom GP uses its actual value');

// More than two full Data API pages; best combat item is outside the raw top ten.
const gear=Array.from({length:1201},(_,i)=>({...item,id:String(i).padStart(5,'0')}));
gear[1100]={id:'01100',quality:'Workbench',room_number:0,gem_power:5000000,item_type:'armor'};
let calls=0;
const client={from(table){let after=null;return {
  select(){return this;},eq(key,id){assert.equal(key,'player_id');assert.equal(id,'owner');return this;},
  order(key){assert.equal(key,'id');return this;},limit(n){assert.equal(n,500);return this;},gt(key,v){assert.equal(key,'id');after=v;return this;},
  then(resolve){if(table==='dungeon_mutations')return Promise.resolve({data:[...mutations].map(([name,m])=>({name,...m}))}).then(resolve);
    calls++;return Promise.resolve({data:gear.filter(g=>!after||g.id>after).slice(0,500)}).then(resolve);}
};}};
assert.equal(await bestCombatGemPower(client,'owner'),5000000);
assert.equal(calls,3);

// Exercise the actual deployed-source-derived stats function, preserving damage.
const source=read('supabase/functions/dungeons/index.ts');
const constants=['ROLE','RANK','MUTATION_TIER'].map(name=>source.match(new RegExp('const '+name+': any = ([\\s\\S]*?);\\n'))[1]);
const regionScale=new Function('region',source.match(/function regionScale\(region: string\) \{([\s\S]*?)\n}/)[1].replace(' as any',''));
const zoneScale=new Function('zone',source.match(/function zoneScale\(zone: string\) \{([\s\S]*?)\n}/)[1].replace(' as any',''));
const body=source.match(/function enemyBaseStats[^\n]*\{([\s\S]*?)\n}/)[1];
const stats=new Function('parseStatMultiplier','canonicalEnemyName','balancedEnemyHealth','referenceAttack','regionScale','zoneScale',
  ...['ROLE','RANK','MUTATION_TIER'],`return (room,row,rank,mutation,isBoss=false,bossRepeat=0,bossZone=room.zone)=>{${body}}`)
  (parseStatMultiplier,canonicalEnemyName,balancedEnemyHealth,reference,regionScale,zoneScale,...constants.map(c=>new Function('return '+c)()));
const ranks={Normal:[1,1],Elite:[1.8,1.8],Champion:[3.5,2.5],Cursed:[3.5,2.5],Mythic:[5,3.5],Paragon:[6.5,4.5],Apex:[8,6],Calamity:[10,8]};
const tiers={None:[1,1],Common:[1.1,1.05],Uncommon:[1.25,1.15],Rare:[1.6,1.35],Epic:[2.5,1.8],Legendary:[5,3]};
let checks=0;
for(let room=1;room<=1500;room++) for(const [rank,r] of Object.entries(ranks)) for(const [tier,m] of Object.entries(tiers)) {
  const result=stats({room_number:room,region:'Mountain',zone:'Hard'},{name:'Ice Wraith',hp:'x9.45',dmg:'x9.75'},rank,{tier});
  const hp=Math.max(1,Math.round(reference[room-1]*3.25*.7*1.35*Math.min(12,r[0]*m[0])));
  assert.equal(result.hp,hp);assert.equal(result.defense,Math.floor(.25*Math.sqrt(hp)));
  assert.equal(result.damage,9.75*r[1]*m[1]);checks++;
}
const boss=stats({room_number:450,region:'Beach & Sea',zone:'Brutal'},
  {name:'Leviathan (boss)',hp:'x90',dmg:'x21'},'Boss',{tier:'Legendary'},true,.5,'Normal');
assert.equal(boss.hp,Math.round(reference[449]*10.5*1.5*5));
assert.equal(boss.damage,63,'parsed boss damage does not receive a second boss multiplier');
const fallback=stats({room_number:450,region:'Beach & Sea',zone:'Brutal'},
  {name:'Leviathan (boss)'},'Boss',{tier:'Legendary'},true,.5,'Normal');
assert.equal(fallback.hp,boss.hp);
assert.equal(fallback.damage,2.5*1.6*1.5*6*3,'legacy damage fallback remains unchanged');
const mimic=stats({room_number:1,region:'Entrance',zone:'Easy'},{name:'Mimic'},'Elite',null);
assert.equal(mimic.hp,Math.round(reference[0]*3.25*1.2*.7*1.8));
assert.match(source,/balanceVersion: BALANCE_VERSION/);
assert.match(source,/playerHealth -= num\(enemy.damage, 10\) \* .08/);
const attackBody=source.match(/if \(action === "attack"\)[\s\S]*?if \(action === "claim"\)/)[0];
assert.doesNotMatch(attackBody,/bestCombatGemPower|enemyBaseStats/,'ongoing runs keep their snapshots');
console.log(`Dungeon combat balance tests passed: ${checks} rank/mutation/room checks, jackpot conversion, complete inventory and saved fights.`);
