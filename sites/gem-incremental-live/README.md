# Gem Incremental on Sites

Public Site: https://gem-incremental-live.ampleshore11.chatgpt.site

`index.html` embeds https://gemincremental.com/ directly, keeping game updates, accounts, and progress on the existing live backend. It includes an Open game link for browsers that restrict embedded sessions. Sign-in may be separate from a normal browser tab. No database migrations or Edge Function deployments are required.

The deployed source is managed through the Sites plugin. To update the Site, copy this file to `dist/index.html` in its Sites checkout and use the Sites source packaging and publishing workflow. Publishing this repository alone does not update the Site.

Validation: local preview returned HTTP 200; the embedded landing and account pages rendered, and the designated test account signed in successfully.
