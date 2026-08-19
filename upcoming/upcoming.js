import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";

mountShell({ page:"upcoming", base:"../" });

const $=id=>document.getElementById(id);
let password="";
let editing=null;

function status(message,error=false){$("status").textContent=message;$("status").classList.toggle("error",error)}
async function call(action, extra={}){
  const {data,error}=await supabase.functions.invoke("private-features",{body:{action,password,...extra}});
  if(error) throw new Error(error.message||"Private feature request failed");
  if(data?.error) throw new Error(data.message||data.error);
  return data;
}
function jsonValue(id,fallback){try{return JSON.parse($(id).value)}catch{return fallback}}
function formatDate(v){return v?new Date(v).toLocaleString():"—"}
function render(defs){
 $("cards").innerHTML=defs.map(d=>`<article class="feature-card">
  <div class="feature-card__top"><span class="feature-icon">${d.icon||"◆"}</span><div><div class="feature-meta">${d.feature_kind}${d.quest_type?` · ${d.quest_type}`:""}</div><h3>${escapeHtml(d.name)}</h3></div></div>
  <p>${escapeHtml(d.description||"")}</p>
  <div class="feature-meta">${d.starts_at?formatDate(d.starts_at):"Always"} → ${d.ends_at?formatDate(d.ends_at):"No end"}</div>
  <pre>${escapeHtml(JSON.stringify({requirements:d.requirements,rewards:d.rewards,prerequisites:d.prerequisites,unlocks:d.unlocks},null,2))}</pre>
  <div class="upcoming-actions"><button class="btn" data-edit="${d.id}">Edit</button><button class="btn" data-delete="${d.id}">Delete</button></div>
 </article>`).join("");
 $("cards").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEditor(defs.find(d=>d.id===b.dataset.edit)));
 $("cards").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removeFeature(b.dataset.delete));
}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
async function load(){try{const d=await call("list");render(d.definitions||[]);status(`${(d.definitions||[]).length} definitions loaded.`)}catch(e){status(e.message,true)}}
function openEditor(d=null){
 editing=d?.id||null;$("editor").hidden=false;$("editorTitle").textContent=d?"Edit feature":"New feature";
 $("kind").value=d?.feature_kind||"achievement";$("questType").value=d?.quest_type||"special";$("name").value=d?.name||"";
 $("icon").value=d?.icon||"✦";$("description").value=d?.description||"";$("sortOrder").value=d?.sort_order??0;
 $("startsAt").value=d?.starts_at?d.starts_at.slice(0,16):"";$("endsAt").value=d?.ends_at?d.ends_at.slice(0,16):"";
 $("requirements").value=JSON.stringify(d?.requirements||{type:"rolls",amount:1},null,2);$("rewards").value=JSON.stringify(d?.rewards||[],null,2);
 $("prerequisites").value=JSON.stringify(d?.prerequisites||[],null,2);$("unlocks").value=JSON.stringify(d?.unlocks||[],null,2);$("metadata").value=JSON.stringify(d?.metadata||{},null,2);
 window.scrollTo({top:$("editor").offsetTop-70,behavior:"smooth"});
}
async function removeFeature(id){if(!confirm("Delete this feature?"))return;try{await call("delete",{id});await load()}catch(e){status(e.message,true)}}
$("unlock").onclick=async()=>{password=$("password").value;try{await call("list");$("gate").hidden=true;$("workspace").hidden=false;await load()}catch(e){status(e.message,true)}};
$("seed").onclick=async()=>{try{await call("seed");await load()}catch(e){status(e.message,true)}};
$("newFeature").onclick=()=>openEditor();
$("cancel").onclick=()=>{$("editor").hidden=true;editing=null};
$("save").onclick=async()=>{
 const definition={id:editing||undefined,feature_kind:$("kind").value,quest_type:$("questType").value,name:$("name").value,icon:$("icon").value,description:$("description").value,sort_order:Number($("sortOrder").value)||0,starts_at:$("startsAt").value?new Date($("startsAt").value).toISOString():null,ends_at:$("endsAt").value?new Date($("endsAt").value).toISOString():null,requirements:jsonValue("requirements",{}),rewards:jsonValue("rewards",[]),prerequisites:jsonValue("prerequisites",[]),unlocks:jsonValue("unlocks",[]),metadata:jsonValue("metadata",{})};
 try{await call("save",{definition});$("editor").hidden=true;editing=null;await load()}catch(e){status(e.message,true)}
};
ensurePlayerAuth().catch(()=>{});
