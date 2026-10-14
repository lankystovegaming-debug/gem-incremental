import {mountShell} from '../../src/ui/shell.js';
import {christmasRequest} from '../../src/backend/cloudChristmas2026.js';
import {escapeHtml as esc} from '../../src/ui/format.js';
import {ensurePlayerAuth} from '../../src/backend/auth.js';

mountShell({page:'limited-events',base:'../../'});
const $=id=>document.getElementById(id),num=n=>Number(n||0).toLocaleString();
const names={snowflakes:'Snowflakes',ornaments:'Ornaments',lights:'Christmas Lights',shillings:'CS',small:'Small Present',festive:'Festive Present',large:'Large Present',golden:'Golden Present',christmas:'Christmas Present',mysterious:'Mysterious Present',cocoa:'Cocoa',cookie:'North Star Cookie',peppermint:'Peppermint',rations:'Reindeer Rations',toolkit:'Toolkit',tonic:'Aurora Tonic',magnet:'Present Magnet',list:"Santa’s List",bell:'Workshop Bell',coin:'Lucky Coin',snowstorm:'Bottled Snowstorm',miracle:'Christmas Miracle',stash:"Santa’s Secret Stash",'bottled-christmas':'Bottled Christmas'};
const label=id=>names[id]||id.split('-').map(s=>s[0]?.toUpperCase()+s.slice(1)).join(' ');
const reward=r=>Object.entries(r||{}).map(([id,n])=>`${num(n)} ${esc(label(id))}`).join(' · ');
let snapshot,busy=false,selected='tree',pending=null,storageKey=null;
function notice(message){$('notice').textContent=message;}
function disabled(){return busy||pending||snapshot?.phase!=='active'||!snapshot?.releaseEnabled?'disabled':'';}
function button(text,command){return `<button data-command="${esc(JSON.stringify(command))}" ${disabled()}>${esc(text)}</button>`;}
function treeArt(level){return `<div class="christmas-tree" role="img" aria-label="Your Christmas Tree, level ${Number(level)} of 25">${level>=15?'<span class="tree-star">✦</span>':''}${Array.from({length:level},(_,i)=>{const row=Math.floor(i/5),x=35+(i%5)*7-row*2,y=25+row*13;return `<i class="tree-bauble" style="left:${x}%;top:${y}%"></i>`;}).join('')}</div>`;}
function render(){
  if(!snapshot)return;
  $('phase').textContent=snapshot.phase.toUpperCase();
  const preview=snapshot.phase==='teaser'||!snapshot.releaseEnabled;
  $('teaser').hidden=!preview;$('hub').hidden=preview;
  if(preview)return;
  const s=snapshot.state;
  $('archive').hidden=snapshot.phase!=='archived';
  $('balances').innerHTML=['snowflakes','ornaments','lights','shillings'].map(id=>`<article><small>${esc(label(id))}</small><strong>${num(s[id])}</strong></article>`).join('');
  $('panel-tree').innerHTML=`<div class="tree-layout">${treeArt(s.tree)}<div><p class="eyebrow">YOUR CHRISTMAS TREE</p><h2>Level ${s.tree} / 25</h2><progress class="tree-progress" value="${s.tree}" max="25" aria-label="Tree level">${s.tree}/25</progress>${snapshot.nextTreeCost?`<h3>Next decorations</h3><p>${reward(snapshot.nextTreeCost)}</p><p class="reward-list">Reward · ${reward(snapshot.nextTreeReward)}</p>${button('Decorate',{action:'decorate'})}`:'<p>The Tree is complete. The Workshop Exchange is open.</p>'}</div></div>`;
  const presents=['small','festive','large','golden',...(s.inventory.mysterious?['mysterious']:[]),...(s.inventory.christmas?['christmas']:[]),'workshop-package','supply-crate'];
  $('panel-presents').innerHTML=`<h2>Presents</h2><p>Present Points · ${num(s.presentPoints)} ${s.unlocks['santa-sack']?'· Santa Sack unlocked':'/ 1,000'}</p><div class="christmas-grid">${presents.map(id=>`<article><h3>${esc(label(id))}</h3><p>Owned · ${num(s.inventory[id])}</p>${id==='mysterious'?'<p>Something about this Present feels unfinished.</p><p>It won’t open.</p>':`${button('Open 1',{action:'open',tier:id,quantity:1})}${id==='christmas'?'':button('Open 10',{action:'open',tier:id,quantity:10})+button('Open All',{action:'open',tier:id,quantity:'all'})}${['small','festive','large'].includes(id)?button('Combine 1',{action:'combine',tier:id,quantity:1})+button('Combine Max',{action:'combine',tier:id,quantity:'max'}):''}`}</article>`).join('')}</div>`;
  const equipment=new Set(['star-lantern']),collectibles=new Set(['christmas-2026-collector','the-christmas-star']);
  $('panel-workshop').innerHTML=`<h2>Santa’s Workshop</h2>${['Supplies','Equipment','Cosmetics','Collectibles'].map(category=>`<h3>${category}</h3><div class="christmas-grid">${snapshot.shop.filter(i=>category==='Equipment'?equipment.has(i.id):category==='Collectibles'?collectibles.has(i.id):category==='Cosmetics'?i.limit===1&&!i.weekly&&!equipment.has(i.id)&&!collectibles.has(i.id):i.weekly||['christmas','supply-crate'].includes(i.id)).map(i=>`<article><h3>${esc(label(i.id))}</h3><p>${num(i.price)} CS${i.subsequentPrice?' first; 50,000 CS thereafter':''}</p><p>${i.weekly?'Weekly limit':i.limit===null?'Unlimited':'Event limit'}${i.limit===null?'':` · ${i.limit}`}</p>${i.id==='the-christmas-star'?'<p>No gameplay effects.</p>':''}${button('Buy',{action:'buy',id:i.id,quantity:1})}</article>`).join('')}</div>`).join('')}<h3>Workshop Exchange</h3>${s.tree<25?'<p>Locked door · Complete Tree Level 25.</p>':`<p>100 Snowflakes → 25 CS · 10 Ornaments → 50 CS · 1 Light → 25 CS</p>${['snowflakes','ornaments','lights'].map(resource=>button(`Exchange ${label(resource)}`,{action:'exchange',resource,quantity:1})).join('')}<h3>Workshop Package</h3><p>1,000 Snowflakes · 30 Ornaments · 5 Lights</p>${button('Craft 1',{action:'craft',quantity:1})}${button('Craft Max',{action:'craft',quantity:'max'})}`}`;
  $('panel-advent').innerHTML=`<h2>Advent Calendar</h2><p>Missed doors remain available until Christmas ends.</p><div class="advent-grid">${snapshot.advent.map(d=>`<article class="advent-door advent-door--${d.day} advent-door--${esc(d.status)}"><h3>${d.day}</h3><p>${d.status==='future'?'???':reward(d.reward)}</p><span class="christmas-label">${esc(d.status)}</span>${['available','today'].includes(d.status)?button('Claim',{action:'advent',day:d.day}):''}</article>`).join('')}</div>`;
  const chapters=[['I','The First Snow','2026-12-01T00:00:00Z'],['II','The Workshop Awakens','2026-12-08T00:00:00Z'],['III','The Aurora','2026-12-15T00:00:00Z'],['IV','The Storm','2026-12-24T00:00:00Z'],['V','Christmas Morning','2026-12-25T00:00:00Z']];
  $('panel-story').innerHTML=`<h2>Christmas Story</h2><div class="christmas-grid">${chapters.map(([id,title,date])=>`<article><h3>${id} — ${esc(title)}</h3><p>${Date.parse(snapshot.serverNow)<Date.parse(date)?'???':s.chapters[id]?.acknowledged?'Experienced':'A new chapter awaits.'}</p></article>`).join('')}${s.chapters.VI?.acknowledged?'<article><h3>VI — One Last Snowfall</h3><p>Thank you for spending Christmas with us.</p></article>':''}</div>`;
  $('panel-collection').innerHTML=`<h2>Christmas Collection</h2><p>Christmas Gems Discovered · ${num(snapshot.discoveredCount)}${snapshot.totalGems?` / ${snapshot.totalGems}`:''}</p><h3>Gems</h3><div class="christmas-grid">${snapshot.gems.map(g=>`<article><h3>${esc(g.name)}</h3><p>${s.discoveries[g.name]?'Discovered':'Undiscovered'}</p>${g.baseWeight?`<p>${num(g.baseWeight)} g base weight${g.rarity?` · 1 / ${num(g.rarity)}`:''}</p>`:''}</article>`).join('')}</div><h3>Equipment</h3><div class="christmas-grid">${['evergreen','star-lantern','snowdrift-boots','santa-sack'].map(id=>`<article><h3>${esc(label(id))}</h3><p>${s.unlocks[id]?'Obtained':'Locked'}</p></article>`).join('')}</div><h3>Cosmetics & Collectibles</h3><div class="christmas-grid">${Object.keys(s.unlocks).filter(id=>!['evergreen','star-lantern','snowdrift-boots','santa-sack'].includes(id)).map(id=>`<article><h3>${esc(label(id))}</h3><p>Obtained</p></article>`).join('')}</div>`;
  if(pending)notice('An action needs confirmation. Retry to check its result.');
}
function switchTab(tab){selected=tab;document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});document.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==`panel-${tab}`);}
async function load(){try{snapshot=await christmasRequest();render();}catch(e){notice(e.message);}}
async function act(command){
  if(busy)return;
  busy=true;
  if(!pending){pending={command,requestId:crypto.randomUUID()};try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}}
  render();
  try{
    const data=await christmasRequest(pending.command,pending.requestId);snapshot={...data.snapshot,releaseEnabled:data.releaseEnabled};
    pending=null;try{sessionStorage.removeItem(storageKey);}catch{}
    notice(Object.keys(data.rewards||{}).length?`Received · ${reward(data.rewards).replace(/&[^;]+;/g,'')}`:'Christmas records updated.');
  }catch(e){
    const rejected=['invalid_quantity','insufficient_resources','tree_complete','door_locked','already_claimed','one_at_a_time','it_wont_open','not_available','workshop_locked','invalid_present','invalid_combine','event_closed','christmas_not_released','bulk_limit'];
    if(rejected.includes(e.code)){pending=null;try{sessionStorage.removeItem(storageKey);}catch{}notice(e.message);}
    else notice(`${e.message}. Retry to check the same action.`);
  }
  finally{busy=false;render();if(pending){const b=document.createElement('button');b.textContent='Retry action';b.onclick=()=>act(pending.command);$('notice').append(' ',b);}}
}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab){switchTab(tab.dataset.tab);return;}const b=e.target.closest('[data-command]');if(b&&!pending)act(JSON.parse(b.dataset.command));});
document.querySelector('.christmas-tabs').addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.findIndex(t=>t.dataset.tab===selected);let next;
  if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
  if(next!==undefined){e.preventDefault();switchTab(tabs[next].dataset.tab);tabs[next].focus();}
});
const user=await ensurePlayerAuth();
if(user){storageKey=`christmas-2026-pending:${user.id}`;try{pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}await load();if(pending)await act(pending.command);}
window.addEventListener('focus',()=>{if(!busy&&!pending)load();});
