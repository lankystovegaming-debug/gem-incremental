import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
let last;
globalThis.__neptuneTestContext={userClaims:{id:"caller"},supabase:{rpc:async(name,args)=>{
  last={name,args};return {data:{state:{neptune_owned:false}},error:null};
}}};
const source=readFileSync(new URL("../supabase/functions/deep-sea/index.ts",import.meta.url),"utf8")
  .replace('import { withSupabase } from "npm:@supabase/server";',
    'const withSupabase=(_options,handler)=>(req)=>handler(req,globalThis.__neptuneTestContext);');
const {default:handler}=await import("data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(source)).toString("base64"));
for(const [action,rpc] of Object.entries({depositNeptune:"deep_sea_deposit_neptune",setNeptuneAutoCraft:"deep_sea_set_neptune_auto_craft",neptuneProgress:"deep_sea_neptune_progress"})){
  const response=await handler.fetch(new Request("http://local/deep-sea",{method:"POST",body:JSON.stringify({action,enabled:true,playerId:"another-player"})}));
  assert.equal(response.status,200);
  assert.equal(last.name,rpc);
  assert.equal(last.args.p_player_id,"caller","the caller's identity must override any supplied player id");
  if(action==="setNeptuneAutoCraft")assert.equal(last.args.p_enabled,true);
}
delete globalThis.__neptuneTestContext;
console.log("Neptune action routing and caller identity checks passed.");
