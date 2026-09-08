import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { escapeHtml, formatHugeDecimal } from "../src/ui/format.js";
mountShell({page:"mutation-index",base:"../"});
const list=document.getElementById("list");
const {data,error}=await supabase.from("game_mutations").select("id,name,chance,multiplier,description,description_credit,icon,color,enabled").eq("enabled",true).order("multiplier",{ascending:true}).order("name",{ascending:true});
if(error){list.innerHTML=`<p class="empty-message">${escapeHtml(error.message)}</p>`;}else{list.innerHTML=(data||[]).map(m=>`<article class="mutation-index-card" style="--mutation-color:${escapeHtml(m.color||'#8b5cf6')}"><h2 class="mutation-index-card__title"><span class="mutation-index-card__icon">${escapeHtml(m.icon||'✦')}</span>${escapeHtml(m.name)}</h2><p class="mutation-index-card__description">${escapeHtml(m.description||'No description yet.')}</p><div class="mutation-index-stats"><div class="mutation-index-stat"><span>Chance</span><strong>1 in ${escapeHtml(formatHugeDecimal(m.chance))}</strong></div><div class="mutation-index-stat"><span>Multiplier</span><strong>×${escapeHtml(formatHugeDecimal(m.multiplier))}</strong></div></div>${m.description_credit?`<p class="mutation-index-credit">${escapeHtml(m.description_credit)}</p>`:''}</article>`).join("");}
