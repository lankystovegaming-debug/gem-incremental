# Photoreal gem materials

The active renderer is `src/ui/gemStyle.js` + the photoreal pass at the end of `src/styles/app.css`. It uses real-world-inspired optical/material profiles and name inference for admin-created gems (including uranium/uraninite-style ore).

The former 2,000,000-line CSS archive has been intentionally removed from the distribution. It did not contribute to the active renderer and would add substantial upload, storage, download, and parsing overhead. The active renderer uses the compact material profiles and local specimen assets instead.
