import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [cli, adminJs, indexHtml] = await Promise.all([
  readFile(new URL("../admin/adminCli.js", import.meta.url), "utf8"),
  readFile(new URL("../admin/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../admin/index.html", import.meta.url), "utf8")
]);

// The admin CLI is its own module, built on the shared terminal widget.
assert.match(cli, /export function mountAdminCli/);
assert.match(cli, /from "\.\.\/src\/ui\/cli\/terminal\.js"/);
assert.match(cli, /adminRequest/);

// Every command that mirrors a UI function is present.
const commands = [
  "check", "search", "inspect", "meta",
  "money", "gem", "potion", "mutationluck", "coins", "capacity", "rolls", "boost", "oneroll",
  "grantallpotions", "grantallgems", "clearinv", "deletegem", "cooldown", "title", "lbvis",
  "lock", "ban", "unban", "baninfo", "appeals", "appeal",
  "announce",
  "analytics", "marketfees", "museum", "bank", "shareholders",
  "guilds", "referrals",
  "sharedips", "whitelist",
  "sections", "section", "mutations",
  "codes", "code", "events", "event"
];
for (const name of commands) {
  assert.match(cli, new RegExp(`name: "${name}"`), `admin CLI missing command: ${name}`);
}

// Each command maps to the real backend call the UI uses. Some RPCs are
// dispatched through a helper (rpc(term, "name", …)), so assert the RPC-name
// literals rather than a fixed call shape.
assert.match(cli, /adminRequest\("search"/);
assert.match(cli, /adminRequest\("inspect"/);
assert.match(cli, /supabase\.rpc\("admin_ban_player"/);
assert.match(cli, /supabase\.rpc\("admin_unban_player"/);
assert.match(cli, /supabase\.rpc\("get_admin_analytics"/);
assert.match(cli, /supabase\.rpc\("post_announcement"/);
for (const name of [
  "admin_get_bank_overview", "admin_get_guild_roster", "admin_find_shared_ips",
  "admin_referral_stats", "admin_get_shareholders", "admin_list_ip_whitelist",
  "admin_add_ip_whitelist", "admin_remove_ip_whitelist", "admin_get_account_meta",
  "admin_get_ban"
]) {
  assert.match(cli, new RegExp(`"${name}"`), `admin CLI missing rpc: ${name}`);
}
assert.match(cli, /appeals_review/);

// Destructive commands require a confirmation step. playerAction gates on a
// confirm-summary argument; ban/unban call term.confirm directly.
assert.match(cli, /if \(confirmSummary && !\(await term\.confirm\(/);
for (const guarded of ["clearinv", "deletegem"]) {
  const slice = cli.slice(cli.indexOf(`name: "${guarded}"`), cli.indexOf(`name: "${guarded}"`) + 1200);
  assert.match(slice, /playerAction\([\s\S]*(Delete|delete)/, `command '${guarded}' should pass a confirm summary`);
}
for (const guarded of ["ban", "unban"]) {
  const slice = cli.slice(cli.indexOf(`name: "${guarded}"`), cli.indexOf(`name: "${guarded}"`) + 1400);
  assert.match(slice, /term\.confirm\(/, `command '${guarded}' should confirm before acting`);
}

// The admin page mounts the CLI as its own tab.
assert.match(adminJs, /import \{ mountAdminCli \} from "\.\/adminCli\.js"/);
assert.match(adminJs, /cli: \["#cliPanel"\]/);
assert.match(adminJs, /cli: \(\) => mountAdminCli\(\{ mount: document\.getElementById\("cliPanel"\) \}\)/);
assert.match(indexHtml, /data-admin-tab="cli"/);
assert.match(indexHtml, /id="cliPanel"/);

console.log("admin-cli checks passed");
