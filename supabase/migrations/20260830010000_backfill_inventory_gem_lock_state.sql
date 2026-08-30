-- Older inventory rows can predate the required lock-state default. They are
-- visibly unlocked in the inventory UI but `locked = false` server queries do
-- not match NULL, which prevents those specimens from being deposited.

begin;

update public.inventory_gems
set locked = false
where locked is null;

alter table public.inventory_gems
  alter column locked set default false,
  alter column locked set not null;

commit;
