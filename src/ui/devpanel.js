import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { invokeFunction } from "../backend/invoke.js";
import { sellCloudGem } from "../backend/cloudInventory.js";
import gems from "../data/gems.js";
import { loadGemCatalog } from "../backend/gemCatalog.js";
import consumables from "../data/consumables.js";
import { equipmentCatalog } from "../data/recipes.js";
import { rollWeightMultiplier } from "../logic/weight.js";
import { notify } from "./toast.js";
import { formatMoney, formatCount, rarityLabel } from "./format.js";
import { createCliTerminal } from "./cli/terminal.js";


// =========================================================
// MAINTENANCE CLI
//
// Internal utility, reached with a fixed key sequence rather than
// a visible control. Instead of a form panel it opens a command
// line (Minecraft-style): type `/give me rolls 1000`, `/give
// <name> gem "Black Opal" 5`, etc. Every command runs through the
// dependency_improvement RPC, which is gated server-side to a small
// allow-list — so even though this code is public, only listed
// accounts can actually use it.
// =========================================================


const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowLeft",
  "ArrowRight",
  "ArrowRight"
];

const BOOST_FAMILIES = ["luck", "rollSpeed", "weightLuck", "weightMultiplier"];


let progress = 0;
let panel = null;
let catalogGems = gems;


export function initDevPanel() {
  document.addEventListener("keydown", onKeyDown, true);
}


function onKeyDown(event) {
  const target = event.target;

  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  ) {
    progress = 0;

    return;
  }

  if (event.key === SEQUENCE[progress]) {
    progress += 1;

    if (progress === SEQUENCE.length) {
      progress = 0;

      toggle();
    }

    return;
  }

  progress = event.key === SEQUENCE[0] ? 1 : 0;
}


function toggle() {
  if (panel) {
    close();

    return;
  }

  open();
}


function close() {
  massRoll.cancelled = true;

  panel?.remove();

  panel = null;

  document.removeEventListener("keydown", onEscape, true);
}


async function open() {
  const user = await ensurePlayerAuth();

  // Nothing opens for anyone but the maintenance account. The check is
  // server-side (the code_improvement allow-list, which no client can
  // read), so for every other player the key sequence does nothing and
  // the CLI — and its commands — never render or reveal anything.
  if (!user) {
    return;
  }

  const { data: allowed, error } = await supabase.rpc("am_i_maintainer");

  if (error || allowed !== true) {
    return;
  }

  const term = createCliTerminal({
    title: "Maintenance CLI",
    prompt: "maint>",
    greeting: [
      "Maintenance console. Target 'me' (or self / ~) means your own account.",
      "Type /help for commands, /man for the full manual."
    ],
    commands: buildCommands(user),
    onClose: close
  });

  panel = term.element;

  document.body.appendChild(panel);

  term.focus();

  // Repopulate the gem catalog from the live source (private_feature_gems),
  // which includes every admin-created / endgame gem the bundle misses.
  loadGemCatalog()
    .then((list) => {
      if (Array.isArray(list) && list.length) {
        catalogGems = list;
      }
    })
    .catch(() => { /* keep the bundled list as fallback */ });

  document.addEventListener("keydown", onEscape, true);
}


// =========================================================
// COMMANDS
// =========================================================

// A player token: me / self / ~ / (blank) resolve to the caller;
// anything else is treated as a username the RPC will resolve.
function resolveTarget(token) {
  if (token == null || ["me", "self", "~"].includes(token.toLowerCase())) {
    return "";
  }

  return token;
}

function whoLabel(target) {
  return target === "" ? "you" : target;
}


function buildCommands(user) {
  // Wrap an RPC result: report failure through the terminal, return ok flag.
  async function send(term, action, target, payload, successText) {
    const result = await callDependency(action, target, payload);

    if (!result.ok) {
      term.printError(result.message);

      return false;
    }

    term.printSuccess(successText);

    refreshIfSelf(target === "");

    return true;
  }

  // Confirm before touching another player's account.
  async function confirmOther(term, target, summary) {
    if (target === "") {
      return true;
    }

    return term.confirm(`Send to ${target}: ${summary}`);
  }

  const give = {
    name: "give",
    group: "Grants",
    usage: "/give <player> <what> <amount> [..]",
    summary: "Grant money, coins, rolls, slots, rp, a gem, a potion, or equipment.",
    man: [
      "what is one of:",
      "  money <amount>          currency (negative lowers, floored at 0)",
      "  coins <amount>          loot-box coins",
      "  rolls <amount>          lifetime rolls",
      "  slots <amount>          inventory capacity",
      "  rp <amount>             research points (1..1,000,000)",
      "  gem <name> [qty] [mult] name in quotes; blank mult = random weight",
      "  potion <id> [qty]       consumable id (see /potions)",
      "  equip <id>              equipment id (see /equipment)",
      "Examples:",
      "  /give me rolls 1000",
      "  /give bob money 50000",
      "  /give me gem \"Black Opal\" 5",
      "  /give me equip all-in-pickaxe"
    ],
    suggest(args) {
      if (args.length === 0) {
        return ["me"];
      }

      if (args.length === 1) {
        return ["money", "coins", "rolls", "slots", "rp", "gem", "potion", "equip"];
      }

      const what = (args[1] ?? "").toLowerCase();

      if (args.length === 2 && (what === "potion" || what === "pot")) {
        return consumables.map((item) => item.id);
      }

      if (args.length === 2 && (what === "equip" || what === "equipment")) {
        return equipmentCatalog.map((item) => item.id);
      }

      return [];
    },
    async run(args, term) {
      const target = resolveTarget(args[0]);
      const what = (args[1] ?? "").toLowerCase();
      const who = whoLabel(target);

      if (!args[0] || !what) {
        term.printError("Usage: /give <player> <what> <amount>. See /man give.");

        return;
      }

      if (["money", "coins", "rolls", "slots", "rp"].includes(what)) {
        const amount = Number(args[2]);

        if (!Number.isFinite(amount)) {
          term.printError("Enter a numeric amount.");

          return;
        }

        const map = {
          money: ["metric", { amount }, `${formatMoney(amount)}`],
          coins: ["coins", { amount: Math.trunc(amount) }, `${formatCount(amount)} coins`],
          rolls: ["rolls", { amount: Math.trunc(amount) }, `${formatCount(amount)} rolls`],
          slots: ["capacity", { slots: Math.trunc(amount) }, `${Math.trunc(amount)} slots`],
          rp: ["research_points", { amount: Math.trunc(amount) }, `${formatCount(amount)} RP`]
        };

        const [action, payload, label] = map[what];

        if (!(await confirmOther(term, target, `give ${label}.`))) {
          return;
        }

        await send(term, action, target, payload, `Sent ${label} to ${who}.`);

        return;
      }

      if (what === "gem") {
        await giveGem(term, target, args.slice(2));

        return;
      }

      if (what === "potion" || what === "pot") {
        const id = args[2];
        const qty = Math.max(1, Math.floor(Number(args[3] ?? 1)));
        const item = consumables.find((entry) => entry.id === id);

        if (!item) {
          term.printError(`Unknown potion '${id}'. See /potions.`);

          return;
        }

        if (!(await confirmOther(term, target, `give ${qty}x ${item.name}.`))) {
          return;
        }

        await send(term, "stock", target, { consumable_id: id, quantity: qty },
          `Sent ${qty}x ${item.name} to ${who}.`);

        return;
      }

      if (what === "equip" || what === "equipment") {
        const id = args[2];
        const item = equipmentCatalog.find((entry) => entry.id === id);

        if (!item) {
          term.printError(`Unknown equipment '${id}'. See /equipment.`);

          return;
        }

        const bonus = item.bonus ?? {};

        if (!(await confirmOther(term, target, `give ${item.name}.`))) {
          return;
        }

        await send(term, "equipment", target, {
          equipment_id: item.id,
          category: item.category,
          tier: item.tier ?? 1,
          name: item.name,
          luck_bonus: Number(bonus.luck ?? 0),
          roll_speed_bonus: Number(bonus.rollSpeed ?? 0),
          weight_luck_bonus: Number(bonus.weightLuck ?? 0),
          weight_multiplier_bonus: Number(bonus.weightMultiplier ?? 0),
          mutation_chance_bonus: Number(bonus.mutationChance ?? 0)
        }, `Sent ${item.name} to ${who}.`);

        return;
      }

      term.printError(`Unknown grant type '${what}'. See /man give.`);
    }
  };

  async function giveGem(term, target, rest) {
    const name = rest[0];
    const gem = catalogGems.find((entry) => entry.name === name)
      ?? catalogGems.find((entry) => entry.name.toLowerCase() === String(name).toLowerCase());

    if (!gem) {
      term.printError(`Unknown gem '${name}'. See /gems.`);

      return;
    }

    const quantity = Math.max(1, Math.min(500, Math.floor(Number(rest[1] ?? 1))));
    const rawMult = rest[2];
    const fixed = rawMult != null && rawMult !== "" && Number.isFinite(Number(rawMult));
    const customMult = fixed ? Math.max(0.01, Number(rawMult)) : null;

    const label = quantity > 1 ? `${quantity}x ${gem.name}` : gem.name;

    if (target !== "" && !(await term.confirm(`Send to ${target}: give ${label}.`))) {
      return;
    }

    let sent = 0;

    for (let i = 0; i < quantity; i += 1) {
      const m = fixed ? customMult : rollWeightMultiplier();
      const finalWeight = gem.baseWeight * m;

      const result = await callDependency("item", target, {
        gem_name: gem.name,
        rarity: gem.rarity,
        base_weight: gem.baseWeight,
        value_per_gram: gem.valuePerGram,
        weight_multiplier: m,
        final_weight: finalWeight,
        value: finalWeight * gem.valuePerGram
      });

      if (!result.ok) {
        term.printError(result.message);

        break;
      }

      sent += 1;
    }

    if (sent > 0) {
      term.printSuccess(`Sent ${sent}x ${gem.name} to ${whoLabel(target)}.`);

      refreshIfSelf(target === "");
    }
  }

  const set = {
    name: "set",
    group: "Grants",
    usage: "/set <player> <mutationluck|rarest> <value>",
    summary: "Set a player's mutation luck multiplier, or their rarest-gem record.",
    man: [
      "  /set me mutationluck 100      set the mutation-luck multiplier (1..100000)",
      "  /set me rarest \"Void Opal\"    set the displayed rarest gem"
    ],
    suggest(args) {
      return args.length === 0 ? ["me"] : args.length === 1 ? ["mutationluck", "rarest"] : [];
    },
    async run(args, term) {
      const target = resolveTarget(args[0]);
      const field = (args[1] ?? "").toLowerCase();

      if (field === "mutationluck") {
        const value = Math.max(1, Math.min(100000, Math.floor(Number(args[2]) || 1)));

        if (!(await confirmOther(term, target, `set mutation luck to x${value}.`))) {
          return;
        }

        await send(term, "mutation", target, { mutation_luck: value },
          `${whoLabel(target)}'s mutation luck is now x${value}.`);

        return;
      }

      if (field === "rarest") {
        const gem = catalogGems.find((entry) => entry.name === args[2])
          ?? catalogGems.find((entry) => entry.name.toLowerCase() === String(args[2]).toLowerCase());

        if (!gem) {
          term.printError(`Unknown gem '${args[2]}'. See /gems.`);

          return;
        }

        if (target !== "" && !(await term.confirm(`Send to ${target}: set rarest to ${gem.name}.`))) {
          return;
        }

        const result = await setMaintenanceRarestGem(target, gem);

        if (!result.ok) {
          term.printError(result.message);

          return;
        }

        term.printSuccess(`${whoLabel(target)}'s rarest gem is now ${gem.name}.`);

        refreshIfSelf(target === "");

        return;
      }

      term.printError("Usage: /set <player> <mutationluck|rarest> <value>.");
    }
  };

  const boost = {
    name: "boost",
    group: "Grants",
    usage: "/boost <player> <family> <percent> <seconds>",
    summary: "Give a temporary boost (luck, rollSpeed, weightLuck, weightMultiplier).",
    man: [
      "  family is one of: luck | rollSpeed | weightLuck | weightMultiplier",
      "  /boost me luck 100 300   +100% luck for 300 seconds"
    ],
    suggest(args) {
      return args.length === 0 ? ["me"] : args.length === 1 ? BOOST_FAMILIES : [];
    },
    async run(args, term) {
      const target = resolveTarget(args[0]);
      const family = args[1];
      const percent = Math.max(0, Number(args[2]) || 0);
      const seconds = Math.max(1, Math.floor(Number(args[3]) || 0));

      if (!BOOST_FAMILIES.includes(family)) {
        term.printError(`family must be one of: ${BOOST_FAMILIES.join(", ")}.`);

        return;
      }

      if (!(await confirmOther(term, target, `+${percent}% ${family} for ${seconds}s.`))) {
        return;
      }

      await send(term, "effect", target, { family, effect: percent / 100, seconds },
        `+${percent}% ${family} to ${whoLabel(target)} for ${seconds}s.`);
    }
  };

  const cooldown = {
    name: "cooldown",
    group: "Grants",
    usage: "/cooldown <player>",
    summary: "Clear a player's roll cooldown.",
    async run(args, term) {
      const target = resolveTarget(args[0]);

      if (!(await confirmOther(term, target, "clear roll cooldown."))) {
        return;
      }

      const result = await callDependency("timer", target, {});

      if (!result.ok) {
        term.printError(result.message);

        return;
      }

      term.printSuccess(`Cleared cooldown for ${whoLabel(target)}.`);

      refreshIfSelf(target === "", true);
    }
  };

  const massroll = {
    name: "massroll",
    group: "Tools",
    usage: "/massroll <count>",
    summary: "Roll and auto-sell many times on your own account.",
    man: ["  Runs on your account only. Type /massroll stop is not needed — close the CLI (Esc) to cancel."],
    async run(args, term) {
      const total = Math.max(1, Math.min(100000, Math.floor(Number(args[0]) || 0)));

      massRoll.cancelled = false;

      term.printMuted(`Rolling ${formatCount(total)}…`);

      const result = await massRoll(user.id, total, (done, summary) => {
        if (done % 50 === 0) {
          term.printMuted(`  ${formatCount(done)}/${formatCount(total)} · +${formatMoney(summary.earned)}`);
        }
      });

      const rarest = result.rarest
        ? `${result.rarest.name} (${rarityLabel(result.rarest.rarity)})`
        : "none";

      term.printSuccess(
        `Done: ${formatCount(result.rolled)} rolls, +${formatMoney(result.earned)}. Rarest: ${rarest}.`
      );

      refreshIfSelf(true);
    }
  };

  const players = {
    name: "players",
    group: "Lookup",
    usage: "/players [query]",
    summary: "List usernames (optionally filtered by a substring).",
    async run(args, term) {
      const result = await callDependency("roster", "", {});

      if (!result.ok) {
        term.printError(result.message);

        return;
      }

      const query = (args[0] ?? "").toLowerCase();
      const names = (result.data ?? []).filter(
        (name) => !query || name.toLowerCase().includes(query)
      );

      term.printMuted(`${names.length} player(s)`);
      term.print(names.join("  ") || "(none)");
    }
  };

  const gemsCmd = {
    name: "gems",
    group: "Lookup",
    usage: "/gems [query]",
    summary: "List gem names and rarity for /give gem.",
    async run(args, term) {
      const query = (args[0] ?? "").toLowerCase();
      const rows = catalogGems
        .filter((gem) => !query || gem.name.toLowerCase().includes(query))
        .slice(0, 60)
        .map((gem) => [gem.name, `1 in ${formatCount(gem.rarity)}`]);

      if (!rows.length) {
        term.printMuted("No matching gems.");

        return;
      }

      term.table(["Gem", "Rarity"], rows);
    }
  };

  const potions = {
    name: "potions",
    group: "Lookup",
    usage: "/potions [query]",
    summary: "List consumable ids for /give potion.",
    async run(args, term) {
      const query = (args[0] ?? "").toLowerCase();
      const rows = consumables
        .filter((item) => !query || item.id.includes(query) || item.name.toLowerCase().includes(query))
        .map((item) => [item.id, item.name]);

      term.table(["Id", "Name"], rows);
    }
  };

  const equipment = {
    name: "equipment",
    group: "Lookup",
    usage: "/equipment [tab]",
    summary: "List equipment ids for /give equip (tab: pickaxe, toys, clover, lantern, boots, bag).",
    suggest(args) {
      return args.length === 0 ? ["pickaxe", "toys", "clover", "lantern", "boots", "bag"] : [];
    },
    async run(args, term) {
      const tab = (args[0] ?? "").toLowerCase();
      const rows = equipmentCatalog
        .filter((item) => !tab || item.tab === tab)
        .map((item) => [item.id, `T${item.tier ?? 1}`, item.name]);

      if (!rows.length) {
        term.printMuted("No matching equipment.");

        return;
      }

      term.table(["Id", "Tier", "Name"], rows);
    }
  };

  const whoami = {
    name: "whoami",
    group: "General",
    usage: "/whoami",
    summary: "Show your player id and maintainer status.",
    async run(args, term) {
      term.keyValues([
        ["Player id", user.id],
        ["Maintainer", "yes"]
      ]);
    }
  };

  return [
    give, set, boost, cooldown, massroll,
    players, gemsCmd, potions, equipment, whoami
  ];
}


// A change to your own account should show up on the page under the
// CLI. A reload is used when a running countdown (the roll cooldown)
// has to be dropped; otherwise a refresh event is enough.
function refreshIfSelf(self, hard = false) {
  if (!self) {
    return;
  }

  if (hard) {
    setTimeout(() => window.location.reload(), 400);

    return;
  }

  window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
}


// =========================================================
// SERVER CALL
// =========================================================

async function callDependency(action, target, payload) {
  const { data, error } = await supabase.rpc("dependency_improvement", {
    p_action: action,
    p_target: target,
    p_payload: payload
  });

  if (!error) {
    return { ok: true, data };
  }

  console.error("dependency_improvement failed:", error);

  const message = String(error.message ?? "");

  if (error.code === "PGRST202" || /Could not find/.test(message)) {
    return { ok: false, message: "Not deployed on this project yet." };
  }

  if (/not_authorized/.test(message)) {
    return { ok: false, message: "This account is not permitted." };
  }

  if (/target_not_found/.test(message)) {
    return { ok: false, message: "No player with that name." };
  }

  if (/invalid_research_points/.test(message)) {
    return { ok: false, message: "Enter 1 to 1,000,000 Research Points." };
  }

  if (/roll_in_progress/.test(message)) {
    return { ok: false, message: "A roll is in progress — try again in a moment." };
  }

  return { ok: false, message: "The action could not be completed." };
}


async function setMaintenanceRarestGem(target, gem) {
  const { data, error } = await supabase.rpc("maintenance_set_rarest_gem", {
    p_target: target,
    p_gem_name: gem.name,
    p_gem_rarity: gem.rarity
  });

  if (!error) {
    return { ok: true, data };
  }

  console.error("maintenance_set_rarest_gem failed:", error);

  const message = String(error.message ?? "");

  if (error.code === "PGRST202" || /Could not find/.test(message)) {
    return { ok: false, message: "Not deployed on this project yet." };
  }

  if (/not_authorized/.test(message)) {
    return { ok: false, message: "This account is not permitted." };
  }

  if (/target_not_found/.test(message)) {
    return { ok: false, message: "No player with that name." };
  }

  return { ok: false, message: "The action could not be completed." };
}


// =========================================================
// MASS ROLL
// =========================================================

async function massRoll(userId, total, onProgress) {
  const summary = { rolled: 0, earned: 0, rarest: null };

  for (let i = 0; i < total; i += 1) {
    if (massRoll.cancelled) {
      break;
    }

    await callDependency("timer", "", {});

    const { data, error } = await invokeFunction("roll");

    if (error) {
      if (error.code === "inventory_full") {
        notify.warning("Mass roll stopped", "Clear some inventory space first.");
      } else {
        notify.error("Mass roll stopped", error.message);
      }

      break;
    }

    if (!data) {
      continue;
    }

    summary.rolled += 1;

    const rarity = Number(data.gem?.rarity ?? 0);

    if (!summary.rarest || rarity > summary.rarest.rarity) {
      summary.rarest = { name: data.gem?.name ?? "Unknown", rarity };
    }

    if (data.specimenId != null && !data.autoCraft?.deposited) {
      const { data: sale } = await sellCloudGem(data.specimenId);

      if (sale) {
        summary.earned += Number(sale.soldValue ?? 0);
      }
    }

    if (i % 5 === 0 || i === total - 1) {
      onProgress(summary.rolled, summary);
    }
  }

  onProgress(summary.rolled, summary);

  return summary;
}


function onEscape(event) {
  if (event.key === "Escape" && panel) {
    close();
  }
}
