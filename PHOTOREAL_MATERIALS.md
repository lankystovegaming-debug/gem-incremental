# Photoreal gem materials

The active renderer is `src/ui/gemStyle.js` + the photoreal pass at the end of `src/styles/app.css`. It uses real-world-inspired optical/material profiles and name inference for admin-created gems (including uranium/uraninite-style ore).

`src/styles/photoreal-material-library.css` is a 2,050,000+ line CSS material archive included for the requested large material library. It is intentionally **not** linked from HTML: loading two million CSS rules into every browser would create multi-second parse/style costs and risk freezing lower-end devices. The active renderer consumes the compact material profiles instead.
