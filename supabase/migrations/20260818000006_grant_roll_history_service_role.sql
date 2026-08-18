-- The roll edge function (service_role) writes roll_weight_history and
-- best_roll_history, but those tables were created without granting
-- service_role INSERT — so the weight-history and Best Roll leaderboard
-- updates silently failed (permission denied, caught + logged). Grant
-- the DML the function needs.
grant select, insert, update, delete on public.roll_weight_history to service_role;
grant select, insert, update, delete on public.best_roll_history to service_role;
