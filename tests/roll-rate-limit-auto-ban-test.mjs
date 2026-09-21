import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260917070235_add_roll_rate_limit_system_ban.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);

assert.match(edge, /Ratelimit\.slidingWindow\(ROLL_RATE_LIMIT_MAX_REQUESTS, "10 s"\)/);
assert.match(edge, /prefix: "ratelimit:roll"/);
assert.match(edge, /from "npm:@upstash\/redis@1\.38\.4"/);
assert.match(edge, /from "npm:@upstash\/ratelimit@2\.1\.0"/);
assert.match(edge, /await rollRequestRateLimit\.limit\(playerId\)/);
assert.match(edge, /"apply_roll_rate_limit_permanent_ban"/);
assert.match(edge, /const rateLimitResponse = await enforceRollRequestRateLimit\(ctx\)/);
assert.match(edge, /if \(rateLimitResponse\) return rateLimitResponse/);
assert.match(edge, /cors: "disabled"/);
assert.match(edge, /if \(req\.method === "OPTIONS"\)/);

const rateLimitCheckIndex = edge.indexOf("const rateLimitResponse = await enforceRollRequestRateLimit(ctx)");
const bodyParseIndex = edge.indexOf("requestBody = await req.json()", rateLimitCheckIndex);
assert.ok(rateLimitCheckIndex > 0 && bodyParseIndex > rateLimitCheckIndex);

globalThis.Deno = { env: { get: () => "test" } };
globalThis.__rollRateLimitResult = { success: true, limit: 120, reset: Date.now() + 10_000 };
let executableEdge = edge
  .replace(
    /import\s*\{\s*withSupabase\s*\}\s*from\s*"npm:@supabase\/server";/,
    "const withSupabase=(_options,handler)=>handler;"
  )
  .replace(
    /import\s*\{\s*Redis\s*\}\s*from\s*"npm:@upstash\/redis@1\.38\.4";/,
    "class Redis { constructor() {} }"
  )
  .replace(
    /import\s*\{\s*Ratelimit\s*\}\s*from\s*"npm:@upstash\/ratelimit@2\.1\.0";/,
    "class Ratelimit { static slidingWindow(){return null;} async limit(){const result=globalThis.__rollRateLimitResult;if(result instanceof Error)throw result;return result;} }"
  );
executableEdge = stripTypeScriptTypes(executableEdge);
const edgeModule = await import(
  `data:text/javascript;base64,${Buffer.from(executableEdge).toString("base64")}`
);
const { rollCorsHeaders, enforceRollRequestRateLimit } = edgeModule;

const productionCorsHeaders = rollCorsHeaders("https://gemincremental.com");
assert.equal(productionCorsHeaders["Access-Control-Allow-Origin"], "https://gemincremental.com");
assert.equal(productionCorsHeaders["Access-Control-Allow-Credentials"], "true");
assert.equal(productionCorsHeaders["Access-Control-Max-Age"], "86400");
assert.equal(rollCorsHeaders("http://127.0.0.1:5500")["Access-Control-Allow-Origin"], "http://127.0.0.1:5500");
assert.equal(rollCorsHeaders("https://attacker.example"), null);
assert.equal(rollCorsHeaders(null), null);
for (const requiredHeader of [
  "authorization",
  "apikey",
  "content-type",
  "priority",
  "x-client-info",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage"
]) {
  assert.ok(productionCorsHeaders["Access-Control-Allow-Headers"].includes(requiredHeader));
}

const allowedPreflight = await edgeModule.default.fetch(new Request(
  "https://example.supabase.co/functions/v1/roll",
  { method: "OPTIONS", headers: { Origin: "https://gemincremental.com" } }
));
assert.equal(allowedPreflight.status, 204);
assert.equal(allowedPreflight.headers.get("Access-Control-Allow-Origin"), "https://gemincremental.com");
assert.equal(allowedPreflight.headers.get("Access-Control-Max-Age"), "86400");

const rejectedPreflight = await edgeModule.default.fetch(new Request(
  "https://example.supabase.co/functions/v1/roll",
  { method: "OPTIONS", headers: { Origin: "https://attacker.example" } }
));
assert.equal(rejectedPreflight.status, 403);
assert.equal(rejectedPreflight.headers.get("Access-Control-Allow-Origin"), null);

let banRpc = null;
const rateLimitContext = {
  userClaims: { id: "00000000-0000-0000-0000-000000000001" },
  supabaseAdmin: {
    rpc: async (name, args) => {
      banRpc = { name, args };
      return {
        data: {
          bannedUntil: "2126-09-17T00:00:00.000Z",
          reason: "Automated permanent ban: roll request rate limit exceeded."
        },
        error: null
      };
    }
  }
};

assert.equal(await enforceRollRequestRateLimit(rateLimitContext), null);
assert.equal(banRpc, null);

globalThis.__rollRateLimitResult = { success: false, limit: 120, reset: Date.now() + 10_000 };
const bannedResponse = await enforceRollRequestRateLimit(rateLimitContext);
assert.equal(bannedResponse.status, 403);
assert.equal((await bannedResponse.json()).error, "banned");
assert.equal(banRpc.name, "apply_roll_rate_limit_permanent_ban");
assert.deepEqual(banRpc.args, {
  p_player_id: rateLimitContext.userClaims.id,
  p_limit: 120,
  p_window_seconds: 10
});

banRpc = null;
globalThis.__rollRateLimitResult = new Error("the cached ban should bypass redis");
const cachedBanResponse = await enforceRollRequestRateLimit(rateLimitContext);
assert.equal(cachedBanResponse.status, 403);
assert.equal((await cachedBanResponse.json()).error, "banned");
assert.equal(banRpc, null);

globalThis.__rollRateLimitResult = new Error("redis unavailable");
const unavailableResponse = await enforceRollRequestRateLimit({
  ...rateLimitContext,
  userClaims: { id: "00000000-0000-0000-0000-000000000099" }
});
assert.equal(unavailableResponse.status, 503);
assert.equal((await unavailableResponse.json()).error, "rate_limit_unavailable");

const db = new PGlite();
const playerId = "00000000-0000-0000-0000-000000000001";
const otherId = "00000000-0000-0000-0000-000000000002";
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create table public.players (id uuid primary key);
  create table public.user_roll_luck_rarity_mult (
    player_id uuid primary key references public.players(id),
    active_until timestamptz not null,
    note text,
    applied_at timestamptz not null default now(),
    applied_by uuid
  );
  insert into public.players(id) values ('${playerId}'), ('${otherId}');
`);
await db.exec(migration);

assert.equal(
  (await one(
    "select has_function_privilege('authenticated', 'public.apply_roll_rate_limit_permanent_ban(uuid,integer,integer)', 'execute') allowed"
  )).allowed,
  false
);
assert.equal(
  (await one(
    "select has_function_privilege('service_role', 'public.apply_roll_rate_limit_permanent_ban(uuid,integer,integer)', 'execute') allowed"
  )).allowed,
  true
);

const first = (await one(
  "select public.apply_roll_rate_limit_permanent_ban($1, 120, 10) result",
  [playerId]
)).result;
assert.equal(first.reason, "Automated permanent ban: roll request rate limit exceeded.");
assert.equal(first.limit, 120);
assert.equal(first.windowSeconds, 10);
assert.ok(new Date(first.bannedUntil).getTime() > Date.now() + 99 * 365 * 24 * 60 * 60 * 1000);

const second = (await one(
  "select public.apply_roll_rate_limit_permanent_ban($1, 120, 10) result",
  [playerId]
)).result;
assert.equal(second.appliedAt, first.appliedAt);

await db.query(
  `insert into public.user_roll_luck_rarity_mult(player_id, active_until, note)
   values ($1, now() + interval '1 day', 'Manual temporary ban')`,
  [otherId]
);
const upgraded = (await one(
  "select public.apply_roll_rate_limit_permanent_ban($1, 120, 10) result",
  [otherId]
)).result;
assert.equal(upgraded.reason, first.reason);
assert.ok(new Date(upgraded.bannedUntil).getTime() > Date.now() + 99 * 365 * 24 * 60 * 60 * 1000);

await assert.rejects(
  () => db.query(
    "select public.apply_roll_rate_limit_permanent_ban($1, 0, 10)",
    [playerId]
  ),
  /invalid_rate_limit_evidence/
);

await db.close();
console.log("Roll request rate-limit permanent-ban checks passed.");
