// =========================================================
// ICONS
//
// Inline SVG strings so the UI stays readable without
// leaning on emoji or an icon font request.
//
// Every icon inherits currentColor and sizes from CSS.
// =========================================================

function svg(body, extra = "") {
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" ${extra}>${body}</svg>`
  );
}


export const icons = {
  gem: svg(`
    <path d="M6 3h12l4 6-10 12L2 9z" />
    <path d="M2 9h20" />
    <path d="M12 21 8.5 9 11 3" />
    <path d="m12 21 3.5-12L13 3" />
  `),

  dice: svg(`
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  `),

  bag: svg(`
    <path d="M4 8h16l-1.2 11.2A2 2 0 0 1 16.8 21H7.2a2 2 0 0 1-2-1.8L4 8Z" />
    <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
  `),

  anvil: svg(`
    <path d="M3 8h7l2.5 3H21a5 5 0 0 1-5 5h-1l1 3H8l1-3a6 6 0 0 1-6-6V8Z" />
    <path d="M6 21h12" />
  `),

  potion: svg(`
    <path d="M9 3h6" />
    <path d="M10 3v5l-4.8 8.1A3.2 3.2 0 0 0 8 21h8a3.2 3.2 0 0 0 2.8-4.9L14 8V3" />
    <path d="M7.8 14h8.4" />
    <circle cx="10" cy="17" r=".8" fill="currentColor" stroke="none" />
  `),

  heart: svg(`
    <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" />
  `),

  shield: svg(`
    <path d="M12 3 20 6v5c0 5.2-3.4 8.3-8 10-4.6-1.7-8-4.8-8-10V6Z" />
    <path d="m8.8 12 2.1 2.1 4.5-4.6" />
  `),

  book: svg(`
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
  `),

  trophy: svg(`
    <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11" />
    <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
    <path d="M9.5 15h5l.7 3.5H8.8L9.5 15Z" />
    <path d="M7 21h10" />
  `),

  chart: svg(`
    <path d="M3 21h18" />
    <path d="M6 21V11" />
    <path d="M11 21V4" />
    <path d="M16 21v-6" />
    <path d="M21 21v-9" />
  `),

  coins: svg(`
    <ellipse cx="12" cy="6" rx="8" ry="3.2" />
    <path d="M4 6v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6" />
    <path d="M4 11v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-5" />
  `),

  lock: svg(`
    <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  `),

  unlock: svg(`
    <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 7.5-2" />
  `),

  check: svg(`<path d="m4.5 12.5 5 5 10-11" />`),

  checkCircle: svg(`
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.2 2.8 2.8L16 9.5" />
  `),

  x: svg(`<path d="M6 6l12 12M18 6 6 18" />`),

  alert: svg(`
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  `),

  info: svg(`
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
  `),

  search: svg(`
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  `),

  sun: svg(`
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  `),

  moon: svg(`
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  `),

  monitor: svg(`
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M8.5 21h7M12 17v4" />
  `),

  palette: svg(`
    <path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.2 3H16a2 2 0 0 0-1.4 3.4A1.9 1.9 0 0 1 12 21Z" />
    <circle cx="7.8" cy="12.2" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9.8" cy="8.2" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.4" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
  `),

  user: svg(`
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  `),

  logout: svg(`
    <path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M10 8.5 6.5 12 10 15.5" />
    <path d="M6.5 12H16" />
  `),

  cloud: svg(`
    <path d="M7.5 19a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 9.6 4 4 0 0 1 17.5 19Z" />
  `),

  cloudCheck: svg(`
    <path d="M7.5 18a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 8.6 4 4 0 0 1 17.5 18Z" />
    <path d="m9.7 14 1.8 1.8 3.5-3.6" />
  `),

  scale: svg(`
    <path d="M12 4v16" />
    <path d="M6 20h12" />
    <path d="M4 8h16" />
    <path d="M4 8 1.5 14a3 3 0 0 0 5 0Z" />
    <path d="M20 8l-2.5 6a3 3 0 0 0 5 0Z" />
  `),

  sparkle: svg(`
    <path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13 4.5 11l5.6-2Z" />
    <path d="M18.5 4v3M17 5.5h3" />
  `),

  arrowLeft: svg(`<path d="M19 12H5" /><path d="m11 6-6 6 6 6" />`),

  arrowUp: svg(`<path d="M12 19V5" /><path d="m6 11 6-6 6 6" />`),

  refresh: svg(`
    <path d="M20 11a8 8 0 0 0-13.7-5.2L3 9" />
    <path d="M3 4.5V9h4.5" />
    <path d="M4 13a8 8 0 0 0 13.7 5.2L21 15" />
    <path d="M21 19.5V15h-4.5" />
  `),

  bolt: svg(`<path d="M13.5 2.5 4.5 13.8h6l-.9 7.7 9-11.3h-6Z" />`),

  clock: svg(`
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6.8V12l3.4 2" />
  `),

  gavel: svg(`
    <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8" />
    <path d="m16 16 6-6" />
    <path d="m8 8 6-6" />
    <path d="m9 7 8 8" />
    <path d="m21 11-8-8" />
  `),

  trash: svg(`
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
  `),

  filter: svg(`<path d="M3.5 5.5h17l-6.5 7.6V20l-4 1.5v-8.4Z" />`),

  settings: svg(`
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  `),

  keyboard: svg(`
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M8.5 14h7" />
  `),

  market: svg(`
    <path d="M4 18V9M9 18V5M14 18v-6M19 18V8" />
    <path d="M3 21h18" />
  `),

  box: svg(`
    <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" />
    <path d="M3 8.5 12 13l9-4.5" />
    <path d="M12 13v7" />
  `),

  megaphone: svg(`
    <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z" />
    <path d="M18 8a4 4 0 0 1 0 8" />
  `),

  bug: svg(`
    <rect x="8" y="7" width="8" height="12" rx="4" />
    <path d="M12 3v3M9 6 7.5 4.5M15 6l1.5-1.5" />
    <path d="M8 11H4M20 11h-4M8 15H4M20 15h-4M8 19l-2 2M16 19l2 2" />
  `),

  compass: svg(`
    <circle cx="12" cy="12" r="8.8" />
    <path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z" />
  `),

  chevronDown: svg(`<path d="m6.5 9 5.5 5.5L17.5 9" />`),

  quest: svg(`
    <path d="M6 3.5h11.5a2 2 0 0 1 2 2V20L15.7 18 12 20l-3.7-2L4.5 20V5.5a2 2 0 0 1 2-2Z" />
    <path d="M8.5 8.5h7M8.5 12h5" />
  `),

  users: svg(`
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M18.5 20a5.3 5.3 0 0 0-2.8-4.7" />
  `),

  island: svg(`
    <path d="M3 17c2.2-1.6 4.5-1.6 6.7 0s4.5 1.6 6.7 0 4.5-1.6 4.6-1.6" />
    <path d="M5 13.5c2.5-3.8 5-5.7 7-5.7 2.8 0 5.3 1.9 7 5.7" />
    <path d="M12 7.8V4.5M12 4.5l2 1.8M12 4.5l-2 1.8" />
  `),

  castle: svg(`
    <path d="M4 20V7h3V4h3v3h4V4h3v3h3v13H4Z" />
    <path d="M9.5 20v-4.5a2.5 2.5 0 0 1 5 0V20M7.5 11h.01M16.5 11h.01" />
  `),

  wheel: svg(`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
  `),

  swords: svg(`
    <path d="m7 4 13 13M15 4l-3 3M17 6l3-2v3l-2 2M6 17l-2 3h3l2-2" />
    <path d="m17 4-13 13M9 4l3 3M7 6 4 4v3l2 2M18 17l2 3h-3l-2-2" />
  `),

  skull: svg(`
    <path d="M6.5 14.5A7 7 0 1 1 18 14.5V18l-2.5 2-1.5-1.2L12 20l-2-1.2L8.5 20 6 18v-3.5Z" />
    <circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M10 16h4" />
  `),

  vault: svg(`
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 8v8M8 12h8" />
  `),

  calendar: svg(`
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M7.5 3v4M16.5 3v4M3.5 9h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
  `),

  map: svg(`
    <path d="m3.5 6 5-2 7 2 5-2v14l-5 2-7-2-5 2V6Z" />
    <path d="M8.5 4v14M15.5 6v14" />
  `),

  archive: svg(`
    <path d="M4 7h16v13H4zM3 4h18v3H3z" />
    <path d="M10 12h4" />
  `),

  flask: svg(`
    <path d="M9 3h6M10 3v5L5.5 17A2.8 2.8 0 0 0 8 21h8a2.8 2.8 0 0 0 2.5-4l-4.5-9V3" />
    <path d="M7.5 15h9" />
  `),

  wand: svg(`
    <path d="m5 19 10-10M13.5 5.5l.8-2 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8ZM18.5 13.5l.6-1.5.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6Z" />
  `),

  pickaxe: svg(`
    <path d="m8 20 8-16M4 7c3.8-3 12.2-3 16 0M6.5 9.5 4 7l2-2.5M17.5 9.5 20 7l-2-2.5" />
  `),

  caravan: svg(`
    <path d="M3 16h18v-6H7l-2 3H3v3Z" />
    <path d="M7 10V7h8l3 3M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  `),

  branch: svg(`
    <path d="M12 21V4M12 10 6 6M12 14l6-4M6 6V3.5M6 6H3.5M18 10V7.5M18 10h2.5M12 4l-2-2M12 4l2-2" />
  `),

  github: svg(`
    <path d="M9 19c-4 1.4-4-2.1-6-2.5m12 4.5v-3.4a3 3 0 0 0-.8-2.3c2.6-.3 5.3-1.3 5.3-5.8a4.5 4.5 0 0 0-1.3-3.1 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.3 3.4 5.3 3.7 5.3 3.7a4.2 4.2 0 0 0-.1 3.2 4.5 4.5 0 0 0-1.3 3.1c0 4.5 2.7 5.5 5.3 5.8a3 3 0 0 0-.8 2.3V21" />
  `),

  google:
    `<svg viewBox="0 0 24 24" aria-hidden="true">
       <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6a5.7 5.7 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.4-5.2 3.4-8.6z"/>
       <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.5v3.1A12 12 0 0 0 12 24z"/>
       <path fill="#FBBC05" d="M5.4 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.5a12 12 0 0 0 0 10.8l3.9-3.1z"/>
       <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.5 6.6l3.9 3.1A7.2 7.2 0 0 1 12 4.8z"/>
     </svg>`
};
