import {
  supabase
} from "../src/backend/supabase.js";

import {
  ensurePlayerAuth
} from "../src/backend/auth.js";


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


let leaderboardData = {
  totalRolls: [],
  rarestGem: [],
  lifetimeEarnings: []
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
    "lifetimeEarnings"
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
              ${escapeHtml(
                player.gemName ??
                "Unknown"
              )}
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
