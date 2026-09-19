import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { escapeHtml } from "../src/ui/format.js";
import { deepSeaPhase } from "../src/data/deepSea.js";

mountShell({ page: "limited-events", base: "../" });

const grid=document.querySelector(".event-grid");
const deepcoreStatus=document.querySelector("#deepcoreStatus");
const deepSeaStatus=document.querySelector("#deepSeaStatus");
const DEEPCORE_START=Date.parse("2026-09-20T00:00:00.000Z");
const DEEPCORE_END=Date.parse("2026-10-04T00:00:00.000Z");

function renderKnownEventStatuses(now=Date.now()){
  if(deepcoreStatus) deepcoreStatus.textContent=now<DEEPCORE_START?"PREVIEW":now<DEEPCORE_END?"ACTIVE":"ARCHIVED";
  if(deepSeaStatus) deepSeaStatus.textContent=({teaser:"PREVIEW",active:"ACTIVE",redemption:"REDEMPTION",archived:"ARCHIVED"})[deepSeaPhase(now)];
}

async function renderEvents(){
  const {data,error}=await supabase.rpc("get_active_limited_events");
  if(error){console.error("[LIMITED EVENTS]",error);return;}
  if(!grid)return;
  const knownEvents=new Set(["deep-sea","deepcore","deepcore-2026"]);
  const cards=[];
  for(const e of (data||[]).filter(x=>!knownEvents.has(x.id))){
    const p=e.config?.presentation||{};
    cards.push(`<a class="event-card" href="./event/?id=${encodeURIComponent(e.id)}" style="${p.backgroundColor?`background:${escapeHtml(p.backgroundColor)};`:``}"><span class="event-card__status">ACTIVE</span><div class="event-card__art" aria-hidden="true"><i></i><i></i><i></i></div><div><p class="eyebrow">LIMITED EVENT</p><h2>${escapeHtml(e.name)}</h2><p>${escapeHtml(e.introduction)}</p><strong>Enter event →</strong></div></a>`);
  }
  if(cards.length) grid.insertAdjacentHTML("beforeend",cards.join(""));
}
renderKnownEventStatuses();
renderEvents();
