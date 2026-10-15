import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const path='../supabase/functions/admin/index.ts';
const source=readFileSync(new URL(path,import.meta.url),'utf8');
assert.doesNotMatch(source,/console\.(?:log|debug)\([\s\S]{0,200}(?:userClaims|jwtClaims)/);
assert.match(source,/npm:@supabase\/server@1\.9\.2/);
const legacy=readFileSync(new URL('../gem-incremental-admin-panel/supabase/functions/admin/index.ts',import.meta.url),'utf8');
assert.doesNotMatch(legacy,/console\.(?:log|debug)\([\s\S]{0,200}(?:userClaims|jwtClaims)/);
const code=stripTypeScriptTypes(source.replace(/^import .* from "npm:@supabase\/server@1\.9\.2";/,'const withSupabase=(_options,handler)=>handler;'));
const handler=(await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default.fetch;
const owner='004d883f-edbc-4610-b5e3-9068a0de0ca2';
const logs=[];const original=console.log;console.log=(...args)=>logs.push(args);
try{
 for(const [id,writer,viewer,expected] of [[owner,false,false,{isAdmin:true,canWrite:true,access:'owner'}],['editor',true,false,{isAdmin:true,canWrite:true,access:'editor'}],['viewer',false,true,{isAdmin:true,canWrite:false,access:'read_only'}],['player',false,false,{isAdmin:false,canWrite:false,access:'read_only'}]]){
  const ctx={userClaims:{sub:id,email:'do-not-log@example.com',session_id:'private-session'},jwtClaims:{sub:id,private_marker:'do-not-log'},supabaseAdmin:{from(table){const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>({data:((table==='admins'&&writer)||(table==='admin_viewers'&&viewer))?{user_id:id}:null,error:null})};return chain}}};
  const invoke=action=>handler(new Request('https://example.test/admin',{method:'POST',body:JSON.stringify({action})}),ctx);
  const res=await invoke('whoami');assert.equal(res.status,200);assert.deepEqual(await res.json(),expected);
  if(viewer)assert.equal((await invoke('give_money')).status,403);
  if(id==='player')assert.equal((await invoke('search')).status,403);
 }
 assert.equal(logs.length,0,'auth claims are not printed by whoami/authorization');
}finally{console.log=original;}
console.log('Phase 0 admin: owner/editor/viewer/player authorization and redacted authentication logging passed.');
