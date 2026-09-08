import { supabase } from '../src/backend/supabase.js';
import { getSettings, updateSettings, hydrateSettingsFromCloud, onSettingsChange } from '../src/ui/settings.js';
import { escapeHtml } from '../src/ui/format.js';
import { notify } from '../src/ui/toast.js';
const el = id => document.getElementById(id);
let gems = [], page = 0, selected = new Set(), busy = false;
const limit = 50;
function rule(gem) {
 const s = getSettings();
 if (s.gemFilter?.[gem.name]) return s.gemFilter[gem.name];
 const maximum = { common:10, uncommon:50, rare:100, epic:1000, legendary:10000, mythic:100000 }[s.legacyAutoSellTier] ?? 10;
 return s.legacyAutoSell && Number(gem.rarity) <= maximum ? 'SELL' : 'DEFAULT';
}
function matching() {
 const term = el('gemFilterSearch').value.trim().toLocaleLowerCase();
 const mode = el('gemFilterState').value;
 return gems.filter(g => g.name.toLocaleLowerCase().includes(term) && (mode === 'ALL' || rule(g) === mode));
}
function paint() {
 const s = getSettings();
 for (const key of ['enableBuffs','discoveryKeep']) el(key).checked = s[key];
 el('discoveryKeepRarity').value = s.discoveryKeepRarity;
 el('legacyFilterNotice').textContent = s.legacyAutoSell ? `Your old Auto Sell rule (${s.legacyAutoSellTier} and below) is preserved for gems without an individual rule, including future discoveries. Choose DEFAULT on a gem to clear its inherited SELL rule.` : '';
 el('clearLegacyFilter').hidden = !s.legacyAutoSell;
 el('clearLegacyFilter').disabled = busy;
 const rows = matching(); page = Math.min(page, Math.max(0,Math.ceil(rows.length/limit)-1));
 el('gemFilterRows').innerHTML = rows.slice(page*limit,(page+1)*limit).map(g => `<div class="qol-filter-row"><input type="checkbox" data-select="${escapeHtml(g.name)}" aria-label="Select ${escapeHtml(g.name)}" ${selected.has(g.name)?'checked':''}><span>${escapeHtml(g.name)}<br><small>Base rarity: 1 in ${Number(g.rarity).toLocaleString()}</small></span><select ${busy?'disabled':''} class="select" data-rule="${escapeHtml(g.name)}" aria-label="Rule for ${escapeHtml(g.name)}">${['DEFAULT','KEEP','SELL'].map(v=>`<option ${rule(g)===v?'selected':''}>${v}</option>`).join('')}</select></div>`).join('');
 el('gemFilterStatus').textContent = `${rows.length} matching discovered gems · ${selected.size} selected · Page ${page+1} of ${Math.max(1,Math.ceil(rows.length/limit))}`;
 el('gemFilterPrevious').disabled = busy || page===0;
 el('gemFilterNext').disabled = busy || (page+1)*limit>=rows.length;
 el('gemFilterApply').disabled = busy || !selected.size;
 el('gemFilterClearSelection').disabled = busy || !selected.size;
 el('gemFilterSelectAll').checked = rows.length>0 && rows.every(g=>selected.has(g.name));
 el('gemFilterSelectAll').indeterminate = rows.some(g=>selected.has(g.name)) && !el('gemFilterSelectAll').checked;
}
async function save(patch) {
 if(busy)return;busy=true;paint();
 document.querySelectorAll('#gemFilterRows select, #enableBuffs, #discoveryKeep, #discoveryKeepRarity').forEach(e=>e.disabled=true);
 try { await updateSettings(patch); }
 catch(error) { notify.error('Settings were not saved',error.message); }
 finally { busy=false; paint();document.querySelectorAll('#enableBuffs, #discoveryKeep, #discoveryKeepRarity').forEach(e=>e.disabled=false); }
}
for (const key of ['enableBuffs','discoveryKeep']) el(key).addEventListener('change',()=>save({[key]:el(key).checked}));
el('discoveryKeepRarity').addEventListener('change',()=>{
 if(!el('discoveryKeepRarity').reportValidity())return;
 save({discoveryKeepRarity:Number(el('discoveryKeepRarity').value)});
});
for(const id of ['gemFilterSearch','gemFilterState']) el(id).addEventListener('input',()=>{page=0;paint();});
el('gemFilterPrevious').onclick=()=>{page--;paint();};el('gemFilterNext').onclick=()=>{page++;paint();};
el('gemFilterRows').addEventListener('change',event=>{
 const input=event.target;
 if(input.dataset.select){input.checked?selected.add(input.dataset.select):selected.delete(input.dataset.select);paint();}
 if(input.dataset.rule)save({gemFilter:{[input.dataset.rule]:input.value}});
});
el('gemFilterSelectAll').onchange=()=>{for(const g of matching())el('gemFilterSelectAll').checked?selected.add(g.name):selected.delete(g.name);paint();};
el('gemFilterApply').onclick=()=>save({gemFilter:Object.fromEntries([...selected].map(name=>[name,el('gemFilterBulk').value]))});
onSettingsChange(paint);
window.addEventListener('gem:settings-error',event=>notify.error('Settings were not saved',event.detail.message));
try {
 await hydrateSettingsFromCloud();
 // Range pagination protects large catalogs from the API's default row cap.
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.rpc('get_qol_gem_catalog').range(offset,offset+499);
  if(error)throw error;gems.push(...(data??[]));if(!data||data.length<500)break;
 }
 paint();
} catch(error){el('gemFilterStatus').textContent=`Could not load settings: ${error.message}. Refresh to retry.`;}

const chatLayoutKey = 'gem.chat.layout.v1';
try { el('qolChatLayout').value = JSON.parse(localStorage.getItem(chatLayoutKey) || '{}').layout || 'floating'; } catch {}
el('qolChatLayout').onchange = () => {
 try {
  const previous = JSON.parse(localStorage.getItem(chatLayoutKey) || '{}');
  localStorage.setItem(chatLayoutKey, JSON.stringify({ ...previous, layout: el('qolChatLayout').value }));
  window.dispatchEvent(new CustomEvent('gem:chat-layout-change'));
 } catch { notify.error('Chat layout was not saved', 'Browser storage is unavailable.'); }
};

el('clearLegacyFilter').onclick=()=>save({clearLegacyAutoSell:true});

el('gemFilterClearSelection').onclick=()=>{selected.clear();paint();};
