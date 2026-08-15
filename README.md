# Gem Incremental

A browser incremental game about rolling for gems, building a
collection and crafting equipment that improves the next roll.

Live at [gemincremental.com](https://gemincremental.com).

Every action that changes a save is decided by a Supabase Edge
Function, so the client never grants itself money, gems or
equipment. The pages here are a static front end over that API —
there is no build step.

## Playing

- **Roll** — pull one gem from the deposit. Each roll has a
  server-enforced cooldown. `R` or `Space` rolls too.
- **Inventory** — lock the gems you want to keep, sell the rest,
  and buy storage upgrades.
- **Crafting** — spend gems and money on pickaxes, lanterns,
  boots and bags. Auto Craft deposits matching gems the moment
  they are rolled.
- **Gem Index** — a record of every gem, revealed as you find it.
- **Leaderboards** — total rolls, rarest gem and lifetime
  earnings, for players who have set a username.
- **Stats** — your bonuses and lifetime records.
- **Settings** — theme, accent colour and automation.
- **Account** — turn a guest save into a permanent account.

### Automation

Auto roll and auto sell are on the Roll page and in Settings.
Both are device preferences, not server state: the server still
authorises every individual roll and sale.

- **Auto roll** keeps rolling while the Roll page is open. It
  stops on its own if the inventory fills up or several rolls
  fail in a row.
- **Auto sell** sells freshly rolled gems up to the tier you
  choose. Anything rarer is kept, and locked gems are never
  touched.

### Accounts and saves
 
Players start as an anonymous guest so the game is playable
immediately. That guest session is the **only** key to that
save — there is no way to sign back into an anonymous user once
its session is gone. The interface therefore never signs a guest
out, and never signs a guest into a different account while
their save still holds progress.

Two routes make a guest save permanent, and both keep the same
player id, so nothing is lost:

- **Email and password**, on the Account page.
- **Google**, which links the identity to the existing guest
  user rather than creating a second one.

The Google button only appears when the provider is actually
enabled on the project — the client reads `/auth/v1/settings`
and hides what is not configured, so nothing is offered that
would fail.

## Layout

```
index.html          Roll page
inventory/          Collection and storage upgrades
crafting/           Recipes, deposits and Auto Craft
gem-index/          Gem encyclopaedia
leaderboards/       Public rankings
account/            Email, password and username
debug/              Stats page
settings/           Appearance and automation
src/data/           Gem and recipe tables (shared with the server)
src/logic/          Pure game rules, unit tested under tests/
src/backend/        Supabase client, auth and cloud reads
src/ui/             Shell, theme, toasts, dialogs, formatting
src/styles/app.css  Design tokens and shared components
src/assets/fonts/   Self-hosted Inter (latin + latin-ext subsets)
tests/              Node test scripts and one-off migration pages
```

## Running locally

Any static file server works, as long as it serves the directory
root — the pages use relative paths and ES modules, which will
not load over `file://`.

```bash
python -m http.server 8423
```

Then open <http://localhost:8423>.

## Supabase setup

The client points at a project via the publishable key in
`src/backend/supabase.js`.

### Player rows

The Edge Functions reject requests with `Player record not
found.` unless `public.players` holds a row for the signed-in
user. `ensureCloudPlayer()` creates it on load, which is enough,
but a trigger removes the round trip and the failure mode:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.players (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### Google sign-in (optional)

Google stays hidden in the interface until it is configured, so
these steps are only needed to offer it:

- Enable the **Google** provider under *Authentication →
  Providers*, using a Google OAuth client whose authorised
  redirect URI is
  `https://<project>.supabase.co/auth/v1/callback`.
- Enable **manual linking** in the project's authentication
  settings. Without it a guest cannot attach Google to an
  existing save, and the interface says so rather than risking
  the save.
- Add the site to the **Redirect URLs** allow list, including
  the sub-pages players can sign in from:

  ```
  https://gemincremental.com/**
  http://localhost:8423/**
  ```

## Tests

The pure game logic has Node test scripts:

```bash
node tests/rolling-test.js
node tests/weight-test.js
node tests/inventory-test.js
node tests/roll-result-test.js
```

The `tests/*.html` files are one-off migration and diagnostic
tools, not part of the game.
