import { supabase } from './src/backend/supabase.js';
import { ensureCloudPlayer } from './src/backend/playerCloud.js';
import { loadCloudPlayerState } from './src/backend/cloudInventory.js';
import { runLegacyMigrationGate } from './src/backend/legacyMigration.js';
import { captureCodeFromUrl, initReferral } from './src/ui/referralBootstrap.js';
import { newestWeeklyUpdate } from './src/logic/updateHistory.js';
import { loadUpdateHistory, renderUpdate } from './src/ui/updateLog.js';

const title = document.getElementById('landingTitle');
const detail = document.getElementById('landingDetail');
const actions = document.getElementById('landingActions');
const primary = document.getElementById('landingPrimary');
const login = document.getElementById('landingLogin');
const retry = document.getElementById('landingRetry');
const dialog = document.getElementById('latestUpdate');
const changelog = document.getElementById('changelogContent');
const changelogButton = document.getElementById('changelogButton');
let generation = 0;

captureCodeFromUrl();

async function initialise() {
  const current = ++generation;
  let timeout;
  actions.hidden = login.hidden = retry.hidden = true;
  title.textContent = 'Loading player data...';
  detail.textContent = 'Getting everything ready for you.';
  document.querySelector('.landing').setAttribute('aria-busy', 'true');

  try {
    const result = await Promise.race([
      loadPlayer(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Player loading timed out')), 30000);
      })
    ]);
    if (current !== generation) return;
    if (!result) {
      title.textContent = 'Create an account to start playing!';
      detail.textContent = 'Save your discoveries and pick up where you left off.';
      primary.textContent = 'Create Account';
      primary.href = './account/?create=1';
      login.hidden = false;
    } else {
      title.textContent = `Loading complete! Welcome ${result.username || 'miner'}`;
      detail.textContent = 'Your next gem is waiting.';
      primary.textContent = 'Play';
      primary.href = './roll/';
      // Keep referral attribution on the existing account-aware path.
      void initReferral().catch(console.error);
    }
    actions.hidden = false;
  } catch (error) {
    if (current !== generation) return;
    console.error('Landing startup failed:', error);
    title.textContent = 'Could not load player data.';
    detail.textContent = 'Check your connection and try again.';
    retry.hidden = false;
    login.hidden = false;
  } finally {
    clearTimeout(timeout);
    if (current === generation) document.querySelector('.landing').setAttribute('aria-busy', 'false');
  }
}

async function loadPlayer() {
  // The welcome page must never create a guest account as a side effect.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  const player = await ensureCloudPlayer(user);
  if (!player) throw new Error('Player setup failed');
  // Preserve the existing legacy-save gate before reading current progress.
  await runLegacyMigrationGate();
  if (!await loadCloudPlayerState()) throw new Error('Player save unavailable');
  return player;
}

changelogButton.addEventListener('click', async () => {
  dialog.showModal();
  changelog.textContent = 'Loading latest weekly update...';
  try {
    const latest = newestWeeklyUpdate(await loadUpdateHistory());
    if (latest) changelog.innerHTML = renderUpdate(latest, true);
    else changelog.textContent = 'No weekly update has been released yet.';
  } catch {
    changelog.textContent = 'Could not load the weekly update. Close and open Changelog to try again.';
  }
});
document.getElementById('closeChangelog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => changelogButton.focus());
retry.addEventListener('click', initialise);

// Defer work until the auth callback has released Supabase's session lock.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    setTimeout(initialise, 0);
  }
});
window.addEventListener('pageshow', (event) => { if (event.persisted) void initialise(); });
void initialise();
