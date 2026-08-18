import {
  supabase
} from "../src/backend/supabase.js";

import {
  ensurePlayerAuth
} from "../src/backend/auth.js";

import { gemNameHtml } from "../src/ui/gemStyle.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";


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


let leaderboardData = {
  totalRolls: [],
  rarestGem: [],
  lifetimeEarnings: [],
  gemsFound: [],
  bestRoll: []
};


let activeLeaderboard =
  "totalRolls";


// username -> avatar URL, filled once the boards load.
let avatarMap = {};


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
    "bestRoll"
  ]) {
    for (const player of leaderboardData[key]) {
      if (player.username) {
        names.add(player.username);
      }
    }
  }

  if (names.size === 0) {
    avatarMap = {};

    return;
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_leaderboard_avatars",
      {
        p_usernames: [...names]
      }
    );

  avatarMap =
    !error && data && typeof data === "object"
      ? data
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

          <div class="player-name">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${escapeHtml(
              player.username
            )}</span>
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

          <div class="player-name">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${escapeHtml(
              player.username
            )}</span>
          </div>

          <div class="score gem-score">
            <strong>
              ${player.gemName
                ? gemNameHtml(player.gemName, escapeHtml)
                : "Unknown"}
            </strong>

            <span>
              1 in
              ${formatNumber(
                player.rarity
              )}
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
          Players ranked by the rarest
          gem they have ever rolled.
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
        Rarest Gem
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

          <div class="player-name">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${escapeHtml(
              player.username
            )}</span>
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
          gems.
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

          <div class="player-name">
            ${avatarHtml(
              player.username
            )}
            <span class="lb-name-text">${escapeHtml(
              player.username
            )}</span>
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
    const mutation = GEM_MUTATIONS?.find?.(item => item.id === id);
    return escapeHtml(mutation?.name ?? String(id).replaceAll("-", " "));
  }).join('<span class="lb-mutation-dot">·</span>');
}

function renderBestRoll() {
  const entries = leaderboardData.bestRoll;

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
      <div class="player-name">
        ${avatarHtml(player.username)}
        <span class="lb-name-block">
          <span class="lb-name-text">${escapeHtml(player.username)}</span>
          <span class="lb-best-gem">${player.gem_name ? gemNameHtml(player.gem_name, escapeHtml) : "Unknown"}</span>
        </span>
      </div>
      <div class="score gem-score">
        <strong>$${formatMoney(player.value)}</strong>
        <span>1 in ${formatNumber(player.rarity)} · ${formatNumber(player.final_weight)}g</span>
        <span>${mutationNamesHtml(player)} · ${formatMultiplier(player.mutation_chance_multiplier)} mutation chance</span>
      </div>
    </div>
  `).join("");

  leaderboardCard.innerHTML = `
    <div class="leaderboard-title-row">
      <div>
        <h2>Best Roll</h2>
        <p class="leaderboard-description">
          Rarest individual roll by effective rarity. Mutation rarity
          multipliers are included, so a Polished 1 in 140,000 Aether Quartz
          is ranked as 1 in 14,000,000.
        </p>
      </div>
    </div>

    <div class="leaderboard-header leaderboard-header--best-roll">
      <div>Rank</div>
      <div>Player / Gem</div>
      <div class="score">Roll Value</div>
    </div>
    <div class="leaderboard-list">${rows}</div>
  `;
}

// =========================================================
// RENDER ACTIVE LEADERBOARD
// =========================================================

function renderLeaderboard() {
  updateTabs();


  if (
    activeLeaderboard ===
    "totalRolls"
  ) {
    renderTotalRolls();

    return;
  }


  if (
    activeLeaderboard ===
    "rarestGem"
  ) {
    renderRarestGem();

    return;
  }


  if (
    activeLeaderboard ===
    "gemsFound"
  ) {
    renderGemsFound();

    return;
  }

  if (
    activeLeaderboard ===
    "bestRoll"
  ) {
    renderBestRoll();

    return;
  }

  renderLifetimeEarnings();
}


// =========================================================
// LOAD DATA
// =========================================================

async function loadLeaderboards() {
  setStatus(
    "Loading leaderboards..."
  );


  const {
    data,
    error
  } =
    await supabase.functions
      .invoke(
        "leaderboards"
      );


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


  const {
    data: gemsFoundData,
    error: gemsFoundError
  } = await supabase.rpc(
    "get_gems_found_leaderboard"
  );

  const {
    data: bestRollData,
    error: bestRollError
  } = await supabase.rpc(
    "get_best_roll_leaderboard",
    { p_limit: 25 }
  );


  if (gemsFoundError) {
    console.error(
      "Gems Found leaderboard load failed:",
      gemsFoundError
    );
  }

  if (bestRollError) {
    console.error(
      "Best Roll leaderboard load failed:",
      bestRollError
    );
  }


  leaderboardData = {
    totalRolls:
      Array.isArray(
        data?.totalRolls
      )
        ? data.totalRolls
        : [],

    rarestGem:
      Array.isArray(
        data?.rarestGem
      )
        ? data.rarestGem
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
        ? bestRollData.map(player => ({
            rank: player.rank,
            username: player.username,
            gem_name: player.gem_name,
            rarity: player.rarity,
            value: player.value,
            final_weight: player.final_weight,
            mutation_ids: Array.isArray(player.mutation_ids) ? player.mutation_ids : [],
            mutation_multiplier: player.mutation_multiplier,
            mutation_chance_multiplier: player.mutation_chance_multiplier
          }))
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
