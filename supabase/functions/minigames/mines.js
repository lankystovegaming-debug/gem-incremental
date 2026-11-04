import { minesScore } from '../../../minigames/mines.js';

const valid = (ok) => { if (!ok) throw new Error('Invalid Mines action'); };
// A fresh cryptographic draw each round prevents inference from past boards.
export function drawMine(word = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  let n;
  do { n = word(); } while (n >= 4294967275);
  return n % 25;
}
export function startMinesRound(s) {
  s.mine = drawMine();
  s.revealed = [];
  s.phase = 'reveal';
}
function endRound(s, hit) {
  const score = hit ? 0 : minesScore(s.revealed.length);
  s.score += score;
  s.history.push({ round: s.round + 1, revealed: s.revealed.length, hit, score });
  s.phase = 'result';
  s.done = s.history.length === 5;
}
export function stepMines(s, a) {
  if (a.type === 'next') {
    valid(Object.keys(a).every(k => k === 'type') && s.phase === 'result');
    s.round++;
    startMinesRound(s);
    return;
  }
  valid(s.phase === 'reveal');
  if (a.type === 'bank') {
    valid(Object.keys(a).every(k => k === 'type'));
    endRound(s, false);
    return;
  }
  valid(a.type === 'reveal' && Object.keys(a).every(k => ['type','x','y'].includes(k)));
  valid(Number.isInteger(a.x) && Number.isInteger(a.y) && a.x >= 0 && a.x < 5 && a.y >= 0 && a.y < 5);
  const cell = a.y * 5 + a.x;
  valid(!s.revealed.includes(cell));
  if (cell === s.mine) endRound(s, true);
  else {
    s.revealed.push(cell);
    if (s.revealed.length === 24) endRound(s, false);
  }
}
