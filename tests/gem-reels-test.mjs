import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreReels, symbolAt, reelDraw } from '../supabase/functions/minigames/reels.js';
import { create, step, ranking, visible } from '../supabase/functions/minigames/engine.js';
import { reelWeights, reelReward } from '../minigames/reels.js';
test('exact symbol probabilities and rejection sampling',()=>{
  const counts=Array(13).fill(0);
  for(let n=0;n<10000;n++) counts[symbolAt(n)]++;
  assert.deepEqual(counts,reelWeights);
  assert.equal(counts.reduce((a,b)=>a+b),10000);
  assert.equal(counts[12],100);
  const words=[4294967295,4294960000,9900];
  assert.equal(reelDraw(()=>words.shift()),12);
  assert.equal(words.length,0);
  assert.throws(()=>symbolAt(10000));
});
test('all natural categories, tiers, fractional two pair and fixed Gem Run',()=>{
  const cases=[[[0,2,4,6,8],0,0],[[0,0,2,4,6],1,75],[[0,0,9,9,6],2,843.75],[[3,3,3,0,6],3,600],[[4,0,2,3,1],4,450],[[6,6,6,9,9],5,2700],[[9,9,9,9,0],6,9000],[[11,11,11,11,11],7,24000]];
  for(const [hand,rank,score] of cases){const r=scoreReels(hand); assert.equal(r.rank,rank);assert.equal(r.score,score);assert.equal(r.natural,rank>0);}
  for(let id=0;id<12;id++) assert.equal(scoreReels([id,id,id,id,id]).score,3000*[1,2,4,8][Math.floor(id/3)]);
  for(let start=0;start<8;start++) assert.equal(scoreReels([start+4,start+1,start+3,start,start+2]).rank,4);
  assert.notEqual(scoreReels([10,11,0,1,2]).rank,4);
});
test('Wild maximizes score rather than hierarchy; all Wild deterministic premium Perfect',()=>{
  const r=scoreReels([0,0,9,10,12]); // Premium pair beats common triple.
  assert.equal(r.rank,2); assert.equal(r.score,562.5); assert.equal(r.natural,false);
  const run=scoreReels([0,1,2,3,12]); assert.equal(run.rank,4);assert.equal(run.score,300);
  const all=scoreReels([12,12,12,12,12]);assert.equal(all.score,16000);assert.equal(all.rank,7);assert.deepEqual(all.interpretation,[11,11,11,11,11]);
  assert.equal(scoreReels([9,9,12,12,12]).score,16000);
  assert.throws(()=>scoreReels([0,0,0,0,13]));
});
test('multiset Wild search agrees with independent ordered exhaustive oracle',()=>{
  function oracle(hand){const i=hand.indexOf(12);if(i<0){const r=scoreReels(hand);return r.score/(r.natural?1.5:1);}let best=0;for(let id=0;id<12;id++){const h=[...hand];h[i]=id;best=Math.max(best,oracle(h));}return best;}
  for(let a=0;a<12;a++) for(let b=0;b<12;b++){
    const h=[a,b,5,12,12];assert.equal(scoreReels(h).score,oracle(h));
  }
});
test('8 hands, held Wild, immutable state, no premature rewards, resume and abandonment',()=>{
  for(const mode of ['practice','rewarded']){
    let s=create('gem-reels',mode,{},1,0);
    assert.equal(s.seed,undefined);
    assert.throws(()=>step(s,{type:'respin',holds:[]},1));
    for(let hand=0;hand<8;hand++){
      let index=0;const seq=[12,0,0,0,0];
      s=step(s,{type:'spin'},hand*2+1,()=>seq[index++]);
      assert.equal(s.phase,'hold');assert.equal(s.pending,0);
      assert.throws(()=>step(s,{type:'spin'},hand*2+1));
      for(const holds of [[0,0],[-1],[5],[0.5],['0'],null]) assert.throws(()=>step(s,{type:'respin',holds},hand*2+2));
      assert.throws(()=>step(s,{type:'respin',holds:[],score:999},hand*2+2));
      const before=structuredClone(s);
      s=step(s,{type:'respin',holds:[0,1,2,3,4]},hand*2+2,()=>{throw Error('held reels must not draw');});
      assert.equal(before.phase,'hold');assert.equal(s.history.at(-1).hand,hand+1);
      assert.equal(s.history.at(-1).score,2000);assert.equal(s.history.at(-1).natural,false);
      s=JSON.parse(JSON.stringify(s));
    }
    assert.equal(s.done,true);assert.equal(s.score,16000);assert.equal(s.pending,mode==='rewarded'?50:0);assert.deepEqual(ranking(s),[16000,0,0]);
    assert.throws(()=>step(s,{type:'spin'},20));assert.ok(!('seed' in visible(s)));
  }
  let s=step(create('gem-reels','rewarded'),{type:'abandon'},1);assert.equal(s.pending,0);assert.equal(ranking(s),null);
});
test('unheld replacements can earn natural bonus; all MT boundaries',()=>{
  let s=step(create('gem-reels','practice'),{type:'spin'},1,()=>12);
  s=step(s,{type:'respin',holds:[]},2,()=>0);
  assert.equal(s.score,3000);assert.equal(s.history[0].natural,true);
  for(const [n,below,at] of [[1750,8,14],[2500,14,20],[3250,20,26],[4250,26,32],[5500,32,40],[7500,40,50]]){assert.equal(reelReward(n-0.25),below);assert.equal(reelReward(n),at);}
  assert.equal(reelReward(0),8);
});
