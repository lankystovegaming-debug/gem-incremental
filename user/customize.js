import { supabase } from '../src/backend/supabase.js';
import { escapeHtml } from '../src/ui/format.js';
import { cosmeticRarity } from '../src/ui/cosmetics.js';

// Everything in this editor comes from the authenticated ownership RPC.
export async function openCustomizer(onSaved) {
  const dialog = document.getElementById('customizeDialog');
  const content = document.getElementById('customizeContent');
  content.innerHTML = '<p role="status">Loading your collectibles…</p>';
  dialog.showModal();
  try {
    const { data, error } = await supabase.rpc('get_my_cosmetics');
    if (error) throw error;
    if (!dialog.open) return;
    const owned = data.owned || [];
    const resolved = data.resolved || {};
    const equipment = data.equipment || {
      trophies: (resolved.trophies || []).map(item => item.id)
    };
    const select = (slot, name, label, selected) => `<label class="customize-field">${escapeHtml(label)}
      <select name="${name}"><option value="">${slot === 'background' ? 'Default profile' : 'None'}</option>
      ${owned.filter(item => !slot || item.slots.includes(slot)).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(`${item.name} · ${cosmeticRarity(item)}`)}</option>`).join('')}</select></label>`;
    content.innerHTML = `<form id="customizeForm">
      <p class="customize-intro">Show what you’ve earned. Cosmetics have no gameplay effects.</p>
      <div class="customize-fields">${[['title','Collectible title'],['frame','Avatar frame'],['background','Background'],['decor','Profile decoration']].map(([slot,label]) => select(slot,slot,label,equipment[slot])).join('')}</div>
      <fieldset><legend>Badges · up to 3</legend><div class="customize-fields">${[0,1,2].map(i => select('badge',`badge-${i}`,`Badge ${i+1}`,equipment.badges?.[i])).join('')}</div></fieldset>
      <fieldset><legend>Trophy Case · up to 5 accomplishments</legend><p>Pin bundle trophies or any earned collectible.</p><div class="customize-fields">${[0,1,2,3,4].map(i => select(null,`trophy-${i}`,`Accomplishment ${i+1}`,equipment.trophies?.[i])).join('')}</div></fieldset>
      <fieldset><legend>Gem showcase labels</legend><p>Select your three gems from your <a href="/inventory/">Inventory</a>.</p><div class="customize-fields">${[0,1,2].map(i => `<label class="customize-field">Gem ${i+1}<input name="label-${i}" maxlength="32" value="${escapeHtml(equipment.showcase_labels?.[i] || '')}" placeholder="e.g. My favourite"></label>`).join('')}</div></fieldset>
      ${owned.length ? '' : '<p>Your earned collectibles will appear here as you unlock rewards.</p>'}
      <p id="customizeStatus" role="status" aria-live="polite"></p>
      <div class="customize-actions"><button type="button" class="btn" id="cancelCustomize">Cancel</button><button type="submit" class="btn btn--primary">Save profile</button></div>
    </form>`;
    document.getElementById('cancelCustomize').onclick = () => dialog.close();
    document.getElementById('customizeForm').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const next = Object.fromEntries(['title','frame','background','decor'].map(slot => [slot, fields.get(slot) || null]));
      next.badges = [0,1,2].map(i => fields.get(`badge-${i}`)).filter(Boolean);
      next.trophies = [0,1,2,3,4].map(i => fields.get(`trophy-${i}`)).filter(Boolean);
      next.showcase_labels = [0,1,2].map(i => fields.get(`label-${i}`).trim());
      const status = document.getElementById('customizeStatus');
      if (new Set(next.badges).size !== next.badges.length || new Set(next.trophies).size !== next.trophies.length) {
        status.textContent = 'Select each collectible only once per section.'; return;
      }
      const button = form.querySelector('[type="submit"]');
      button.disabled = true; status.textContent = 'Saving…';
      try {
        const { error: saveError } = await supabase.rpc('set_my_cosmetic_loadout', { p_equipment: next });
        if (saveError) throw saveError;
        await onSaved();
        dialog.close();
      } catch (error) {
        status.textContent = error.message || 'Could not save. Please try again.';
      } finally { button.disabled = false; }
    };
  } catch (error) {
    content.innerHTML = `<p role="alert">${escapeHtml(error.message || 'Could not load your collectibles.')}</p><button class="btn" id="retryCustomize">Try again</button>`;
    document.getElementById('retryCustomize').onclick = () => { dialog.close(); openCustomizer(onSaved); };
  }
}
