# Player update logs

`updates/history.json` is the single player-facing source for `/updates` and the weekly entry popup. It replaces the old static versioned logs and the database-published feed on that page. Existing admin publishing data is retained, but is no longer mixed into this page. No database cleanup or deployment is required for this feature.

The initial archive accounts for all 502 PRs merged through 15 October 2026. Each game-facing PR has a dated entry, with expanded summaries for weekly PRs. Documentation, admin-only tools and internal maintenance are accounted for separately in `update-log-pr-audit.json`; their implementation details are not advertised as gameplay changes. Dates use Singapore time. Historical notes describe changes at their merge date, including systems that were later replaced; they are not a claim that every past feature still exists or every backend deployment happened at merge.

## Each weekly PR

Keep the player notes current as commits are added. Include the following section in the weekly PR description (at heading level two), with optional level-three headings:

```markdown
## Player update log

### New features
- Describe the finished feature from the player's perspective.

### Improvements and fixes
- Describe visible improvements and repaired behavior.
```

Do not include version numbers, code paths, deployment instructions, private player details, or unfinished/release-disabled work. Keep deployment instructions in a separate level-two section. A weekly PR validation job checks this section on open, edits and commits. Titles use `weekly update N: DD/MM/YY` as usual.

On a weekly PR merge into the default branch, the publication job reads that exact merged PR description and adds one dated entry keyed by PR number. Retries replace the same entry rather than duplicating it. The job commits only the history and audit JSON to the default branch using the repository's Actions token. GitHub Actions must be enabled and branch rules must permit this bot commit; no separate token or secret is required. If branch rules block publication, run the same script with the merged-PR event payload and include the resulting JSON changes through the normal review flow. Never weaken branch protection to enable this job.

The site must then publish the new default-branch files through its existing hosting pipeline. A merge itself cannot update already-hosted static files. Pushes made with the Actions token do not start other GitHub Actions workflows: if hosting uses an Actions-only deployment, add deployment to the publication job using the project's approved deployment process. External hosting must respond to the publication commit. No Supabase migrations or Edge Functions are part of this update-log feature.

## Popup behavior

After authentication, show the newest merged weekly entry on any shared-shell game page. Wait for visible daily reward dialogs, tours, maintenance screens and active cinematics to finish. Use an accessible native dialog with keyboard focus containment, Escape dismissal, a scrollable mobile layout, “Let's play” and “All updates”. Acknowledgment is stored per player and PR on that browser; a different player or newly merged weekly PR gets its own popup. Show only the newest weekly entry on first visit, rather than a backlog of old popups. Storage-disabled browsers remember acknowledgment for the current page session only. The historical latest weekly entry can be shown once when this feature first launches.

An open/unmerged weekly PR cannot appear: its notes enter the published JSON only after the merge event. Existing tabs pick up the new release on their next page entry. Player-facing notes and all PR text are escaped before rendering.

## Checks

- `node --test tests/update-history-test.mjs`
- `node tests/update-history-browser-test.mjs` (Playwright; optional `UPDATE_PLAYWRIGHT_MODULE` and `UPDATE_CHROME_PATH`)
- `node tests/admin-update-publishing-test.mjs`
