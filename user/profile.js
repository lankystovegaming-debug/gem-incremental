import { cosmeticHtml, cosmeticStyle } from '../src/ui/cosmetics.js';
import { openCustomizer } from './customize.js';
import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { gemNameHtml, gemIconHtml } from "../src/ui/gemStyle.js";
import { getGemStyle } from "../src/ui/gemStyle.js";
import { getGemMutation } from "../src/data/mutations.js";
import { roleForId, roleBadgeHtml } from "../src/ui/roles.js";
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


function showcaseCard(gem, label = "") {
  const name = String(gem?.gem_name ?? "Unknown Gem");
  const style = getGemStyle(name);

  return `
    <article
      class="showcase-gem"
      style="--gem-color:${escapeHtml(style.color)};--gem-glow:${escapeHtml(style.glow ?? "transparent")}"
    >
      ${label ? `<div class="showcase-gem__label">${escapeHtml(label)}</div>` : ""}
      <div class="showcase-gem__icon" aria-hidden="true">${gemIconHtml(name, "gem-icon--profile", Array.isArray(gem?.mutation_ids) ? gem.mutation_ids : (Array.isArray(gem?.mutationIds) ? gem.mutationIds : []))}</div>

      <div class="showcase-gem__body">
        <div class="showcase-gem__name">
          ${gemNameHtml(name, escapeHtml)}
        </div>

        <div class="showcase-gem__rarity">
          ${escapeHtml(rarityLabel(gem?.rarity))}
        </div>

        <div class="showcase-gem__details">
          <span>${formatNumber(gem?.final_weight)}g</span>
          <span>${escapeHtml(mutationText(gem))}</span>
        </div>
      </div>
    </article>
  `;
}


function renderStats(profile) {
  const stats = [
    { label: "Total rolls", value: formatNumber(profile.total_rolls), detail: "Lifetime rolls" },
    { label: "Rarest raw roll", value: profile.raw_roll_rarity ? `1 in ${formatNumber(profile.raw_roll_rarity)}` : "—", detail: "Luck-adjusted roll history" },
    { label: "Lifetime earnings", value: `$${formatMoney(profile.lifetime_earnings)}`, detail: "Money earned" },
    { label: "Gems discovered", value: profile.gems_discovered == null ? "—" : formatNumber(profile.gems_discovered), detail: "Distinct gems in the index" },
    { label: "Achievements", value: profile.achievement_count == null ? "—" : formatNumber(profile.achievement_count), detail: "Completed achievements" },
    { label: "Bundles", value: profile.bundles ? `${profile.bundles.completed.length} / ${profile.bundles.total}` : "—", detail: "Permanent collections" }
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
  const role = roleForId(profile.id);

  const cosmetics = profile.cosmetics || {};
  profileHero.dataset.background = cosmetics.background ? cosmeticStyle(cosmetics.background) : 'default';
  document.querySelector('.profile-page').dataset.decor = cosmetics.decor ? cosmeticStyle(cosmetics.decor) : 'none';
  profileHero.innerHTML = `
    <div class="profile-hero__glow" aria-hidden="true"></div>

    <div class="profile-hero__avatar" data-frame="${cosmetics.frame ? cosmeticStyle(cosmetics.frame) : 'none'}" title="${escapeHtml(cosmetics.frame?.name || '')}">
      ${avatarHtml(profile)}
    </div>

    <div class="profile-hero__identity">
      <div class="eyebrow">PLAYER PROFILE</div>

      <h1 id="profileName">
        ${escapeHtml(username)}
        ${roleBadgeHtml(role)}
        ${profile.title ? `<span class="player-title-badge player-title-badge--profile" style="--player-title-color:${escapeHtml(/^#[0-9a-f]{6}$/i.test(String(profile.title_color ?? "")) ? profile.title_color : "#ffd166")}">${escapeHtml(profile.title)}</span>` : ""}
      </h1>

      <div class="profile-collectible-title">${cosmeticHtml(cosmetics.title)}</div>
      <div class="profile-badges" aria-label="Equipped badges">${(cosmetics.badges || []).slice(0,3).map(item => cosmeticHtml(item)).join('')}</div>
      <p class="profile-joined">${profile.created_at ? `Joined ${escapeHtml(new Date(profile.created_at).toLocaleDateString('en-US', { month:'long', year:'numeric' }))}` : ''}</p>
      <div class="profile-actions"><button class="btn" id="copyPlayerId">Copy Player ID</button><button class="btn btn--primary" id="customizeProfile" hidden>Customize Profile</button></div>
      <span id="profileActionStatus" role="status" aria-live="polite"></span>
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

  showcaseGrid.innerHTML = gems.map((gem, i) => showcaseCard(gem, profile.cosmetics?.showcase_labels?.[i] || `Showcase ${i + 1}`)).join("");
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
        ${gemIconHtml(gem.gem_name, "gem-icon--best-roll", Array.isArray(gem.mutation_ids) ? gem.mutation_ids : [])}
      </div>

      <div>
        <div class="eyebrow">RAREST CURRENT SPECIMEN</div>
        <h3>${gemNameHtml(gem.gem_name, escapeHtml)}</h3>
        <p>
          ${escapeHtml(rarityLabel(gem.rarity))}
          · ${formatNumber(gem.final_weight)}g
          · ${escapeHtml(mutationText(gem))}
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
  document.getElementById('bundleProfileSection').hidden = true;
  document.getElementById('trophyContent').textContent = '';
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
  renderCollectibles(data);
  document.getElementById('copyPlayerId').onclick = async () => {
    try { await navigator.clipboard.writeText(profileId); document.getElementById('profileActionStatus').textContent = 'Player ID copied.'; }
    catch { document.getElementById('profileActionStatus').textContent = `Player ID: ${profileId}`; }
  };
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user?.id === profileId && data.cosmetics) {
    const customize = document.getElementById('customizeProfile');
    customize.hidden = false;
    customize.onclick = () => openCustomizer(loadProfile);
  }
}


function renderCollectibles(profile) {
  const trophies = profile.cosmetics?.trophies || [];
  document.getElementById('trophyContent').innerHTML = trophies.length
    ? trophies.map(item => cosmeticHtml(item, { trophy: true })).join('')
    : '<p class="profile-empty">Accomplishments earned through play will find a home here.</p>';
  const bundles = profile.bundles;
  const section = document.getElementById('bundleProfileSection');
  section.hidden = !bundles;
  if (!bundles) return;
  const completed = new Set(bundles.completed.map(bundle => bundle.id));
  const crown = bundles.crown;
  document.getElementById('bundleProfileContent').innerHTML = `
    <p class="bundle-progress">${bundles.completed.length} / ${bundles.total} collections completed</p>
    <div class="bundle-strip">${(bundles.catalog || bundles.completed).map(bundle => `<div class="bundle-medallion ${completed.has(bundle.id) ? 'is-complete' : ''}"><span aria-hidden="true">${escapeHtml(bundle.icon)}</span><strong>${escapeHtml(bundle.name)}</strong><small>${completed.has(bundle.id) ? 'Completed ✓' : 'Not completed'}</small></div>`).join('')}</div>
    ${crown ? `<div class="profile-highlight crown-jewel"><div class="profile-highlight__gem">${gemIconHtml(crown.gem_name, 'gem-icon--best-roll', crown.mutation_ids || [])}</div><div><div class="eyebrow">👑 CROWN JEWEL</div><h3>${gemNameHtml(crown.gem_name, escapeHtml)}</h3><p>1 in ${formatNumber(crown.rarity)} · ${formatNumber(crown.final_weight_multiplier)}× final weight</p><p>${escapeHtml(mutationText(crown))}${crown.serial_number ? ` · Serial #${formatNumber(crown.serial_number)}` : ''}</p></div></div>` : '<p class="profile-empty">The Crown Jewel awaits a permanent specimen.</p>'}`;
}

loadProfile().catch(() => renderNotFound('This profile could not be loaded right now.'));
