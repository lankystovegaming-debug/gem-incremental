import { gemIconHtml } from './gemStyle.js';

// Presentation only: results have already been committed by the roll service.
// Replacing the scene also cancels the previous CSS animation on rapid rolls.
export function mountMiningScene(stage, results = [], { animated = false } = {}) {
  stage.querySelector('.mining-scene')?.remove();
  stage.classList.add('mining-stage');
  const scene = document.createElement('div');
  scene.className = `mining-scene${animated ? ' is-mining' : ''}`;
  scene.setAttribute('aria-hidden', 'true');
  const finds = results.flatMap(result => {
    if (result.houseEdge) return [];
    if (result.pet) return ['<span class="mining-find">🐾</span>'];
    if (!result.gem?.name) return [];
    return [`<span class="mining-find">${gemIconHtml(result.gem.name, 'gem-icon--batch', result.mutationIds ?? result.mutations?.map(m => m.id) ?? [])}</span>`];
  }).join('');
  scene.innerHTML = `
    <div class="mining-scene__label"><span></span> THE GEM DEPOSIT <span></span></div>
    <svg class="mining-scene__art" viewBox="0 0 560 250" fill="none">
      <ellipse cx="280" cy="224" rx="174" ry="15" fill="currentColor" opacity=".07"/>
      <path d="M65 224H495" stroke="currentColor" stroke-opacity=".13"/>
      <g class="mining-rock">
        <path d="M161 213L175 151L209 119L278 107L340 127L386 169L400 215L344 230L219 229Z" fill="#313d50" stroke="#68778c" stroke-width="2"/>
        <path d="M175 151L244 148L278 107L209 119Z" fill="#64748b"/>
        <path d="M244 148L320 157L340 127L278 107Z" fill="#4b5d75"/>
        <path d="M320 157L386 169L340 127Z" fill="#738298"/>
        <path d="M161 213L244 197L244 148L175 151Z" fill="#43516a"/>
        <path d="M244 148L244 197L320 216L320 157Z" fill="#3a485e"/>
        <path d="M320 216L386 169L400 215L344 230Z" fill="#263345"/>
        <path d="M244 197L219 229L161 213Z" fill="#526079"/>
        <path d="M278 120L269 143L288 158L279 179M288 158L312 145" stroke="#b2dae3" stroke-opacity=".4" stroke-width="2"/>
        <path d="M203 177L215 170L224 181L213 193Z" fill="#73e7d4" opacity=".65"/>
        <path d="M347 189L355 181L363 190L355 201Z" fill="#91b9f3" opacity=".7"/>
      </g>
      <g class="mining-impact" transform="translate(-65 35)" stroke="#b4f7e9" stroke-width="3" stroke-linecap="round">
        <path d="M276 110L268 91M288 108L297 89M301 119L319 110M258 120L241 112"/>
        <path d="M221 139L209 127M332 137L345 125" stroke="#e7c98a"/>
      </g>
      <g class="mining-pickaxe">
        <path d="M379 192L291 60" stroke="#2c1e19" stroke-width="15" stroke-linecap="round"/>
        <path d="M378 190L291 60" stroke="#be8955" stroke-width="10" stroke-linecap="round"/>
        <path d="M366 173L346 143" stroke="#e5b77b" stroke-width="3" stroke-linecap="round"/>
        <path d="M232 87Q274 14 349 37L373 57Q300 35 256 83L233 101Z" fill="#bacedd" stroke="#eff8ff" stroke-width="2"/>
        <path d="M232 87Q277 29 349 37Q288 12 232 87Z" fill="#edf8ff"/>
        <path d="M282 51L298 44L309 65L293 74Z" fill="#71879d" stroke="#d0e4ee" stroke-width="2"/>
      </g>
      <g fill="#67778d"><path d="M127 221L139 211L148 224Z"/><path d="M417 223L425 212L437 225Z"/><path d="M151 231L157 225L168 233Z"/></g>
    </svg>
    <div class="mining-finds">${finds}</div>
    <p class="mining-scene__caption">${results.length ? 'Fresh from the deposit' : 'Your next discovery is waiting'}</p>`;
  const anchor = stage.querySelector('.gem-reveal, .stage__idle');
  if (anchor) anchor.after(scene); else stage.prepend(scene);
}
