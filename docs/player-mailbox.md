# Player mailbox

Deploy `supabase/migrations/20261026002136_player_mailbox.sql` before publishing the frontend. No Edge Function deployment is needed.

Signed-in players open **Profile → Mailbox**, then select a message. Attachments are claimed explicitly; opening a message only marks it read. The inbox loads 25 messages at a time, newest first.

## Delivering mail

Use the Supabase SQL editor or trusted service-role tooling to insert a message. There is deliberately no player-to-player sending endpoint. Each row is addressed to one existing `players.id`.

```sql
insert into public.player_mail (player_id, subject, body, rewards)
values (
  '<recipient player UUID>',
  'Thanks for playing!',
  'Here is a gift from the Gem Incremental team.',
  '[{"type":"money","amount":1000},{"type":"coins","amount":5}]'::jsonb
);
```

Omit `rewards` for a message without attachments. `sender` defaults to `Gem Incremental`. Messages are plain text; line breaks are preserved.

Supported attachments reuse the deployed `apply_reward_object` helper:

- `{"type":"money","amount":1000}` adds cash and lifetime earnings.
- `{"type":"coins","amount":5}` adds coins.
- `{"type":"potion","consumableId":"<existing game_consumables.id>","amount":2}` adds consumables.

Amounts must be positive integers, at most 1,000,000,000,000,000 (potions are capped at 2,147,483,647). Up to 20 attachments are supported. Unsupported or invalid attachments reject the entire claim without marking it claimed or granting partial rewards.

Players have SELECT-only access under row-level security. Read/claim functions derive ownership from `auth.uid()`. Reward amounts are never accepted from the browser. Claims lock the player and message and commit the rewards and claim marker together; retries return the existing claim result without granting twice.

## Verification

`node tests/mailbox-database-test.mjs` uses PGlite and the existing reward helper from the daily login migration. `PGLITE_MODULE` can point to an installed package entry.

`node tests/mailbox-browser-test.mjs` uses Playwright and a local dev server on port 5587. `PLAYWRIGHT_MODULE` and `MAILBOX_PREVIEW_URL` can override those defaults. Browser checks use fixtures and never grant live rewards.
