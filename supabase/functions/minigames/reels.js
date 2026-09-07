import { reelWeights, reelMultiplier, reelHands, reelBases, reelReward } from '../../../minigames/reels.js';
const requireValid = (ok) => { if (!ok) throw new Error('Invalid Gem Reels action'); };
// Rejection sampling eliminates modulo bias. No persistent/predictable RNG seed.
export function reelDraw(word = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  let n;
  do { n = word(); } while (n >= 4294960000);
  return symbolAt(n % 10000);
}
export function symbolAt(n) {
  requireValid(Number.isInteger(n) && n >= 0 && n < 10000);
  for (let i = 0; i < reelWeights.length; i++) {
    n -= reelWeights[i];
    if (n < 0) return i;
  }
}
function classify(counts) {
  const groups = counts.flatMap((n,id) => n ? [{n,id}] : []).sort((a,b) => b.n-a.n || b.id-a.id);
  const first = groups[0];
  let rank = first.n === 5 ? 7 : first.n === 4 ? 6 : first.n === 3 ? (groups[1].n === 2 ? 5 : 3) : first.n === 2 ? (groups[1].n === 2 ? 2 : 1) : 0;
  const ids = groups.map(g=>g.id).sort((a,b)=>a-b);
  if (groups.length === 5 && ids[4]-ids[0] === 4) rank = 4;
  const multiplier = rank === 4 || rank === 0 ? 1 : rank === 2 ? (reelMultiplier(first.id)+reelMultiplier(groups[1].id))/2 : reelMultiplier(first.id);
  return { rank, name: reelHands[rank], multiplier, score: reelBases[rank]*multiplier, interpretation: counts.flatMap((n,id)=>Array(n).fill(id)) };
}
export function scoreReels(symbols) {
  requireValid(Array.isArray(symbols) && symbols.length === 5 && symbols.every(x=>Number.isInteger(x) && x>=0 && x<=12));
  const counts = Array(12).fill(0);
  let wilds = 0, best;
  for (const id of symbols) id === 12 ? wilds++ : counts[id]++;
  // Enumerate multisets (at most 4,368), not ordered assignments (248,832).
  function visit(left, min) {
    if (!left) {
      const candidate = classify(counts);
      if (!best || candidate.score > best.score || (candidate.score === best.score && (candidate.rank > best.rank || (candidate.rank === best.rank && candidate.interpretation.reduce((cmp,id,i)=>cmp || id-best.interpretation[i],0) > 0)))) best = candidate;
      return;
    }
    for (let id=min; id<12; id++) { counts[id]++; visit(left-1,id); counts[id]--; }
  }
  visit(wilds,0);
  const natural = wilds === 0 && best.rank > 0;
  return {...best, natural, wilds, score: best.score*(natural ? 1.5 : 1)};
}
export function stepReels(s, a, now, draw = reelDraw) {
  requireValid(Number.isInteger(s.hand) && s.hand >= 0 && s.hand < 8);
  const allowed = a.type === 'respin' ? ['type','holds'] : ['type'];
  requireValid(Object.keys(a).every(k=>allowed.includes(k)));
  if (a.type === 'spin') {
    requireValid(s.phase === 'spin');
    s.symbols = Array.from({length:5},()=>draw());
    s.phase = 'hold';
    s.spunAt = now;
  } else {
    requireValid(a.type === 'respin' && s.phase === 'hold');
    requireValid(Array.isArray(a.holds) && a.holds.length <= 5 && a.holds.every(x=>Number.isInteger(x) && x>=0 && x<5) && new Set(a.holds).size === a.holds.length);
    const initial = [...s.symbols];
    s.symbols = initial.map((id,i)=>a.holds.includes(i) ? id : draw());
    const result = scoreReels(s.symbols);
    s.score += result.score;
    s.history.push({hand:s.hand+1,initial,holds:[...a.holds].sort(),symbols:[...s.symbols],...result,cumulative:s.score,spunAt:s.spunAt,evaluatedAt:now});
    s.hand++;
    s.phase = 'spin';
    if (s.hand === 8) {
      s.done = true;
      s.phase = 'complete';
      s.pending = s.mode === 'rewarded' ? reelReward(s.score) : 0;
    }
  }
}
