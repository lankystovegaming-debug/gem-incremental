import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { singaporeDay, nextReset, rollWeight, weightContribution, gemEligible, selectionProbabilities, gemDistribution, rollMutations, generateResult, badges } from '../supabase/functions/gemdle/rules.ts';
import { createHandler, lifetimeBoardFromRows } from '../supabase/functions/gemdle/handler.ts';
import { shareText, escapeHtml } from '../gemdle/format.js';
const gem = (name, rarity, extra = {}) => ({ name, rarity, base_weight: 10, sort_order: 0, enabled: true, ...extra });
const now = new Date('2026-09-04T14:00:00Z');
const draws = values => () => { assert.ok(values.length, 'unexpected random draw'); return values.shift(); };
const approx = (a,b) => assert.ok(Math.abs(a-b) < 1e-12, `${a} != ${b}`);
test('Singapore date and reset boundary', () => {
  assert.equal(singaporeDay(new Date('2026-09-04T15:59:59.999Z')), '2026-09-04');
  assert.equal(singaporeDay(new Date('2026-09-04T16:00:00Z')), '2026-09-05');
  assert.equal(nextReset(now), '2026-09-04T16:00:00.000Z');
});
test('old weight RNG branches and precise fractional survival probability', () => {
  for (const [randoms, weight] of [[[0,.1,0],.5], [[0,.5,0],.85], [[.9,.1,0],1.1], [[.9,.65,0],1.5], [[.9,.9,.6,0],2], [[.9,.9,.2,.2,.6,.427],4.427]]) approx(rollWeight(draws(randoms)),weight);
  for (const [w, contribution] of [[.501,1],[1.999,1],[2,16],[3,32],[5,128],[8,1024],[10,4096],[5.427,128/(1-.427/2)]]) approx(weightContribution(w),contribution);
});
test('old source and port agree under identical random draws', async () => {
  const source = (await fs.readFile(new URL('../src/logic/weight.js',import.meta.url),'utf8')).replace(/import\s*\{[\s\S]*?from "\.\/random.js";/, '').replaceAll('export ', '');
  const original = new Function('random01', source+';return rollWeightMultiplier(1);');
  let seed=17;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let i=0;i<10000;i++){const sequence=Array.from({length:100},rng);assert.equal(rollWeight(draws([...sequence])),original(draws([...sequence])));}
});
test('rarity floor, serial exclusion, date ranges and overnight second-accurate windows', () => {
  assert.equal(gemEligible(gem('Common',9),now),false);
  assert.equal(gemEligible(gem('Seriali Copenhageni',100),now),false);
  assert.equal(gemEligible(gem('Other',100,{metadata:{requiresSerial:true}}),now),false);
  const g=gem('Night',100,{availability_mode:'daily',daily_start_time:'22:00:00',daily_end_time:'04:00:00'});
  assert.equal(gemEligible(g,now),true);
  assert.equal(gemEligible(g,new Date('2026-09-04T20:00:00Z')),false);
  assert.equal(gemEligible({...g,daily_start_time:null},now),false);
  assert.equal(gemEligible(gem('Expired',100,{ends_at:now.toISOString()}),now),false);
  const aurorium=gem('Aurorium',300000000,{availability_mode:'daily',daily_start_time:'05:00:00',daily_end_time:'07:00:00',daily_time_windows:[{start:'05:00',end:'07:00'},{start:'17:00',end:'19:00'}]});
  assert.equal(gemEligible(aurorium,new Date('2026-09-04T09:00:00Z')),true);
  assert.equal(gemEligible(aurorium,new Date('2026-09-04T08:00:00Z')),false);
  assert.equal(gemEligible(gem('Zephyrion',1000,{metadata:{sourceExclusive:true}}),now),false);
});
test('actual rarest-first probability includes failure mass and excludes flat fallback', () => {
  const rows=selectionProbabilities([gem('Normal',100),gem('Flat',10,{affected_by_luck:false})]);
  approx(rows.reduce((n,r)=>n+r.probability,0),1);
  approx(rows.find(r=>r.gem.name==='Flat').probability,.9/Math.sqrt(10));
  approx(rows.find(r=>r.gem.name==='Normal').probability,1-.9/Math.sqrt(10));
  assert.equal(selectionProbabilities([gem('Only',100)])[0].probability,1);
});
test('event-state probabilities are marginalized and expired events excluded', () => {
  const event={id:'1',eventKey:'total_eclipse',startsAt:'2026-09-04T13:00:00Z',endsAt:'2026-09-04T15:00:00Z',config:{states:[{key:'normal',weight:3},{key:'totality',weight:1}]}};
  const pool=[gem('Base',10),gem('Totality',100,{required_event_key:'total_eclipse',metadata:{requiredRollState:'totality'}})];
  const rows=gemDistribution(pool,event,now);
  approx(rows.find(r=>r.gem.name==='Totality').probability,.025);
  approx(rows.reduce((sum,r)=>sum+r.probability,0),1);
  assert.equal(gemDistribution(pool,event,new Date('2026-09-04T15:00:00Z')).length,1);
});
test('successful mutations alone contribute; stack factor is constant .35 and respects exclusions', () => {
  const pool=[{id:'a',name:'A',chance:100,sort_order:1},{id:'b',name:'B',chance:100,sort_order:2},{id:'c',name:'C',chance:100,sort_order:3}];
  const result=rollMutations(pool,gem('X',10),null,now,()=>0);
  [.1,.035,.035].forEach((p,i)=>approx(result[i].probability,p));
  assert.equal(rollMutations([{...pool[0],excludes:['b']},pool[1]],gem('X',10),null,now,()=>0).length,1);
  assert.equal(rollMutations([{id:'charged',chance:2000}],gem('X',10),null,now,()=>0).length,0);
  const s=generateResult([gem('X',10)],[],null,now,()=>.9);
  assert.equal(s.contributions.mutations,1);
});
test('badge thresholds, share privacy and escaping', () => {
  assert.deepEqual(badges(gem('X',1e9),10,[{normal_rarity:10000},{normal_rarity:15}]),['Secret','Titanic','Double Mutation','Rare Mutation']);
  assert.deepEqual(badges(gem('The Bottom',2000),1,[]),['Anomalous']);
  assert.deepEqual(badges(gem('Zephyrion',1000),1,[]),['Anomalous']);
  const s=generateResult([gem('X',10)],[],null,now,()=>.5);
  const text=shareText({gemdle_date:'2026-09-04',player_id:'PRIVATE',specimen:s});
  assert.ok(!text.includes('PRIVATE'));assert.ok(text.includes('No Mutation'));
  assert.equal(escapeHtml('<img "x">'), '&lt;img &quot;x&quot;&gt;');
});
test('seeded simulation matches old weight band rates', () => {
  let seed=42; const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const counts=[0,0,0,0,0];
  for(let i=0;i<200000;i++){const w=rollWeight(rng); counts[w<.85?0:w<1.1?1:w<1.5?2:w<2?3:4]++;}
  [.15,.60,.15,.0375,.0625].forEach((p,i)=>assert.ok(Math.abs(counts[i]/200000-p)<.003));
});
function mockAdmin({ authError=false, existing=null, history=null, lifetimeScore=0, boardError=false, lifetimeBoardError=false, fallbackData=null }={}) {
  const calls=[];
  const admin={calls,auth:{getUser:async token=>({data:{user:authError?null:{id:'real-user'}},error:authError?{}:null})},from(table){
    const filters=[];let selected=''; const query={select(columns){selected=columns;return this},eq(k,v){filters.push([k,v]);return this},in(k,v){filters.push([k,v]);return this},order(){return this},range(){return this},limit(){return this},lt(k,v){filters.push([k,v]);return this},maybeSingle(){return this},then(resolve){
      calls.push({table,filters,selected});const data=fallbackData&&table==='gemdle_results'&&selected==='id,player_id,overall_rarity'?fallbackData.results:fallbackData&&table==='players'&&selected==='id,username,leaderboard_hidden'?fallbackData.players:fallbackData&&table==='user_roll_luck_rarity_mult'&&selected==='player_id,active_until'?fallbackData.bans:table==='players'?{id:'real-user'}:table==='user_roll_luck_rarity_mult'?null:table==='private_feature_gems'?[gem('X',100)]:table==='game_mutations'?[]:history??existing;
      return Promise.resolve({data,error:null}).then(resolve);
    }};return query;
  }, async rpc(name,args){calls.push({name,args});if(name==='get_active_global_event')return {data:null};if(name==='save_gemdle_result')return {data:{gemdle_date:'2026-09-04',rolled_at:now.toISOString(),specimen:args.p_specimen}};if(name==='gemdle_lifetime_rarity_score')return {data:lifetimeScore};if(name==='gemdle_daily_board')return boardError?{error:new Error('board down')}:{data:{entries:[],own_rank:null}};if(name==='gemdle_lifetime_board')return lifetimeBoardError?{error:new Error('lifetime board down')}:{data:{entries:[{rank:1,username:'Player',total_score:lifetimeScore,discoveries:2,is_you:true}],own_rank:1,participants:1}};throw new Error(`unexpected rpc ${name}`);}};
  return admin;
}
const req = body => new Request('http://localhost/gemdle',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify(body)});
test('missing/invalid auth never queries player data',async()=>{
  const admin=mockAdmin({authError:true}), handler=createHandler(admin,()=>now);
  assert.equal((await handler(req({action:'roll'}))).status,401);assert.equal(admin.calls.length,0);
  assert.equal((await handler(new Request('http://localhost',{method:'POST'}))).status,401);
});
test('forged identity, score and date are ignored; existing result does not reroll',async()=>{
  const existing={gemdle_date:'2026-09-04',specimen:{gem_name:'Saved'}};
  const admin=mockAdmin({existing});const response=await createHandler(admin,()=>now)(req({action:'roll',player_id:'victim',gemdle_date:'2099-01-01',overall_rarity:1e99}));
  assert.deepEqual((await response.json()).result,existing);
  assert.ok(admin.calls.every(c=>!c.name?.includes('save')));
  assert.deepEqual(admin.calls.find(c=>c.table==='gemdle_results').filters,[['player_id','real-user'],['gemdle_date','2026-09-04']]);
});
test('roll saves server output and survives a leaderboard outage',async()=>{
  const admin=mockAdmin({boardError:true,lifetimeScore:4321}); const response=await createHandler(admin,()=>now)(req({action:'roll',specimen:{gem_name:'FORGED'}}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.specimen.gem_name,'X');assert.equal(data.board,null);assert.equal(data.lifetime_rarity_score,4321);assert.equal(data.lifetime_board.own_rank,1);
  const save=admin.calls.find(c=>c.name==='save_gemdle_result');assert.equal(save.args.p_player_id,'real-user');assert.equal(save.args.p_rolled_at,now.toISOString());
});
test('a lifetime board outage does not hide the saved result or daily board',async()=>{
  const fallbackData={results:[{id:'1',player_id:'real-user',overall_rarity:40},{id:'2',player_id:'real-user',overall_rarity:60},{id:'3',player_id:'other',overall_rarity:200}],players:[{id:'real-user',username:'Me',leaderboard_hidden:false},{id:'other',username:'Other',leaderboard_hidden:false}],bans:[]};
  const admin=mockAdmin({lifetimeBoardError:true,lifetimeScore:100,fallbackData});
  const response=await createHandler(admin,()=>now)(req({action:'state'}));
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.lifetime_board.own_rank,2);assert.equal(data.lifetime_board.participants,2);assert.equal(data.lifetime_board.entries[1].total_score,100);assert.deepEqual(data.board,{entries:[],own_rank:null});
});
test('lifetime board fallback preserves ties, privacy and active suspensions',()=>{
  const results=[{player_id:'me',overall_rarity:100},{player_id:'tie',overall_rarity:100},{player_id:'hidden',overall_rarity:999},{player_id:'banned',overall_rarity:888},{player_id:'bad',overall_rarity:'NaN'}];
  const players=[{id:'me',username:'Me'},{id:'tie',username:''},{id:'hidden',username:'Hidden',leaderboard_hidden:true},{id:'banned',username:'Banned'},{id:'bad',username:'Bad'}];
  const board=lifetimeBoardFromRows(results,players,[{player_id:'banned',active_until:'2027-01-01T00:00:00Z'}],'me',now);
  assert.equal(board.participants,2);assert.equal(board.own_rank,1);assert.deepEqual(board.entries.map(entry=>[entry.rank,entry.username,entry.total_score]),[[1,'Me',100],[1,'Player',100]]);
  assert.ok(board.entries.every(entry=>!('player_id' in entry)));
});
test('history includes the server-calculated lifetime rarity score',async()=>{
  const history=Array.from({length:31},(_,i)=>({gemdle_date:`2026-08-${String(31-i).padStart(2,'0')}`,specimen:{gem_name:'X'}}));
  const admin=mockAdmin({history,lifetimeScore:123456});
  const response=await createHandler(admin,()=>now)(req({action:'history'}));
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.history.length,30);assert.equal(data.next_cursor,'2026-08-02');assert.equal(data.lifetime_rarity_score,123456);
  assert.deepEqual(admin.calls.find(c=>c.name==='gemdle_lifetime_rarity_score').args,{p_player_id:'real-user'});
});
