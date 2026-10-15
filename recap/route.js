const month = location.pathname.match(/^\/recap\/month([1-9][0-9]*)\/?$/)?.[1] ||
  (/^\/recap\/(?:index.html)?$/.test(location.pathname) ? '2' : null);
const periods = {
  1: { word: 'One', hero: 'ONE MONTH OF GEM RNG', dates: 'August 8 — September 8, 2026',
    intro: 'One month. An alarming amount of rolling.', outro: 'AND THAT WAS JUST MONTH ONE.' },
  2: { word: 'Two', hero: 'TWO MONTHS OF GEM RNG', dates: 'September 8 — October 8, 2026',
    intro: 'Another month of rolling.<br>Here’s what happened.', outro: 'TWO MONTHS DOWN.' }
};
const period = periods[month];
const experience = document.getElementById('month-experience');
if (!period) {
  experience.innerHTML = '<h1>Recap unavailable</h1><p>Choose an available month above.</p>';
} else {
  document.title = `Month ${period.word} · Gem RNG`;
  document.querySelector(`[data-month="${month}"]`).setAttribute('aria-current', 'page');
  if (month === '2') {
    document.getElementById('monthly-recap').classList.add('recap--month-two');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/recap/month-2/recap.css';
    document.head.append(stylesheet);
  }
  experience.innerHTML = `
    <header class="recap-hero ${month === '2' ? 'recap-hero--two' : ''}">
      ${month === '2' ? '<div class="recap-hero__crystals" aria-hidden="true"><i></i><i></i></div>' : ''}
      <p class="eyebrow">${period.hero}</p>
      <h1>MONTH <span>${period.word.toUpperCase()}.</span></h1>
      <p>${period.dates}</p><p class="intro">${period.intro}</p>
      <p id="recap-status" role="status" aria-live="polite">Loading Month ${period.word}…</p>
      ${month === '2' ? '<button id="replay-intro" type="button" hidden>Replay Anniversary Intro</button>' : ''}
    </header>
    <nav class="recap-tabs" aria-label="Month ${period.word} experiences">
      <button id="global-tab" type="button" aria-pressed="true">🌎 Global Month ${period.word}</button>
      <button id="personal-tab" type="button" aria-pressed="false">💎 Your Month ${period.word}</button>
    </nav>
    <p id="recap-error" role="alert" hidden></p>
    <button id="retry" type="button" hidden>Try again</button>
    <div id="recap-content" aria-busy="true"></div>
    <footer class="recap-footer"><h2>${period.outro}</h2><p>Thank you for playing. 💎</p>
      <a href="/">Keep rolling →</a></footer>`;
  try {
    if (month === '1') await import('./month-1/recap.js');
    else await import('./month-2/recap.js');
  } catch {
    document.getElementById('recap-status').textContent = 'This recap could not be loaded. Please reload to try again.';
  }
}
