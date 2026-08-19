import {mountShell} from "../src/ui/shell.js";
import {supabase} from "../src/backend/supabase.js";
mountShell({page:"daily-spin",base:"../"});
const $=id=>document.getElementById(id);
let config=null,spinning=false;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
async function api(action){const {data,error}=await supabase.functions.invoke("daily-spin",{body:{action}});if(error||data?.error)throw new Error(data?.message||data?.error||error?.message||"Daily Spin failed");return data;}
function render(d){
 config=d.config;
 $("title").textContent=config.title||"Daily Spin";
 $("subtitle").textContent=config.subtitle||"One free spin every day.";
 const rewards=Array.isArray(config.rewards)?config.rewards:[];
 const total=rewards.reduce((n,r)=>n+Math.max(0,Number(r.chance)||0),0)||1;
 let cursor=0;
 const palette=["#7dd3fc","#a78bfa","#f9a8d4","#fbbf24","#34d399","#fb7185","#60a5fa","#c084fc","#22d3ee","#f97316"];
 const stops=rewards.map((r,i)=>{const start=cursor/total*100;cursor+=Math.max(0,Number(r.chance)||0);const end=cursor/total*100;return `${palette[i%palette.length]} ${start}% ${end}%`;}).join(",");
 $("wheel").style.background=`conic-gradient(from -90deg,${stops||"#7dd3fc 0 100%"})`;
 $("prizes").innerHTML=rewards.map(r=>`<div class="prize"><span>${esc(r.label||"Reward")}</span><small>${Number(r.chance||0)} weight</small></div>`).join("");
 $("spinButton").disabled=Boolean(d.claimed);
 $("spinButton").textContent=d.claimed?"Today's spin claimed":"Spin for today's reward";
 if(d.claimed){$("result").hidden=false;$("resultLabel").textContent=d.claim?.reward?.label||d.claim?.reward?.id||"Claimed";$("resultDetails").textContent="Come back tomorrow for another spin.";}
}
async function load(){try{render(await api("config"));}catch(e){$("status").textContent=e.message;$("spinButton").disabled=true;}}
$("spinButton").onclick=async()=>{
 if(spinning)return;spinning=true;$("spinButton").disabled=true;$("status").textContent="";
 try{
   // Claim first so the animation always lands on the server-authoritative reward.
   // The client never decides which prize was actually granted.
   const d=await api("spin");
   const rewards=config?.rewards||[];
   const rewardId=String(d.reward?.id||"");
   let index=Math.max(0,rewards.findIndex(r=>String(r.id||"")===rewardId));
   if(index<0)index=0;
   const total=rewards.reduce((n,r)=>n+Math.max(0,Number(r.chance)||0),0)||1;
   let before=0;
   for(let i=0;i<index;i++) before+=Math.max(0,Number(rewards[i].chance)||0);
   const width=Math.max(0,Number(rewards[index]?.chance)||0);
   const centerPercent=(before+width/2)/total;
   const targetDegrees=360-(centerPercent*360);
   const turns=6+Math.floor(Math.random()*3);
   $("wheel").style.transform=`rotate(${turns*360 + targetDegrees}deg)`;
   await new Promise(r=>setTimeout(r,5200));
   $("result").hidden=false;
   $("resultLabel").textContent=d.reward?.label||"Reward claimed";
   $("resultDetails").textContent=`You received ${d.reward?.label||"your configured reward"}.`;
   $("status").textContent="Reward claimed!";
 }catch(e){$("status").textContent=e.message;$("spinButton").disabled=false;}
 finally{spinning=false;}
};
load();
