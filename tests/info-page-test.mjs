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
test('active events are grouped and an active admin event is polled every second', async () => {
  const shell = readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
  const source = shell.slice(shell.indexOf('async function renderActiveEvents('), shell.indexOf('\nfunction eventPercent('));
  let now = Date.parse('2026-09-10T00:00:00Z');
  let card = null;
  const timers = new Map();
  let adminCalls = 0;
  let adminEvent = {id:'admin-1', name:'Double luck', luck_multiplier:2, ends_at:new Date(now + 10000).toISOString()};
  const globalEvent = {id:'global-1', eventKey:'lucky_hour', name:'Lucky Hour', tier:'common', config:{}, description:'Luck boost', startsAt:new Date(now).toISOString(), endsAt:new Date(now + 10000).toISOString(), serverNow:new Date(now).toISOString()};
  class Clock extends Date { static now() { return now; } }
  const count = {textContent:'', setAttribute(name, value) { this[name] = value; }};
  const list = {innerHTML:''};
  const eventTimers = [];
  const syncEventTimers = () => {
    eventTimers.length = 0;
    for (const match of list.innerHTML.matchAll(/data-ends-at="([^"]+)"( data-server-clock="true")?/g)) {
      eventTimers.push({dataset:{endsAt:match[1], serverClock:match[2] ? 'true' : undefined}, textContent:''});
    }
  };
  Object.defineProperty(list, 'innerHTML', {get() { return this.value || ''; }, set(value) { this.value = value; syncEventTimers(); }});
  const context = vm.createContext({
    Date:Clock, icons:{sparkle:'<svg></svg>', chevronDown:'<svg></svg>'},
    ensurePlayerAuth:async () => ({id:'test'}),
    loadActiveAdminEvent:async () => {adminCalls += 1; return {data:adminEvent};},
    loadActiveGlobalEvent:async () => ({data:globalEvent}),
    escapeHtml: value => String(value ?? ''), eventTime: value => String(Math.max(0, value)),
    eventPercent: value => `${Number(value) * 100}%`, eventMultiplier: value => `×${Number(value)}`,
    setInterval: (fn, delay) => {timers.set(delay, fn); return delay;}, clearInterval: () => {},
    window:{addEventListener:()=>{}},
    document:{querySelector: () => null, createElement: () => ({
      className:'', innerHTML:'', querySelector: selector => selector.includes('__count') ? count : list,
      querySelectorAll: () => eventTimers
    })}
  });
  const render = vm.runInContext(`${source}; renderActiveEvents`, context);
  await render({after: value => {card=value;}}, '../../');
  assert.equal(count.textContent, '2');
  assert.match(list.innerHTML, /Double luck/);
  assert.match(list.innerHTML, /Lucky Hour · common/);
  assert.match(list.innerHTML, /href="\.\.\/\.\.\/info\/#random-events"/);
  adminEvent = {id:'admin-2', name:'Overrunning event', luck_multiplier:3, ends_at:new Date(now + 20000).toISOString()};
  await timers.get(1000)();
  assert.equal(adminCalls, 2, 'active admin event is refreshed once per second');
  assert.match(list.innerHTML, /Overrunning event/, 'new admin event replaces the previous event in place');
});
test('active events card remains available when there are no events', async () => {
  const shell = readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
  const source = shell.slice(shell.indexOf('async function renderActiveEvents('), shell.indexOf('\nfunction eventPercent('));
  const count = {textContent:'', setAttribute() {}};
  const list = {innerHTML:''};
  let card = null;
  const context = vm.createContext({
    Date, icons:{sparkle:'', chevronDown:''}, ensurePlayerAuth:async () => ({id:'test'}),
    loadActiveAdminEvent:async () => ({data:null}), loadActiveGlobalEvent:async () => ({data:null}),
    escapeHtml: value => String(value ?? ''), eventTime: value => String(value),
    eventPercent: value => `${Number(value) * 100}%`, eventMultiplier: value => `×${Number(value)}`,
    setInterval: () => 1, clearInterval: () => {}, window:{addEventListener:()=>{}},
    document:{querySelector: () => null, createElement: () => ({
      className:'', innerHTML:'', querySelector: selector => selector.includes('__count') ? count : list,
      querySelectorAll: () => []
    })}
  });
  const render = vm.runInContext(`${source}; renderActiveEvents`, context);
  await render({after: value => {card=value;}}, './');
  assert.ok(card, 'the expandable card is rendered');
  assert.equal(count.textContent, '0');
  assert.match(list.innerHTML, /no active events/);
});
