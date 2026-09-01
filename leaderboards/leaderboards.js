import {
  supabase
} from "../src/backend/supabase.js";

import {
  ensurePlayerAuth
} from "../src/backend/auth.js";

import { gemNameHtml } from "../src/ui/gemStyle.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";
import gems from "../src/data/gems.js";
import { loadShowcasesFor } from "../src/backend/cloudShowcase.js";
import { showcasePinsHtml } from "../src/ui/showcaseRender.js";
import { roleForUsername, roleBadgeHtml } from "../src/ui/roles.js";

let liveMutationCatalog = Object.fromEntries(
  Object.values(GEM_MUTATIONS).map((mutation) => [mutation.id, mutation])
);

// Role tag ([DEV]/[OWNER]/[SWEAT]) shown before a ranked player's name.
function roleTag(username) {
  return roleBadgeHtml(roleForUsername(username));
}


const leaderboardStatus =
  document.getElementById(
    "leaderboardStatus"
  );

const leaderboardCard =
  document.getElementById(
    "leaderboardCard"
  );

const totalRollsTab =
  document.getElementById(
    "totalRollsTab"
  );

const rarestGemTab =
  document.getElementById(
    "rarestGemTab"
  );

const lifetimeEarningsTab =
  document.getElementById(
    "lifetimeEarningsTab"
  );

const gemsFoundTab =
  document.getElementById(
    "gemsFoundTab"
  );

const bestRollTab =
  document.getElementById(
    "bestRollTab"
  );

const mostWeightTab =
  document.getElementById(
    "mostWeightTab"
  );

const rawRareRollTab =
  document.getElementById(
    "rawRareRollTab"
  );

const baseLuckTab =
  document.getElementById(
    "baseLuckTab"
  );

const museumPrestigeTab = document.getElementById("museumPrestigeTab");


let leaderboardData = {
  totalRolls: [],
  rarestGem: [],
  lifetimeEarnings: [],
  gemsFound: [],
  bestRoll: [],
  mostWeight: [],
  rawRareRoll: [],
  baseLuck: [],
  museumPrestige: []
};


let activeLeaderboard =
  "totalRolls";


// username -> avatar URL, filled once the boards load.
let avatarMap = {};
let showcaseMap = {};
let profileIdMap = {};

function showcasePins(username) {
  return showcasePinsHtml(showcaseMap[username]);
}


// =========================================================
// STATUS
// =========================================================

function setStatus(
  message,
  isError = false
) {
  leaderboardStatus.textContent =
    message;

  leaderboardStatus.classList.toggle(
    "error",
    isError
  );
}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


// =========================================================
// AVATARS
//
// The leaderboards function returns names + stats but no
// picture. A single SECURITY DEFINER RPC maps the ranked
// usernames to their avatar URLs (public bucket / Google URLs),
// so the board can show profile pictures without exposing any
// other player data.
// =========================================================

function avatarHtml(
  username
) {
  const url =
    avatarMap[username];

  const initial =
    String(username ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";

  if (url) {
    return `<span class="lb-avatar"><img src="${escapeHtml(
      url
    )}" alt="" referrerpolicy="no-referrer"></span>`;
  }

  return `<span class="lb-avatar lb-avatar--fallback">${escapeHtml(
    initial
  )}</span>`;
}


async function loadAvatars() {
  const names = new Set();

  for (const key of [
    "totalRolls",
    "rarestGem",
    "lifetimeEarnings",
    "gemsFound",
    "bestRoll",
    "mostWeight",
    "rawRareRoll",
    "baseLuck"
  ]) {
    for (const player of leaderboardData[key]) {
      if (player.username) {
        names.add(player.username);
      }
    }
  }

  if (names.size === 0) {
    avatarMap = {};
    showcaseMap = {};
    profileIdMap = {};
    return;
  }

  const [avatarResult, showcases, profileResult] = await Promise.all([
    supabase.rpc("get_leaderboard_avatars", {
      p_usernames: [...names]
    }),

    loadShowcasesFor([...names]),

    supabase.rpc("get_profile_ids_for_usernames", {
      p_usernames: [...names]
    })
  ]);

  const {
    data: avatarData,
    error: avatarError
  } = avatarResult;

  avatarMap =
    !avatarError &&
    avatarData &&
    typeof avatarData === "object"
      ? avatarData
      : {};

  showcaseMap =
    showcases &&
    typeof showcases === "object"
      ? showcases
      : {};

  profileIdMap =
    !profileResult.error &&
    profileResult.data &&
    typeof profileResult.data === "object"
      ? profileResult.data
      : {};
}


// =========================================================
// FORMATTERS
// =========================================================

function formatNumber(
  value
) {
  return Number(
    value ?? 0
  )
    .toLocaleString(
      "en-US"
    );
}


function formatMoney(
  value
) {
  return Number(
    value ?? 0
  )
    .toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
}


// The top three are marked by colour and weight in the
// stylesheet rather than medal emoji.
function rankDisplay(
  rank
) {
  return `#${rank}`;
}


// =========================================================
// TAB STATE
// =========================================================

function updateTabs() {
  totalRollsTab.classList.toggle(
    "active",
    activeLeaderboard ===
      "totalRolls"
  );

  rarestGemTab.classList.toggle(
    "active",
    activeLeaderboard ===
      "rarestGem"
  );

  lifetimeEarningsTab.classList.toggle(
    "active",
    activeLeaderboard ===
      "lifetimeEarnings"
  );

  gemsFoundTab.classList.toggle(
    "active",
    activeLeaderboard ===
      "gemsFound"
  );

  bestRollTab.classList.toggle(
    "active",
    activeLeaderboard ===
      "bestRoll"
  );

  mostWeightTab.classList.toggle("active", activeLeaderboard === "mostWeight");
  rawRareRollTab.classList.toggle("active", activeLeaderboard === "rawRareRoll");
  baseLuckTab.classList.toggle("active", activeLeaderboard === "baseLuck");
  museumPrestigeTab.classList.toggle("active", activeLeaderboard === "museumPrestige");
}


// =========================================================
// TOTAL ROLLS
// =========================================================

function renderTotalRolls() {
  const entries =
    leaderboardData.totalRolls;


  if (!entries.length) {
    leaderboardCard.innerHTML = `
      <h2>
        Total Rolls
      </h2>

      <p class="empty-message">
        No ranked players yet.
      </p>
    `;

    return;
  }


  const rows =
    entries.map(
      player => `
        <div class="leaderboard-row">
          <div class="rank">
            ${rankDisplay(
              player.rank
            )}
          </div>

          <div class="player-name" data-profile-username="${escapeHtml(player.username)}">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${roleTag(player.username)}${escapeHtml(
              player.username
            )}</span>
            ${showcasePins(player.username)}
          </div>

          <div class="score">
            ${formatNumber(
              player.totalRolls
            )}
          </div>
        </div>
      `
    )
      .join(
        ""
      );


  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>
          Total Rolls
        </h2>

        <p class="leaderboard-description">
          Players ranked by total
          lifetime rolls.
        </p>
      </div>
    </div>

    <div class="leaderboard-header">
      <div>
        Rank
      </div>

      <div>
        Player
      </div>

      <div class="score">
        Rolls
      </div>
    </div>

    <div class="leaderboard-list">
      ${rows}
    </div>
  `;
}


// =========================================================
// RAREST GEM
// =========================================================

function renderRarestGem() {
  const entries =
    leaderboardData.rarestGem;


  if (!entries.length) {
    leaderboardCard.innerHTML = `
      <h2>
        Rarest Gem
      </h2>

      <p class="empty-message">
        No inventory gems yet.
      </p>
    `;

    return;
  }


  const rows =
    entries.map(
      player => `
        <div class="leaderboard-row">
          <div class="rank">
            ${rankDisplay(
              player.rank
            )}
          </div>

          <div class="player-name" data-profile-username="${escapeHtml(player.username)}">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-block">
              <span class="lb-name-text">${roleTag(player.username)}${escapeHtml(
                player.username
              )}${showcasePins(player.username)}</span>
              <span class="lb-best-gem">
                ${player.gemName
                  ? gemNameHtml(player.gemName, escapeHtml)
                  : "Unknown"}
              </span>
            </span>
          </div>

          <div class="score gem-score">
            <strong>
              1 in
              ${formatNumber(
                player.rarity
              )}
            </strong>

            <span>
              ${mutationNamesHtml(player)}
            </span>

            <span>
              ${mutationChanceProductLabel(player)}
            </span>
          </div>
        </div>
      `
    )
      .join(
        ""
      );


  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>
          Rarest Gem
        </h2>

        <p class="leaderboard-description">
          The rarest gem currently in each player's inventory.
          Ranking uses the same effective-chance formula as Best Roll:
          base gem denominator × every mutation denominator. Price is ignored.
        </p>
      </div>
    </div>

    <div class="leaderboard-header">
      <div>
        Rank
      </div>

      <div>
        Player / Gem
      </div>

      <div class="score">
        Effective Chance
      </div>
    </div>

    <div class="leaderboard-list">
      ${rows}
    </div>
  `;
}


// =========================================================
// LIFETIME EARNINGS
// =========================================================

function renderLifetimeEarnings() {
  const entries =
    leaderboardData
      .lifetimeEarnings;


  if (!entries.length) {
    leaderboardCard.innerHTML = `
      <h2>
        Lifetime Earnings
      </h2>

      <p class="empty-message">
        No ranked players yet.
      </p>
    `;

    return;
  }


  const rows =
    entries.map(
      player => `
        <div class="leaderboard-row">
          <div class="rank">
            ${rankDisplay(
              player.rank
            )}
          </div>

          <div class="player-name" data-profile-username="${escapeHtml(player.username)}">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${roleTag(player.username)}${escapeHtml(
              player.username
            )}</span>
            ${showcasePins(player.username)}
          </div>

          <div class="score">
            $${formatMoney(
              player.lifetimeEarnings
            )}
          </div>
        </div>
      `
    )
      .join(
        ""
      );


  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>
          Lifetime Earnings
        </h2>

        <p class="leaderboard-description">
          Total money earned by selling
          gems. (calculated from 23 August)
        </p>
      </div>
    </div>

    <div class="leaderboard-header">
      <div>
        Rank
      </div>

      <div>
        Player
      </div>

      <div class="score">
        Earnings
      </div>
    </div>

    <div class="leaderboard-list">
      ${rows}
    </div>
  `;
}


// =========================================================
// GEMS FOUND
// =========================================================

function renderGemsFound() {
  const entries =
    leaderboardData.gemsFound;


  if (!entries.length) {
    leaderboardCard.innerHTML = `
      <h2>
        Gems Found
      </h2>

      <p class="empty-message">
        No ranked players yet.
      </p>
    `;

    return;
  }


  const rows =
    entries.map(
      player => `
        <div class="leaderboard-row">
          <div class="rank">
            ${rankDisplay(
              player.rank
            )}
          </div>

          <div class="player-name" data-profile-username="${escapeHtml(player.username)}">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${roleTag(player.username)}${escapeHtml(
              player.username
            )}</span>
            ${showcasePins(player.username)}
          </div>

          <div class="score">
            ${formatNumber(
              player.gemsFound
            )}
          </div>
        </div>
      `
    )
      .join(
        ""
      );


  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>
          Gems Found
        </h2>

        <p class="leaderboard-description">
          The base rarity denominator of every
          unmutated gem found, added together.
        </p>
      </div>
    </div>

    <div class="leaderboard-header">
      <div>
        Rank
      </div>

      <div>
        Player
      </div>

      <div class="score">
        Score
      </div>
    </div>

    <div class="leaderboard-list">
      ${rows}
    </div>
  `;
}



// =========================================================
// BEST ROLL
// =========================================================

function formatMultiplier(value) {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n)) return "1x";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}x`;
}

function mutationNamesHtml(player) {
  const ids = Array.isArray(player.mutation_ids) ? player.mutation_ids : [];
  if (!ids.length) return '<span class="lb-no-mutation">No mutation</span>';
  return ids.map(id => {
    const mutation = liveMutationCatalog?.[id] ?? GEM_MUTATIONS?.[id];
    return escapeHtml(mutation?.name ?? String(id).replaceAll("-", " "));
  }).join('<span class="lb-mutation-dot">·</span>');
}

function mutationChanceProductLabel(player) {
  const ids = Array.isArray(player.mutation_ids) ? player.mutation_ids : [];
  if (!ids.length) return "No mutation multiplier";

  const factors = ids
    .map(id => Number(liveMutationCatalog?.[id]?.chance ?? GEM_MUTATIONS?.[id]?.chance))
    .filter(Number.isFinite);

  if (!factors.length) return "Mutation odds unavailable";

  const product = factors.reduce(
    (total, factor) => total * factor,
    1
  );

  return `${factors.map(value => `1/${formatNumber(value)}`).join(" × ")} = 1/${formatNumber(product)}`;
}

function baseGemRarity(player) {
  const gem = gems.find(entry => entry.name === player.gem_name);
  return Number(gem?.rarity ?? player.rarity ?? 0);
}

function renderBestRoll() {
  const entries = leaderboardData.bestRoll;

  if (leaderboardData.bestRollLoadFailed) {
    leaderboardCard.innerHTML = `
      <h2>Best Roll</h2>
      <p class="empty-message">Best Roll is temporarily unavailable. Please try again.</p>
    `;
    return;
  }

  if (!entries.length) {
    leaderboardCard.innerHTML = `
      <h2>Best Roll</h2>
      <p class="empty-message">No saved rolls yet.</p>
    `;
    return;
  }

  const rows = entries.map(player => `
    <div class="leaderboard-row leaderboard-row--best-roll">
      <div class="rank">${rankDisplay(player.rank)}</div>
      <div class="player-name" data-profile-username="${escapeHtml(player.username)}">
        ${avatarHtml(player.username)}
        <span class="lb-name-block">
          <span class="lb-name-text">${roleTag(player.username)}${escapeHtml(player.username)}${showcasePins(player.username)}</span>
          <span class="lb-best-gem">${player.gem_name ? gemNameHtml(player.gem_name, escapeHtml) : "Unknown"}</span>
        </span>
      </div>
      <div class="score gem-score">
        <strong>1 in ${formatNumber(player.rarity)}</strong>
        <span>${formatNumber(player.final_weight)}g · $${formatMoney(player.value)}</span>
        <span>${mutationNamesHtml(player)} · ${mutationChanceProductLabel(player)}</span>
        <span class="lb-best-roll-formula">${formatNumber(baseGemRarity(player))} × ${formatNumber(player.mutation_chance_product ?? 1)} = ${formatNumber(player.rarity)} effective rarity</span>
      </div>
    </div>
  `).join("");

  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>Best Roll</h2>
        <p class="leaderboard-description">
          Best rolls of all time across every player. Every successful roll is
          eligible, even after the specimen leaves inventory. Ranking uses
          effective rarity only: base gem denominator × every mutation
          denominator. Price is ignored. (calculated from 24 August)
        </p>
      </div>
    </div>

    <div class="leaderboard-header leaderboard-header--best-roll">
      <div>Rank</div>
      <div>Player / Gem</div>
      <div class="score">Effective Rarity</div>
    </div>
    <div class="leaderboard-list">${rows}</div>
  `;
}


// =========================================================
// ADDITIONAL ALL-TIME BOARDS
// =========================================================

function renderMostWeight() {
  const entries = leaderboardData.mostWeight;
  if (!entries.length) {
    leaderboardCard.innerHTML = `<h2>Highest Weight</h2><p class="empty-message">No roll history yet.</p>`;
    return;
  }
  const rows = entries.map(player => `
    <div class="leaderboard-row">
      <div class="rank">${rankDisplay(player.rank)}</div>
      <div class="player-name" data-profile-username="${escapeHtml(player.username)}">${avatarHtml(player.username)}
        <span class="lb-name-block"><span class="lb-name-text">${roleTag(player.username)}${escapeHtml(player.username)}</span>
        <span class="lb-best-gem">${gemNameHtml(player.gem_name, escapeHtml)}</span></span>
      </div>
      <div class="score"><strong>${formatNumber(player.final_weight)}g</strong>
        <span>${mutationNamesHtml(player)}</span></div>
    </div>`).join("");
  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row"><div><h2>Highest Weight</h2>
    <p class="leaderboard-description">Highest final specimen weight from real rolls, all time. Loot-box rewards are excluded.</p></div></div>
    <div class="leaderboard-header"><div>Rank</div><div>Player / Gem</div><div class="score">Weight</div></div>
    <div class="leaderboard-list">${rows}</div>`;
}

function renderRawRareRoll() {
  const entries = leaderboardData.rawRareRoll;
  if (!entries.length) {
    leaderboardCard.innerHTML = `<h2>Raw Rare Roll</h2><p class="empty-message">No roll history yet.</p>`;
    return;
  }
  const rows = entries.map(player => `
    <div class="leaderboard-row">
      <div class="rank">${rankDisplay(player.rank)}</div>
      <div class="player-name" data-profile-username="${escapeHtml(player.username)}">${avatarHtml(player.username)}
        <span class="lb-name-block"><span class="lb-name-text">${roleTag(player.username)}${escapeHtml(player.username)}</span>
        <span class="lb-best-gem">${gemNameHtml(player.gem_name, escapeHtml)}</span></span>
      </div>
      <div class="score"><strong>1 in ${formatNumber(player.raw_rarity)}</strong>
        <span>Raw Luck ${formatNumber(player.raw_luck)}×</span></div>
    </div>`).join("");
  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row"><div><h2>Raw Rare Roll</h2>
    <p class="leaderboard-description">Rarest base-gem roll of all time, adjusted only by the Luck that was actually active on that roll. Mutations are ignored.</p></div></div>
    <div class="leaderboard-header"><div>Rank</div><div>Player / Gem</div><div class="score">Raw Chance</div></div>
    <div class="leaderboard-list">${rows}</div>`;
}

function renderBaseLuck() {
  const entries = leaderboardData.baseLuck;
  if (!entries.length) {
    leaderboardCard.innerHTML = `<h2>Most Base Luck</h2><p class="empty-message">No players yet.</p>`;
    return;
  }
  const rows = entries.map(player => `
    <div class="leaderboard-row">
      <div class="rank">${rankDisplay(player.rank)}</div>
      <div class="player-name" data-profile-username="${escapeHtml(player.username)}">${avatarHtml(player.username)}
        <span class="lb-name-block"><span class="lb-name-text">${roleTag(player.username)}${escapeHtml(player.username)}</span>
        <span class="lb-best-gem">Permanent / equipment Luck</span></span>
      </div>
      <div class="score"><strong>${formatNumber(player.base_luck)}×</strong>
        <span>No temporary boosts or admin events</span></div>
    </div>`).join("");
  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row"><div><h2>Most Base Luck</h2>
    <p class="leaderboard-description">Highest current permanent/equipment Luck from the player and currently equipped equipment. Temporary boosts, one-roll potions, and admin events do not count.</p></div></div>
    <div class="leaderboard-header"><div>Rank</div><div>Player</div><div class="score">Base Luck</div></div>
    <div class="leaderboard-list">${rows}</div>`;
}

function renderMuseumPrestige() {
  const entries = leaderboardData.museumPrestige;
  if (!entries.length) {
    leaderboardCard.innerHTML = `<h2>Museum Prestige</h2><p class="empty-message">No curated museums yet.</p>`;
    return;
  }
  const rows = entries.map(player => `<div class="leaderboard-row">
    <div class="rank">${rankDisplay(player.rank)}</div>
    <div class="player-name" data-profile-username="${escapeHtml(player.username)}">${avatarHtml(player.username)}<span class="lb-name-block"><span class="lb-name-text">${roleTag(player.username)}${escapeHtml(player.username)}</span><span class="lb-best-gem">Tier ${formatNumber(player.tier)} · ${formatNumber(player.collections_completed)} permanent collections</span></span></div>
    <div class="score museum-prestige-score"><span><small>Total Prestige</small><strong>${formatNumber(player.prestige)}</strong></span><span><small>Active Exhibit Score</small><strong>${formatNumber(player.highest_exhibit_score)}</strong></span></div>
  </div>`).join("");
  leaderboardCard.innerHTML = `<div class="leaderboard-title-row"><div><h2>Museum Prestige</h2><p class="leaderboard-description">Current valid Museum Prestige from active exhibits and completed collections. Removing an exhibit immediately updates its score.</p></div></div><div class="leaderboard-header"><div>Rank</div><div>Curator</div><div class="score">Prestige</div></div><div class="leaderboard-list">${rows}</div>`;
}

// =========================================================
// PROFILE LINKS
//
// Leaderboard rows keep their existing markup so the boards remain
// compact, then this pass turns each ranked player identity into a
// real link. The destination is the canonical /user/<uuid>/ route.
// =========================================================

function wireProfileLinks() {
  const identities = leaderboardCard.querySelectorAll(
    "[data-profile-username]"
  );

  for (const identity of identities) {
    if (identity.closest("a.leaderboard-profile-link")) {
      continue;
    }

    const username = identity.dataset.profileUsername;
    const userId = profileIdMap[username];

    if (!userId) {
      continue;
    }

    const link = document.createElement("a");

    link.className = "leaderboard-profile-link";
    link.href = `/user/${encodeURIComponent(userId)}/`;
    link.title = `View ${username}'s profile`;

    identity.parentNode.insertBefore(link, identity);
    link.appendChild(identity);
  }
}


// =========================================================
// RENDER ACTIVE LEADERBOARD
// =========================================================

function renderLeaderboard() {
  updateTabs();

  if (activeLeaderboard === "totalRolls") {
    renderTotalRolls();
  } else if (activeLeaderboard === "rarestGem") {
    renderRarestGem();
  } else if (activeLeaderboard === "gemsFound") {
    renderGemsFound();
  } else if (activeLeaderboard === "bestRoll") {
    renderBestRoll();
  } else if (activeLeaderboard === "mostWeight") {
    renderMostWeight();
  } else if (activeLeaderboard === "rawRareRoll") {
    renderRawRareRoll();
  } else if (activeLeaderboard === "baseLuck") {
    renderBaseLuck();
  } else if (activeLeaderboard === "museumPrestige") {
    renderMuseumPrestige();
  } else {
    renderLifetimeEarnings();
  }

  wireProfileLinks();
}


// =========================================================
// LOAD DATA
// =========================================================

async function loadLeaderboards() {
  setStatus(
    "Loading leaderboards..."
  );


  // The browser cannot execute the expensive leaderboard RPCs directly.
  // One authenticated, cached Edge Function call serves every board.
  const { data: response, error } = await supabase.functions.invoke("leaderboards");

  const data = {
    totalRolls: (response?.totalRolls ?? []).map((row) => ({
      rank: Number(row.rank ?? 0),
      username: row.username,
      totalRolls: Number(row.total_rolls ?? row.totalRolls ?? 0)
    })),
    lifetimeEarnings: (response?.lifetimeEarnings ?? []).map((row) => ({
      rank: Number(row.rank ?? 0),
      username: row.username,
      lifetimeEarnings: Number(row.lifetime_earnings ?? row.lifetimeEarnings ?? 0)
    }))
  };
  const liveMutations = response?.mutations;
  if (Array.isArray(liveMutations)) {
    liveMutationCatalog = Object.fromEntries(
      liveMutations.map((mutation) => [
        String(mutation.id),
        {
          id: String(mutation.id),
          name: String(mutation.name),
          chance: Number(mutation.chance),
          multiplier: Number(mutation.multiplier),
          description: String(mutation.description ?? ""),
          icon: String(mutation.icon ?? "✦"),
          color: String(mutation.color ?? "#9fdcff")
        }
      ])
    );
  }


  if (error) {
    console.error(
      "Leaderboard load failed:",
      error
    );


    setStatus(
      "Could not load leaderboards.",
      true
    );


    leaderboardCard.innerHTML = `
      <p class="empty-message">
        Leaderboards are unavailable.
      </p>
    `;


    return;
  }


  const gemsFoundData = response?.gemsFound;
  const bestRollData = response?.bestRoll;
  const mostWeightData = response?.mostWeight;
  const rawRareRollData = response?.rawRareRoll;
  const baseLuckData = response?.baseLuck;
  const museumPrestigeData = response?.museumPrestige;

  // Rarest Gem intentionally uses the exact same inventory-only effective
  // rarity logic as Best Roll: base gem denominator multiplied by every
  // mutation's denominator. This prevents the old base-rarity / sold-gem
  // leaderboard from disagreeing with Best Roll.
  const rarestGemData = response?.rarestGem;


  leaderboardData = {
    totalRolls:
      Array.isArray(
        data?.totalRolls
      )
        ? data.totalRolls
        : [],

    rarestGem:
      Array.isArray(
        rarestGemData
      )
        ? rarestGemData.map(player => ({
            rank: player.rank,
            username: player.username,
            gemName: player.gem_name,
            rarity: player.rarity,
            value: player.value,
            final_weight: player.final_weight,
            mutation_ids: Array.isArray(player.mutation_ids)
              ? player.mutation_ids
              : [],
            mutation_chance_product: player.mutation_chance_product
          }))
        : [],

    lifetimeEarnings:
      Array.isArray(
        data?.lifetimeEarnings
      )
        ? data.lifetimeEarnings
        : [],

    gemsFound:
      Array.isArray(
        gemsFoundData
      )
        ? gemsFoundData.map(
            player => ({
              rank: player.rank,
              username: player.username,
              gemsFound:
                player.gems_found
            })
          )
        : [],

    bestRoll:
      Array.isArray(bestRollData)
        ? bestRollData
            .map(player => ({
              rank: player.rank,
              username: player.username,
              gem_name: player.gem_name,
              rarity: Number(player.rarity ?? 0),
              value: player.value,
              final_weight: player.final_weight,
              mutation_ids: Array.isArray(player.mutation_ids) ? player.mutation_ids : [],
              mutation_multiplier: player.mutation_multiplier,
              mutation_chance_multiplier: player.mutation_chance_multiplier,
              base_rarity: Number(player.base_rarity ?? 0),
              mutation_chance_product: Number(player.mutation_chance_product ?? 1)
            }))
            .sort((a, b) => b.rarity - a.rarity || b.base_rarity - a.base_rarity)
            .map((player, index) => ({ ...player, rank: index + 1 }))
        : [],

    bestRollLoadFailed: Boolean(bestRollError),

    mostWeight:
      Array.isArray(mostWeightData)
        ? mostWeightData.map(player => ({ ...player }))
        : [],

    rawRareRoll:
      Array.isArray(rawRareRollData)
        ? rawRareRollData.map(player => ({ ...player }))
        : [],

    baseLuck:
      Array.isArray(baseLuckData)
        ? baseLuckData.map(player => ({ ...player }))
        : [],

    museumPrestige:
      Array.isArray(museumPrestigeData)
        ? museumPrestigeData.map(player => ({ ...player }))
        : []
  };


  // Profile pictures for the ranked players (best-effort — the
  // board still renders if this fails).
  await loadAvatars();


  setStatus(
    ""
  );


  renderLeaderboard();
}


// =========================================================
// TAB EVENTS
// =========================================================

totalRollsTab.addEventListener(
  "click",
  () => {
    activeLeaderboard =
      "totalRolls";

    renderLeaderboard();
  }
);


rarestGemTab.addEventListener(
  "click",
  () => {
    activeLeaderboard =
      "rarestGem";

    renderLeaderboard();
  }
);


lifetimeEarningsTab.addEventListener(
  "click",
  () => {
    activeLeaderboard =
      "lifetimeEarnings";

    renderLeaderboard();
  }
);


gemsFoundTab.addEventListener(
  "click",
  () => {
    activeLeaderboard =
      "gemsFound";

    renderLeaderboard();
  }
);

bestRollTab.addEventListener(
  "click",
  () => {
    activeLeaderboard =
      "bestRoll";

    renderLeaderboard();
  }
);

mostWeightTab.addEventListener("click", () => {
  activeLeaderboard = "mostWeight";
  renderLeaderboard();
});

rawRareRollTab.addEventListener("click", () => {
  activeLeaderboard = "rawRareRoll";
  renderLeaderboard();
});

baseLuckTab.addEventListener("click", () => {
  activeLeaderboard = "baseLuck";
  renderLeaderboard();
});

museumPrestigeTab.addEventListener("click", () => {
  activeLeaderboard = "museumPrestige";
  renderLeaderboard();
});


// =========================================================
// START
//
// The leaderboards function needs a signed-in caller. A player
// arriving here first — from a shared link, say — has no session
// yet, so one is created before the board is requested.
// =========================================================

async function startLeaderboards() {
  const user =
    await ensurePlayerAuth();


  if (!user) {
    setStatus(
      "Could not sign you in. Refresh to try again.",
      true
    );

    return;
  }


  await loadLeaderboards();
}


startLeaderboards();
