import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { newestWeeklyUpdate, updateSeenKey, searchUpdates } from '../src/logic/updateHistory.js';
import { renderUpdate } from '../src/ui/updateLog.js';
import { publishWeeklyUpdate, weeklyUpdateFromPr } from '../tools/publish-weekly-update.mjs';
const history = JSON.parse(readFileSync(new URL('../updates/history.json', import.meta.url)));
const audit = JSON.parse(readFileSync(new URL('../docs/update-log-pr-audit.json', import.meta.url)));
const pr = { number: 999, title: 'weekly update 6: 24/10/26', body: '## Summary\nTechnical detail\n\n## Player update log\n### Trading\n- Added a new shop.\n- Sale bonus 1.5x.\n\n## Deployment\nDo not show this.', merged: true, merged_at: '2026-10-23T20:00:00Z' };

test('every historical merged PR is included or explicitly accounted for', () => {
  assert.equal(audit.merged_pr_count, audit.pull_requests.length);
  assert.equal(new Set(audit.pull_requests.map((p) => p.pr)).size, audit.pull_requests.length);
  assert.equal(new Set(history.map((p) => p.pr)).size, history.length);
  for (const p of audit.pull_requests) {
    assert.equal(history.some((entry) => entry.pr === p.pr), p.disposition === 'included', `PR ${p.pr}`);
    if (p.disposition === 'internal') assert.ok(p.reason);
  }
  assert.ok(!history.some((entry) => entry.pr === 514), 'unmerged weekly work is not advertised');
});
test('history has valid ordered dates, player content and no versions', () => {
  for (const [index, entry] of history.entries()) {
    assert.ok(Number.isSafeInteger(entry.pr));
    assert.ok(Number.isFinite(Date.parse(entry.merged_at)));
    assert.match(entry.published_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.title && entry.sections.length);
    assert.ok(entry.sections.every((s) => s.heading && s.bullets.length && s.bullets.every((b) => b.trim())));
    assert.doesNotMatch(entry.title + JSON.stringify(entry.sections), /\bv\d+\b|\b\d+\.\d+\.\d+\b|\bBeta\b/i);
    if (index) assert.ok(Date.parse(history[index - 1].merged_at) >= Date.parse(entry.merged_at));
  }
});
test('weekly publication uses only the authored player section and Singapore merge date', () => {
  const entry = weeklyUpdateFromPr(pr);
  assert.equal(entry.title, 'Weekly update 6');
  assert.equal(entry.published_on, '2026-10-24');
  assert.deepEqual(entry.sections, [{ heading: 'Trading', bullets: ['Added a new shop.', 'Sale bonus 1.5x.'] }]);
  assert.equal(weeklyUpdateFromPr({ title: 'Fix a shop' }), null);
  assert.throws(() => weeklyUpdateFromPr({ ...pr, body: '## Summary\n- Technical detail' }), /Player update log/);
  assert.throws(() => weeklyUpdateFromPr({ ...pr, body: '## Player update log\n- Release v1.2.3' }), /version numbers/);
});
test('publication rejects unmerged work and is idempotent on workflow retry', () => {
  assert.throws(() => publishWeeklyUpdate(history, { ...pr, merged: false }), /Only merged/);
  assert.throws(() => publishWeeklyUpdate(history, { ...pr, merged_at: null }), /Only merged/);
  const once = publishWeeklyUpdate(history, pr);
  assert.equal(once.length, history.length + 1);
  assert.deepEqual(publishWeeklyUpdate(once, pr), once);
});
test('popup chooses the newest merged weekly entry and isolates account acknowledgments', () => {
  assert.equal(newestWeeklyUpdate(history).pr, 496);
  assert.equal(newestWeeklyUpdate([{ ...history[0], weekly: true, merged_at: null }]), null);
  assert.equal(newestWeeklyUpdate([{ ...history[0], weekly: true, merged_at: '2999-01-01T00:00:00Z' }]), null);
  assert.notEqual(updateSeenKey('a', 1), updateSeenKey('b', 1));
  assert.notEqual(updateSeenKey('a', 1), updateSeenKey('a', 2));
});
test('search finds features across weekly section bodies', () => {
  assert.ok(searchUpdates(history, 'Convergence').some((entry) => entry.pr === 496));
  assert.equal(searchUpdates(history, 'no-such-gem-abcdef').length, 0);
  assert.equal(searchUpdates(history).length, history.length);
});
test('all release text is escaped, with no version badge', () => {
  const html = renderUpdate({ pr: 1, title: '<img onerror=alert(1)>', published_on: '2026-10-15', sections: [{ heading: '<script>', bullets: ['<svg onload=alert(1)>'] }] });
  assert.doesNotMatch(html, /<img|<svg|<script|badge--version/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;svg/);
});
