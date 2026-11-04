import assert from 'node:assert/strict';
import test from 'node:test';
import { create, step, visible, ranking } from '../supabase/functions/minigames/engine.js';
import { drawMine } from '../supabase/functions/minigames/mines.js';
import { minesScore, minesMultiplier, minesRisk } from '../minigames/mines.js';
const reveal = i => ({ type: 'reveal', x: i % 5, y: Math.floor(i / 5) });

test('all 25 scores reproduce the supplied table; exact odds and unbiased random draws', () => {
  assert.deepEqual(Array.from({length:25}, (_, i) => minesScore(i)), [1000,1042,1087,1136,1190,1250,1316,1389,1471,1563,1667,1786,1923,2083,2273,2500,2778,3125,3571,4167,5000,6250,8333,12500,25000]);
  assert.equal(minesMultiplier(0), 1);
  assert.equal(minesMultiplier(24), 25);
  assert.equal(minesRisk(0), 4);
  assert.equal(minesRisk(23), 50);
  assert.equal(minesRisk(24), 100);
  const words = [4294967295,4294967275,24];
  assert.equal(drawMine(() => words.shift()), 24);
  assert.equal(words.length, 0);
  for (let i=0; i<25; i++) assert.equal(drawMine(() => i), i);
});
test('five rounds combine banked points, mine only loses current round, resume is immutable', () => {
  let s = create('mines','practice');
  assert.equal(s.seed, undefined);
  assert.equal(visible(s).mine, undefined);
  assert.equal(ranking(s), null);
  assert.throws(() => create('mines','rewarded'));
  const original = structuredClone(s);
  s = step(s, {type:'bank'}, 1);
  assert.equal(original.phase, 'reveal');
  assert.equal(original.score, 0);
  assert.equal(s.score, 1000);
  assert.equal(visible(s).mine, s.mine);
  assert.throws(() => step(s, {type:'bank'}, 2));
  assert.throws(() => step(s, reveal(0), 2));
  s = step(JSON.parse(JSON.stringify(s)), {type:'next'}, 2);
  assert.equal(s.round, 1);
  assert.equal(s.revealed.length, 0);
  assert.equal(visible(s).mine, undefined);
  s = step(s, reveal(s.mine), 3);
  assert.equal(s.history[1].score, 0);
  assert.equal(s.score, 1000);
  for (let round=2; round<5; round++) {
    s = step(s, {type:'next'}, round*3);
    const safe = (s.mine+1)%25;
    s = step(s, reveal(safe), round*3+1);
    s = step(s, {type:'bank'}, round*3+2);
  }
  assert.equal(s.done, true);
  assert.equal(s.history.length, 5);
  assert.equal(s.score, 4126);
  assert.deepEqual(ranking(s), [4126,0,0]);
  assert.equal(s.pending, undefined);
  assert.throws(() => step(s, {type:'next'}, 100));
});
test('24 safe gems auto-bank, upper bound is 125000 and completed actions cannot replay', () => {
  let s = create('mines','practice'), now = 1;
  for (let round=0; round<5; round++) {
    for (let cell=0; cell<25; cell++) {
      if (cell !== s.mine) s = step(s, reveal(cell), now++);
    }
    assert.equal(s.phase, 'result');
    assert.equal(s.history.at(-1).score, 25000);
    if (round<4) s = step(s, {type:'next'}, now++);
  }
  assert.equal(s.score, 125000);
  assert.equal(s.done, true);
  assert.throws(() => step(s, {type:'bank'}, now));
});
test('invalid, duplicate, premature and forged inputs fail without mutating saved state', () => {
  const s = create('mines','practice'), safe=(s.mine+1)%25;
  for (const a of [{type:'next'}, {type:'bogus'}, {type:'reveal',x:-1,y:0}, {type:'reveal',x:5,y:0}, {type:'reveal',x:0,y:5}, {type:'reveal',x:0.5,y:0}, {type:'reveal',x:'0',y:0}, {type:'bank',score:999999}, {...reveal(safe),mine:0}]) {
    assert.throws(() => step(s,a,1));
    assert.equal(s.score,0);
    assert.equal(s.revealed.length,0);
  }
  const next = step(s,reveal(safe),1);
  assert.throws(() => step(next,reveal(safe),2));
  const publicState=visible(next);
  assert.equal(publicState.mine,undefined);
  assert.equal(publicState.seed,undefined);
  publicState.revealed.push(100);
  assert.equal(next.revealed.length,1);
  const abandoned=step(next,{type:'abandon'},2);
  assert.equal(ranking(abandoned),null);
  assert.equal(abandoned.pending,0);
});
