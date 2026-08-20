import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";

mountShell({ page: "guilds", base: "../" });

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke("features", {
    body: { action, ...extra }
  });

  if (error || data?.error) {
    const code = data?.error || error?.code;
    const messages = {
      guild_create_failed: "The guild could not be created. Please try again.",
      guild_name_taken: "That guild name is already taken.",
      already_in_guild: "You are already in a guild.",
      player_id_required: "Enter the player's UUID.",
      player_already_in_guild: "That player is already in a guild.",
      owner_only: "Only the guild owner can do that."
    };

    throw new Error(
      messages[code] ||
      data?.message ||
      code ||
      error?.message ||
      "Guild request failed."
    );
  }

  return data;
}

function showStatus(message, isError = false) {
  const status = $("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function load() {
  try {
    const data = await api("guild");

    showStatus("");

    $("inviteList").innerHTML = (data.invites || []).map((invite) => `
      <div class="row cardx">
        <span>Guild invite</span>
        <button class="btn" data-invite-id="${escapeHtml(invite.id)}" data-accept="true">Accept</button>
        <button class="btn" data-invite-id="${escapeHtml(invite.id)}" data-accept="false">Decline</button>
      </div>
    `).join("") || '<p class="muted">No pending invitations.</p>';

    for (const button of document.querySelectorAll("[data-invite-id]")) {
      button.addEventListener("click", async () => {
        button.disabled = true;

        try {
          await api("guild-respond-invite", {
            inviteId: button.dataset.inviteId,
            accept: button.dataset.accept === "true"
          });
          await load();
        } catch (error) {
          showStatus(error.message, true);
          button.disabled = false;
        }
      });
    }

    if (!data.guild) {
      $("create").classList.remove("hidden");
      $("guild").classList.add("hidden");
      return;
    }

    $("create").classList.add("hidden");
    $("guild").classList.remove("hidden");

    $("guildTitle").textContent = data.guild.name;
    $("guildMeta").textContent = `Owner: ${data.guild.owner_id}`;
    $("guildPoints").textContent = `${Number(data.guild.points || 0).toLocaleString()} guild points`;

    $("members").innerHTML = (data.members || []).map((member) => `
      <p>${escapeHtml(member.player_id)} · ${escapeHtml(member.role)}</p>
    `).join("") || "<p class='muted'>No members.</p>";

    $("quests").innerHTML = (data.quests || []).map((quest) => `
      <article class="cardx">
        <h3>${escapeHtml(quest.name)}</h3>
        <p>${escapeHtml(quest.description)}</p>
        <p class="muted">
          Requires ${Number(quest.requirements?.amount ?? 0).toLocaleString()} guild points
          · Rewards ${Number(quest.reward_points ?? 0).toLocaleString()}
        </p>
      </article>
    `).join("") || '<p class="muted">No guild quests yet.</p>';

    const isOwner = data.guild.owner_id === data.currentPlayerId ||
      (data.members || []).some((member) => member.player_id === data.currentPlayerId && member.role === "owner");

    $("ownerTools").classList.toggle("hidden", !isOwner);

    $("inviteBtn").onclick = async () => {
      try {
        await api("guild-invite", {
          guildId: data.guild.id,
          playerId: $("invitePlayer").value.trim()
        });
        $("invitePlayer").value = "";
        await load();
      } catch (error) {
        showStatus(error.message, true);
      }
    };

    $("qSave").onclick = async () => {
      try {
        await api("guild-quest-save", {
          guildId: data.guild.id,
          quest: {
            name: $("qName").value.trim(),
            description: $("qDesc").value.trim(),
            requirements: {
              type: "guild_points",
              amount: Number($("qAmount").value || 100)
            },
            reward_points: Number($("qReward").value || 0)
          }
        });
        await load();
      } catch (error) {
        showStatus(error.message, true);
      }
    };
  } catch (error) {
    showStatus(error.message, true);
  }
}

$("createBtn").onclick = async () => {
  const button = $("createBtn");
  const name = $("guildName").value.trim();

  if (name.length < 2) {
    showStatus("Guild names need at least 2 characters.", true);
    return;
  }

  button.disabled = true;

  try {
    await api("guild-create", { name });
    $("guildName").value = "";
    await load();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
};

load();
