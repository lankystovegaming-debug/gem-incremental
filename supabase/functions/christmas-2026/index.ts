import { withSupabase } from 'npm:@supabase/server';
import { initialState, applyAction, publicSnapshot } from '../_shared/christmasActions.js';

const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

export default {fetch:withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  let body:any;
  try{body=await req.json();}catch{return reply({error:'invalid_json'},400);}
  if(!body||Array.isArray(body)||typeof body!=='object')return reply({error:'invalid_request'},400);
  const uid=String(ctx.userClaims?.id||'');
  if(!uuid.test(uid))return reply({error:'unauthorized'},401);
  const {requestId,...command}=body;
  const action=command.action||'snapshot';command.action=action;
  if(action!=='snapshot'&&!uuid.test(requestId||''))return reply({error:'request_id_required'},400);
  try{
    for(let attempt=0;attempt<3;attempt++){
      const loaded=await ctx.supabaseAdmin.rpc('christmas_2026_load',{p_player_id:uid,p_request_id:requestId??null});
      if(loaded.error)throw new Error(loaded.error.message);
      const now=Date.parse(loaded.data.serverNow);
      if(!Number.isFinite(now))throw new Error('server_clock_unavailable');
      const before={...initialState(),...loaded.data.state,version:Number(loaded.data.version)};
      if(action==='snapshot')return reply({...publicSnapshot(before,now),releaseEnabled:loaded.data.releaseEnabled});
      if(loaded.data.receipt){
        const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
        if(JSON.stringify(canonical(loaded.data.receipt.command))!==JSON.stringify(canonical(command)))return reply({error:'idempotency_conflict'},409);
        return reply({...loaded.data.receipt.result,snapshot:publicSnapshot(before,now),releaseEnabled:loaded.data.releaseEnabled});
      }
      if(!loaded.data.releaseEnabled)return reply({error:'christmas_not_released'},409);
      const {state,rewards}=applyAction(before,command,now,random);
      const committed=await ctx.supabaseAdmin.rpc('christmas_2026_commit',{
        p_player_id:uid,p_request_id:requestId,p_command:command,p_expected_version:before.version,p_state:state,p_rewards:rewards
      });
      if(committed.error?.message.includes('version_conflict'))continue;
      if(committed.error)throw new Error(committed.error.message);
      const latest=await ctx.supabaseAdmin.rpc('christmas_2026_load',{p_player_id:uid});
      if(latest.error)throw new Error(latest.error.message);
      return reply({...committed.data,snapshot:publicSnapshot({...initialState(),...latest.data.state,version:Number(latest.data.version)},Date.parse(latest.data.serverNow)),releaseEnabled:true});
    }
    return reply({error:'version_conflict'},409);
  }catch(e){
    const code=String((e as Error).message).match(/[a-z][a-z0-9_]+/)?.[0]||'christmas_action_failed';
    return reply({error:code},400);
  }
})};
