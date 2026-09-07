import { reelSymbols, reelMultiplier, reelWeights, reelHands, reelBases } from './reels.js';
const number = n => Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
export function reelsHtml(s, icon) {
  const last = s.history.at(-1);
  return `<section class="mg-reels" aria-label="Gem Reels">
    <h3>${s.done ? 'Final score' : `Hand ${Math.min(8,s.hand+1)} of 8`} · ${number(s.score)} points</h3>
    <p>${s.phase === 'hold' ? 'Choose any gems to hold, then respin once.' : s.done ? 'Your run has ended.' : 'Spin five gems to begin your next hand.'}</p>
    <div class="mg-reels-row">${(s.symbols.length ? s.symbols : Array(5).fill(null)).map((id,i)=>`<button class="mg-reel" data-reel="${i}" aria-pressed="false" ${s.phase !== 'hold' || s.done ? 'disabled' : ''}>
    ${id === null ? '<span class="mg-reel-wild">◇</span>' : id === 12 ? '<span class="mg-reel-wild">✦</span>' : icon(reelSymbols[id])}
    <strong>${id === null ? 'Ready' : reelSymbols[id]}</strong><small>${id === null ? 'Spin to reveal' : id === 12 ? 'Wild · 1%' : `×${reelMultiplier(id)} · ${reelWeights[id]/100}%`}</small><span data-hold-label>${s.phase === 'hold' ? 'Tap to hold' : '—'}</span></button>`).join('')}</div>
    ${!s.done ? `<div class="mg-controls"><button class="btn btn--primary" data-action="${s.phase === 'hold' ? 'respin' : 'spin'}">${s.phase === 'hold' ? 'Respin unheld gems' : `Spin hand ${s.hand+1}`}</button></div>` : ''}
    ${last ? `<p role="status">Hand ${last.hand}: <strong>${last.natural ? 'Natural ' : ''}${reelHands[last.rank]}</strong> · +${number(last.score)}${last.natural ? ' (×1.5 natural bonus)' : ''}</p>` : ''}
    ${s.history.length ? `<details><summary>Hand history (${s.history.length}/8)</summary><ol>${s.history.map(h=>`<li>${h.symbols.map(id=>reelSymbols[id]).join(' · ')} — ${h.natural ? 'Natural ' : ''}${reelHands[h.rank]} +${number(h.score)}${h.wilds ? ` (Wild interpretation: ${h.interpretation.map(id=>reelSymbols[id]).join(', ')})` : ''}</li>`).join('')}</ol></details>` : ''}
    <details class="mg-howto"><summary>Scoring, symbols & rewards</summary>
    <p>${reelHands.slice(1).map((h,i)=>`${h}: ${reelBases[i+1]}`).join(' · ')} base points. No Prismatic hand.</p>
    <p>Common ×1, Uncommon ×2, Rare ×4, Premium ×8. Matching hands use their gem multiplier; Two Pair averages both pairs; Full Cluster uses its triple. Gem Run is fixed at 300. A qualifying final hand with no Wild earns ×1.5, including after a respin.</p>
    <p>Any five consecutive gems, in any reel order: ${reelSymbols.slice(0,12).join(' → ')}.</p>
    <p>Each Common 14.85%; Uncommon 9.90%; Rare 5.94%; Premium 2.31%; Wild 1%. Wild chooses the highest-scoring interpretation. Five Wilds score 16,000, without a natural bonus. Fractional points are retained.</p>
    <p>Rewarded final score → MT: &lt;1,750 → 8; 1,750–&lt;2,500 → 14; 2,500–&lt;3,250 → 20; 3,250–&lt;4,250 → 26; 4,250–&lt;5,500 → 32; 5,500–&lt;7,500 → 40; 7,500+ → 50. One ticket covers all eight hands. Practice is identical, unlimited, awards 0 MT, and counts for the leaderboard. Existing MT is never wagered.</p></details></section>`;
}
export function bindReelHolds(root, isBusy) {
  root.querySelectorAll('[data-reel]').forEach(b=>b.onclick=()=>{
    if (isBusy() || b.disabled) return;
    const held = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed',String(held));
    b.querySelector('[data-hold-label]').textContent = held ? 'HELD' : 'Tap to hold';
  });
}
