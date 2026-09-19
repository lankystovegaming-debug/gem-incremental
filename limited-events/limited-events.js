import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { escapeHtml } from "../src/ui/format.js";

mountShell({ page: "limited-events", base: "../" });

const grid=document.querySelector(".event-grid");
const status=document.querySelector("#deepcoreStatus");

async function renderEvents(){
  const {data,error}=await supabase.rpc("get_active_limited_events");
  if(error){console.error("[LIMITED EVENTS]",error);return;}
  const events=data||[];
  const seededDeepSea=events.find(e=>e.id==="deep-sea");
  if(status && seededDeepSea) status.textContent="ACTIVE";
  if(!grid)return;
  const cards=[];
  if(seededDeepSea){
    cards.push(`<a class="event-card" href="./deep-sea/"><span class="event-card__status">ACTIVE</span><div class="event-card__art" aria-hidden="true"><i></i><i></i><i></i></div><div><p class="eyebrow">LIMITED EVENT</p><h2>${escapeHtml(seededDeepSea.name)}</h2><p>${escapeHtml(seededDeepSea.introduction)}</p><strong>Enter event →</strong></div></a>`);
  }
  for(const e of events.filter(x=>x.id!=="deep-sea")){
    const p=e.config?.presentation||{};
    cards.push(`<a class="event-card" href="./event/?id=${encodeURIComponent(e.id)}" style="${p.backgroundColor?`background:${escapeHtml(p.backgroundColor)};`:``}"><span class="event-card__status">ACTIVE</span><div class="event-card__art" aria-hidden="true"><i></i><i></i><i></i></div><div><p class="eyebrow">LIMITED EVENT</p><h2>${escapeHtml(e.name)}</h2><p>${escapeHtml(e.introduction)}</p><strong>Enter event →</strong></div></a>`);
  }
  if(!cards.length){
    grid.innerHTML=`<article class="event-card"><span class="event-card__status">NO ACTIVE EVENTS</span><div><h2>Nothing active right now</h2><p>Check back when the next limited-time operation starts.</p></div></article>`;
  }else grid.innerHTML=cards.join("");
}
renderEvents();
