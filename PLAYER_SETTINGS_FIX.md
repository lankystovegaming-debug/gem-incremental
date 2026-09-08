# Player Settings 403 Fix

Run:

`supabase/migrations/20260908000013_fix_player_settings_permissions.sql`

This fixes the browser error:

`permission denied for table player_settings (42501)`

It grants the Supabase `authenticated` role table access while Row Level Security still restricts each player to their own settings row.

The GoTrueClient `lock option is deprecated` warning is unrelated and harmless.
