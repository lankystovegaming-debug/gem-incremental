import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {initialState} from '../supabase/functions/_shared/christmasActions.js';
let source=await readFile(new URL('../supabase/functions/christmas-2026/index.ts',import.meta.url),'utf8');
source=source.replace("import { withSupabase } from 'npm:@supabase/server';",'const withSupabase=(_options,handler)=>req=>handler(req,globalThis.__christmasCtx);')
  .replace("'../_shared/christmasActions.js'",JSON.stringify(new URL('../supabase/functions/_shared/christmasActions.js',import.meta.url).href));
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const uid='00000000-0000-4000-8000-000000000001',requestId='10000000-0000-4000-8000-000000000001';
let state={...initialState(),snowflakes:100},release=true,commits=0,conflict=false;
const receipts=new Map(),rpcs=[];
globalThis.__christmasCtx={userClaims:{id:uid},supabaseAdmin:{rpc:async(name,args)=>{
  rpcs.push({name,args});assert.equal(args.p_player_id,uid,'never trust a request-body player ID');
  if(name==='christmas_2026_load')return {data:{state,version:state.version,serverNow:'2026-12-01T00:00:00Z',releaseEnabled:release,receipt:receipts.get(args.p_request_id)||null}};
  if(name==='christmas_2026_commit'){
    if(conflict)return {error:{message:'version_conflict'}};
    commits++;state={...args.p_state,version:state.version+1};
    const result={rewards:args.p_rewards,version:state.version};receipts.set(args.p_request_id,{command:args.p_command,result});return {data:result};
  }
  throw Error('unexpected RPC');
}}};
async function call(body,method='POST'){
  const r=await handler.fetch(new Request('https://local/christmas-2026',{method,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  return {status:r.status,data:await r.json()};
}
assert.equal((await call({},'GET')).status,405);
assert.equal((await call('bad JSON')).data.error,'invalid_json');
assert.equal((await call([])).data.error,'invalid_request');
assert.equal((await call({action:'decorate'})).data.error,'request_id_required');
release=false;assert.equal((await call({action:'decorate',requestId})).data.error,'christmas_not_released');assert.equal(commits,0);release=true;
const command={action:'decorate',requestId,playerId:'attacker-supplied-id',state:{snowflakes:9999999}};
const first=await call(command);assert.equal(first.status,200);assert.equal(state.tree,1);assert.equal(state.snowflakes,0);assert.equal(state.inventory.small,2);assert.equal(commits,1);
const retry=await call(command);assert.equal(retry.status,200);assert.deepEqual(retry.data.rewards,first.data.rewards);assert.equal(commits,1);
assert.equal((await call({...command,action:'advent',day:1})).data.error,'idempotency_conflict');
conflict=true;rpcs.length=0;
assert.equal((await call({action:'advent',day:1,requestId:'10000000-0000-4000-8000-000000000002'})).data.error,'version_conflict');
assert.equal(rpcs.filter(c=>c.name==='christmas_2026_commit').length,3,'bounded CAS retries');
globalThis.__christmasCtx.userClaims={id:null};assert.equal((await call({})).status,401);
console.log('Christmas handler: verified identity, forged state rejection, release gate, receipt-first replay and bounded conflict retries passed.');
