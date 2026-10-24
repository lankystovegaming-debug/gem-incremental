# Legal page review — 22 October 2026

The `/legal/` privacy policy and terms now describe the current account, social,
analytics and cosmetic-store flows. The review changes the public page only.

## Findings addressed

- **Payment disclosure was inaccurate.** The deployed `bmc-facets-webhook` (version 2)
  sends purchase/refund notifications to `process_bmc_facet_event`. The live function
  stores the provider payload, transaction reference and ledger entries. The policy
  now distinguishes payment-card details from purchase/contact information and
  explains claim codes, cosmetic purchases and refund reversals, including possible
  negative balances. Donations and Facets purchases are described separately.
- **Analytics was missing.** The page already loads Cloudflare's beacon. Disclose
  usage/performance measurements and link provider documentation, rather than imply
  that all browser storage is essential or that no analytics exists.
- **Guest-save description was wrong.** `src/backend/supabase.js` enables persistent
  sessions, and gameplay is server-backed. Explain server storage, browser-dependent
  access and loss of guest credentials; qualify guest play by availability.
- **Contact route was misleading.** `/support/` is a donation page. Link `/bugs/`
  (including the correct account/other categories) and its existing SMS fallback.
  Explain optional reply contact, identity verification and requests for access,
  correction, deletion and withdrawal of consent without promising automatic deletion.
- **Social/operational data was under-described.** Add public profiles/showcases,
  activity/presence, referrals, reports, appeals, moderation records and provider
  processing. Browser clearing/sign-out is distinguished from server account deletion.
- **Terms were overbroad or ambiguous.** Preserve non-excludable consumer rights,
  remove the blanket non-refundable assertion, distinguish store value from cash-out,
  permit built-in automation, use consistent age requirements and respect third-party
  intellectual property. Fair-play rules are self-contained instead of incorporating
  an external homepage as an unspecified “Rulebook”. Privacy updates no longer imply
  blanket consent to new data uses merely through continued play.
- **The shared gameplay shell could block policy access.** Its sign-in/ban screens,
  chat and automation no longer initialize on `/legal/`. Static back links, section
  anchors, theme preferences and the existing analytics beacon remain. Override
  offscreen card rendering locally so the complete policy renders for screenshots,
  browser search and reading without the gameplay shell.

## Evidence and references

Read-only backend verification used function definitions, not player/payment rows:
`process_bmc_facet_event` and `submit_bug_report`, plus the deployed payment webhook.
Repository references: `src/backend/supabase.js`, `src/backend/auth.js`,
`src/ui/activityHeartbeat.js`, `src/backend/cloudReferral.js`, `bugs/bugs.js`,
`bugs/index.html`, `support/index.html`, `store/store.js`, `src/ui/shell.js` and the
Facets migration. No formulas, backend code or schema were changed.

Provider documentation checked:

- [Cloudflare collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Cloudflare dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/)
- [Cloudflare analytics privacy approach](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default/)
- [Buy Me a Coffee privacy](https://buymeacoffee.com/privacy-policy)
- [Supabase privacy](https://supabase.com/privacy)
- [Vercel privacy](https://vercel.com/legal/privacy-notice)
- [Singapore PDPA](https://sso.agc.gov.sg/Act/PDPA2012) for access/correction,
  withdrawal, purpose and retention principles; the page does not assert that one
  jurisdiction's law governs all players.

## Validation

Isolated Chrome checks at 320, 390, 768 and 1440px: no horizontal overflow, section
anchors and contact-link keyboard focus work, jump links meet 44px target height,
local account/contact/support/store destinations return 200, and no gameplay or
authentication requests load. Both full policy sections render without offscreen
content skipping. Checked 200% text size at 390px, and policy reading/section
navigation with JavaScript disabled. Visually inspected phone and desktop output.
`git diff --check` passes. Full gameplay tests were not needed for static legal-page
copy and scoped styles; no live purchases, account deletion or deployment performed.

## Scope limits

This is a factual product/content review, not certification of compliance in every
jurisdiction. The repository does not establish a registered operator identity,
postal address or fixed retention schedule, so none was invented. The existing
published developer name and contact number are used. Operational responses to
privacy requests, actual retention practice and any additional jurisdiction-specific
notices remain the operator's responsibility. The displayed policy date is the
review date; the change takes effect on the website when this frontend is released.
