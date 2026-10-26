# Player mailbox

Deploy `supabase/migrations/20261026002136_player_mailbox.sql`, then `supabase/migrations/20261026003507_mailbox_publishing.sql`, then `supabase/migrations/20261026010410_mailbox_read_claim_retention.sql`, then `supabase/migrations/20261026010619_mailbox_pending_notification.sql`, then `supabase/migrations/20261026015352_mailbox_hard_expiry_and_multi_potions.sql`, before publishing the frontend. No Edge Function deployment is needed for the publisher.

Signed-in players open **Profile → Mailbox**, then select a message. Attachments are claimed explicitly; opening a message only marks it read. The inbox loads 25 messages at a time, newest first.

## Delivering mail

The repository owner's account can use **Admin → Content & events → Mail Publisher**. Choose one player (username or Player ID) or all current players, enter the sender, subject and message, and choose an expiry (1 hour, 1 day, 7 days, 30 days, or a custom local date/time), and optionally attach cash, coins, and multiple potion types. Add or remove potion rows as needed. Duplicate potion types are combined into a single attachment. **Review mail** shows the exact recipient selection, expiry deadline, text and rewards per player before the final **Publish** action. Recent publications show the source and delivery count. Editor and read-only admins cannot publish mail.

A broadcast delivers to the players who exist at publication time; it does not deliver to future signups. Publishing only creates mailbox entries. It never automatically claims attachments.

## Automated system mail

Trusted backend code can call the service-role-only `publish_system_mail` RPC, or import `publishSystemMail` from `supabase/functions/_shared/mail.ts`:

```ts
await publishSystemMail(serviceClient, {
  requestId: persistedEventMailId, // Same UUID for every retry of this event.
  recipient: playerId,           // Username or Player ID.
  subject: "Event complete!",
  body: "Thank you for taking part. Claim your reward below.",
  rewards: [{ type: "coins", amount: 5 }]
});
```

For a broadcast, set `audience: "all"` and omit `recipient`. The sender defaults to `System`. Optional `expiresAt` is an ISO timestamp; omit it for seven days from publication. For direct RPC calls use the optional `p_expires_at` argument. Reuse the same timestamp on retries along with the request ID. No service-role key belongs in the browser. This is an integration point; no existing gameplay event sends mail automatically until it explicitly calls the helper.

Both publishing paths require a stable request UUID. Repeating the same request returns its original delivery count without sending again. Reusing an ID with different content fails. The admin screen retains its request ID after an uncertain network response so **Publish** can safely retry. Editing the form creates a new publication request.

Direct RPC example for trusted backend tooling:

```ts
await serviceClient.rpc("publish_system_mail", {
  p_request_id: persistedEventMailId,
  p_subject: "Thanks for playing!",
  p_body: "Here is a gift from the Gem Incremental team.",
  p_audience: "player",
  p_recipient: playerId,
  p_rewards: [{ type: "money", amount: 1000 }]
});
```

Supported attachments reuse the deployed `apply_reward_object` helper:

- `{"type":"money","amount":1000}` adds cash and lifetime earnings.
- `{"type":"coins","amount":5}` adds coins.
- `{"type":"potion","consumableId":"<existing game_consumables.id>","amount":2}` adds consumables.

Amounts must be positive integers, at most 1,000,000,000,000,000 (potions are capped at 2,147,483,647). Up to 20 attachments are supported, including cash and coins. The combined quantity for each potion type cannot exceed 2,147,483,647. Unsupported or invalid attachments reject the entire claim without marking it claimed or granting partial rewards.

Publishing validates all attachments before delivery. Delivery and its publication record commit together, so errors cannot leave partial broadcasts.

Players have SELECT-only access under row-level security. Read/claim functions derive ownership from `auth.uid()`. Reward amounts are never accepted from the browser. Claims lock the player and message and commit the rewards and claim marker together; retries return the existing claim result without granting twice.

## Verification

`node tests/mailbox-database-test.mjs` uses PGlite and the existing reward helper from the daily login migration. `PGLITE_MODULE` can point to an installed package entry.

`node tests/mailbox-browser-test.mjs` uses Playwright and a local dev server on port 5587. `PLAYWRIGHT_MODULE` and `MAILBOX_PREVIEW_URL` can override those defaults. Browser checks use fixtures and never grant live rewards.

`node tests/mailbox-publishing-database-test.mjs` checks owner/service authorization, targeted and broadcast delivery, validation, retry deduplication, publication privacy and subsequent claiming. `node tests/mailbox-publishing-browser-test.mjs` checks the admin composer at phone and desktop sizes. `node tests/system-mail-helper-test.mjs` checks the shared backend helper.

## Automatic cleanup

All mail now has a hard expiry, even if unread or unclaimed. The default is seven days; the publisher can choose a different future deadline. Mail clears at the earlier of that hard deadline and the existing completion deadline: 30 minutes after first reading a plain message, or 30 minutes after both reading and claiming reward mail (using the later timestamp). Reopening or retrying does not restart either timer.

Applying `20261026015352_mailbox_hard_expiry_and_multi_potions.sql` gives every existing stored message and publication a hard deadline seven days from migration application, regardless of when it was originally sent. Any earlier read/claim cleanup still applies. No live mail is updated until the owner deploys this migration. The existing Cron cleanup job, RLS, claim guards and notification counts all use the effective deadline.

The backend stores the deadline, immediately hides expired rows from players, and rejects opening or claiming expired mail. A `pg_cron` job removes expired rows every minute in batches of up to 5,000. The existing project has Cron enabled; the retention migration fails clearly if Cron is missing on another project. Open inbox/message popups remove expired mail using the same backend deadline. Publication history stays available so retrying an old publish request cannot recreate mail that was already cleared.

`node tests/mailbox-retention-database-test.mjs` covers timing boundaries, unread/unclaimed protection, reopening, claiming, cleanup, scheduler registration and publication retry safety. `node tests/mailbox-retention-browser-test.mjs` checks expiry while the inbox/message popup stays open.

## Pending-mail notification

A red count bubble on the top-right profile button and the Mailbox menu option shows visible messages that are unread **or** have unclaimed attachments. A mail meeting both conditions counts once. Reading a plain message clears its notification immediately; reading reward mail leaves it pending until claimed. Expired messages do not count. The count refreshes after read/claim/expiry, on opening the account menu, on returning to the tab, and once per minute while the tab is visible. Signing out clears the badge and discards pending responses.

`node tests/mailbox-hard-expiry-database-test.mjs` verifies the seven-day backfill, future/custom/default/broadcast deadlines, expired unclaimed rewards, multiple potion claims, legacy publication retries and RPC signature compatibility. The publisher browser suite covers multiple and duplicate potion rows, past-date validation, custom dates and the seven-day default after reset.
