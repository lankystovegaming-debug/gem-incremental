import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { publishDungeonAnnouncement } from '../tools/publish-dungeon-announcement.mjs';
import { isDungeonAnnouncementReleased, dungeonAnnouncementSeenKey } from '../src/logic/dungeonAnnouncement.js';
const entry = JSON.parse(readFileSync(new URL('../updates/dungeons-announcement.json', import.meta.url)));
const event = { action: 'closed', repository: { full_name: 'lankystovegaming-debug/gem-incremental', default_branch: 'main' }, pull_request: { number: 999, merged: true, merged_at: '2026-10-15T00:00:00Z', head: { ref: 'announce/dungeons-update', repo: { full_name: 'lankystovegaming-debug/gem-incremental' } }, base: { ref: 'main' } } };
test('announcement stays disabled in the unmerged branch', () => {
  assert.equal(entry.published, false);
  assert.equal(entry.release_pr, null);
  assert.equal(isDungeonAnnouncementReleased(entry), false);
});
test('only the specific announcement merge publishes it', () => {
  const released = publishDungeonAnnouncement(entry, event);
  assert.equal(isDungeonAnnouncementReleased(released), true);
  assert.equal(released.release_pr, 999);
  assert.deepEqual(released.sections, entry.sections);
  assert.deepEqual(publishDungeonAnnouncement(released, event), released);
  for (const update of [{ action: 'opened' }, { pull_request: { ...event.pull_request, merged: false } }, { pull_request: { ...event.pull_request, head: { ...event.pull_request.head, ref: 'weekly-update-5-2026-10-17' } } }, { pull_request: { ...event.pull_request, base: { ref: 'preview' } } }, { pull_request: { ...event.pull_request, head: { ...event.pull_request.head, repo: { full_name: 'someone/gem-incremental' } } } }]) {
    assert.throws(() => publishDungeonAnnouncement(entry, { ...event, ...update }), /Only this/);
  }
  assert.throws(() => publishDungeonAnnouncement({ ...released, release_pr: 998 }, event), /another PR/);
});
test('invalid/future release data cannot show the popup', () => {
  const released = publishDungeonAnnouncement(entry, event);
  for (const update of [{ published: false }, { release_pr: null }, { merged_at: null }, { merged_at: 'bad date' }, { merged_at: '2999-01-01T00:00:00Z' }]) {
    assert.equal(isDungeonAnnouncementReleased({ ...released, ...update }), false);
  }
});
test('acknowledgments are isolated by player and release PR', () => {
  assert.notEqual(dungeonAnnouncementSeenKey('a', 1), dungeonAnnouncementSeenKey('b', 1));
  assert.notEqual(dungeonAnnouncementSeenKey('a', 1), dungeonAnnouncementSeenKey('a', 2));
});
