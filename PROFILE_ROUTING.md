# Profile URL routing

Player profiles use the canonical URL:

`/user/<username>/`

## Local testing

VS Code Live Server is a static file server and does not implement dynamic rewrites. Use the included dependency-free server instead:

```bash
npm run dev
```

Then open:

`http://127.0.0.1:5500/user/<username>/`

The server internally serves `user/index.html` while preserving the requested profile URL.

## Production

The project includes:

- `vercel.json` for Vercel
- `_redirects` for Netlify / Cloudflare Pages style hosts
- `.htaccess` for Apache hosts

The profile page also uses root-absolute asset URLs so the rewritten URL does not cause requests such as `/user/<username>/profile.js`.

Usernames are URL-encoded and resolved through the existing public
`get_profile_ids_for_usernames` RPC before loading `get_public_profile`.
Matching follows the backend's exact username spelling. Old UUID URLs and
`?id=` links still load and replace the visible URL with the current username.
`/user/` opens the signed-in player's profile.

Monthly recaps share `recap/index.html` at `/recap/month1/` and `/recap/month2/`.
The month selector switches between the existing month-specific data and rendering.
Old `/recap/month-1/` and `/recap/month-2/` links redirect to the new URLs.
GitHub Pages falls back through `404.html` for both dynamic routes.
These changes require no Supabase migration or Edge Function deployment.
