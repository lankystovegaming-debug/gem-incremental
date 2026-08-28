import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync(new URL("../supabase/migrations/20260828090000_abandoned_mine_artifact_opportunity_rebalance.sql",import.meta.url),"utf8");
assert.match(migration,/when p_depth between 1 and 3 then \.15[\s\S]*between 4 and 6 then \.20[\s\S]*between 7 and 9 then \.25[\s\S]*p_depth=10 then \.40/);
assert.match(migration,/v_run\.overdepth>0[\s\S]*'overdepth'[\s\S]*else[\s\S]*'general_depth'/);
for(const opportunity of ["rich_vein","unstable_descent","d10"])
  assert.match(migration,new RegExp(`abandoned_mine_artifact\\('${opportunity}'`));
const routeFunction=migration.match(/create or replace function public\.choose_abandoned_mine_route[\s\S]*?end \$\$;/)?.[0]||"";
assert.match(routeFunction,/p_route='rich_vein'[\s\S]*abandoned_mine_artifact\('rich_vein'/);
assert.match(routeFunction,/p_route='unstable_descent'[\s\S]*abandoned_mine_artifact\('unstable_descent'/);
assert.doesNotMatch(migration,/not exists[\s\S]*museum_artifact_registrations[\s\S]*order by -ln/i);

function random(seed){let state=seed>>>0;return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);}
const generalChance=[.15,.15,.15,.20,.20,.20,.25,.25,.25,.40];
const eligibleGeneral=depth=>depth<2?[0]:depth<4?[0,1]:depth<6?[0,1,2]:depth<8?[0,1,2,3]:[0,1,2,3,4];
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*p)];

function normalRun(rng,owned=new Set()){
  let drops=0,duplicates=0;
  for(let depth=1;depth<=10;depth++)if(rng()<generalChance[depth-1]){
    const eligible=eligibleGeneral(depth),artifact=eligible[Math.floor(rng()*eligible.length)];
    drops++; if(owned.has(artifact))duplicates++; owned.add(artifact);
  }
  for(const artifact of [5,6])if(rng()<.12){drops++;if(owned.has(artifact))duplicates++;owned.add(artifact);}
  if(rng()<.15){const artifact=7+(rng()<.5?0:1);drops++;if(owned.has(artifact))duplicates++;owned.add(artifact);}
  return {drops,duplicates};
}

const trials=50000,firstRuns=[],completionRuns=[],routeRuns=[],d10Runs=[];
let firstDrops=0,firstAny=0,totalDrops=0,totalDuplicates=0;
const normalRng=random(0x9e3779b9);
for(let trial=0;trial<trials;trial++){
  const rng=normalRng,owned=new Set();
  const first=normalRun(rng,owned);firstDrops+=first.drops;firstAny+=Number(first.drops>0);
  let runs=1,routeDoneAt=owned.has(5)&&owned.has(6)?1:null,d10DoneAt=owned.has(7)&&owned.has(8)?1:null;
  totalDrops+=first.drops;totalDuplicates+=first.duplicates;
  while(owned.size<9){const result=normalRun(rng,owned);runs++;totalDrops+=result.drops;totalDuplicates+=result.duplicates;
    if(routeDoneAt===null&&owned.has(5)&&owned.has(6))routeDoneAt=runs;
    if(d10DoneAt===null&&owned.has(7)&&owned.has(8))d10DoneAt=runs;}
  completionRuns.push(runs);routeRuns.push(routeDoneAt);d10Runs.push(d10DoneAt);firstRuns.push(first.drops);
}
const expected=firstDrops/trials,any=firstAny/trials,median=percentile(completionRuns,.5),p90=percentile(completionRuns,.9);
assert.ok(expected>2.48&&expected<2.60,`expected artifacts/run ${expected}`);
assert.ok(any>.94&&any<.98,`P(any artifact) ${any}`);
assert.ok(median>=15&&median<=30,`normal completion median ${median}`);
assert.ok(p90<=50,`normal completion P90 ${p90}`);
assert.ok(percentile(routeRuns,.9)<=40,`route-exclusive completion P90 ${percentile(routeRuns,.9)}`);
assert.ok(percentile(d10Runs,.9)<=40,`D10 completion P90 ${percentile(d10Runs,.9)}`);
assert.ok(totalDuplicates/totalDrops>.65&&totalDuplicates/totalDrops<.90,`duplicate frequency ${totalDuplicates/totalDrops}`);

function overdepthRun(rng,owned){
  for(let level=1;level<=6;level++)if(rng()<Math.min(.55,.25+level*.05)){
    const eligible=level<3?[0]:level<6?[0,1]:[0,1,2];
    owned.add(eligible[Math.floor(rng()*eligible.length)]);
  }
}
const overdepthCompletion=[];
const overdepthRng=random(0x85ebca6b);
for(let trial=0;trial<trials;trial++){
  const rng=overdepthRng,owned=new Set();let runs=0;
  while(owned.size<3){overdepthRun(rng,owned);runs++;}
  overdepthCompletion.push(runs);
}
assert.ok(percentile(overdepthCompletion,.5)<=6,`Overdepth completion median ${percentile(overdepthCompletion,.5)}`);
assert.ok(percentile(overdepthCompletion,.9)<=12,`Overdepth completion P90 ${percentile(overdepthCompletion,.9)}`);

console.log("Abandoned Mine artifact balance:",{
  expectedArtifactsPerD10Run:Number(expected.toFixed(3)),probabilityAny:Number(any.toFixed(3)),
  normalMedian:median,normalP90:p90,routeP90:percentile(routeRuns,.9),d10P90:percentile(d10Runs,.9),
  duplicateFrequency:Number((totalDuplicates/totalDrops).toFixed(3)),overdepthMedian:percentile(overdepthCompletion,.5),overdepthP90:percentile(overdepthCompletion,.9)
});
