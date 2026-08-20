# Profile URL routing

Player profiles use the canonical URL:

`/user/<user-id>/`

## Local testing

VS Code Live Server is a static file server and does not implement dynamic rewrites. Use the included dependency-free server instead:

```bash
npm run dev
```

Then open:

`http://127.0.0.1:5500/user/<uuid>/`

The server internally serves `user/index.html` while preserving the requested profile URL.

## Production

The project includes:

- `vercel.json` for Vercel
- `_redirects` for Netlify / Cloudflare Pages style hosts
- `.htaccess` for Apache hosts

The profile page also uses root-absolute asset URLs so the rewritten URL does not cause requests such as `/user/<uuid>/profile.js`.
