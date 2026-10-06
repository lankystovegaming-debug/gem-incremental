import { supabase } from '../backend/supabase.js';
import { cosmeticStyle } from './cosmetics.js';

const rollStyles = new Set(['glitched','celestial','overgrown','retro-desktop','prismatic']);

export async function mountEquippedRollCard() {
  const stage = document.getElementById('section-roll-stage');
  if (!stage) return;
  const preview = new URLSearchParams(location.search).get('cosmeticPreview');
  if (rollStyles.has(preview)) { stage.dataset.rollCard = preview; return; }
  try {
    const { data, error } = await supabase.rpc('get_my_cosmetics');
    if (error) return;
    const item = data?.resolved?.roll_card;
    const style = cosmeticStyle(item);
    if (item && rollStyles.has(style)) stage.dataset.rollCard = style;
  } catch { /* The standard card is the safe fallback. */ }
}
