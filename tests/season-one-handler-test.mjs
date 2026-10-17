import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let source=readFileSync(new URL('../supabase/functions/seasons/index.ts',import.meta.url),'utf8').replace(/import \{ withSupabase \} from "npm:@supabase\/server";/,'const withSupabase=(_,fn)=>(req)=>fn(req,globalThis.__seasonCtx);');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const uid='00000000-0000-4000-8000-000000000001',sid='10000000-0000-4000-8000-000000000001',zero='20000000-0000-4000-8000-000000000001';
const now=Date.now(),season={id:sid,name:'The Interlude',enabled:true,starts_at:new Date(now-1000).toISOString(),ends_at:new Date(now+86400000).toISOString(),tiers:[{tier:1,xp:0,free:[],premium:[]}]},archive={...season,id:zero,name:'Season Zero',starts_at:'2026-08-01',ends_at:'2026-09-01'};
let calls=[],duplicate=false,enabled=true;
class Query{
 constructor(table){this.table=table;this.filters={};}
 select(){return this;}eq(k,v){this.filters[k]=v;return this;}order(){return this;}lte(){return this;}gt(){return this;}single(){return this;}maybeSingle(){return this;}
 then(resolve,reject){let data=this.table==='game_section_settings'?{enabled}:this.table==='season_definitions'?(this.filters.id?[season,archive].find(s=>s.id===this.filters.id):[season,archive]):this.table==='player_seasons'?{xp:0,premium:false,claimed_tiers:[],roll_xp_date:'2000-01-01',roll_xp_today:1499}:[];
  if(['player_seasons','player_season_missions','player_season_rerolls'].includes(this.table))assert.equal(this.filters.player_id,uid,'all reads scoped to authenticated user');
  return Promise.resolve({data,error:null}).then(resolve,reject);
 }
}
const client={from:t=>new Query(t),rpc:async(name,args)=>{calls.push([name,args]);if(name==='ensure_player_season')return {data:sid,error:null};return duplicate?{error:{message:'already_claimed'}}:{data:{ok:true},error:null};}};
globalThis.__seasonCtx={userClaims:{sub:uid},supabaseAdmin:client,supabase:client};
const call=async body=>{const r=await handler.fetch(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
let r=await call({action:'list'});assert.equal(r.status,200);assert.equal(r.data.season.id,sid);assert.equal(r.data.seasons.length,2);assert.equal(r.data.progress.roll_xp_today,0);
r=await call({action:'list',seasonId:zero});assert.equal(r.data.season.id,zero);assert.deepEqual(r.data.missions,[]);
for(const body of [{action:'claim-tier',seasonId:sid,tier:'1',lane:'free'},{action:'claim-tier',seasonId:sid,tier:1,lane:'__proto__'},{action:'list',seasonId:'x;delete'},{action:'reroll-daily',seasonId:sid,slot:0}])assert.equal((await call(body)).status,400);
const before=calls.length;assert.equal((await call({action:'toString',seasonId:sid})).status,400);assert.equal(calls.length,before);
assert.equal((await call({action:'purchase-premium',seasonId:sid})).status,200);assert.deepEqual(calls.at(-1),['purchase_season_premium',{p_season_id:sid}]);
r=await call({action:'claim-all',seasonId:sid});assert.equal(r.data.claimed,1);
duplicate=true;r=await call({action:'claim-all',seasonId:sid});assert.equal(r.data.claimed,0);duplicate=false;
enabled=false;assert.equal((await call({action:'list'})).status,403);enabled=true;
globalThis.__seasonCtx.userClaims={};assert.equal((await call({action:'list'})).status,401);
console.log('Seasons handler: archive selection, authenticated reads, validation/injection, purchases and concurrent claim-all duplicates passed.');
