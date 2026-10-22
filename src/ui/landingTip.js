import { landingTips } from '../data/landingTips.js';

// Pick once per visit, independently of player loading and account changes.
document.getElementById('landingTip').textContent =
  landingTips[Math.floor(Math.random() * landingTips.length)];
