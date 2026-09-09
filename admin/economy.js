import { escapeHtml, formatMoney, formatCount } from '../src/ui/format.js';

const labels = {
  gem_sales:'Gem sales', bank_interest:'Bank interest', bank_loans:'Bank loans & repayments',
  bank_loan_seizure:'Overdue loan collection', admin_system_rewards:'Admin / system rewards',
  achievements:'Achievement rewards', codes:'Redemption codes', referrals:'Referral rewards',
  season_rewards:'Season rewards', guild_rewards:'Guild competition rewards',
  equipment_crafting:'Equipment crafting', masterwork:'Masterwork', consumables:'Consumables / merchant',
  daily_shop:'Daily shop', gem_shop:'Gem shop', shares:'Share trading',
  guild_contributions:'Guild contributions', guild_creation:'Guild creation', museum:'Museum',
  mining_caches:'Mining caches', season_premium:'Season premium', research:'Research resets',
  inventory:'Inventory upgrades', money_burn:'Voluntary money burning', legacy_import:'Legacy save imports',
  expedition_services:'Expedition entry, funding & services', expedition_rewards:'Expedition rewards',
  market_escrow:'Market trades & escrow', war_escrow:'War wagers & escrow', market_fees:'Market & wager fees',
  bank_deposit:'Wallet → bank', bank_withdrawal:'Bank → wallet',
  account_initialization:'New account balances', account_removal:'Account removal'
};
const required = {
  source:['gem_sales','bank_interest','admin_system_rewards'],
  sink:['equipment_crafting','research','daily_shop','guild_contributions','market_fees','museum','consumables'],
  transfer:['bank_deposit','bank_withdrawal','market_escrow','war_escrow']
};
const money = value => `<span title="${escapeHtml(Number(value).toLocaleString(undefined,{maximumFractionDigits:8}))}">${formatMoney(Number(value))}</span>`;
const label = key => labels[key] || String(key).replaceAll('_',' ');

function breakdownTable(data, direction, title) {
  const categories = new Map(required[direction].map(category=>[category,[]]));
  for (const row of data.breakdown || []) {
    if (row.direction!==direction) continue;
    if (!categories.has(row.category)) categories.set(row.category,[]);
    categories.get(row.category).push(row);
  }
  const rows=[...categories].map(([category,items])=>{
    const total=items.reduce((n,r)=>n+Number(r.amount),0);
    // Transfers show wallet movement once for bank flows. Other escrow flows
    // show paid out / returned and paid in independently, not as cash creation.
    const credit=items.reduce((n,r)=>n+Number(r.credited),0);
    const debit=items.reduce((n,r)=>n+Number(r.debited),0);
    const amount=direction==='sink'?-total:total;
    const transferAmount=category==='bank_deposit'?money(data.walletToBank):category==='bank_withdrawal'?money(data.bankToWallet):`${money(debit)} out · ${money(credit)} in`;
    const detail=items.length?`<details><summary>${escapeHtml(label(category))}</summary><ul>${items.map(r=>`<li><span>${escapeHtml(label(r.subcategory))}</span> ${money(direction==='sink'?-Number(r.amount):Number(r.amount))}</li>`).join('')}</ul></details>`:escapeHtml(label(category));
    return `<tr><td>${detail}</td><td>${direction==='transfer'?transferAmount:money(amount)}</td></tr>`;
  }).join('');
  return `<section class="economy-breakdown"><h3>${title}</h3><div class="shareholders-table-wrap"><table class="shareholders-table"><thead><tr><th scope="col">Category / detail</th><th scope="col">${direction==='transfer'?'Movement':'Amount'}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

export function renderEconomy(data) {
  const stats=[['Cash created',data.cashCreated],['Cash destroyed',data.cashDestroyed],['Net creation',data.netCreation],['Wallet → bank',data.walletToBank],['Bank → wallet',data.bankToWallet]];
  const since=new Date(data.trackingSince).toLocaleString();
  return `<p class="admin-note">Detailed tracking since ${escapeHtml(since)}. All means since deployment; historical attribution has not been backfilled.</p>
    <div class="economy-stats">${stats.map(([name,value])=>`<div class="economy-stat"><span>${name}</span><strong>${money(value)}</strong></div>`).join('')}</div>
    <div class="economy-supply"><span>Total Money Supply <strong>${money(data.totalMoneySupply)}</strong></span><span>Wallets ${money(data.walletCash)} + bank deposits ${money(data.bankDeposits)}</span></div>
    <p class="admin-note">Supply is current and includes every player. It excludes escrow, shares, gem values and unpaid loan interest. Older analytics may exclude test accounts. Period totals use recorded cash changes; interest appears when credited.</p>
    ${Number(data.balanceEvents)===0?'<p class="economy-empty" role="status">No cash movements recorded in this period.</p>':''}
    ${Number(data.unattributedEntries)>0?`<p class="economy-warning" role="status">${formatCount(data.unattributedEntries)} unattributed balance changes (${money(data.unattributedNet)} net) need review. They are excluded from classified source and sink totals.</p>`:''}
    <div class="economy-columns">${breakdownTable(data,'source','Sources')}${breakdownTable(data,'sink','Sinks')}</div>
    <p class="admin-note">Sinks are net of recorded refunds. Expand categories for the backend operation breakdown. Fee reclassification entries separate withheld fees without charging a wallet twice.</p>
    ${breakdownTable(data,'transfer','Transfers — separate from creation & destruction')}
    <p class="admin-note">Escrow outflows and returns can occur in different periods. Transfer net: ${money(data.transferNet)}. Recorded wallet + bank change: ${money(data.balanceChange)} = net creation + transfer net + unattributed net.</p>`;
}

export function mountEconomy({panel,content,summary,filters,refresh,rpc}) {
  let period='24H';
  let request=0;
  async function load() {
    const current=++request;
    panel.hidden=false;
    content.setAttribute('aria-busy','true');
    content.innerHTML='<p class="admin-note" role="status">Loading economy breakdown…</p>';
    summary.textContent=`${period} · Loading…`;
    try {
      const {data,error}=await rpc('admin_get_economy_breakdown',{p_period:period});
      if(current!==request)return;
      if(error)throw error;
      if(!data?.trackingSince || !Array.isArray(data.breakdown))throw new Error('Economy service returned incomplete data.');
      content.innerHTML=renderEconomy(data);
      summary.textContent=`${data.period} · Updated ${new Date(data.generatedAt).toLocaleString()}`;
    } catch(error) {
      if(current!==request)return;
      const pending=['PGRST202','42883'].includes(error?.code);
      content.innerHTML=`<div class="analytics-error" role="alert"><strong>${pending?'Detailed tracking is not deployed yet.':'Could not load economy breakdown.'}</strong><span>${pending?'Deploy the prepared economy migration, then refresh.':escapeHtml(error?.message || 'Please try again.')}</span></div>`;
      summary.textContent='Unavailable · Refresh to retry';
    } finally {
      if(current===request)content.setAttribute('aria-busy','false');
    }
  }
  filters.addEventListener('click',event=>{
    const button=event.target.closest('[data-economy-period]');
    if(!button || !filters.contains(button))return;
    period=button.dataset.economyPeriod;
    for(const item of filters.querySelectorAll('[data-economy-period]')){
      item.classList.toggle('is-active',item===button);
      item.setAttribute('aria-pressed',String(item===button));
    }
    load();
  });
  refresh.addEventListener('click',load);
  return {load};
}
