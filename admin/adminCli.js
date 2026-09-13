// =========================================================
// ADMIN CLI
//
// A command line for the admin panel, mounted as its own tab. It
// mirrors the player / moderation / ops functions of the admin UI
// (grants, bans, appeals, analytics, announcements, IP audit,
// referrals, bank, guilds, admin codes/events, section toggles).
//
// Feature Lab content authoring (achievements, quests, gems,
// islands, dungeons, PvP, workbench) stays in the UI — this CLI
// exposes read/toggle for it, not the multi-field editors.
//
// This is separate from the maintenance CLI on purpose; it shares
// only the terminal widget, not any command set.
// =========================================================

import { supabase } from "../src/backend/supabase.js";
import { adminRequest } from "../src/backend/cloudAdmin.js";
import {
  loadAdminCodes, createAdminCode, deleteAdminCode, setAdminCodeActive
} from "../src/backend/cloudCodes.js";
import {
  loadAdminEvents, startAdminEvent, stopAdminEvent
} from "../src/backend/cloudAdminEvents.js";
import { createCliTerminal } from "../src/ui/cli/terminal.js";
import { formatCount, formatMoney } from "../src/ui/format.js";


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// Print an arbitrary RPC result in a readable way without knowing
// its exact shape: arrays become summarised rows, objects become
// key/value lines. Good enough for an ops console.
function printAny(term, data) {
  if (data == null) {
    term.printMuted("(no data)");

    return;
  }

  if (Array.isArray(data)) {
    if (!data.length) {
      term.printMuted("(empty)");

      return;
    }

    term.printMuted(`${data.length} row(s)`);

    data.slice(0, 50).forEach((row, index) => {
      if (row && typeof row === "object") {
        const summary = Object.entries(row)
          .slice(0, 6)
          .map(([key, value]) => `${key}=${formatScalar(value)}`)
          .join("  ");

        term.print(`${index + 1}. ${summary}`);
      } else {
        term.print(`${index + 1}. ${formatScalar(row)}`);
      }
    });

    if (data.length > 50) {
      term.printMuted(`… ${data.length - 50} more`);
    }

    return;
  }

  if (typeof data === "object") {
    const pairs = Object.entries(data).map(([key, value]) => [key, formatScalar(value)]);

    term.keyValues(pairs);

    return;
  }

  term.print(formatScalar(data));
}

function formatScalar(value) {
  if (value == null) {
    return "—";
  }

  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }

  if (typeof value === "object") {
    return "{…}";
  }

  return String(value);
}


export function mountAdminCli({ mount }) {
  if (!mount || mount.dataset.cliMounted === "true") {
    return;
  }

  mount.dataset.cliMounted = "true";

  // Cache resolved usernames → ids so repeated commands don't re-search.
  const resolved = new Map();

  async function resolvePlayer(term, token) {
    if (!token) {
      term.printError("A player (username or id) is required.");

      return null;
    }

    if (UUID.test(token)) {
      return { id: token, username: token };
    }

    const key = token.toLowerCase();

    if (resolved.has(key)) {
      return resolved.get(key);
    }

    const { data, error } = await adminRequest("search", { query: token });

    if (error) {
      term.printError(error.message);

      return null;
    }

    const players = data?.players ?? [];
    const exact = players.find((player) => (player.username ?? "").toLowerCase() === key);
    const chosen = exact ?? (players.length === 1 ? players[0] : null);

    if (!chosen) {
      if (players.length > 1) {
        term.printError(`Ambiguous '${token}'. Matches: ${players.map((p) => p.username).join(", ")}`);
      } else {
        term.printError(`No player matching '${token}'.`);
      }

      return null;
    }

    const record = { id: chosen.id, username: chosen.username ?? chosen.id };

    resolved.set(key, record);

    return record;
  }

  // Run an admin edge-function action against a resolved player.
  async function playerAction(term, token, action, payload, successText, confirmSummary) {
    const player = await resolvePlayer(term, token);

    if (!player) {
      return;
    }

    if (confirmSummary && !(await term.confirm(`${confirmSummary} (${player.username})`))) {
      return;
    }

    const { error } = await adminRequest(action, { targetId: player.id, ...payload });

    if (error) {
      term.printError(error.message);

      return;
    }

    term.printSuccess(successText(player));
  }

  // Run a SECURITY DEFINER RPC and report the outcome.
  async function rpc(term, name, args, onData) {
    const { data, error } = await supabase.rpc(name, args);

    if (error) {
      term.printError(error.message);

      return;
    }

    if (onData) {
      onData(data);
    } else {
      printAny(term, data);
    }
  }

  const term = createCliTerminal({
    title: "Admin CLI",
    prompt: "admin>",
    docked: true,
    greeting: [
      "Admin console. Players are named by username or id.",
      "Type /help for commands, /man for the full manual."
    ],
    commands: buildCommands({ resolvePlayer, playerAction, rpc })
  });

  mount.appendChild(term.element);

  term.focus();
}


function buildCommands({ resolvePlayer, playerAction, rpc }) {
  const check = {
    name: "check",
    group: "Lookup",
    usage: "/check",
    summary: "Show current player counts and live activity.",
    async run(args, term) {
      const { data, error } = await supabase.rpc("get_admin_analytics");

      if (error || !data) {
        const fallback = await adminRequest("analytics", { targetId: null });

        if (fallback.error || !fallback.data) {
          term.printError(error?.message ?? "Analytics unavailable.");

          return;
        }

        printAnalytics(term, fallback.data);

        return;
      }

      printAnalytics(term, data);
    }
  };

  const search = {
    name: "search",
    group: "Lookup",
    usage: "/search <query>",
    summary: "Find players by username, email, or id.",
    async run(args, term) {
      const query = args.join(" ").trim();

      if (!query) {
        term.printError("Usage: /search <query>.");

        return;
      }

      const { data, error } = await adminRequest("search", { query });

      if (error) {
        term.printError(error.message);

        return;
      }

      const players = data?.players ?? [];

      if (!players.length) {
        term.printMuted("No players found.");

        return;
      }

      term.table(
        ["Username", "Email", "Id"],
        players.map((p) => [
          p.username ?? "—",
          p.email ?? (p.isAnonymous ? "(anon)" : "—"),
          p.id
        ])
      );
    }
  };

  const inspect = {
    name: "inspect",
    group: "Lookup",
    usage: "/inspect <player>",
    summary: "Show a player's account details, ban status, and metadata.",
    async run(args, term) {
      const player = await resolvePlayer(term, args[0]);

      if (!player) {
        return;
      }

      const { data, error } = await adminRequest("inspect", { targetId: player.id });

      if (error) {
        term.printError(error.message);

        return;
      }

      printAny(term, data?.player ?? data);

      const { data: banRows } = await supabase.rpc("admin_get_ban", { p_target: player.id });
      const ban = Array.isArray(banRows) ? banRows[0] : banRows;

      if (ban?.ban_until) {
        term.printWarn(`BANNED until ${ban.ban_until}${ban.ban_reason ? ` — ${ban.ban_reason}` : ""}`);
      }
    }
  };

  const meta = {
    name: "meta",
    group: "Lookup",
    usage: "/meta <player>",
    summary: "Show account creation / last sign-in metadata.",
    async run(args, term) {
      const player = await resolvePlayer(term, args[0]);

      if (player) {
        await rpc(term, "admin_get_account_meta", { p_target: player.id });
      }
    }
  };

  // ---- Grants / player actions ----

  const money = {
    name: "money",
    group: "Player",
    usage: "/money <player> <amount>",
    summary: "Grant money (negative removes).",
    async run(args, term) {
      const amount = Number(args[1]);

      if (!Number.isFinite(amount)) {
        term.printError("Enter a numeric amount.");

        return;
      }

      await playerAction(term, args[0], "money", { amount },
        (p) => `${amount >= 0 ? "Granted" : "Removed"} ${formatMoney(Math.abs(amount))} · ${p.username}.`,
        amount < 0 ? `Remove ${formatMoney(Math.abs(amount))} from` : null);
    }
  };

  const gem = {
    name: "gem",
    group: "Player",
    usage: "/gem <player> <name> [weightMult=1] [mutationId..]",
    summary: "Grant a gem with an optional weight multiplier and mutations.",
    async run(args, term) {
      const gemName = args[1];

      if (!gemName) {
        term.printError("Usage: /gem <player> <name> [weightMult] [mutationId..].");

        return;
      }

      const weightMultiplier = Number(args[2] ?? 1) || 1;
      const mutationIds = args.slice(3);

      await playerAction(term, args[0], "grant_gem",
        { gemName, weightMultiplier, mutationIds },
        (p) => `Granted ${gemName} (x${weightMultiplier}) to ${p.username}.`);
    }
  };

  const potion = {
    name: "potion",
    group: "Player",
    usage: "/potion <player> <consumableId> <amount>",
    summary: "Grant (or remove, if negative) a consumable.",
    async run(args, term) {
      const consumableId = args[1];
      const amount = Math.trunc(Number(args[2]));

      if (!consumableId || !Number.isFinite(amount)) {
        term.printError("Usage: /potion <player> <consumableId> <amount>.");

        return;
      }

      await playerAction(term, args[0], "potion", { consumableId, amount },
        (p) => `${amount >= 0 ? "Granted" : "Removed"} ${Math.abs(amount)}x ${consumableId} · ${p.username}.`);
    }
  };

  const mutationLuck = {
    name: "mutationluck",
    group: "Player",
    usage: "/mutationluck <player> <x>",
    summary: "Set a player's mutation-luck multiplier.",
    async run(args, term) {
      const mutationLuck = Number(args[1]);

      if (!Number.isFinite(mutationLuck)) {
        term.printError("Enter a numeric multiplier.");

        return;
      }

      await playerAction(term, args[0], "mutation_luck", { mutationLuck },
        (p) => `${p.username}'s mutation luck is now x${mutationLuck}.`);
    }
  };

  const coins = {
    name: "coins",
    group: "Player",
    usage: "/coins <player> <amount>",
    summary: "Grant loot-box coins (negative removes).",
    async run(args, term) {
      const amount = Number(args[1]);

      if (!Number.isFinite(amount)) {
        term.printError("Enter a numeric amount.");

        return;
      }

      await playerAction(term, args[0], "coins", { amount },
        (p) => `Applied ${amount} coins · ${p.username}.`);
    }
  };

  const capacity = {
    name: "capacity",
    group: "Player",
    usage: "/capacity <player> <slots>",
    summary: "Adjust inventory capacity (negative removes).",
    async run(args, term) {
      const amount = Math.trunc(Number(args[1]));

      if (!Number.isFinite(amount)) {
        term.printError("Enter a numeric slot count.");

        return;
      }

      await playerAction(term, args[0], "capacity", { amount },
        (p) => `Applied ${amount} slots · ${p.username}.`);
    }
  };

  const rolls = {
    name: "rolls",
    group: "Player",
    usage: "/rolls <player> <amount>",
    summary: "Adjust lifetime rolls (negative removes).",
    async run(args, term) {
      const amount = Math.trunc(Number(args[1]));

      if (!Number.isFinite(amount)) {
        term.printError("Enter a numeric amount.");

        return;
      }

      await playerAction(term, args[0], "rolls", { amount },
        (p) => `Applied ${amount} rolls · ${p.username}.`);
    }
  };

  const boost = {
    name: "boost",
    group: "Player",
    usage: "/boost <player> <family> <effect> <seconds>",
    summary: "Grant a timed boost (family: luck|rollSpeed|weightLuck|weightMultiplier).",
    async run(args, term) {
      const family = args[1];
      const effect = Number(args[2]);
      const seconds = Math.trunc(Number(args[3]));

      if (!family || !Number.isFinite(effect) || !Number.isFinite(seconds)) {
        term.printError("Usage: /boost <player> <family> <effect> <seconds>.");

        return;
      }

      await playerAction(term, args[0], "boost", { family, effect, seconds },
        (p) => `${family} +${effect} for ${seconds}s · ${p.username}.`);
    }
  };

  const oneRoll = {
    name: "oneroll",
    group: "Player",
    usage: "/oneroll <player> <consumableId> <effectValue>",
    summary: "Grant a one-roll boost.",
    async run(args, term) {
      const consumableId = args[1];
      const effectValue = Number(args[2]);

      if (!consumableId || !Number.isFinite(effectValue)) {
        term.printError("Usage: /oneroll <player> <consumableId> <effectValue>.");

        return;
      }

      await playerAction(term, args[0], "one_roll_boost", { consumableId, effectValue },
        (p) => `One-roll ${consumableId} (${effectValue}) · ${p.username}.`);
    }
  };

  const grantAllPotions = {
    name: "grantallpotions",
    group: "Player",
    usage: "/grantallpotions <player> <qty>",
    summary: "Grant every potion type.",
    async run(args, term) {
      const quantity = Math.trunc(Number(args[1]) || 1);

      await playerAction(term, args[0], "grant_all_potions", { quantity },
        (p) => `Granted ${quantity}x of every potion · ${p.username}.`);
    }
  };

  const grantAllGems = {
    name: "grantallgems",
    group: "Player",
    usage: "/grantallgems <player> [mutationId..]",
    summary: "Grant one of every gem (with optional mutations).",
    async run(args, term) {
      const mutationIds = args.slice(1);

      await playerAction(term, args[0], "grant_all_gems", { mutationIds },
        (p) => `Granted every gem · ${p.username}.`);
    }
  };

  const clearInv = {
    name: "clearinv",
    group: "Player",
    usage: "/clearinv <player>",
    summary: "Delete every gem in a player's inventory (irreversible).",
    async run(args, term) {
      await playerAction(term, args[0], "clear_inventory", {},
        (p) => `Cleared inventory · ${p.username}.`,
        "Delete EVERY gem in the inventory of");
    }
  };

  const deleteGem = {
    name: "deletegem",
    group: "Player",
    usage: "/deletegem <player> <specimenId>",
    summary: "Delete one gem permanently.",
    async run(args, term) {
      const specimenId = args[1];

      if (!specimenId) {
        term.printError("Usage: /deletegem <player> <specimenId>.");

        return;
      }

      await playerAction(term, args[0], "delete_gem", { specimenId },
        (p) => `Deleted gem ${specimenId} · ${p.username}.`,
        `Permanently delete gem ${specimenId} from`);
    }
  };

  const cooldown = {
    name: "cooldown",
    group: "Player",
    usage: "/cooldown <player>",
    summary: "Reset a player's roll cooldown.",
    async run(args, term) {
      await playerAction(term, args[0], "reset_cooldown", {},
        (p) => `Reset roll cooldown · ${p.username}.`);
    }
  };

  const title = {
    name: "title",
    group: "Player",
    usage: "/title <player> set \"<title>\" [color] | /title <player> remove",
    summary: "Set or remove a player's title.",
    async run(args, term) {
      const mode = (args[1] ?? "").toLowerCase();

      if (mode === "remove") {
        await playerAction(term, args[0], "player_title_remove", {},
          (p) => `Removed title · ${p.username}.`);

        return;
      }

      if (mode === "set") {
        const titleText = args[2];
        const color = args[3] || "#ffd166";

        if (!titleText) {
          term.printError("Provide a title: /title <player> set \"Champion\" #ffd166.");

          return;
        }

        await playerAction(term, args[0], "player_title_set", { title: titleText, color },
          (p) => `Set title "${titleText}" · ${p.username}.`);

        return;
      }

      term.printError("Usage: /title <player> set \"<title>\" [color] | remove.");
    }
  };

  const lbVis = {
    name: "lbvis",
    group: "Player",
    usage: "/lbvis <player> <hide|show>",
    summary: "Hide or show a player on leaderboards.",
    async run(args, term) {
      const mode = (args[1] ?? "").toLowerCase();

      if (!["hide", "show"].includes(mode)) {
        term.printError("Usage: /lbvis <player> <hide|show>.");

        return;
      }

      await playerAction(term, args[0], "leaderboard_visibility", { hidden: mode === "hide" },
        (p) => `${mode === "hide" ? "Hid" : "Showed"} ${p.username} on leaderboards.`);
    }
  };

  const lock = {
    name: "lock",
    group: "Moderation",
    usage: "/lock <player> <on|off>",
    summary: "Lock or unlock a player's account.",
    async run(args, term) {
      const mode = (args[1] ?? "").toLowerCase();

      if (!["on", "off"].includes(mode)) {
        term.printError("Usage: /lock <player> <on|off>.");

        return;
      }

      const locked = mode === "on";

      await playerAction(term, args[0], "account_lock", { locked },
        (p) => `${locked ? "Locked" : "Unlocked"} account · ${p.username}.`,
        locked ? "Lock the account of" : null);
    }
  };

  const ban = {
    name: "ban",
    group: "Moderation",
    usage: "/ban <player> <hours|perm> [reason..]",
    summary: "Ban a player for N hours, or 'perm' for permanent.",
    man: [
      "  hours = 0 or 'perm' bans permanently.",
      "  /ban bob 24 spamming chat",
      "  /ban bob perm cheating"
    ],
    async run(args, term) {
      const player = await resolvePlayer(term, args[0]);

      if (!player) {
        return;
      }

      const durationToken = (args[1] ?? "").toLowerCase();
      const hours = durationToken === "perm" ? 0 : Number(args[1]);

      if (durationToken !== "perm" && !Number.isFinite(hours)) {
        term.printError("Usage: /ban <player> <hours|perm> [reason..].");

        return;
      }

      const reason = args.slice(2).join(" ");
      const label = hours === 0 ? "permanently" : `for ${hours}h`;

      if (!(await term.confirm(`Ban ${player.username} ${label}?`))) {
        return;
      }

      const { error } = await supabase.rpc("admin_ban_player", {
        p_target: player.id,
        p_hours: hours,
        p_reason: reason
      });

      if (error) {
        term.printError(error.message);

        return;
      }

      term.printSuccess(`Banned ${player.username} ${label}.`);
    }
  };

  const unban = {
    name: "unban",
    group: "Moderation",
    usage: "/unban <player>",
    summary: "Lift a player's ban.",
    async run(args, term) {
      const player = await resolvePlayer(term, args[0]);

      if (!player) {
        return;
      }

      if (!(await term.confirm(`Lift the ban on ${player.username}?`))) {
        return;
      }

      const { error } = await supabase.rpc("admin_unban_player", { p_target: player.id });

      if (error) {
        term.printError(error.message);

        return;
      }

      term.printSuccess(`Ban lifted · ${player.username}.`);
    }
  };

  const baninfo = {
    name: "baninfo",
    group: "Moderation",
    usage: "/baninfo <player>",
    summary: "Show a player's current ban record.",
    async run(args, term) {
      const player = await resolvePlayer(term, args[0]);

      if (player) {
        await rpc(term, "admin_get_ban", { p_target: player.id });
      }
    }
  };

  const appeals = {
    name: "appeals",
    group: "Moderation",
    usage: "/appeals [status]",
    summary: "List ban appeals (status: pending|accepted|rejected; default pending).",
    async run(args, term) {
      const status = args[0] ?? "pending";
      const { data, error } = await adminRequest("appeals_list", { status });

      if (error) {
        term.printError(error.message);

        return;
      }

      printAny(term, data?.appeals ?? data);
    }
  };

  const appeal = {
    name: "appeal",
    group: "Moderation",
    usage: "/appeal <appealId> <accept|reject> [message..]",
    summary: "Accept (unban) or reject a ban appeal.",
    async run(args, term) {
      const appealId = args[0];
      const decisionToken = (args[1] ?? "").toLowerCase();

      if (!appealId || !["accept", "reject"].includes(decisionToken)) {
        term.printError("Usage: /appeal <appealId> <accept|reject> [message..].");

        return;
      }

      const decision = decisionToken === "accept" ? "accepted" : "rejected";
      const message = args.slice(2).join(" ");

      if (decision === "accepted" && !message) {
        term.printError("Accepting requires a message for the player.");

        return;
      }

      if (!(await term.confirm(`${decisionToken === "accept" ? "Accept (unban)" : "Reject"} appeal ${appealId}?`))) {
        return;
      }

      const { error } = await adminRequest("appeals_review", { appealId, decision, message });

      if (error) {
        term.printError(error.message);

        return;
      }

      term.printSuccess(decision === "accepted" ? "Appeal accepted; player unbanned." : "Appeal rejected.");
    }
  };

  // ---- Announcements ----

  const announce = {
    name: "announce",
    group: "Announce",
    usage: "/announce <message..> | /announce clear | /announce <tone>: <message..>",
    summary: "Post a site announcement, or clear all announcements.",
    man: [
      "  /announce clear                 remove all active announcements",
      "  /announce Server restart at 5pm post with the default tone",
      "  /announce warning: Maintenance  set a tone (info|warning|success) before ':'"
    ],
    async run(args, term) {
      if ((args[0] ?? "").toLowerCase() === "clear") {
        if (!(await term.confirm("Clear all active announcements?"))) {
          return;
        }

        await rpc(term, "clear_announcements", {}, () => term.printSuccess("Announcements cleared."));

        return;
      }

      let tone = "info";
      let text = args.join(" ").trim();
      const toneMatch = text.match(/^(info|warning|success)\s*:\s*(.*)$/i);

      if (toneMatch) {
        tone = toneMatch[1].toLowerCase();
        text = toneMatch[2];
      }

      if (!text) {
        term.printError("Write a message: /announce <message>.");

        return;
      }

      const { error } = await supabase.rpc("post_announcement", { p_body: text, p_tone: tone });

      if (error) {
        term.printError(error.message);

        return;
      }

      term.printSuccess(`Announcement posted (${tone}).`);
    }
  };

  // ---- Analytics / economy ----

  const analytics = {
    name: "analytics",
    group: "Analytics",
    usage: "/analytics",
    summary: "Full analytics snapshot.",
    async run(args, term) {
      await rpc(term, "get_admin_analytics", {}, (data) => printAnalytics(term, data));
    }
  };

  const marketfees = {
    name: "marketfees",
    group: "Analytics",
    usage: "/marketfees",
    summary: "Market fee totals.",
    async run(args, term) {
      const { data, error } = await adminRequest("market_fee_analytics", { targetId: null });

      error ? term.printError(error.message) : printAny(term, data?.fees ?? data);
    }
  };

  const museum = {
    name: "museum",
    group: "Analytics",
    usage: "/museum",
    summary: "Museum analytics.",
    async run(args, term) {
      const { data, error } = await adminRequest("museum_analytics", { targetId: null });

      error ? term.printError(error.message) : printAny(term, data?.museum ?? data);
    }
  };

  const bank = {
    name: "bank",
    group: "Analytics",
    usage: "/bank",
    summary: "Bank overview (loans, savings, totals).",
    async run(args, term) {
      await rpc(term, "admin_get_bank_overview", {});
    }
  };

  const shareholders = {
    name: "shareholders",
    group: "Analytics",
    usage: "/shareholders",
    summary: "Index shareholders overview.",
    async run(args, term) {
      await rpc(term, "admin_get_shareholders", {});
    }
  };

  // ---- Community ----

  const guilds = {
    name: "guilds",
    group: "Community",
    usage: "/guilds",
    summary: "Guild roster overview.",
    async run(args, term) {
      await rpc(term, "admin_get_guild_roster", {});
    }
  };

  const referrals = {
    name: "referrals",
    group: "Community",
    usage: "/referrals [limit]",
    summary: "Referral program stats.",
    async run(args, term) {
      const limit = Math.trunc(Number(args[0]) || 200);

      await rpc(term, "admin_referral_stats", { p_limit: limit });
    }
  };

  // ---- IP audit ----

  const sharedips = {
    name: "sharedips",
    group: "IP audit",
    usage: "/sharedips [minAccounts=2] [subnet]",
    summary: "Find IPs shared by multiple accounts.",
    async run(args, term) {
      const minAccounts = Math.min(100, Math.max(2, Math.trunc(Number(args[0]) || 2)));
      const includeSubnet = (args[1] ?? "").toLowerCase() === "subnet";

      await rpc(term, "admin_find_shared_ips", {
        p_min_accounts: minAccounts,
        p_include_subnet: includeSubnet
      });
    }
  };

  const whitelist = {
    name: "whitelist",
    group: "IP audit",
    usage: "/whitelist [add <ip> [note..] | remove <ip>]",
    summary: "List, add to, or remove from the IP whitelist.",
    async run(args, term) {
      const mode = (args[0] ?? "").toLowerCase();

      if (mode === "add") {
        const ip = args[1];

        if (!ip) {
          term.printError("Usage: /whitelist add <ip> [note..].");

          return;
        }

        await rpc(term, "admin_add_ip_whitelist",
          { p_ip: ip, p_note: args.slice(2).join(" ") || null },
          () => term.printSuccess(`Whitelisted ${ip}.`));

        return;
      }

      if (mode === "remove") {
        const ip = args[1];

        if (!ip) {
          term.printError("Usage: /whitelist remove <ip>.");

          return;
        }

        await rpc(term, "admin_remove_ip_whitelist", { p_ip: ip },
          () => term.printSuccess(`Removed ${ip} from whitelist.`));

        return;
      }

      await rpc(term, "admin_list_ip_whitelist", {});
    }
  };

  // ---- Feature sections (read / toggle) ----

  const sections = {
    name: "sections",
    group: "Feature Lab",
    usage: "/sections",
    summary: "List feature sections and their state.",
    async run(args, term) {
      const { data, error } = await adminRequest("section_settings");

      error ? term.printError(error.message) : printAny(term, data?.sections ?? data);
    }
  };

  const section = {
    name: "section",
    group: "Feature Lab",
    usage: "/section <toggle|access> <id> <on|off | admin|all>",
    summary: "Enable/disable a section, or set admin-only access.",
    async run(args, term) {
      const mode = (args[0] ?? "").toLowerCase();
      const id = args[1];
      const value = (args[2] ?? "").toLowerCase();

      if (mode === "toggle" && id && ["on", "off"].includes(value)) {
        const { error } = await adminRequest("section_toggle", { id, enabled: value === "on" });

        error ? term.printError(error.message) : term.printSuccess(`Section ${id} ${value}.`);

        return;
      }

      if (mode === "access" && id && ["admin", "all"].includes(value)) {
        const { error } = await adminRequest("section_access_toggle", { id, adminOnly: value === "admin" });

        error ? term.printError(error.message) : term.printSuccess(`Section ${id} access: ${value}.`);

        return;
      }

      term.printError("Usage: /section toggle <id> <on|off> | /section access <id> <admin|all>.");
    }
  };

  const mutations = {
    name: "mutations",
    group: "Feature Lab",
    usage: "/mutations",
    summary: "List the mutation catalogue (edit in the UI).",
    async run(args, term) {
      const { data, error } = await adminRequest("mutation_list", { targetId: null });

      error ? term.printError(error.message) : printAny(term, data?.mutations ?? data);
    }
  };

  // ---- Admin codes ----

  const codes = {
    name: "codes",
    group: "Codes & events",
    usage: "/codes",
    summary: "List redemption codes.",
    async run(args, term) {
      const { data, error } = await loadAdminCodes();

      error ? term.printError(error.message) : printAny(term, data);
    }
  };

  const code = {
    name: "code",
    group: "Codes & events",
    usage: "/code create <CODE> <money> [maxRedemptions] | /code toggle <id> <on|off> | /code delete <id>",
    summary: "Create, enable/disable, or delete a redemption code.",
    man: [
      "  /code create SUMMER25 100000 500   money reward + optional redemption cap",
      "  /code toggle <codeId> off",
      "  /code delete <codeId>"
    ],
    async run(args, term) {
      const mode = (args[0] ?? "").toLowerCase();

      if (mode === "create") {
        const codeName = args[1];
        const moneyReward = Number(args[2] || 0);
        const maxRedemptions = args[3] != null ? Number(args[3]) : null;

        if (!codeName) {
          term.printError("Usage: /code create <CODE> <money> [maxRedemptions].");

          return;
        }

        const { error } = await createAdminCode({
          code: codeName,
          moneyReward,
          expiresAt: null,
          maxRedemptions,
          consumableRewards: []
        });

        error ? term.printError(error.message) : term.printSuccess(`Created code ${codeName}.`);

        return;
      }

      if (mode === "toggle" && args[1] && ["on", "off"].includes((args[2] ?? "").toLowerCase())) {
        const { error } = await setAdminCodeActive(args[1], args[2].toLowerCase() === "on");

        error ? term.printError(error.message) : term.printSuccess(`Code ${args[1]} ${args[2]}.`);

        return;
      }

      if (mode === "delete" && args[1]) {
        if (!(await term.confirm(`Delete code ${args[1]}?`))) {
          return;
        }

        const { error } = await deleteAdminCode(args[1]);

        error ? term.printError(error.message) : term.printSuccess(`Deleted code ${args[1]}.`);

        return;
      }

      term.printError("See /man code for usage.");
    }
  };

  const events = {
    name: "events",
    group: "Codes & events",
    usage: "/events",
    summary: "List admin events.",
    async run(args, term) {
      const { data, error } = await loadAdminEvents();

      error ? term.printError(error.message) : printAny(term, data);
    }
  };

  const event = {
    name: "event",
    group: "Codes & events",
    usage: "/event start <name> <minutes> <luck%> | /event stop <id>",
    summary: "Start a simple luck event, or stop a running one.",
    man: [
      "  /event start DoubleLuck 60 100   name, duration minutes, +luck% (as a bonus)",
      "  /event stop <eventId>",
      "  Multi-stat events are authored in the UI."
    ],
    async run(args, term) {
      const mode = (args[0] ?? "").toLowerCase();

      if (mode === "start") {
        const name = args[1];
        const durationMinutes = Math.trunc(Number(args[2]));
        const luckPercent = Number(args[3] || 0);

        if (!name || !Number.isFinite(durationMinutes)) {
          term.printError("Usage: /event start <name> <minutes> <luck%>.");

          return;
        }

        const { error } = await startAdminEvent({
          name,
          durationMinutes,
          luckBonus: luckPercent / 100,
          rollSpeedBonus: 0,
          weightLuckBonus: 0,
          weightMultiplierBonus: 0,
          luckMultiplier: 1,
          rollSpeedMultiplier: 1,
          weightLuckMultiplier: 1,
          weightMultiplierMultiplier: 1
        });

        error ? term.printError(error.message) : term.printSuccess(`Started event ${name}.`);

        return;
      }

      if (mode === "stop" && args[1]) {
        const { error } = await stopAdminEvent(args[1]);

        error ? term.printError(error.message) : term.printSuccess(`Stopped event ${args[1]}.`);

        return;
      }

      term.printError("Usage: /event start <name> <minutes> <luck%> | /event stop <id>.");
    }
  };

  return [
    check, search, inspect, meta,
    money, gem, potion, mutationLuck, coins, capacity, rolls, boost, oneRoll,
    grantAllPotions, grantAllGems, clearInv, deleteGem, cooldown, title, lbVis,
    lock, ban, unban, baninfo, appeals, appeal,
    announce,
    analytics, marketfees, museum, bank, shareholders,
    guilds, referrals,
    sharedips, whitelist,
    sections, section, mutations,
    codes, code, events, event
  ];
}


function printAnalytics(term, data) {
  term.keyValues([
    ["Players", formatCount(data.players ?? 0)],
    ["Current online", formatCount(data.currentOnline ?? 0)],
    ["Daily online", formatCount(data.dailyOnline ?? 0)],
    ["Weekly online", formatCount(data.weeklyOnline ?? 0)],
    ["D1 retention", `${Number(data.retention1d ?? 0).toFixed(1)}%`],
    ["D7 retention", `${Number(data.retention7d ?? 0).toFixed(1)}%`],
    ["Total rolls", formatCount(data.totalRolls ?? 0)],
    ["Inventory gems", formatCount(data.totalInventoryGems ?? 0)],
    ["Money in economy", formatMoney(data.totalMoney ?? 0)],
    ["Inventory value", formatMoney(data.totalInventoryValue ?? 0)]
  ]);
}
