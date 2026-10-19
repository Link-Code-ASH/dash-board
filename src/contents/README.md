# Contents (트로피룸)

A gallery of every title 애쉬 has enjoyed (webtoon, drama, movie, anime, novel, game, etc.), each shown as a "figure" on a glowing pedestal. Rarity (LEGENDARY/EPIC/RARE/UNCOMMON/COMMON) is derived from the rating and never stored.

## Upcoming titles
- `status: "upcoming"` titles sit on a separate 출시 예정 shelf with a D-day badge, `releaseDate` and `hype` (기대도, not a rating; no rarity). "다 봤어요" turns one into a normal exhibit.
- Every title with a `releaseDate` shows in Flow's schedule through the `contents` Flow source (`flow.js`); its link opens `#/contents/item:<id>`.

## Data
- One row per title in Supabase `contents_items` (`supabase/contents.sql`), never inside `hub_user_data.payload`.
- Covers: resized to WebP in the browser, cached in IndexedDB (`hub-contents-v1` → `covers`), uploaded to the private `contents-covers` bucket at `<user id>/<cover id>` before the row that points at them.
- Local-first: IndexedDB `hub-contents-v1` → `accounts` holds every row with its last synced base and revision. Sync uses optimistic `revision` checks and the HUB three-way merge; conflicts keep recovery copies.
- Removing a title only sets `deletedAt`; the row stays (the table has no delete grant). Never hard-delete rows or change field meanings; add fields and let `validateItem` fill defaults.
- Backups: registered as the `contents` module backup provider (metadata only, covers stay in Storage).

## Cover search

`coverSearch.js` finds cover candidates in the browser from key-less sources (Wikipedia ko/en, Apple iTunes Search, AniList), chosen by title type. The editor searches on its own while a title has no cover; a failing source is skipped. A picked image is downloaded and saved like an uploaded cover when its host allows it (CORS), otherwise kept as `coverUrl`.
