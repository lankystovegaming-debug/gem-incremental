export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,
  (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const number = (value) => Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const compact = (value) => Number(value ?? 0).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const money = (value) => `$${compact(value)}`;
const percent = (value) => `${number(value)}%`;
const date = (value) => new Date(value).toLocaleDateString('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric'
});
const stat = (label, value, note = '') => `<article class="recap-card"><h3>${escapeHtml(label)}</h3><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
const section = (title, note, body) => `<section class="recap-section"><h2>${escapeHtml(title)}</h2><p class="section-note">${escapeHtml(note)}</p>${body}</section>`;

export function gemCard(title, gem, metric = 'rarity') {
  if (!gem || !gem.gem || Number(gem.rarity) <= 0) {
    return `<article class="recap-card"><h3>${escapeHtml(title)}</h3><p>No qualifying record yet.</p></article>`;
  }
  const value = metric === 'value' ? money(gem.value)
    : metric === 'weight' ? `${number(gem.weight)} g`
    : metric === 'mutations' ? `${number(gem.score)} mutation${Number(gem.score) === 1 ? '' : 's'}`
    : metric === 'combo' ? `1 / ${number(gem.score)} mutation combination`
    : `1 / ${number(metric === 'raw' ? gem.rawRarity : gem.rarity)}`;
  return `<article class="recap-card"><h3>${escapeHtml(title)}</h3>
    <strong class="gem-name">${escapeHtml(gem.gem)}</strong><p>${escapeHtml(value)}</p>
    ${gem.username ? `<p>${escapeHtml(gem.username)}</p>` : ''}
    ${metric !== 'rarity' ? `<small>Base rarity: 1 / ${number(gem.rarity)}</small>` : ''}
    <p>🍀 ${gem.luck == null ? 'Roll-time luck not recorded' : `${number(gem.luck)}× luck at this roll`}</p>
    ${gem.mutations?.length ? `<small>${gem.mutations.map(escapeHtml).join(' + ')}</small>` : ''}
    ${gem.at ? `<p><small>${escapeHtml(date(gem.at))}</small></p>` : ''}
  </article>`;
}

function minigames(games = []) {
  if (!games.length) return '<p>No recorded minigame scores yet.</p>';
  return `<div class="recap-table-wrap"><table><caption>Recorded completed scores</caption>
    <thead><tr><th scope="col">Game</th><th scope="col">Runs</th><th scope="col">Best recorded score</th></tr></thead>
    <tbody>${games.map((game) => `<tr><th scope="row">${escapeHtml(game.game.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase()))}</th>
    <td>${number(game.runs)}${game.rank ? `<br><small>#${number(game.rank)} / ${number(game.participants)} players</small>` : ''}</td><td>${game.best_score == null ? 'Not comparable across modes' : number(game.best_score)}${game.best_player ? `<br><small>${escapeHtml(game.best_player)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

export function globalRecap(data) {
  const global = data.global;
  const totals = global.totals;
  const records = global.records;
  const top = global.topRollers[0];
  return `<div class="stat-grid">${stat('🎲 Rolls', compact(totals.rolls), `${number(totals.rolls)} rolls`)}
    ${stat('👥 Players', number(totals.players))}${stat('💰 Player earnings', money(totals.earned))}
    ${stat('🔥 Money burned', money(totals.burned))}</div>`
    + section('Against All Odds', 'Displayed rarity and raw roll odds tell two different stories.',
      `<div class="record-grid">${gemCard('Highest Displayed Rarity', global.highestDisplayed)}
      ${gemCard('Best recorded Raw Rare Roll', records.raw, 'raw')}</div>
      <p class="section-note">Raw Rare Roll uses the existing leaderboard’s luck-adjusted odds. Historical roll tracking began partway through Month One; missing roll-time luck is never replaced with current luck.</p>`)
    + section('The community found these.', 'Top recorded displayed-rarity discoveries — one per player.',
      `<div class="record-grid">${global.discoveries.map((gem) => gemCard('Recorded discovery', gem)).join('')}</div>`)
    + section('Hall of Fame', 'Real records. Questionable amounts of free time.',
      `<div class="record-grid">${stat('Most rolls', top ? compact(top.rolls) : '—', top?.username ?? '')}
      ${gemCard('Highest recorded weight', records.weight, 'weight')}
      ${gemCard('Most valuable recorded roll', records.value, 'value')}
      ${gemCard('Most recorded mutations on one gem', records.mutations, 'mutations')}
      ${gemCard('Rarest recorded mutation combination', records.combo, 'combo')}</div>
      <p class="section-note">Weight tracking began August 18; detailed roll tracking began August 24. “Recorded” records cover the available telemetry, not every roll since launch.</p>`)
    + section('The Grind', 'Please check on them.',
      `<p class="recap-callout">${top ? `${escapeHtml(top.username)} performed <b>${percent(100 * top.rolls / Math.max(1, totals.rolls))}</b> of all rolls. ` : ''}
      The top ten players account for <b>${percent(global.topTenShare)}</b>.</p>
      <div class="stat-grid">${stat('Median rolls / player', number(totals.median_rolls))}
      ${stat('1K+ rollers', number(totals.rollers_1k))}${stat('10K+ rollers', number(totals.rollers_10k))}
      ${stat('100K+ rollers', number(totals.rollers_100k))}${stat('Found 1 / 1M+', number(totals.finds_1m), 'Players')}
      ${stat('Found 1 / 10M+', number(totals.finds_10m), 'Players')}${stat('Found 1 / 100M+', number(totals.finds_100m), 'Players')}</div>`)
    + section('The Economy™', 'Somehow still functioning.',
      `<div class="stat-grid">${stat('Player earnings', money(totals.earned), 'Includes rewards from other systems')}
      ${stat('Sent into the void', money(totals.burned))}${stat('Cash held', money(totals.money), 'At recap capture')}
      ${stat('Banked cash', money(global.banked), 'At recap capture')}${global.richest ? stat('Richest player · cash held', money(global.richest.money), global.richest.username) : ''}</div>
      <p class="recap-callout">Players burned an amount equal to ${percent(100 * totals.burned / Math.max(1, totals.earned))} of their earnings. Economy balancing is going great.</p>`)
    + section('Minigames entered the chat', 'Recorded scores since minigames launched near the end of Month One.', `<div class="stat-grid">${stat('Recorded runs', number(global.minigameRuns))}${stat('Minigame players', number(global.minigamePlayers))}${stat('Games played', number(global.minigames.length))}</div>` + minigames(global.minigames));
}

export function shareSummary(data) {
  const personal = data.personal;
  if (!personal) return '';
  return `💎 GEM RNG — MY MONTH ONE${data.status === 'live' ? ' (LIVE)' : ''}\n${personal.username}\n`
    + `${number(personal.rolls)} rolls · Top ${personal.rollTopPercent}%\n`
    + `Rarest: ${personal.highestDisplayed.gem || 'Still rolling'}${personal.highestDisplayed.rarity > 0 ? ` · 1 / ${number(personal.highestDisplayed.rarity)}` : ''}\n`
    + `Player #${number(personal.joinNumber)} · Joined ${date(personal.joined)}\n`
    + `${money(personal.earned)} earned\nYou were here for Month One.\nAugust 7 — September 7, 2026`;
}

export function personalRecap(data) {
  const personal = data.personal;
  if (!personal) return section('Your Month One', 'Your own little piece of Gem RNG history.',
    '<p>Sign in with your Month One account to see your recap. Accounts outside the eligible Month One community do not have a personal recap.</p><a href="../../account/">Open your account →</a>');
  const records = personal.records;
  return section(`${personal.username}’s Month One`, 'You contributed to this alarming amount of rolling.',
    `<div class="stat-grid">${stat('Your rolls', compact(personal.rolls), `${number(personal.rolls)} total`)}
    ${stat('Roll ranking', `#${number(personal.rollRank)}`, `Top ${personal.rollTopPercent}% of ${number(personal.population)} players`)}
    ${stat('Your earnings', money(personal.earned))}
    ${stat('Earnings ranking', `#${number(personal.earningsRank)}`, `Top ${personal.earningsTopPercent}%`)}
    ${stat('Money burned', money(personal.burned))}${stat('Community roll share', percent(personal.rollShare))}</div>
    <p class="section-note">Rankings include every eligible player, including zero-roll accounts. Equal totals share a rank; top percentage is rank ÷ player count, rounded up.</p>`)
    + section('Your Against All Odds', 'Roll-time luck, preserved with the record.',
      `<div class="record-grid">${gemCard('Your Highest Displayed Rarity', personal.highestDisplayed)}
      ${gemCard('Your best recorded Raw Rare Roll', records.raw, 'raw')}
      ${gemCard('Your highest recorded weight', records.weight, 'weight')}
      ${gemCard('Your most valuable recorded roll', records.value, 'value')}</div>`)
    + section('Mutations happened.', 'Personal records from available roll telemetry, not a full-month mutation count.',
      `<div class="record-grid">${gemCard('Most recorded mutations on one gem', records.mutations, 'mutations')}
      ${gemCard('Rarest recorded mutation combination', records.combo, 'combo')}</div>`)
    + section('Your minigame detour', 'Recorded completed scores.', minigames(personal.minigames))
    + section('You Were Here', 'One of the originals.',
      `<p class="recap-callout">You were eligible player <b>#${number(personal.joinNumber)}</b>.<br>
      Joined ${escapeHtml(date(personal.joined))}. You were here for Month One.</p>`)
    + section('A small card. Some big numbers.', 'Share your little piece of Month One.',
      `<div class="share-card"><pre>${escapeHtml(shareSummary(data))}</pre></div>
      <div class="share-actions"><button type="button" id="share-summary">Share my Month One</button>
      <button type="button" id="copy-summary">Copy summary</button>
      <button type="button" id="download-summary">Save card as SVG</button></div>
      <p id="share-status" role="status" aria-live="polite"></p>`);
}

export function summarySvg(data) {
  const lines = shareSummary(data).split('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
    <rect width="800" height="520" rx="28" fill="#111324"/>
    <rect x="20" y="20" width="760" height="480" rx="20" fill="none" stroke="#a99cff"/>
    ${lines.map((line, index) => `<text x="48" y="${76 + index * 48}" font-family="Arial, sans-serif" font-size="${index === 0 ? 25 : 21}" fill="${index === 0 ? '#b9aaff' : '#f2efff'}"${line.length > 52 ? ' textLength="704" lengthAdjust="spacingAndGlyphs"' : ''}>${escapeHtml(line)}</text>`).join('')}
    </svg>`;
}
