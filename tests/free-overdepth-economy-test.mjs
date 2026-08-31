import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const sql=read("supabase/migrations/20260831093442_universal_free_overdepth_economy.sql");
const mineUi=read("expeditions/expeditions.js");
const crystalUi=read("crystal-caverns/crystal-caverns.js");
const body=name=>sql.match(new RegExp(`create or replace function public\\.${name}\\([^]*?end \\$\\$;`))?.[0]||"";
const range=(anchors,od)=>od<=10?anchors[od-1]:anchors[9]*(1+.18*Math.sqrt(od-10));
const mineLow=[250000,300000,375000,450000,550000,700000,850000,1000000,1250000,1500000],mineHigh=[350000,425000,525000,650000,800000,1000000,1200000,1500000,1800000,2200000];
const crystalLow=[300000,400000,500000,650000,850000,1100000,1400000,1800000,2300000,3000000],crystalHigh=[450000,600000,750000,1000000,1300000,1700000,2200000,2800000,3500000,4500000];

assert.match(sql,/D1-D10 are funded; Overdepth descent is free/);
assert.match(body("expedition_overdepth_cost"),/return 0/);
for(const fn of["continue_mine_overdepth","continue_crystal_overdepth"]){assert.match(body(fn),/'cost',0/);assert.doesNotMatch(body(fn),/set money=money-|money=p\.money-c|abandoned_mine_funding/);}
assert.equal([100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000].reduce((a,b)=>a+b),17150000);
assert.equal([200000,300000,450000,650000,900000,1300000,2000000,3000000,4500000,7000000].reduce((a,b)=>a+b),20300000);
for(const value of[...mineLow,...mineHigh])assert.match(body("abandoned_mine_overdepth_cargo_range"),new RegExp(`\\b${value}\\b`));
for(const value of[...crystalLow,...crystalHigh])assert.match(body("crystal_od_cargo_range"),new RegExp(`\\b${value}\\b`));
for(const od of[11,20,50]){assert.equal(range(mineLow,od),1500000*(1+.18*Math.sqrt(od-10)));assert.equal(range(mineHigh,od),2200000*(1+.18*Math.sqrt(od-10)));assert.equal(range(crystalLow,od),3000000*(1+.18*Math.sqrt(od-10)));assert.equal(range(crystalHigh,od),4500000*(1+.18*Math.sqrt(od-10)));}
assert.match(body("abandoned_mine_overdepth_cargo_range"),/1500000\*multiplier[\s\S]*2200000\*multiplier/);
assert.match(body("crystal_od_cargo_range"),/3000000\*multiplier[\s\S]*4500000\*multiplier/);
assert.doesNotMatch(body("abandoned_mine_overdepth_cargo_range"),/for .*loop|lo:=lo\*/);assert.doesNotMatch(body("crystal_od_cargo_range"),/for .*loop|lo:=lo\*/);
assert.match(body("resolve_crystal_decision"),/crystal_overdepth_formation_cost/);
assert.match(mineUi,/Descend to OD\$\{dashboard\.nextOverdepth\} · Free/);assert.match(crystalUi,/Descend to OD\$\{r\.overdepth\+1\} · Free/);
for(const ui of[mineUi,crystalUi]){assert.doesNotMatch(ui,/Fund OD/);assert.doesNotMatch(ui,/Spend \$\{formatMoney\(cost\)\} and enter/);}
assert.match(mineUi,/Danger:[\s\S]*projectedDanger[\s\S]*unsecured cargo/);assert.match(crystalUi,/Next Danger[\s\S]*Current Instability[\s\S]*Unsecured cargo/);
console.log("Universal free-Overdepth economy tests passed.");
