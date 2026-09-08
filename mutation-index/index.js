import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { escapeHtml, formatHugeDecimal } from "../src/ui/format.js";

mountShell({ page:"mutation-index", base:"../" });
const list=document.getElementById("list");
const count=document.getElementById("mutationCount");
const search=document.getElementById("mutationSearch");
let mutations=[];

function render(){
  const q=(search?.value||"").trim().toLowerCase();
  const rows=mutations.filter(m=>!q || `${m.name||""} ${m.description||""} ${m.description_credit||""}`.toLowerCase().includes(q));
  count.textContent=String(mutations.length);
  list.innerHTML=rows.length?rows.map(m=>`<article class="mutation-index-card" style="--mutation-color:${escapeHtml(m.color||"#8b5cf6")}">
    <div class="mutation-index-card__top"><span class="mutation-index-card__icon" aria-hidden="true">${escapeHtml(m.icon||"✦")}</span><h2 class="mutation-index-card__title">${escapeHtml(m.name)}</h2></div>
    <p class="mutation-index-card__description">${escapeHtml(m.description||"No description yet.")}</p>
    <div class="mutation-index-stats"><div class="mutation-index-stat"><span>Chance</span><strong>1 in ${escapeHtml(formatHugeDecimal(m.chance))}</strong></div><div class="mutation-index-stat"><span>Multiplier</span><strong>×${escapeHtml(formatHugeDecimal(m.multiplier))}</strong></div></div>
    ${m.description_credit?`<p class="mutation-index-credit">${escapeHtml(m.description_credit)}</p>`:""}
  </article>`).join(""):`<div class="mutation-index-empty">No mutations match that search.</div>`;
}

const {data,error}=await supabase.from("game_mutations").select("id,name,chance,multiplier,description,description_credit,icon,color,enabled").eq("enabled",true).order("multiplier",{ascending:true}).order("name",{ascending:true});
if(error){count.textContent="0";list.innerHTML=`<div class="mutation-index-empty">${escapeHtml(error.message)}</div>`;}else{mutations=data||[];render();}
search?.addEventListener("input",render);
