import {ensurePlayerAuth} from "../../src/backend/auth.js";
import {mountShell} from "../../src/ui/shell.js";
import {notify} from "../../src/ui/toast.js";
import {escapeHtml,formatCount,formatMoney,formatWeight} from "../../src/ui/format.js";
import {loadConvergenceStatus,loadConvergenceLeaderboard,loadConvergenceCandidates,previewConvergenceDonation,donateConvergenceGems,donateConvergenceCash,setConvergenceAutoCraft,claimConvergencePickaxe,activateConvergenceSurge} from "../../src/backend/cloudConvergence.js";

mountShell({page:"crafting",base:"../../"});
const $=(id)=>document.getElementById(id);
const labels={common:"Common",rare:"Rare",epic:"Epic",legendary:"Legendary",mythic:"Mythic",exotic:"Exotic",exalted:"Exalted",cosmic:"Cosmic",transcendent:"Transcendent",weight3:"Final weight ≥3×",weight5:"Final weight ≥5×",weight10:"Final weight ≥10×",weight25:"Final weight ≥25×",effective1b:"Effective rarity ≥1B",effective10b:"Effective rarity ≥10B",effective100b:"Effective rarity ≥100B",effective1t:"Effective rarity ≥1T",mass:"Total gem mass",under001g:"Gem weighing <0.01g",over2500000g:"Gem weighing >2,500,000g",cash:"Cash contributions"};
let status=null,candidates=[],pendingAction=null,timer=null;
const selectedIds=()=>[...document.querySelectorAll("[data-gem-id]:checked")].map(el=>Number(el.dataset.gemId));
const formatRequirement=(key,value)=>key==="cash"?formatMoney(value):key==="mass"?formatWeight(value):formatCount(value);
const requestKey=()=>crypto.randomUUID();
const rarityKey=value=>{const r=Number(value);return r>=1e9?"secret":r>=1e8?"transcendent":r>=1e7?"cosmic":r>=1e6?"exalted":r>=1e5?"exotic":r>=1e4?"mythic":r>=1e3?"legendary":r>=100?"epic":r>=50?"rare":r>=10?"uncommon":"common"};
const filteredCandidates=()=>{const search=$("candidateSearch").value.trim().toLowerCase(),rarity=$("candidateRarity").value,usefulOnly=$("candidateUseful").checked;return candidates.filter(g=>(!search||String(g.gem_name||"").toLowerCase().includes(search))&&(rarity==="all"||rarityKey(g.rarity)===rarity)&&(!usefulOnly||g.preview?.useful));};

function phaseCopy(data){
 const now=Date.now(),start=Date.parse(data.startsAt),deadline=Date.parse(data.deadlineAt);
 if(data.status==="succeeded")return["Construction succeeded",data.succeededAt?`Completed ${new Date(data.succeededAt).toLocaleString()}`:"Completed early"];
 if(data.status==="failed")return["Construction failed","The deadline passed before every requirement was filled."];
 if(now<start)return["Construction begins in",start];
 return["Construction ends in",deadline];
}
function countdown(target){
 if(typeof target==="string")return target;
 const ms=Math.max(0,target-Date.now()),days=Math.floor(ms/86400000),hours=Math.floor(ms/3600000)%24,minutes=Math.floor(ms/60000)%60,seconds=Math.floor(ms/1000)%60;
 return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
function renderStatus(){
 const [phase,target]=phaseCopy(status);$("phaseLabel").textContent=phase;$("countdown").textContent=countdown(target);
 $("overallPercent").textContent=`${Number(status.progressPercent||0).toFixed(2)}%`;
 $("completedCount").textContent=`${status.completedRequirements} / ${status.requirementCount}`;
 const community=status.community||{};$("communityContributors").textContent=formatCount(community.contributors||0);$("communityCp").textContent=formatCount(community.contributionPoints||0);$("communityGems").textContent=formatCount(community.gemsDonated||0);$("communityCash").textContent=formatMoney(community.cashDonated||0);
 $("requirements").innerHTML=Object.entries(status.targets).map(([key,targetValue])=>{const value=Number(status.progress[key]||0),ratio=Math.min(1,value/Number(targetValue||1));return `<div class="convergence-requirement ${ratio>=1?"is-complete":""}"><div class="requirement-line"><span>${escapeHtml(labels[key]||key)}</span><strong>${escapeHtml(formatRequirement(key,value))} / ${escapeHtml(formatRequirement(key,targetValue))}</strong></div><div class="progress-track"><span style="width:${ratio*100}%"></span></div></div>`}).join("");
 const p=status.player||{};$("cpTotal").textContent=`${formatCount(p.contributionPoints||0)} CP`;$("gemsDonated").textContent=formatCount(p.gemsDonated||0);$("cashDonated").textContent=formatMoney(p.cashDonated||0);
 $("autoCraftToggle").checked=Boolean(p.autoCraft);$("autoCraftToggle").disabled=status.status!=="active";$("autoCraftLabel").textContent=p.autoCraft?"On":"Off";
 $("momentumCharges").textContent=String(p.momentumCharges||0);$("surgeState").textContent=p.surgeRolls>0?`${p.surgeRolls} boosted genuine rolls remaining.`:`Echo ${p.echo||0}/1,000 · Resonance ${p.resonanceRolls||0}/5 rolls`;
 $("activateSurge").disabled=!p.claimed||Number(p.momentumCharges||0)<1||Number(p.surgeRolls||0)>0;
 const claimable=status.status==="succeeded"&&p.entitled&&p.prerequisiteMet&&!p.claimed;$("claimButton").disabled=!claimable;$("claimButton").textContent=p.claimed?"Convergence claimed":p.entitled?"Claim Convergence":"Earn 1,000 CP to qualify";
 $("entitlementState").textContent=p.claimed?"Claimed permanently.":!p.entitled?`${formatCount(Math.max(0,1000-Number(p.contributionPoints||0)))} CP until entitlement.`:p.prerequisiteMet?status.status==="succeeded"?"Entitled and ready to claim.":"Entitled permanently if construction succeeds.":"Entitled, but dormant until you own or have crafted a T15 or Specialist pickaxe.";
 $("eventMessage").hidden=status.status==="active"||status.status==="scheduled";$("eventMessage").textContent=status.status==="succeeded"?"The community completed Convergence. Eligible players may claim whenever their personal prerequisite is met.":status.status==="failed"?"Construction failed permanently. Contributions are not refunded.":"";
}
function renderCandidates(){
 const visible=filteredCandidates();
 $("candidateList").innerHTML=visible.length?visible.map(g=>{const useful=g.preview?.useful,points=Number(g.preview?.points||0),wm=Number(g.preview?.finalWeightMultiplier||0);return `<label class="candidate"><input type="checkbox" data-gem-id="${g.id}" ${useful?"":"disabled"}><span><strong>${escapeHtml(g.gem_name)}</strong><small>1 in ${formatCount(g.rarity)} · ${formatWeight(g.final_weight)} · ${wm.toFixed(2)}×${useful?"":" · advances nothing"}</small></span><strong class="candidate__cp">+${formatCount(points)} CP</strong></label>`}).join(""):`<div class="empty-state">No specimens match these filters.</div>`;
 document.querySelectorAll("[data-gem-id]").forEach(el=>el.addEventListener("change",updateSelection));updateSelection();
}
async function updateSelection(){
 const ids=selectedIds();$("donateGems").disabled=!ids.length||status?.status!=="active";$("selectionSummary").textContent=ids.length?`${formatCount(ids.length)} specimens selected`:"No gems selected";
 if(!ids.length){$("selectionPreview").textContent="Select gems to preview their contribution.";return;}
 try{const preview=await previewConvergenceDonation(ids);const points=(preview.items||[]).reduce((n,item)=>n+Number(item.preview?.points||0),0);const useful=(preview.items||[]).filter(item=>item.preview?.useful).length;$("selectionPreview").textContent=`${formatCount(useful)} useful · approximately ${formatCount(points)} CP (final capped progress is authoritative).`;}catch(error){$("selectionPreview").textContent=error.message;}
}
function openConfirm(title,html,action){pendingAction=action;$("confirmTitle").textContent=title;$("confirmBody").innerHTML=html;$("confirmAcknowledge").checked=false;$("confirmSubmit").disabled=true;$("confirmDialog").showModal();}
async function refresh({inventory=true}={}){
 try{status=await loadConvergenceStatus();renderStatus();const board=await loadConvergenceLeaderboard(100);$("leaderboard").innerHTML=(board||[]).map(row=>`<tr><td>${row.rank}</td><td>${escapeHtml(row.username||"Unknown")}</td><td>${formatCount(row.contribution_points)}</td><td>${Number(row.contribution_percent||0).toFixed(2)}%</td><td>${row.entitled?"Entitled":"Building"}</td><td>${formatCount(row.gems_donated)}</td><td>${formatMoney(row.cash_donated)}</td></tr>`).join("")||`<tr><td colspan="7">No contributions yet.</td></tr>`;if(inventory){candidates=await loadConvergenceCandidates(0,200);renderCandidates();}}catch(error){notify.error("Convergence unavailable",error.message);$("eventMessage").hidden=false;$("eventMessage").textContent=error.message;}
}

$("confirmAcknowledge").addEventListener("change",e=>{$("confirmSubmit").disabled=!e.currentTarget.checked});
$("confirmDialog").addEventListener("close",async()=>{if($("confirmDialog").returnValue!=="default"||!pendingAction)return;const action=pendingAction;pendingAction=null;try{await action();notify.success("Contribution accepted","Your permanent contribution and CP are now recorded.");await refresh();}catch(error){notify.error("Contribution failed safely",error.message);}});
$("donateGems").addEventListener("click",()=>{const ids=selectedIds(),key=requestKey();openConfirm("Donate selected specimens",`<p><strong>${formatCount(ids.length)} specimens</strong> will be permanently consumed. Each will advance every eligible unfinished counter.</p>`,()=>donateConvergenceGems(ids,key));});
$("cashForm").addEventListener("submit",e=>{e.preventDefault();const amount=Number($("cashAmount").value),key=requestKey();if(!Number.isSafeInteger(amount)||amount<=0)return notify.error("Invalid amount","Enter a positive whole-dollar amount.");openConfirm("Donate cash",`<p><strong>${formatMoney(amount)}</strong> will be permanently deducted and awards up to ${formatCount(Math.floor(amount/100000))} CP.</p>`,()=>donateConvergenceCash(amount,key));});
$("selectUseful").addEventListener("click",()=>{document.querySelectorAll("[data-gem-id]:not(:disabled)").forEach(el=>el.checked=true);updateSelection()});$("clearSelection").addEventListener("click",()=>{document.querySelectorAll("[data-gem-id]").forEach(el=>el.checked=false);updateSelection()});
$("candidateSearch").addEventListener("input",renderCandidates);$("candidateRarity").addEventListener("change",renderCandidates);$("candidateUseful").addEventListener("change",renderCandidates);
$("autoCraftToggle").addEventListener("change",async e=>{e.currentTarget.disabled=true;try{await setConvergenceAutoCraft(e.currentTarget.checked);notify.success("Auto Craft updated",e.currentTarget.checked?"Useful future rolls will feed Convergence.":"Your previous ordinary Auto Craft setting was restored.");await refresh({inventory:false});}catch(error){notify.error("Could not update Auto Craft",error.message);await refresh({inventory:false});}});
$("claimButton").addEventListener("click",async()=>{try{await claimConvergencePickaxe();notify.success("Convergence claimed","The T16 pickaxe is now equipped.");await refresh({inventory:false});}catch(error){notify.error("Claim unavailable",error.message);}});
$("activateSurge").addEventListener("click",async()=>{try{await activateConvergenceSurge();notify.success("Community Surge active","Your next 10 genuine Convergence rolls receive the 2× stat boost.");await refresh({inventory:false});}catch(error){notify.error("Could not activate Surge",error.message);}});$("refreshStatus").addEventListener("click",()=>refresh());

if(await ensurePlayerAuth()){await refresh();timer=setInterval(()=>{if(document.visibilityState==="visible"){renderStatus();refresh({inventory:false});}},15000);window.addEventListener("pagehide",()=>clearInterval(timer));}
