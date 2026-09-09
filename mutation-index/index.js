import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { escapeHtml } from "../src/ui/format.js";

mountShell({ page: "mutation-index", base: "../" });
const el = Object.fromEntries(["list","mutationCount","visibleCount","rarestMutation","largestMultiplier","mutationSearch","mutationSort","clearSearch","catalogStatus"].map(id=>[id,document.getElementById(id)]));
let mutations=[];

function exact(value,max=8){const n=Number(value);return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:max}):"—";}
function band(chance){const n=Number(chance);return n>=1e8?"Extreme":n>=1e6?"Ultra rare":n>=1e5?"Very rare":n>=1e4?"Rare":"Uncommon";}
function normalize(payload){
 let rows=payload;if(rows&&!Array.isArray(rows)&&typeof rows==="object")rows=rows.mutations??rows.rows??rows.data??rows.result??rows.catalog??rows.items??[];
 if(!Array.isArray(rows))return[];const seen=new Set();
 return rows.flatMap(row=>{const id=String(row?.id??"").trim(),name=String(row?.name??"").trim(),chance=Number(row?.chance),multiplier=Number(row?.multiplier);
  if(!id||!name||chance<=0||!Number.isFinite(chance)||!Number.isFinite(multiplier)||seen.has(id))return[];seen.add(id);
  const color=String(row.color??"");return[{id,name,chance,multiplier,description:String(row.description??"").trim(),credit:String(row.description_credit??row.descriptionCredit??"").trim(),icon:String(row.icon??"✦").trim()||"✦",color:/^#[0-9a-f]{3,8}$/i.test(color)?color:"#8b5cf6"}];});
}
async function loadCatalog(){
 const failures=[];for(const name of ["get_gem_index_mutation_catalog_v3","get_public_mutation_catalog","get_gem_index_mutation_catalog","get_public_mutation_catalog_json","get_public_mutation_catalog_all"]){
  const{data,error}=await supabase.rpc(name),rows=error?[]:normalize(data);if(rows.length)return rows;failures.push(error?.message??`${name} returned no rows`);
 }
 const{data,error}=await supabase.from("game_mutations").select("id,name,chance,multiplier,description,description_credit,icon,color").eq("enabled",true);
 const rows=error?[]:normalize(data);if(rows.length)return rows;throw new Error(error?.message??failures[0]??"Mutation catalog unavailable");
}
function sortRows(rows){const mode=el.mutationSort.value;return[...rows].sort((a,b)=>mode==="chance-desc"?b.chance-a.chance||a.name.localeCompare(b.name):mode==="chance-asc"?a.chance-b.chance||a.name.localeCompare(b.name):mode==="multiplier-desc"?b.multiplier-a.multiplier||a.name.localeCompare(b.name):mode==="name"?a.name.localeCompare(b.name):a.multiplier-b.multiplier||a.name.localeCompare(b.name));}
function render(){
 const q=el.mutationSearch.value.trim().toLowerCase();const rows=sortRows(mutations.filter(m=>!q||[m.name,m.description,m.credit,m.id,band(m.chance)].join(" ").toLowerCase().includes(q)));
 el.visibleCount.textContent=exact(rows.length);el.clearSearch.hidden=!q;el.catalogStatus.textContent=q?`Showing ${rows.length} of ${mutations.length} mutations`:`${mutations.length} obtainable mutations loaded`;el.list.setAttribute("aria-busy","false");
 el.list.innerHTML=rows.length?rows.map(m=>`<article class="mutation-index-card" style="--mutation-color:${escapeHtml(m.color)}"><div class="mutation-index-card__top"><span class="mutation-index-card__icon" aria-hidden="true">${escapeHtml(m.icon)}</span><div class="mutation-index-card__heading"><h2>${escapeHtml(m.name)}</h2><span>${band(m.chance)}</span></div></div><p class="mutation-index-card__description">${escapeHtml(m.description||"No description has been added yet.")}</p><dl class="mutation-index-stats"><div><dt>Base chance</dt><dd>1 in ${exact(m.chance)}</dd></div><div><dt>Value multiplier</dt><dd>×${exact(m.multiplier)}</dd></div></dl>${m.credit?`<p class="mutation-index-credit">${escapeHtml(m.credit)}</p>`:""}</article>`).join(""):`<div class="mutation-index-empty"><span aria-hidden="true">⌕</span><strong>No mutations found</strong><p>Try a different name, description, ID, or rarity band.</p></div>`;
}
function summary(){el.mutationCount.textContent=exact(mutations.length);const rare=[...mutations].sort((a,b)=>b.chance-a.chance)[0],large=[...mutations].sort((a,b)=>b.multiplier-a.multiplier)[0];el.rarestMutation.textContent=rare?`1 in ${exact(rare.chance)}`:"—";el.largestMultiplier.textContent=large?`×${exact(large.multiplier)}`:"—";}
el.mutationSearch.addEventListener("input",render);el.mutationSort.addEventListener("change",render);el.clearSearch.addEventListener("click",()=>{el.mutationSearch.value="";el.mutationSearch.focus();render();});
try{mutations=await loadCatalog();summary();render();}catch(error){console.error("Mutation Index catalog failed:",error);el.mutationCount.textContent="—";el.visibleCount.textContent="0";el.catalogStatus.textContent="Catalog unavailable";el.list.setAttribute("aria-busy","false");el.list.innerHTML=`<div class="mutation-index-empty mutation-index-empty--error"><span aria-hidden="true">!</span><strong>Could not load the Mutation Index</strong><p>Please refresh the page and try again.</p><button type="button" id="retryCatalog">Retry</button></div>`;document.getElementById("retryCatalog")?.addEventListener("click",()=>location.reload());}
