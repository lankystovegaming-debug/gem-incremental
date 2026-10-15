# Mining roll card preview

`preview.webm` is a short browser recording of the production roll-card renderers
and mining scene, using fixed five-result fixtures. It is a visual preview, not a
live backend roll. The full featured result, all five batch results and roll
button remain visible throughout the recording.

Run `npm run test:mining-card` against the local preview server. Optional variables:
`MINING_PREVIEW_URL`, `MINING_PLAYWRIGHT_MODULE`, `MINING_CHROMIUM_PATH`,
`MINING_PREVIEW_OUTPUT`, and `MINING_RECORD_VIDEO=1`.

Coverage: phone/tablet/desktop overflow, authoritative result icons, complete
five-result list, single rolls, animation-off settings, reduced motion,
House Edge/pet results and rapid re-renders. Existing roll-handler and cutscene
regressions are run separately. No backend files or deployments are involved.
