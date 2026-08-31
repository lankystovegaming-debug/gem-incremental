begin;

create schema if not exists private_auth authorization postgres;
revoke all on schema private_auth from public, anon, authenticated;
grant usage on schema private_auth to supabase_auth_admin, service_role;

-- Gmail ignores dots in the local part and routes +tags to the same inbox.
-- googlemail.com is the same mailbox namespace as gmail.com. Other providers
-- retain their exact normalized address because their alias rules vary.
create or replace function private_auth.canonical_account_email(p_email text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_email text := lower(trim(p_email));
  v_local text;
  v_domain text;
begin
  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := split_part(v_local, '+', 1);
    v_local := replace(v_local, '.', '');
    return v_local || '@gmail.com';
  end if;

  return v_email;
end;
$function$;

revoke all on function private_auth.canonical_account_email(text)
  from public, anon, authenticated;
grant execute on function private_auth.canonical_account_email(text)
  to supabase_auth_admin, service_role;

create table if not exists private_auth.account_email_claims (
  canonical_email text primary key,
  user_id uuid not null unique,
  claimed_at timestamptz not null default now()
);

revoke all on table private_auth.account_email_claims
  from public, anon, authenticated;
grant select, insert, update, delete on table private_auth.account_email_claims
  to supabase_auth_admin, service_role;

-- Preserve every existing account. Where aliases already duplicated an inbox,
-- the oldest account owns the canonical claim and later accounts remain usable.
insert into private_auth.account_email_claims(canonical_email, user_id, claimed_at)
select distinct on (private_auth.canonical_account_email(auth_user.email))
  private_auth.canonical_account_email(auth_user.email),
  auth_user.id,
  coalesce(auth_user.created_at, now())
from auth.users auth_user
where auth_user.email is not null
order by
  private_auth.canonical_account_email(auth_user.email),
  auth_user.created_at,
  auth_user.id
on conflict do nothing;

create or replace function private_auth.claim_account_email()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_canonical text;
begin
  if tg_op = 'DELETE' then
    delete from private_auth.account_email_claims claim
    where claim.user_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.email is not distinct from old.email then
    return new;
  end if;

  delete from private_auth.account_email_claims claim
  where claim.user_id = new.id;

  if new.email is null then return new; end if;

  v_canonical := private_auth.canonical_account_email(new.email);
  insert into private_auth.account_email_claims(canonical_email, user_id)
  values (v_canonical, new.id)
  on conflict (canonical_email) do update
    set user_id = excluded.user_id
    where private_auth.account_email_claims.user_id = excluded.user_id;

  if not found then
    raise exception 'email_inbox_already_registered'
      using errcode = '23505',
        detail = 'Gmail dots and +tags do not create a separate inbox.';
  end if;

  return new;
end;
$function$;

revoke all on function private_auth.claim_account_email()
  from public, anon, authenticated;
grant execute on function private_auth.claim_account_email()
  to supabase_auth_admin, service_role;

drop trigger if exists enforce_canonical_account_email on auth.users;
create trigger enforce_canonical_account_email
after insert or update of email or delete on auth.users
for each row execute function private_auth.claim_account_email();

-- Configure this as Authentication > Hooks > Before User Created for a clear
-- client-facing error. The trigger above remains the concurrency-safe guard
-- and also covers email linking on existing anonymous accounts.
create or replace function private_auth.before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_email text := event->'user'->>'email';
  v_canonical text;
begin
  if v_email is null or coalesce((event->'user'->>'is_anonymous')::boolean, false) then
    return '{}'::jsonb;
  end if;

  v_canonical := private_auth.canonical_account_email(v_email);
  if exists (
    select 1
    from private_auth.account_email_claims claim
    where claim.canonical_email = v_canonical
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 422,
        'message', 'Gmail aliases cannot be used to create separate accounts. Sign in to the existing account or use another inbox.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$function$;

revoke all on function private_auth.before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function private_auth.before_user_created(jsonb)
  to supabase_auth_admin;

commit;
