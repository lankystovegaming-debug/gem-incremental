# Private Features deployment

Deploy the folder `supabase/functions/private-features` as the Edge Function named `private-features`.

The function is intentionally self-contained. It does **not** import a `_shared` or `shared` file, so Supabase will not remove a required source file.

Before using `list`, `seed`, `save`, `delete`, or `progress`, apply:
`supabase/migrations/20260819000001_upcoming_features_progression.sql`

The owner ID and password are at the top of `index.ts`:
- `PRIVATE_FEATURE_OWNER_USER_IDS`
- `PRIVATE_FEATURE_ADMIN_USER_IDS`
- `PRIVATE_FEATURE_PASSWORD`

The browser's Upcoming link uses `whoami` without the password. The server still enforces the owner/admin gate. The password is required for all mutation/list actions.
