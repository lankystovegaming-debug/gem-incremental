-- Install each Deepcore trigger in its own short transaction. The live roll
-- path can touch players -> inventory_gems while inventory insert triggers can
-- touch those relations in the opposite direction. Never hold a DDL lock on
-- one hot table while waiting for the other.

set lock_timeout = '10s';
set statement_timeout = '30s';

begin;
drop trigger if exists deepcore_track_rolls on public.players;
create trigger deepcore_track_rolls
after update of total_rolls on public.players
for each row
when (new.total_rolls > old.total_rolls)
execute function deepcore_private.track_rolls();
commit;

begin;
drop trigger if exists deepcore_track_specimen on public.inventory_gems;
create trigger deepcore_track_specimen
after insert on public.inventory_gems
for each row
execute function deepcore_private.track_specimen();
commit;

reset lock_timeout;
reset statement_timeout;
