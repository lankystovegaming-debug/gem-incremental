import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function publishDungeonAnnouncement(entry, event) {
  const pr = event.pull_request;
  if (event.action !== 'closed' || !pr?.merged || !pr.merged_at || !Number.isSafeInteger(pr.number) || pr.number <= 0 ||
      pr.head.ref !== 'announce/dungeons-update' ||
      pr.head.repo.full_name !== 'lankystovegaming-debug/gem-incremental' ||
      event.repository.full_name !== 'lankystovegaming-debug/gem-incremental' ||
      pr.base.ref !== event.repository.default_branch) {
    throw new Error('Only this dungeon announcement PR merged into the default branch can release the popup.');
  }
  if (entry.release_pr && entry.release_pr !== pr.number) throw new Error('The dungeon announcement already belongs to another PR.');
  return { ...entry, published: true, release_pr: pr.number, merged_at: pr.merged_at };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const target = new URL('../updates/dungeons-announcement.json', import.meta.url);
  const entry = JSON.parse(readFileSync(target, 'utf8'));
  writeFileSync(target, JSON.stringify(publishDungeonAnnouncement(entry, event), null, 2) + '\n');
}
