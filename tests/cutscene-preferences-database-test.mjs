import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const uid = "00000000-0000-0000-0000-000000000001";
await db.exec(`
  create schema auth;
  create role authenticated;
  create role anon;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.player_settings(
    player_id uuid primary key,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );
  create function public.update_qol_settings(p_patch jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    uid uuid := auth.uid();
    saved jsonb;
    key text;
  begin
    if uid is null then raise exception 'not_authenticated'; end if;
    for key in select jsonb_object_keys(p_patch) loop
      if key not in ('autoRoll', 'rollAnimations') then raise exception 'unknown_setting'; end if;
    end loop;
    insert into public.player_settings(player_id, settings)
    values(uid, p_patch)
    on conflict(player_id) do update
      set settings = public.player_settings.settings || excluded.settings,
          updated_at = now()
    returning settings into saved;
    return saved;
  end;
  $$;
  grant execute on function public.update_qol_settings(jsonb) to authenticated;
`);

await db.exec(readFileSync(new URL(
  "../supabase/migrations/20260923042004_cutscene_preferences.sql",
  import.meta.url
), "utf8"));
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
await db.exec("set role authenticated");

const save = async (patch) => (await db.query(
  "select public.update_qol_settings($1) result",
  [patch]
)).rows[0].result;

let saved = await save({ autoRoll: true, cutscenesEnabled: false, skipSeenCutscenes: true });
assert.equal(saved.autoRoll, true);
assert.equal(saved.cutscenesEnabled, false);
assert.equal(saved.skipSeenCutscenes, true);

saved = await save({ cutscenesEnabled: true });
assert.equal(saved.autoRoll, true, "saving a cutscene preference must preserve established settings");
assert.equal(saved.cutscenesEnabled, true);
assert.equal(saved.skipSeenCutscenes, true);

await assert.rejects(() => save({ cutscenesEnabled: "true" }), /invalid_boolean/);
await assert.rejects(() => save({ unrecognised: true }), /unknown_setting/);

await db.close();
console.log("Cutscene preferences preserve existing QoL validation and cloud-sync both booleans.");
