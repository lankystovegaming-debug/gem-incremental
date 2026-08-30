import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [migration, features, page, script, css] = await Promise.all([
  read("../supabase/migrations/20260828170000_guild_logos.sql"),
  read("../supabase/functions/features/index.ts"),
  read("../guilds/index.html"),
  read("../guilds/guilds.js"),
  read("../guilds/guilds.css")
]);

assert.match(migration, /add column if not exists logo_path text/);
assert.match(migration, /'guild-logos'/);
assert.match(migration, /file_size_limit[\s\S]*2097152/);
assert.match(migration, /allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
assert.match(migration, /can_manage_guild_logo/);
assert.match(migration, /g\.owner_id = auth\.uid\(\)/);
assert.match(migration, /m\.role = 'owner'/);
assert.match(features, /guild-update-logo/);
assert.match(features, /guild-remove-logo/);
assert.match(features, /guildOwnedBy/);
assert.match(features, /function missingGuildLogoColumn/);
assert.match(features, /error\?\.code==="42703"/);
assert.match(features, /select\("id"\).*owner_id/);
assert.match(features, /legacy\.data\?\?\[\]\)\.map\(\(guild:any\)=>\(\{\.\.\.guild,logo_path:null\}\)\)/);
assert.match(features, /GUILD_LOGO_DISBAND_OBJECT_REMOVE/);
assert.match(page, /id="guildLogoInput"/);
assert.match(page, /id="uploadGuildLogo"/);
assert.match(page, /id="removeGuildLogo"/);
assert.match(script, /GUILD_LOGO_BUCKET="guild-logos"/);
assert.match(script, /MAX_GUILD_LOGO_BYTES=2\*1024\*1024/);
assert.match(script, /uploadGuildLogo/);
assert.match(script, /renderGuildLogo/);
assert.match(css, /\.guild-emblem img/);

console.log("Guild logo tests passed.");
