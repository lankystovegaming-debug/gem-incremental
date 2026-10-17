import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseUpdateLogContent } from '../src/logic/updateLogContent.js';

export function weeklyUpdateFromPr(pr) {
  const match = /^weekly update\s+(\d+)\b/i.exec(pr.title ?? '');
  if (!match) return null;
  const body = String(pr.body ?? '');
  const block = /^## Player update log\s*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/im.exec(body)?.[1]?.trim();
  if (!block) throw new Error('Weekly PRs need a "## Player update log" section with player-facing bullets and optional ### headings.');
  const sections = parseUpdateLogContent(block.replace(/^### /gm, '## '));
  if (/\bv\d+(?:\.\d+)*\b|\b\d+\.\d+\.\d+\b/i.test(block)) throw new Error('Leave version numbers out of the player update log.');
  return {
    pr: pr.number,
    title: `Weekly update ${match[1]}`,
    merged_at: pr.merged_at,
    published_on: pr.merged_at ? new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(pr.merged_at)) : null,
    weekly: true,
    sections,
  };
}

export function publishWeeklyUpdate(history, pr) {
  if (!pr.merged || !pr.merged_at) throw new Error('Only merged weekly PRs can be published.');
  const entry = weeklyUpdateFromPr(pr);
  if (!entry) return history;
  return [entry, ...history.filter((previous) => previous.pr !== entry.pr)]
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pull_request: pr, repository } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (!pr || pr.base.ref !== repository.default_branch) process.exit(0);
  const entry = weeklyUpdateFromPr(pr);
  if (!entry || process.argv.includes('--check')) process.exit(0);
  const target = new URL('../updates/history.json', import.meta.url);
  const history = JSON.parse(readFileSync(target, 'utf8'));
  writeFileSync(target, JSON.stringify(publishWeeklyUpdate(history, pr), null, 2) + '\n');
  const auditPath = new URL('../docs/update-log-pr-audit.json', import.meta.url);
  const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  audit.pull_requests = [{ pr: pr.number, title: pr.title, merged_at: pr.merged_at, disposition: 'included' },
    ...audit.pull_requests.filter((previous) => previous.pr !== pr.number)];
  audit.merged_pr_count = audit.pull_requests.length;
  audit.audited_on = entry.published_on;
  writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
}
