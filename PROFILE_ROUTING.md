# Profile URL routing

Player profiles use the canonical URL:

`/user/<user-id>/`

## Production: static hosting / GitHub Pages

`gemincremental.com` includes a `CNAME`, so the project can be deployed as a
static site. Static hosts cannot physically create a directory for every
possible UUID. The repository therefore uses `404.html` as a profile fallback:

1. A request for `/user/<uuid>/` reaches the host's 404 document.
2. `404.html` recognizes the UUID route.
3. It fetches `/user/index.html`.
4. It replaces the temporary 404 document with the profile shell.
5. It imports `/user/profile.js`.
6. The browser URL remains `/user/<uuid>/` and `profile.js` reads the UUID from
   `window.location.pathname`.

This is required for GitHub Pages/static hosting. The HTTP request can still
appear as a 404 in the Network panel because that is how the static host
invokes its custom 404 document, but the user-facing page is the profile.

## Vercel / Netlify / Cloudflare Pages

`vercel.json` and `_redirects` are also included. Hosts that support rewrites
can serve `/user/index.html` directly with a successful 200 response.

## Local testing

VS Code Live Server does not implement dynamic rewrites. Use:

```bash
npm run dev
```

Then open:

`http://127.0.0.1:5500/user/<uuid>/`

The included server serves the profile shell directly with HTTP 200.
