import { withSupabase } from "npm:@supabase/server";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}
async function getConfig(ctx:any){
 const {data,error}=await ctx.supabaseAdmin.from("forge_config").select("*").eq("id",true).maybeSingle();
 if(error)throw error;
 if(data)return data;
 const fallback={id:true,enabled:false,beta_label:"Workbench [BETA]",display_name:"Workbench [BETA]",icon:"⚒",min_materials:3,max_materials:50,stage_time_seconds:8,quality_broken:.65,quality_poor:.8,quality_average:1,quality_good:1.1,quality_excellent:1.2,quality_masterwork:1.3,trait_threshold_minor:.1,trait_threshold_full:.3,ore_count_rules:{weapon:[{min:3,max:6,class:"Dagger"},{min:7,max:14,class:"Sword"},{min:15,max:29,class:"Great Sword"},{min:30,max:9999,class:"Colossal Sword"}],armor:[{min:3,max:9,class:"Light Helmet"},{min:10,max:19,class:"Medium Helmet"},{min:20,max:9999,class:"Heavy Helmet"}]},trait_rules:[]};
 const {data:created,error:ce}=await ctx.supabaseAdmin.from("forge_config").upsert(fallback).select("*").single();
 if(ce)throw ce;
 return created;
}
function qualityFrom(scores:number[],c:any){const avg=scores.reduce((a,b)=>a+b,0)/Math.max(1,scores.length);if(avg<.2)return ["Broken",c.quality_broken];if(avg<.4)return ["Poor",c.quality_poor];if(avg<.6)return ["Average",c.quality_average];if(avg<.75)return ["Good",c.quality_good];if(avg<.9)return ["Excellent",c.quality_excellent];return ["Masterwork",c.quality_masterwork];}
function classFor(type:string,count:number,c:any){
 const rules=(c.ore_count_rules?.[type]||[]);
 if(!rules.length)return type==="weapon"?"Weapon":"Armor";
 const weighted=rules.map((r:any)=>{
   const min=Number(r.min),max=Number(r.max),optimal=Number(r.optimal??((min+Math.min(max,min+Math.max(1,Math.round((max-min)*.55))))/2));
   const distance=Math.abs(count-optimal);
   return {r,w:1/(1+distance)};
 });
 const total=weighted.reduce((a:any,x:any)=>a+x.w,0);let roll=Math.random()*total;
 for(const x of weighted){roll-=x.w;if(roll<=0)return x.r.class;}
 return weighted[weighted.length-1].r.class;
}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});const playerId=uid(ctx);if(!playerId)return json({error:"unauthenticated"},401);
 try{
  const c=await getConfig(ctx);if(!c.enabled)return json({error:"feature_disabled",message:"The Forge is currently disabled."},403);
  const b=await req.json().catch(()=>({}));const a=b.action||"config";
  if(a==="config")return json({config:c});
  if(a==="materials"){
   const {data:gems,error}=await ctx.supabaseAdmin.from("inventory_gems")
    .select("id,gem_name,rarity,value,locked,final_weight,mutation_multiplier")
    .eq("player_id",playerId).eq("locked",false).order("rarity",{ascending:true}).limit(200);
   if(error)throw error;
   return json({gems:gems??[]});
  }
  if(a==="start"){
   const type=b.itemType==="armor"?"armor":"weapon";const ids=Array.isArray(b.materialIds)?b.materialIds.map(String):[];
   if(ids.length<c.min_materials||ids.length>c.max_materials)return json({error:"invalid_material_count",min:c.min_materials,max:c.max_materials},400);
   const {data:gems,error}=await ctx.supabaseAdmin.from("inventory_gems").select("id,gem_name,value_per_gram,rarity,mutation_multiplier").eq("player_id",playerId).in("id",ids);
   if(error)throw error;if((gems??[]).length!==ids.length)return json({error:"materials_missing"},400);
   const {data:session,error:se}=await ctx.supabaseAdmin.from("forge_sessions").insert({player_id:playerId,item_type:type,material_ids:ids,material_summary:gems,stage:1,stage_scores:[],quality:1}).select("*").single();
   if(se)throw se;return json({session,stage:1,stageTime:c.stage_time_seconds});
  }
  if(a==="stage"){
   const id=String(b.sessionId);const score=Math.max(0,Math.min(1,Number(b.score)));const {data:s,error}=await ctx.supabaseAdmin.from("forge_sessions").select("*").eq("id",id).eq("player_id",playerId).eq("status","active").single();if(error)throw error;
   const scores=[...(s.stage_scores||[]),score];const next=s.stage+1;
   if(next<=3){const {data:u,error:ue}=await ctx.supabaseAdmin.from("forge_sessions").update({stage:next,stage_scores:scores,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(ue)throw ue;return json({session:u,stage:next});}
   const [qualityName,qmult]=qualityFrom(scores,c);const mats=s.material_summary||[];const avg=(mats.reduce((x:any,g:any)=>x+Number(g.value_per_gram||0)*Number(g.mutation_multiplier||1),0)/Math.max(1,mats.length));const count=mats.length;const itemClass=classFor(s.item_type,count,c);const rarity=qmult>=1.3?"Legendary":qmult>=1.2?"Epic":qmult>=1.1?"Rare":"Common";
   const traitMap:any={};for(const g of mats){const share=1/count;if(share>=Number(c.trait_threshold_minor))traitMap[g.gem_name]=(share>=Number(c.trait_threshold_full)?"full":"minor");}
   const stats=s.item_type==="weapon"?{attack:Math.max(1,avg*100*qmult),attackSpeed:Math.max(.15,1.5/(1+avg*.25))}:{vitality:Math.max(1,avg*120*qmult),defense:Math.max(0,avg*60*qmult)};
   const result={itemType:s.item_type,itemClass,quality:qualityName,qualityMultiplier:qmult,oreCount:count,rarity,multiplier:avg,stats,traits:traitMap};
   const {data:item,error:ie}=await ctx.supabaseAdmin.from("forge_items").insert({player_id:playerId,item_type:s.item_type,item_name:itemClass,rarity,quality:qmult,ore_count:count,multiplier:avg,stats,traits:Object.entries(traitMap).map(([name,level])=>({name,level}))}).select("*").single();if(ie)throw ie;
   // Consume exactly the selected inventory gems.
   const {error:de}=await ctx.supabaseAdmin.from("inventory_gems").delete().eq("player_id",playerId).in("id",s.material_ids);if(de)throw de;
   const {data:done,error:fe}=await ctx.supabaseAdmin.from("forge_sessions").update({stage_scores:scores,quality:qmult,result,status:"completed",updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(fe)throw fe;
   return json({session:done,item,result});
  }
  if(a==="history"){const {data,error}=await ctx.supabaseAdmin.from("forge_items").select("*").eq("player_id",playerId).order("created_at",{ascending:false}).limit(30);if(error)throw error;return json({items:data??[]});}
  return json({error:"unknown_action"},400);
 }catch(e){console.error("FORGE_ERROR",e);return json({error:"forge_server_error",message:e instanceof Error?e.message:String(e)},500);}
})};
