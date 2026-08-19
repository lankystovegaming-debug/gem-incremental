# Private Features deployment

Deploy the folder `supabase/functions/private-features` as the Edge Function named `private-features`.

## Database setup

Run these migrations in order:

1. `supabase/migrations/20260819000001_upcoming_features_progression.sql`
2. `supabase/migrations/20260819000002_upcoming_features_seed.sql`

**Important:** `20260819000001` only creates the tables. `20260819000002` is what actually inserts the starter achievements and quests. You do **not** need to rerun `000001` if it has already been applied.

The Edge Function also has an idempotent `seed` action and can bootstrap the examples if the definitions table is empty, but the SQL seed migration means a fresh database is populated immediately.

## Access

The owner ID and password are at the top of `index.ts`:
- `PRIVATE_FEATURE_OWNER_USER_IDS`
- `PRIVATE_FEATURE_ADMIN_USER_IDS`
- `PRIVATE_FEATURE_PASSWORD`

The browser's Upcoming link uses `whoami` without the password. The server still enforces the owner/admin gate. The password is required for all mutation/list actions.

Password: `lankygem`
