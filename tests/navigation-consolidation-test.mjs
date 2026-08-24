import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const shell=read("src/ui/shell.js");
assert.doesNotMatch(shell,/id: "lootbox"/);
assert.doesNotMatch(shell,/id: "stats"/);
assert.match(shell,/id: "boosts".*label: "Shop"/);
assert.match(shell,/id: "leaderboards".*label: "Leaderboards"/);
assert.match(read("boosts/index.html"),/Shop sections[\s\S]*Mining Caches/);
assert.match(read("lootbox/index.html"),/Shop sections[\s\S]*aria-current="page">Mining Caches/);
assert.match(read("leaderboards/index.html"),/Records sections[\s\S]*My Stats/);
assert.match(read("debug/index.html"),/Records sections[\s\S]*aria-current="page">My Stats/);
assert.match(read("lootbox/lootbox.js"),/page\s*:\s*"boosts"/);
assert.match(read("debug/debug.js"),/page: "leaderboards"/);
console.log("Navigation consolidation tests passed.");
