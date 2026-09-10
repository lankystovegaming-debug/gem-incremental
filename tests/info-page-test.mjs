import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { groups, events } from '../info/content.js';
import { matchesSearch, renderManual } from '../info/manual.js';

const articles = groups.flatMap(group => group.articles);
test('manual links resolve, with unique stable anchors and no default expansion', () => {
  const html = renderManual();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
  for (const entry of articles) for (const [href] of entry.links ?? []) {
    assert.ok(existsSync(new URL(`${href}index.html`, new URL('../info/', import.meta.url))), href);
  }
  for (const id of ['weight-luck', 'actual-chance', 'random-events', 'raw-rarity', 'maximum-luck']) assert.ok(ids.includes(id));
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:[\s=>])/);
  assert.equal(groups.length, 6);
});
test('search handles punctuation, case, multiword terms and no match', () => {
  assert.ok(matchesSearch('Prospector’s Eye', "PROSPECTOR'S eye"));
  assert.ok(matchesSearch('2×+ tail: 1-in-3 continuation', 'tail 1 in 3'));
  assert.ok(matchesSearch('Weight Multiplier', 'multiplier weight'));
  assert.ok(matchesSearch('Raw Rarity / Raw Roll', 'raw roll'));
  assert.ok(!matchesSearch('Weight Luck', 'weight mutation'));
  assert.ok(!matchesSearch('Weight Luck', 'xyznonexistent'));
});
test('all verified event tiers are present without hidden scheduler data', () => {
  assert.equal(events.length, 25);
  assert.deepEqual(['common', 'uncommon', 'rare', 'legendary'].map(tier => events.filter(event => event.tier === tier).length), [8, 8, 6, 3]);
  assert.equal(new Set(events.map(event => event.id)).size, 25);
  assert.doesNotMatch(JSON.stringify({groups, events}), /selection_weight|spawn.percent|tailEntryChance|Math\.exp|Magnum Opus|Mastery/i);
});
test('active event reference preserves timer expiry and inactive removal', async () => {
  const shell = readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
  const source = shell.slice(shell.indexOf('async function renderActiveGlobalEvent('), shell.indexOf('\nfunction eventPercent('));
  let now = Date.parse('2026-09-10T00:00:00Z');
  let banner = null;
  const timers = new Map();
  let event = {id:'test', eventKey:'lucky_hour', name:'Lucky Hour', tier:'common', config:{}, description:'Luck boost', startsAt:new Date(now).toISOString(), endsAt:new Date(now + 10000).toISOString(), serverNow:new Date(now).toISOString()};
  class Clock extends Date { static now() { return now; } }
  const timer = {textContent:''};
  const context = vm.createContext({
    Date:Clock, ensurePlayerAuth:async () => ({id:"test"}), loadActiveGlobalEvent:async () => ({data:event}),
    escapeHtml: value => String(value), eventTime: value => String(value),
    setInterval: (fn, delay) => {timers.set(delay, fn); return delay;}, clearInterval: () => {},
    window:{addEventListener:()=>{}},
    document:{querySelector: selector => selector === '.global-event-banner' ? banner : null,
      createElement: () => ({className:'', innerHTML:'', querySelector: () => timer, remove: () => {banner=null;}})}
  });
  const render = vm.runInContext(`${source}; renderActiveGlobalEvent`, context);
  await render({after: value => {banner=value;}}, '../../');
  assert.match(banner.innerHTML, /Lucky Hour · common/);
  assert.match(banner.innerHTML, /href="\.\.\/\.\.\/info\/#random-events"/);
  assert.equal(timer.textContent, '10000');
  now += 10001;
  timers.get(1000)();
  assert.equal(banner, null, 'expired event disappears without waiting for polling');
  event = null;
  await timers.get(15000)();
  assert.equal(banner, null, 'inactive event stays absent');
});
