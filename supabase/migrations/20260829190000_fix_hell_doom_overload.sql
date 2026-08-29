-- The four-argument helper introduced with Hell artifact passives declared
-- p_player_id DEFAULT NULL while the original three-argument helper remained.
-- That made every three-argument runtime call ambiguous (Postgres 42725).
-- Runtime state already carries doomGainMultiplier, so retain the established
-- three-argument API and remove the unused overload.

drop function if exists public.abandoned_mine_hell_add_doom(jsonb,integer,integer,uuid);

