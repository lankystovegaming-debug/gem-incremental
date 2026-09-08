import { mountShell } from '../src/ui/shell.js';
import { supabase } from '../src/backend/supabase.js';
import { ensurePlayerAuth } from '../src/backend/auth.js';

mountShell({ page: 'playtime-upgrades', base: '../' });

const defs = {
  luck: ['🍀 Luck', 'Improves your overall luck'],
  mutation: ['🧬 Mutation Luck', 'Improves mutation chances'],
  rollSpeed: ['⚡ Roll Speed', 'Rolls happen faster'],
  money: ['💰 Money', 'Increases gem sale value']
};
const tiers = [1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5, 3, 4];
const costs = [100, 300, 900, 3000, 10000, 30000, 90000, 300000, 1000000, 3000000];

let state = null;
let lastServerSync = 0;
let loading = false;

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function time(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m ${s % 60}s`;
}

function showError(message) {
  const status = document.querySelector('#status');
  if (status) status.textContent = message;
}

function render(d = state) {
  if (!d) return;
  state = d;
  document.querySelector('#points').textContent = `${fmt(d.availablePoints)} Playtime Points available`;
  document.querySelector('#time').textContent = `Total playtime: ${time(d.playtimeSeconds)} • Spent: ${fmt(d.spent)}`;

  const grid = document.querySelector('#grid');
  grid.innerHTML = '';

  for (const [id, [name, desc]] of Object.entries(defs)) {
    const level = Number(d.levels?.[id] || 0);
    const current = tiers[Math.min(level, tiers.length - 1)];
    const next = tiers[Math.min(level + 1, tiers.length - 1)];
    const cost = costs[level] ?? 3000000;
    const maxed = level >= 10;
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <h2>${name}</h2>
      <p>${desc}</p>
      <h3>${current}× → ${next}×</h3>
      <p>${maxed ? 'MAXED' : `Cost: ${fmt(cost)} points`}</p>
      <button ${maxed ? 'disabled' : ''}>Upgrade</button>
    `;

    const button = card.querySelector('button');
    button.onclick = async () => {
      button.disabled = true;
      const { data, error } = await supabase.rpc('buy_playtime_upgrade', { p_upgrade: id });
      if (error) {
        console.error('[PLAYTIME] buy_playtime_upgrade failed:', error);
        alert(error.message.includes('insufficient') ? 'Not enough Playtime Points!' : error.message);
        button.disabled = false;
        return;
      }
      render(data);
      showError('');
    };
    grid.append(card);
  }
}

async function load({ force = false } = {}) {
  if (loading || (!force && Date.now() - lastServerSync < 10000)) return;
  loading = true;
  try {
    const user = await ensurePlayerAuth();
    if (!user) throw new Error('No authenticated player session found.');

    const { data, error } = await supabase.rpc('get_playtime_upgrades');
    if (error) {
      // Keep the full Supabase/Postgres error visible in the console instead
      // of replacing the whole page, which makes database debugging difficult.
      console.error('[PLAYTIME] get_playtime_upgrades failed:', error);
      showError(`Could not sync playtime upgrades: ${error.message}`);
      return;
    }

    state = data;
    lastServerSync = Date.now();
    showError('');
    render();
  } catch (error) {
    console.error('[PLAYTIME] load failed:', error);
    showError(`Could not load playtime upgrades: ${error.message || error}`);
  } finally {
    loading = false;
  }
}

load({ force: true });

// Make the UI feel like points are arriving every second, while the server is
// synced less aggressively. The next server sync remains authoritative.
setInterval(() => {
  if (!state) return;
  state = {
    ...state,
    playtimeSeconds: Number(state.playtimeSeconds || 0) + 1,
    availablePoints: Number(state.availablePoints || 0) + 1
  };
  render();
}, 1000);

setInterval(() => load({ force: true }), 10000);
