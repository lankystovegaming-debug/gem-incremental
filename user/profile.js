import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { gemNameHtml, gemIconHtml } from "../src/ui/gemStyle.js";
import { getGemStyle } from "../src/ui/gemStyle.js";
import { getGemMutation } from "../src/data/mutations.js";
import { roleForUsername, roleBadgeHtml } from "../src/ui/roles.js";
import { escapeHtml, rarityLabel } from "../src/ui/format.js";

mountShell({
  page: "profile",
  base: "/"
});

const profileHero = document.getElementById("profileHero");
const profileStats = document.getElementById("profileStats");
const showcaseGrid = document.getElementById("showcaseGrid");
const bestRollSection = document.getElementById("bestRollSection");
const bestRollContent = document.getElementById("bestRollContent");


function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}


function formatMoney(value) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}


function getProfileIdFromPath() {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  const parts = pathname.split("/").filter(Boolean);

  const userIndex = parts.lastIndexOf("user");

  if (userIndex !== -1 && parts[userIndex + 1]) {
    return parts[userIndex + 1];
  }

  return new URLSearchParams(window.location.search).get("id");
}


function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "")
  );
}


function avatarHtml(profile) {
  if (profile.avatar_url) {
    return `
      <img
        class="profile-avatar__image"
        src="${escapeHtml(profile.avatar_url)}"
        alt=""
        referrerpolicy="no-referrer"
      >
    `;
  }

  const initial = String(profile.username ?? "P")
    .trim()
    .charAt(0)
    .toUpperCase() || "P";

  return `
    <span class="profile-avatar__fallback">
      ${escapeHtml(initial)}
    </span>
  `;
}


function mutationText(gem) {
  const ids = Array.isArray(gem?.mutation_ids)
    ? gem.mutation_ids
    : [];

  if (!ids.length) {
    return "No mutation";
  }

  return ids
    .map((id) => getGemMutation(id)?.name ?? String(id))
    .join(" · ");
}


function showcaseCard(gem) {
  const name = String(gem?.gem_name ?? "Unknown Gem");
  const style = getGemStyle(name);

  return `
    <article
      class="showcase-gem"
      style="--gem-color:${escapeHtml(style.color)};--gem-glow:${escapeHtml(style.glow ?? "transparent")}"
    >
      <div class="showcase-gem__icon" aria-hidden="true">${gemIconHtml(name, "gem-icon--profile")}</div>

      <div class="showcase-gem__body">
        <div class="showcase-gem__name">
          ${gemNameHtml(name, escapeHtml)}
        </div>

        <div class="showcase-gem__rarity">
          ${escapeHtml(rarityLabel(gem?.rarity))}
        </div>

        <div class="showcase-gem__details">
          <span>${formatNumber(gem?.final_weight)}g</span>
          <span>${mutationText(gem)}</span>
        </div>
      </div>
    </article>
  `;
}


function renderStats(profile) {
  const stats = [
    {
      label: "Total rolls",
      value: formatNumber(profile.total_rolls),
      detail: "Lifetime rolls"
    },
    {
      label: "Gems held",
      value: formatNumber(profile.inventory_count),
      detail: `${formatNumber(profile.inventory_capacity)} inventory capacity`
    },
    {
      label: "Lifetime earnings",
      value: `$${formatMoney(profile.lifetime_earnings)}`,
      detail: "Money earned"
    },
    {
      label: "Mutation luck",
      value: `${Number(profile.mutation_luck ?? 1).toLocaleString("en-US", {
        maximumFractionDigits: 2
      })}×`,
      detail: "Current multiplier"
    },
    {
      label: "Rarest gem",
      value: profile.rarest_gem_name || "None",
      detail: profile.rarest_gem_rarity
        ? `1 in ${formatNumber(profile.rarest_gem_rarity)}`
        : "No rarest gem recorded"
    },
    {
      label: "Showcase",
      value: `${Array.isArray(profile.showcase) ? profile.showcase.length : 0}/3`,
      detail: "Pinned gems"
    }
  ];

  profileStats.innerHTML = stats
    .map(
      (stat) => `
        <article class="profile-stat card">
          <span class="profile-stat__label">${escapeHtml(stat.label)}</span>
          <strong class="profile-stat__value">${escapeHtml(stat.value)}</strong>
          <span class="profile-stat__detail">${escapeHtml(stat.detail)}</span>
        </article>
      `
    )
    .join("");
}


function renderHero(profile) {
  const username = profile.username || "Guest Player";
  const role = roleForUsername(username);

  profileHero.innerHTML = `
    <div class="profile-hero__glow" aria-hidden="true"></div>

    <div class="profile-hero__avatar">
      ${avatarHtml(profile)}
    </div>

    <div class="profile-hero__identity">
      <div class="eyebrow">PLAYER PROFILE</div>

      <h1 id="profileName">
        ${escapeHtml(username)}
        ${roleBadgeHtml(role)}
      </h1>

      <p>
        Player ID
        <code>${escapeHtml(profile.id)}</code>
      </p>
    </div>
  `;
}


function renderShowcase(profile) {
  const gems = Array.isArray(profile.showcase)
    ? profile.showcase.slice(0, 3)
    : [];

  if (!gems.length) {
    showcaseGrid.innerHTML = `
      <div class="profile-empty">
        This player has not selected any showcase gems yet.
      </div>
    `;

    return;
  }

  showcaseGrid.innerHTML = gems.map(showcaseCard).join("");
}


function renderBestRoll(profile) {
  const gem = profile.best_roll;

  if (!gem) {
    bestRollSection.hidden = true;
    return;
  }

  bestRollSection.hidden = false;

  bestRollContent.innerHTML = `
    <div class="profile-highlight">
      <div class="profile-highlight__gem">
        ${gemIconHtml(gem.gem_name, "gem-icon--best-roll")}
      </div>

      <div>
        <div class="eyebrow">RAREST CURRENT SPECIMEN</div>
        <h3>${gemNameHtml(gem.gem_name, escapeHtml)}</h3>
        <p>
          ${escapeHtml(rarityLabel(gem.rarity))}
          · ${formatNumber(gem.final_weight)}g
          · ${mutationText(gem)}
        </p>
      </div>
    </div>
  `;
}


function renderNotFound(message) {
  profileHero.innerHTML = `
    <div class="profile-error">
      <div class="eyebrow">PLAYER PROFILE</div>
      <h1>Profile unavailable</h1>
      <p>${escapeHtml(message)}</p>
      <a class="btn btn--primary" href="../leaderboards/">
        Back to Leaderboards
      </a>
    </div>
  `;

  profileStats.innerHTML = "";
  showcaseGrid.innerHTML = "";
  bestRollSection.hidden = true;
}


async function loadProfile() {
  const profileId = getProfileIdFromPath();

  if (!isUuid(profileId)) {
    renderNotFound("The player ID in this URL is not valid.");
    return;
  }

  const { data, error } = await supabase.rpc("get_public_profile", {
    p_user_id: profileId
  });

  if (error) {
    console.error("[PROFILE] Could not load profile:", error);
    renderNotFound("This profile could not be loaded right now.");
    return;
  }

  if (!data) {
    renderNotFound("That player does not exist.");
    return;
  }

  document.title = `${data.username || "Player"} · Gem Incremental`;

  renderHero(data);
  renderStats(data);
  renderShowcase(data);
  renderBestRoll(data);
}


loadProfile();
