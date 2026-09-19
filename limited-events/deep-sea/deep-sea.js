import { mountShell } from "../../src/ui/shell.js";
import { supabase } from "../../src/backend/supabase.js";
import { escapeHtml } from "../../src/ui/format.js";
mountShell({page:"limited-events",base:"../../"});
const {data}=await supabase.rpc("get_active_limited_events");
const e=(data||[]).find(x=>x.id==="deep-sea");
if(e){document.title="Deep Sea · Gem Incremental";document.querySelector("#eventRoot").innerHTML=`<p class="eyebrow">LIMITED EVENT</p><h1>${escapeHtml(e.name)}</h1><p>${escapeHtml(e.introduction)}</p><div class="event-card__status">ACTIVE</div><p>This event is active. The configured event systems are ready for activation.</p>`;}
