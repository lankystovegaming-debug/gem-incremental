import { supabase } from '../backend/supabase.js';
import { ensurePlayerAuth } from '../backend/auth.js';
import { escapeHtml } from './format.js';
import { confirmDialog } from './dialog.js';
import { notify } from './toast.js';
export function mountEquipmentLoadouts(host, refreshEquipment) {
 let presets = [], equipment = [], busy = false;
 const categories = ['pickaxe','boots','bag','clover','lantern'];
 function paint() {
  host.innerHTML = `<h2>Equipment Loadouts</h2><p>Save up to five builds. Missing items leave their slots unchanged. Empty saved slots are unequipped.</p>` + Array.from({length:5},(_,i)=>{
   const slot=i+1,preset=presets.find(p=>p.slot===slot);
   const details=preset?categories.map(category=>{
    const id=preset.selections[category],item=equipment.find(e=>String(e.id)===id);
    return `${category}: ${id==null?'Empty':item?.name??'Unavailable'}`;
   }).join(' · '):'Empty preset';
   return `<div class="card" style="padding:16px;margin-bottom:12px"><label>Name <input class="input" data-name="${slot}" maxlength="40" value="${escapeHtml(preset?.name??'')}" placeholder="Loadout ${slot}" aria-label="Loadout ${slot} name"></label><p>${escapeHtml(details)}</p><div class="row"><button class="btn" data-action="save" data-slot="${slot}" ${busy?'disabled':''}>${preset?'Update from current gear':'Save current gear'}</button>${preset?`<button class="btn btn--primary" data-action="equip" data-slot="${slot}" ${busy?'disabled':''}>Equip</button><button class="btn" data-action="delete" data-slot="${slot}" ${busy?'disabled':''}>Delete</button>`:''}</div></div>`;
  }).join('');
 }
 async function reload() {
  const user=await ensurePlayerAuth();if(!user)throw new Error('Sign in to manage loadouts.');
  const [p,e]=await Promise.all([supabase.from('player_equipment_loadouts').select('*').eq('player_id',user.id).order('slot'),supabase.from('player_equipment').select('id,name,category').eq('player_id',user.id)]);
  if(p.error||e.error)throw p.error??e.error;presets=p.data;equipment=e.data;paint();
 }
 host.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||busy)return;
  const slot=Number(button.dataset.slot),action=button.dataset.action;
  const name=host.querySelector(`[data-name="${slot}"]`).value.trim();
  if(action==='save'&&!name){notify.warning('Name required','Enter a name for this loadout.');return;}
  if(action==='delete'&&await confirmDialog({title:'Delete loadout?',body:'<p>Your equipment stays equipped.</p>',confirmLabel:'Delete',cancelLabel:'Cancel'})!=='confirm')return;
  busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
  try {
   const {data,error}=await supabase.rpc('equipment_loadout',{p_action:action,p_slot:slot,p_name:name||null});
   if(error)throw error;
   if(action==='equip') {await refreshEquipment();if(data.unavailable?.length)notify.warning('Loadout equipped with missing items',`${data.unavailable.join(', ')} left unchanged.`);}
   await reload();
  }catch(error){notify.error('Loadout could not be changed',error.message);}
  finally{busy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 reload().catch(error=>{host.textContent=`Loadouts unavailable: ${error.message}`;});
 return reload;
}
