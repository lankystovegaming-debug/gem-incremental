# Global random events deployment

The repository contains the complete migration and Edge Function changes, but
they are intentionally not deployed automatically.

## Order

1. Deploy `20260901011651_global_random_events_schema.sql`.
2. Deploy `20260901011652_global_random_events_scheduler.sql`.
3. Deploy the `roll` Edge Function, including both `index.ts` and
   `eventRules.ts`.
4. Deploy the website.
5. Enable the scheduler only after the new roll function and site are live:

```sql
update public.global_event_runtime
set enabled = true,
    next_start_at = clock_timestamp(),
    updated_at = clock_timestamp()
where singleton = true;
```

The Cron job is installed by the second migration, but the singleton runtime
starts disabled. Therefore applying the migrations alone cannot start an event.

## Pause or rollback

Pause natural events without deleting history:

```sql
update public.global_event_runtime
set enabled = false,
    updated_at = clock_timestamp()
where singleton = true;
```

Any already-active occurrence remains recorded. To stop it immediately:

```sql
update public.global_event_occurrences
set status = 'cancelled',
    updated_at = clock_timestamp()
where status = 'active';

update public.global_event_runtime
set active_occurrence_id = null,
    updated_at = clock_timestamp()
where singleton = true;
```

## Verification

```sql
select public.advance_global_random_event();
select public.get_active_global_event();

select jobid, jobname, schedule, active
from cron.job
where jobname = 'advance-global-random-events';
```

Check the Edge Function logs after several rolls. Successful rolls should add
to `global_roll_activity_minute`; Singularity rolls also advance occurrence
Mass. The next event timestamp is stored only in the protected runtime table
and is never returned by the public snapshot RPC.
