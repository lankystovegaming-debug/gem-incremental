import { ensurePlayerAuth } from '../src/backend/auth.js';
import { mountShell } from '../src/ui/shell.js';
import { escapeHtml as esc } from '../src/ui/format.js';
import { gemIconHtml } from '../src/ui/gemStyle.js';
import { loadBundles,loadBundleCandidates,setBundleAuto,contributeBundle } from '../src/backend/cloudBundles.js';
import { bundleProgress,requirementLabel } from '../src/logic/bundles.js';
mountShell({page:'collection-hall',base:'../'});
const $=id=>document.getElementById(id),count=n=>Number(n??0).toLocaleString(undefined,{maximumFractionDigits:2});
let state,active,offset=0,candidates=[],hasNext=false,busy=false,loading=false;
const selected=new Set(),dialog=$('contributionDialog');
function status(message,error=false,id='bundleStatus'){$(id).textContent=message;$(id).classList.toggle('error',error);}
function specimenDetails(g){return `<div class="specimen-review"><h3>${esc(g.gem_name)}</h3><dl><dt>Base rarity</dt><dd>1 in ${count(g.rarity)}</dd><dt>Final weight multiplier</dt><dd>${count(g.final_weight_multiplier)}×</dd><dt>Mutations</dt><dd>${esc((g.mutation_ids??[]).join(', ')||'None')}</dd>${g.serial_number?`<dt>Serial</dt><dd>#${count(g.serial_number)}</dd>`:''}</dl></div>`;}
function render(){
 const opened=new Set([...document.querySelectorAll('.bundle-card[open]')].map(x=>x.dataset.bundle));
 $('bundleCount').textContent=`${state.bundles.filter(b=>bundleProgress(b).complete).length} / 7`;
 $('bundles').innerHTML=state.bundles.map((b,i)=>{
  const p=bundleProgress(b);
  if(!b.unlocked)return `<article class="bundle-card locked"><span class="bundle-icon">🔒</span><div class="bundle-heading"><h2>${esc(b.name)}</h2><p>Complete the first six Collections to unlock Master.</p></div></article>`;
  const groups=[...new Set(b.requirements.map(r=>r.section))];
  return `<details class="bundle-card ${p.complete?'completed':''}" data-bundle="${esc(b.id)}" ${opened.has(b.id)||!state.rendered&&i===0?'open':''}><summary><span class="bundle-icon">${esc(b.icon)}</span><div class="bundle-heading"><h2>${esc(b.name)}</h2><p>${count(p.contributed)} / ${count(p.target)} specimens contributed</p></div><span class="bundle-percent">${p.complete?'Complete ✓':`${Math.min(99.9,p.percent).toFixed(1)}%`}</span></summary><progress value="${p.contributed}" max="${p.target}" aria-label="${esc(b.name)} progress"></progress><div class="bundle-sections">${groups.map(group=>`<h3 class="bundle-section-title">${esc(group)}</h3>${b.requirements.filter(r=>r.section===group).map(r=>{
   const done=r.contributed>=r.required_amount,label=requirementLabel(r);
   return `<div class="bundle-row"><span class="bundle-row-name">${esc(label)}</span><div class="bundle-row-count">${count(r.contributed)} / ${count(r.required_amount)}<progress value="${r.contributed}" max="${r.required_amount}" aria-label="${esc(label)} progress"></progress></div><button class="btn" data-contribute="${esc(r.id)}" ${done?'disabled':''}>${done?'Complete ✓':'Contribute'}</button>${r.manual_only?'<span class="manual-pill">Manual submission only</span>':`<label class="bundle-auto"><input type="checkbox" data-auto="${esc(r.id)}" ${r.auto_contribute?'checked':''} ${done?'disabled':''} aria-label="Auto-contribute ${esc(label)} to ${esc(b.name)}">Auto-contribute</label>`}</div>`;
  }).join('')}`).join('')}</div></details>`;
 }).join('');
 state.rendered=true;
 const crown=state.submissions.find(s=>s.requirement_id==='master-crown');
 $('crownMemory').hidden=!crown;
 if(crown)$('crownMemory').innerHTML=`<p class="bundles-eyebrow">PERMANENTLY REMEMBERED</p><h2>👑 Your Crown Jewel</h2>${specimenDetails(crown.specimen_snapshot)}<p>Submitted ${esc(new Date(crown.submitted_at).toLocaleDateString())}. The specimen is gone; its place in your collection remains.</p>`;
}
async function refresh(quiet=false){
 if(loading||busy)return;loading=true;
 if(!quiet)status('Loading your Collections…');
 try{const {data,error}=await loadBundles();if(error)throw Error(error.message);
 const rendered=state?.rendered;state={...data,rendered};render();status('');}
 catch(error){status(error.message,true);}finally{loading=false;}
}
function selectionChanged(){
 $('selectionCount').textContent=`${selected.size} selected`;
 $('reviewContribution').disabled=!selected.size||busy;
 for(const input of $('bundleCandidates').querySelectorAll('input'))input.checked=selected.has(input.value);
}
async function loadCandidates(){
 selected.clear();selectionChanged();busy=true;
 status('Finding matching specimens…',false,'contributionStatus');
 $('bundleCandidates').innerHTML='';
 for(const id of ['previousCandidates','nextCandidates','selectCandidates'])$(id).disabled=true;
 try{const {data,error}=await loadBundleCandidates(active.id,offset);if(error)throw Error(error.message);
 candidates=data.specimens.slice(0,50);hasNext=data.specimens.length>50;
 $('bundleCandidates').innerHTML=candidates.map(g=>`<label class="bundle-candidate"><input type="${active.manual_only?'radio':'checkbox'}" name="bundleSpecimen" value="${esc(g.id)}"><span class="specimen-icon">${gemIconHtml(g.gem_name,'',g.mutation_ids??[])}</span><span><strong>${esc(g.gem_name)}</strong><small>1 in ${count(g.rarity)} · ${count(g.final_weight_multiplier)}× final weight · $${count(g.value)}<br>${esc((g.mutation_ids??[]).join(', ')||'No mutations')}</small></span></label>`).join('')||'<p>No matching unlocked specimens on this page. Try another page or keep rolling.</p>';
 $('candidatePage').textContent=`Page ${offset/50+1}`;
 status('',false,'contributionStatus');
 }catch(error){status(error.message,true,'contributionStatus');candidates=[];hasNext=false;}
 finally{busy=false;$('previousCandidates').disabled=offset===0;$('nextCandidates').disabled=!hasNext;$('selectCandidates').disabled=!candidates.length||active.manual_only;}
}
async function openContribution(id){
 if(busy||loading)return;
 active=state.bundles.flatMap(b=>b.requirements.map(r=>({...r,bundleName:b.name}))).find(r=>r.id===id);
 if(!active)return;offset=0;
 $('contributionTitle').textContent=requirementLabel(active);
 $('contributionEyebrow').textContent=active.bundleName;
 $('candidateStep').hidden=false;$('confirmStep').hidden=true;
 dialog.showModal();await loadCandidates();
}
$('bundles').addEventListener('click',event=>{const button=event.target.closest('[data-contribute]');if(button)openContribution(button.dataset.contribute);});
$('bundles').addEventListener('change',async event=>{
 const input=event.target.closest('[data-auto]');if(!input||busy)return;
 busy=true;$('bundles').setAttribute('aria-busy','true');
 const {error}=await setBundleAuto(input.dataset.auto,input.checked);
 busy=false;$('bundles').removeAttribute('aria-busy');
 if(error){input.checked=!input.checked;status(error.message,true);}else await refresh(true);
});
$('bundleCandidates').addEventListener('change',event=>{
 const input=event.target.closest('input');if(!input||busy)return;
 if(active.manual_only)selected.clear();
 if(input.checked)selected.add(input.value);else selected.delete(input.value);
 if(selected.size>active.required_amount-active.contributed){selected.delete(input.value);status('Select no more than the remaining requirement.',true,'contributionStatus');}
 selectionChanged();
});
$('selectCandidates').addEventListener('click',()=>{if(busy)return;selected.clear();candidates.slice(0,Math.min(50,active.required_amount-active.contributed)).forEach(g=>selected.add(String(g.id)));selectionChanged();});
$('previousCandidates').addEventListener('click',()=>{if(!busy&&offset>0){offset-=50;loadCandidates();}});
$('nextCandidates').addEventListener('click',()=>{if(!busy&&hasNext){offset+=50;loadCandidates();}});
$('reviewContribution').addEventListener('click',()=>{
 if(busy||!selected.size)return;
 const gems=candidates.filter(g=>selected.has(String(g.id)));
 const valuable=active.bundle_id==='master'||gems.some(g=>g.rarity>=10000000||g.final_weight_multiplier>=5||(g.mutation_ids??[]).length>=3);
 $('contributionReview').innerHTML=active.manual_only?`<h3>Submit this specimen as your Crown Jewel?</h3>${specimenDetails(gems[0])}<p>A permanent snapshot will remember this specimen on your profile.</p>`:
 `<h3>${valuable?'Rare specimen sacrifice':'Confirm your contribution'}</h3><p>Contribute <strong>${gems.length} specimen${gems.length===1?'':'s'}</strong> to ${esc(active.bundleName)} — ${esc(requirementLabel(active))}.</p>${valuable?'<p>These include valuable specimens or a Master requirement. Check your selection carefully.</p>':''}${gems.map(specimenDetails).join('')}`;
 $('submitContribution').textContent=active.manual_only?'Submit Crown Jewel':'Permanently contribute';
 $('candidateStep').hidden=true;$('confirmStep').hidden=false;$('backToCandidates').focus();
});
$('backToCandidates').addEventListener('click',()=>{if(!busy){$('candidateStep').hidden=false;$('confirmStep').hidden=true;}});
$('submitContribution').addEventListener('click',async()=>{
 if(busy)return;busy=true;$('submitContribution').disabled=true;
 status('Submitting your contribution…',false,'contributionStatus');
 const {error}=await contributeBundle(active.id,[...selected],active.manual_only);
 busy=false;$('submitContribution').disabled=false;
 if(error){status(`${error.message} Close and refresh your progress before trying again.`,true,'contributionStatus');$('submitContribution').disabled=true;return;}
 dialog.close();await refresh();
});
$('closeContribution').addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{$('submitContribution').disabled=false;});
$('refreshBundles').addEventListener('click',()=>refresh());
await ensurePlayerAuth();await refresh();
setInterval(()=>{if(!document.hidden&&!dialog.open)refresh(true);},15000);
