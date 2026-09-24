// =========================================================
// PLAYER CLI
//
// A power-user command console for normal players, opened with the
// backtick (`) key or the floating "⌨" button on any page. It drives
// the same server-authoritative endpoints the UI uses (sell, craft,
// market, settings) — it grants no new powers, just faster, richer,
// scriptable control with automation loops that keep running while the
// console is closed. Built on the shared terminal widget in this folder;
// separate command set from the maintenance/admin CLIs.
// =========================================================

import { createCliTerminal } from "./terminal.js";
import {
  loadCloudGems, sellCloudGem, deleteCloudGem, toggleCloudGemLock, loadCloudPlayerState
} from "../../backend/cloudInventory.js";
import { loadCloudCraftingState, craftCloudRecipe } from "../../backend/cloudCrafting.js";
import { createAuctionLot, loadMyAuctions, cancelAuction } from "../../backend/cloudAuctions.js";
import recipes from "../../data/recipes.js";
import { getSettings, updateSettings } from "../settings.js";
import { formatMoney, formatCount } from "../format.js";
import { notify } from "../toast.js";


const STORAGE_KEY = "gemPlayerCli";

const DEFAULTS = {
  // Sell rules — a gem is a sell candidate when it passes every set filter.
  sellMaxRarity: null,   // sell gems with rarity (1 in N) <= this
  sellMaxValue: null,    // sell gems worth <= this
  sellNames: [],         // restrict to these gem names (empty = any)
  sellKeepLocked: true,  // never sell locked gems
  sellKeepHeaviest: 0,   // keep the N heaviest of each gem name
  autosell: false,
  sellMaxPerTick: 50,

  // Craft — a queue of recipe ids the loop tries each tick.
  craftQueue: [],
  autocraft: false,

  // Market — auto-list rules {name, minRarity, price, hours}.
  marketRules: [],
  automarket: false,
  marketConfirm: true,   // when on, automarket only reports; you /market flush to list
  marketMaxPerRun: 5,

  loopSeconds: 3
};

const NUMERIC_KEYS = new Set([
  "sellMaxRarity", "sellMaxValue", "sellKeepHeaviest", "sellMaxPerTick", "marketMaxPerRun", "loopSeconds"
]);
const BOOL_KEYS = new Set(["sellKeepLocked", "autosell", "autocraft", "automarket", "marketConfirm"]);

let settings = load();
let panel = null;
let term = null;
let loopTimer = null;
let running = false;
const logBuffer = [];
let pendingMarket = [];


function load() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* per-viewer convenience only */ }
}

// Print to the console if open; always keep a small ring buffer so
// background automation is visible next time it's opened.
function log(text, variant = "info") {
  logBuffer.push({ text, variant });

  if (logBuffer.length > 200) {
    logBuffer.shift();
  }

  if (term) {
    if (variant === "error") term.printError(text);
    else if (variant === "success") term.printSuccess(text);
    else if (variant === "muted") term.printMuted(text);
    else term.print(text);
  }
}


// =========================================================
// GEM FILTERING
// =========================================================

function sellCandidates(gems) {
  const keepLocked = settings.sellKeepLocked;
  const keepN = Math.max(0, Number(settings.sellKeepHeaviest) || 0);
  const names = (settings.sellNames || []).map((n) => n.toLowerCase());

  // Which specimens to protect as the heaviest-per-name.
  const protectedIds = new Set();
  if (keepN > 0) {
    const byName = new Map();
    for (const gem of gems) {
      const list = byName.get(gem.gem_name) || [];
      list.push(gem);
      byName.set(gem.gem_name, list);
    }
    for (const list of byName.values()) {
      list.sort((a, b) => Number(b.final_weight ?? 0) - Number(a.final_weight ?? 0));
      for (const gem of list.slice(0, keepN)) protectedIds.add(gem.id);
    }
  }

  const hasRule = settings.sellMaxRarity != null || settings.sellMaxValue != null || names.length > 0;
  if (!hasRule) {
    return { candidates: [], noRule: true };
  }

  const candidates = gems.filter((gem) => {
    if (keepLocked && gem.locked) return false;
    if (protectedIds.has(gem.id)) return false;
    if (names.length && !names.includes(String(gem.gem_name).toLowerCase())) return false;
    if (settings.sellMaxRarity != null && Number(gem.rarity) > settings.sellMaxRarity) return false;
    if (settings.sellMaxValue != null && Number(gem.value) > settings.sellMaxValue) return false;
    return true;
  });

  return { candidates, noRule: false };
}


// =========================================================
// AUTOMATION LOOPS
// =========================================================

function ensureLoop() {
  const wantLoop = settings.autosell || settings.autocraft || settings.automarket;

  if (wantLoop && !loopTimer) {
    loopTimer = setInterval(tick, Math.max(1000, (Number(settings.loopSeconds) || 3) * 1000));
  } else if (!wantLoop && loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

async function tick() {
  if (running) return; // never overlap two passes
  running = true;

  try {
    if (settings.autosell) await runAutoSell();
    if (settings.autocraft) await runAutoCraft();
    if (settings.automarket) await runAutoMarket();
  } catch (error) {
    log(`Loop error: ${error?.message ?? error}`, "error");
  } finally {
    running = false;
  }
}

async function runAutoSell() {
  const gems = await loadCloudGems();
  if (!Array.isArray(gems)) return;

  const { candidates, noRule } = sellCandidates(gems);
  if (noRule || !candidates.length) return;

  const cap = Math.max(1, Number(settings.sellMaxPerTick) || 50);
  let sold = 0;
  let earned = 0;

  for (const gem of candidates.slice(0, cap)) {
    const { data, error } = await sellCloudGem(gem.id);
    if (error) continue;
    sold += 1;
    earned += Number(data?.soldValue ?? 0);
  }

  if (sold) {
    log(`Auto-sold ${formatCount(sold)} gem(s) · +${formatMoney(earned)}`, "success");
    window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
  }
}

async function runAutoCraft() {
  const queue = settings.craftQueue || [];
  if (!queue.length) return;

  for (const recipeId of queue) {
    const { error } = await craftCloudRecipe(recipeId);
    if (!error) {
      log(`Auto-crafted ${recipeName(recipeId)}`, "success");
      window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
    }
    // requirements_incomplete / not_enough_money are expected — stay quiet.
  }
}

async function runAutoMarket() {
  const gems = await loadCloudGems();
  if (!Array.isArray(gems)) return;

  const matches = marketMatches(gems);
  if (!matches.length) return;

  if (settings.marketConfirm) {
    // Confirmation is on: don't list from the loop, just surface the count.
    if (matches.length !== pendingMarket.length) {
      log(`${formatCount(matches.length)} gem(s) match your market rules — run /market flush to list them.`, "muted");
    }
    pendingMarket = matches;
    return;
  }

  await listMatches(matches.slice(0, Math.max(1, Number(settings.marketMaxPerRun) || 5)));
}

function marketMatches(gems) {
  const out = [];
  for (const rule of settings.marketRules || []) {
    for (const gem of gems) {
      if (gem.locked) continue;
      if (String(gem.gem_name).toLowerCase() !== String(rule.name).toLowerCase()) continue;
      if (rule.minRarity != null && Number(gem.rarity) < Number(rule.minRarity)) continue;
      out.push({ gem, rule });
    }
  }
  return out;
}

async function listMatches(matches) {
  let listed = 0;
  for (const { gem, rule } of matches) {
    const { error } = await createAuctionLot(
      [{ type: "gem", id: gem.id }],
      Number(rule.price),
      Number(rule.hours) || 24
    );
    if (!error) listed += 1;
    else log(`Market: ${error.message ?? "could not list"} (${gem.gem_name})`, "error");
  }
  if (listed) {
    log(`Listed ${formatCount(listed)} gem(s) on the market.`, "success");
    window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
  }
  return listed;
}


function recipeName(recipeId) {
  const recipe = recipes.find((r) => r.id === recipeId);
  return recipe ? recipe.name : recipeId;
}


// =========================================================
// COMMANDS
// =========================================================

function setToggle(key, value, term) {
  settings[key] = value === "on" || value === true;
  save();
  ensureLoop();
  term.printSuccess(`${key} ${settings[key] ? "on" : "off"}.`);
}

function buildCommands() {
  const config = {
    name: "config", group: "General", usage: "/config",
    summary: "Show all current settings.",
    run(args, t) {
      t.keyValues(Object.entries(settings).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : String(v)]));
    }
  };

  const set = {
    name: "set", group: "General", usage: "/set <key> <value|off>",
    summary: "Change a setting (see /config for keys). Use 'off' to clear a number.",
    suggest(args) { return args.length === 0 ? Object.keys(DEFAULTS) : []; },
    run(args, t) {
      const key = args[0];
      if (!(key in DEFAULTS)) { t.printError(`Unknown setting '${key}'. See /config.`); return; }
      const raw = args.slice(1).join(" ");
      if (BOOL_KEYS.has(key)) settings[key] = /^(on|true|1|yes)$/i.test(raw);
      else if (NUMERIC_KEYS.has(key)) settings[key] = /^(off|none|null|)$/i.test(raw) ? null : Number(raw);
      else t.printError(`'${key}' can't be set directly — use its command.`);
      save();
      ensureLoop();
      t.printSuccess(`${key} = ${settings[key]}`);
    }
  };

  const logCmd = {
    name: "log", group: "General", usage: "/log",
    summary: "Replay recent automation activity.",
    run(args, t) {
      if (!logBuffer.length) { t.printMuted("No activity yet."); return; }
      for (const entry of logBuffer.slice(-40)) t.printMuted(entry.text);
    }
  };

  // ---- Selling ----
  const sell = {
    name: "sell", group: "Selling",
    usage: "/sell <now|tier|rarity|value|name|keeplocked|keep|rules>",
    summary: "Sell gems by rule, or configure the sell rules.",
    man: [
      "  /sell now                 sell everything matching the current rules right now",
      "  /sell rarity <N|off>      sell gems with rarity 1-in-N or lower (frequent gems)",
      "  /sell value <N|off>       sell gems worth N or less",
      "  /sell name <gem|off>      restrict selling to one gem name (repeat to add; 'off' clears)",
      "  /sell keep <N>            keep the N heaviest of each gem name",
      "  /sell keeplocked <on|off> never sell locked gems (default on)",
      "  /sell rules               show the current sell rules",
      "  /autosell <on|off>        sell continuously in the background"
    ],
    suggest(args) {
      if (args.length === 0) return ["now", "rarity", "value", "name", "keep", "keeplocked", "rules"];
      return [];
    },
    async run(args, t) {
      const sub = (args[0] || "").toLowerCase();

      if (sub === "rules" || sub === "") {
        t.keyValues([
          ["maxRarity", settings.sellMaxRarity ?? "—"],
          ["maxValue", settings.sellMaxValue ?? "—"],
          ["names", (settings.sellNames || []).join(", ") || "any"],
          ["keepHeaviest", settings.sellKeepHeaviest],
          ["keepLocked", settings.sellKeepLocked]
        ]);
        return;
      }
      if (sub === "rarity") { settings.sellMaxRarity = /^(off|none|)$/i.test(args[1] || "") ? null : Number(args[1]); save(); t.printSuccess(`sell max rarity = ${settings.sellMaxRarity ?? "off"}`); return; }
      if (sub === "value") { settings.sellMaxValue = /^(off|none|)$/i.test(args[1] || "") ? null : Number(args[1]); save(); t.printSuccess(`sell max value = ${settings.sellMaxValue ?? "off"}`); return; }
      if (sub === "keep") { settings.sellKeepHeaviest = Math.max(0, Math.trunc(Number(args[1]) || 0)); save(); t.printSuccess(`keep heaviest = ${settings.sellKeepHeaviest}`); return; }
      if (sub === "keeplocked") { setToggle("sellKeepLocked", (args[1] || "on").toLowerCase(), t); return; }
      if (sub === "name") {
        const name = args.slice(1).join(" ");
        if (/^(off|none|)$/i.test(name)) { settings.sellNames = []; save(); t.printSuccess("sell name filter cleared."); return; }
        settings.sellNames = [...new Set([...(settings.sellNames || []), name])]; save();
        t.printSuccess(`selling names: ${settings.sellNames.join(", ")}`); return;
      }
      if (sub === "now") {
        const gems = await loadCloudGems();
        if (!Array.isArray(gems)) { t.printError("Could not load inventory."); return; }
        const { candidates, noRule } = sellCandidates(gems);
        if (noRule) { t.printError("No sell rules set — configure /sell rarity/value/name first."); return; }
        if (!candidates.length) { t.printMuted("Nothing matches the sell rules."); return; }
        if (!(await t.confirm(`Sell ${formatCount(candidates.length)} gem(s) now?`))) return;
        let sold = 0, earned = 0;
        for (const gem of candidates) {
          const { data, error } = await sellCloudGem(gem.id);
          if (!error) { sold += 1; earned += Number(data?.soldValue ?? 0); }
        }
        t.printSuccess(`Sold ${formatCount(sold)} gem(s) · +${formatMoney(earned)}.`);
        window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
        return;
      }
      t.printError("See /man sell.");
    }
  };

  const autosell = {
    name: "autosell", group: "Selling", usage: "/autosell <on|off>",
    summary: "Continuously sell gems matching the sell rules.",
    suggest(args) { return args.length === 0 ? ["on", "off"] : []; },
    run(args, t) {
      if (settings.sellMaxRarity == null && settings.sellMaxValue == null && !(settings.sellNames || []).length && (args[0] || "").toLowerCase() === "on") {
        t.printError("Set a sell rule first (e.g. /sell rarity 100000).");
        return;
      }
      setToggle("autosell", (args[0] || "off").toLowerCase(), t);
    }
  };

  // ---- Crafting ----
  const craft = {
    name: "craft", group: "Crafting", usage: "/craft <recipeId>",
    summary: "Craft one recipe now (if its requirements are met).",
    suggest(args) { return args.length === 0 ? recipeIds() : []; },
    async run(args, t) {
      const id = args[0];
      if (!recipes.some((r) => r.id === id)) { t.printError(`Unknown recipe '${id}'. See /recipes.`); return; }
      const { error } = await craftCloudRecipe(id);
      if (error) { t.printError(error.message ?? "Could not craft (requirements not met?)."); return; }
      t.printSuccess(`Crafted ${recipeName(id)}.`);
      window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
    }
  };

  const autocraft = {
    name: "autocraft", group: "Crafting",
    usage: "/autocraft <add|remove|list|clear|on|off> [recipeId]",
    summary: "Queue several recipes; the loop crafts each whenever it can.",
    man: [
      "  /autocraft add <recipeId>     add a recipe to the queue",
      "  /autocraft remove <recipeId>  remove one",
      "  /autocraft list               show the queue",
      "  /autocraft clear              empty the queue",
      "  /autocraft on | off           run the queue continuously"
    ],
    suggest(args) {
      if (args.length === 0) return ["add", "remove", "list", "clear", "on", "off"];
      if (args.length === 1 && args[0] === "add") return recipeIds();
      if (args.length === 1 && args[0] === "remove") return settings.craftQueue || [];
      return [];
    },
    run(args, t) {
      const sub = (args[0] || "").toLowerCase();
      if (sub === "add") {
        const id = args[1];
        if (!recipes.some((r) => r.id === id)) { t.printError(`Unknown recipe '${id}'.`); return; }
        settings.craftQueue = [...new Set([...(settings.craftQueue || []), id])]; save();
        t.printSuccess(`Queued ${recipeName(id)} (${settings.craftQueue.length} total).`); return;
      }
      if (sub === "remove") { settings.craftQueue = (settings.craftQueue || []).filter((x) => x !== args[1]); save(); t.printSuccess("Removed."); return; }
      if (sub === "clear") { settings.craftQueue = []; save(); t.printSuccess("Queue cleared."); return; }
      if (sub === "list") {
        if (!(settings.craftQueue || []).length) { t.printMuted("Queue empty."); return; }
        t.printLines(settings.craftQueue.map((id) => `  ${id} — ${recipeName(id)}`)); return;
      }
      if (sub === "on" || sub === "off") { setToggle("autocraft", sub, t); return; }
      t.printError("See /man autocraft.");
    }
  };

  const recipesCmd = {
    name: "recipes", group: "Crafting", usage: "/recipes [query]",
    summary: "List craftable recipe ids.",
    async run(args, t) {
      const q = (args.join(" ") || "").toLowerCase();
      const rows = recipes
        .filter((r) => r.reward && r.reward.type !== "consumable")
        .filter((r) => !q || r.id.includes(q) || String(r.name).toLowerCase().includes(q))
        .map((r) => [r.id, r.name]);
      if (!rows.length) { t.printMuted("No matching recipes."); return; }
      t.printMuted(`${rows.length} recipe(s)`);
      t.table(["Id", "Name"], rows);
    }
  };

  // ---- Market ----
  const market = {
    name: "market", group: "Market",
    usage: "/market <sell|rules|add|remove|list|flush|mine|confirm>",
    summary: "List gems for sale and manage auto-listing rules.",
    man: [
      "  /market sell <gem> <price> [hours]  list your heaviest matching gem now",
      "  /market add <gem> <minRarity> <price> [hours]  add an auto-list rule",
      "  /market remove <index>              remove rule N (see /market rules)",
      "  /market rules                       show auto-list rules",
      "  /market flush                       list everything matching your rules now",
      "  /market mine                        show your active listings",
      "  /market confirm <on|off>            require confirmation before auto-listing",
      "  /automarket <on|off>                run auto-listing in the background"
    ],
    suggest(args) {
      if (args.length === 0) return ["sell", "add", "remove", "rules", "flush", "mine", "confirm"];
      if (args.length === 1 && (args[0] === "sell" || args[0] === "add")) return gemNames();
      if (args.length === 1 && args[0] === "confirm") return ["on", "off"];
      return [];
    },
    async run(args, t) {
      const sub = (args[0] || "").toLowerCase();

      if (sub === "confirm") { setToggle("marketConfirm", (args[1] || "on").toLowerCase(), t); return; }

      if (sub === "rules") {
        if (!(settings.marketRules || []).length) { t.printMuted("No market rules."); return; }
        t.table(["#", "Gem", "minRarity", "Price", "Hours"],
          settings.marketRules.map((r, i) => [i, r.name, r.minRarity ?? "—", formatMoney(r.price), r.hours ?? 24]));
        return;
      }
      if (sub === "add") {
        const name = args[1]; const minRarity = Number(args[2]) || 0; const price = Number(args[3]); const hours = Number(args[4]) || 24;
        if (!name || !Number.isFinite(price)) { t.printError("Usage: /market add <gem> <minRarity> <price> [hours]."); return; }
        settings.marketRules = [...(settings.marketRules || []), { name, minRarity, price, hours }]; save();
        t.printSuccess(`Rule added: ${name} ≥1-in-${formatCount(minRarity)} @ ${formatMoney(price)}.`); return;
      }
      if (sub === "remove") { const i = Number(args[1]); settings.marketRules = (settings.marketRules || []).filter((_, idx) => idx !== i); save(); t.printSuccess("Rule removed."); return; }
      if (sub === "mine") {
        const mine = await loadMyAuctions();
        if (!mine.length) { t.printMuted("No active listings."); return; }
        t.table(["Id", "Price", "Ends"], mine.slice(0, 50).map((a) => [a.id, formatMoney(a.start_price ?? a.price ?? 0), a.ends_at ?? "—"]));
        return;
      }
      if (sub === "sell") {
        const name = args[1]; const price = Number(args[2]); const hours = Number(args[3]) || 24;
        if (!name || !Number.isFinite(price)) { t.printError("Usage: /market sell <gem> <price> [hours]."); return; }
        const gems = await loadCloudGems();
        if (!Array.isArray(gems)) { t.printError("Could not load inventory."); return; }
        const match = gems.filter((g) => !g.locked && String(g.gem_name).toLowerCase() === name.toLowerCase())
          .sort((a, b) => Number(b.final_weight ?? 0) - Number(a.final_weight ?? 0))[0];
        if (!match) { t.printError(`No unlocked '${name}' in your inventory.`); return; }
        if (settings.marketConfirm && !(await t.confirm(`List ${match.gem_name} for ${formatMoney(price)}?`))) return;
        const { error } = await createAuctionLot([{ type: "gem", id: match.id }], price, hours);
        if (error) { t.printError(error.message ?? "Could not list."); return; }
        t.printSuccess(`Listed ${match.gem_name} for ${formatMoney(price)}.`);
        return;
      }
      if (sub === "flush") {
        const gems = await loadCloudGems();
        if (!Array.isArray(gems)) { t.printError("Could not load inventory."); return; }
        const matches = marketMatches(gems);
        if (!matches.length) { t.printMuted("Nothing matches your market rules."); return; }
        if (settings.marketConfirm && !(await t.confirm(`List ${formatCount(matches.length)} gem(s) now?`))) return;
        const listed = await listMatches(matches);
        t.printSuccess(`Listed ${formatCount(listed)} gem(s).`);
        pendingMarket = [];
        return;
      }
      t.printError("See /man market.");
    }
  };

  const automarket = {
    name: "automarket", group: "Market", usage: "/automarket <on|off>",
    summary: "Auto-list gems matching your market rules (respects /market confirm).",
    suggest(args) { return args.length === 0 ? ["on", "off"] : []; },
    run(args, t) {
      if ((args[0] || "").toLowerCase() === "on" && !(settings.marketRules || []).length) {
        t.printError("Add a rule first (e.g. /market add \"Void Opal\" 5000000 1000000000).");
        return;
      }
      setToggle("automarket", (args[0] || "off").toLowerCase(), t);
    }
  };

  // ---- Inventory & stats ----
  const inv = {
    name: "inv", group: "Inventory", usage: "/inv",
    summary: "Inventory summary — count and total value.",
    async run(args, t) {
      const gems = await loadCloudGems();
      if (!Array.isArray(gems)) { t.printError("Could not load inventory."); return; }
      const total = gems.reduce((sum, g) => sum + Number(g.value ?? 0), 0);
      const locked = gems.filter((g) => g.locked).length;
      t.keyValues([
        ["Gems", formatCount(gems.length)],
        ["Locked", formatCount(locked)],
        ["Total value", formatMoney(total)]
      ]);
    }
  };

  const stats = {
    name: "stats", group: "Inventory", usage: "/stats",
    summary: "Your money, rolls, and inventory capacity.",
    async run(args, t) {
      const state = await loadCloudPlayerState();
      if (!state) { t.printError("Could not load player state."); return; }
      t.keyValues([
        ["Money", formatMoney(state.money ?? 0)],
        ["Total rolls", formatCount(state.totalRolls ?? state.total_rolls ?? 0)],
        ["Capacity", formatCount(state.inventoryCapacity ?? state.inventory_capacity ?? 0)]
      ]);
    }
  };

  const lock = {
    name: "lock", group: "Inventory", usage: "/lock <gemName>",
    summary: "Lock every gem of a name (protects them from selling).",
    suggest(args) { return args.length === 0 ? gemNames() : []; },
    async run(args, t) { await setLocks(args.join(" "), true, t); }
  };
  const unlock = {
    name: "unlock", group: "Inventory", usage: "/unlock <gemName>",
    summary: "Unlock every gem of a name.",
    suggest(args) { return args.length === 0 ? gemNames() : []; },
    async run(args, t) { await setLocks(args.join(" "), false, t); }
  };

  const autoroll = {
    name: "autoroll", group: "Inventory", usage: "/autoroll <on|off>",
    summary: "Toggle Auto Roll (game setting).",
    suggest(args) { return args.length === 0 ? ["on", "off"] : []; },
    async run(args, t) {
      const on = (args[0] || "off").toLowerCase() === "on";
      await updateSettings({ autoRoll: on });
      t.printSuccess(`Auto Roll ${on ? "on" : "off"}.`);
    }
  };

  const batch = {
    name: "batch", group: "Inventory", usage: "/batch <1-4>",
    summary: "Set roll batch size (game setting).",
    async run(args, t) {
      const size = Math.max(1, Math.min(4, Math.trunc(Number(args[0]) || 1)));
      await updateSettings({ batchSize: size });
      t.printSuccess(`Batch size = ×${size}.`);
    }
  };

  return [
    config, set, logCmd,
    sell, autosell,
    craft, autocraft, recipesCmd,
    market, automarket,
    inv, stats, lock, unlock, autoroll, batch
  ];
}

async function setLocks(name, locked, t) {
  if (!name) { t.printError("Provide a gem name."); return; }
  const gems = await loadCloudGems();
  if (!Array.isArray(gems)) { t.printError("Could not load inventory."); return; }
  const targets = gems.filter((g) => String(g.gem_name).toLowerCase() === name.toLowerCase() && Boolean(g.locked) !== locked);
  if (!targets.length) { t.printMuted(`No '${name}' to ${locked ? "lock" : "unlock"}.`); return; }
  let done = 0;
  for (const gem of targets) {
    const { error } = await toggleCloudGemLock(gem.id);
    if (!error) done += 1;
  }
  t.printSuccess(`${locked ? "Locked" : "Unlocked"} ${formatCount(done)} × ${name}.`);
  window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
}

function recipeIds() {
  return recipes.filter((r) => r.reward && r.reward.type !== "consumable").map((r) => r.id);
}

let gemNameCache = null;
function gemNames() {
  return gemNameCache || [];
}


// =========================================================
// OPEN / CLOSE / INIT
// =========================================================

function open() {
  if (panel) return;

  term = createCliTerminal({
    title: "Player Console",
    prompt: "gem>",
    greeting: [
      "Player console — automate selling, crafting, and the market.",
      "Type /help for commands, /man for the manual. Automation keeps running when closed."
    ],
    commands: buildCommands(),
    onClose: close
  });

  panel = term.element;
  document.body.appendChild(panel);
  term.focus();

  // Warm a gem-name list for autocomplete (best effort).
  loadCloudGems().then((gems) => {
    if (Array.isArray(gems)) gemNameCache = [...new Set(gems.map((g) => g.gem_name))].sort();
  }).catch(() => {});

  document.addEventListener("keydown", onEscape, true);
}

function close() {
  panel?.remove();
  panel = null;
  term = null;
  document.removeEventListener("keydown", onEscape, true);
}

function toggle() {
  if (panel) close(); else open();
}

// The floating button is hidden on phones, where the tab bar and chat
// button already crowd the bottom edge; the More menu opens it instead.
export function togglePlayerCli() {
  toggle();
}

function onEscape(event) {
  if (event.key === "Escape" && panel) close();
}

function onKeyDown(event) {
  if (event.key !== "`" && event.key !== "~") return;

  const el = event.target;
  if (el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
    return;
  }

  event.preventDefault();
  toggle();
}

function mountButton() {
  if (document.querySelector(".player-cli-fab")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "player-cli-fab";
  button.title = "Open console (`)";
  button.setAttribute("aria-label", "Open player console");
  button.textContent = "⌨";
  button.addEventListener("click", toggle);
  document.body.appendChild(button);
}

export function initPlayerCli() {
  document.addEventListener("keydown", onKeyDown, true);
  mountButton();
  ensureLoop(); // resume any automation that was left on
}
