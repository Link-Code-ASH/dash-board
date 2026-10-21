# Contents (기록 아카이브)

An archive of every title 애쉬 has finished (webtoon, drama, movie, anime, novel, game, etc.), one record card each, with a rating, a one-line review and a Q&A review. Rarity helpers in `model.js` are kept but no longer shown.

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

## Simplified records (2026-10-19)

The editor shows only title, type, rating and one-line review for watched titles, and title, type, release date and memo for 출시 예정 titles (added from their own section). Status, dates, creator, platform and hype are no longer edited but stay stored untouched. The detail view shows "마지막 수정" from `updatedAt`.

## Archive and Q&A reviews (2026-10-21)

The trophy room became a record archive: numbered record cards (No.001 = first recorded) with the upcoming list beside them.
Each record keeps a Q&A review in `item.dialogue`: `{ id, role: "claude" | "guide" | "me", text, at, skipped? }`.
The owner does the Q&A with Claude in the project chat, and Claude appends the entries to the row in `contents_items`
(payload `dialogue` plus `updatedAt`, revision + 1). Built-in questions (`interview.js`) let the owner do it alone in the app.
Stars are SVGs clipped at `24 * fill`, so half a star is exactly half.
