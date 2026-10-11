# Working rules for AI coding agents (Codex, Claude)

This repo is edited by both Codex and Claude, one at a time. The live app holds
real user data, so these rules come first.

## Before you start
- Get the latest `main` first (`git pull origin main`, or GitHub Desktop: Fetch origin, then Pull origin). Never start from an old copy.
- Read `CLAUDE.md` and the README in the module folder you touch.

## Protecting existing data
- Never delete, rename or change the meaning of stored fields (`hub_user_data.payload`, `mindfold_*` tables, localStorage keys such as `routine-scoreboard-clean-v1`). Add new fields instead, and make `normalizeState` / the module's normalizer accept both old and new shapes.
- Never write default or empty data over existing data. Loading, rendering and migrating must not trigger a save on their own.
- Keep the `revision` checks and three-way merge (`src/hub/merge.js`) in every cloud write; do not add force-overwrite paths.
- Keep the service worker / cache behaviour that stops an old app version from saving over newer cloud data.
- Visual-only changes stay in CSS/markup and must not touch data code.

## Before you push
- Run `npm test` and `npm run build`; both must pass. Pushing to `main` deploys.
- Keep commits small, with a message that says what changed and why.
