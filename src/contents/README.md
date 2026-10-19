# Contents (트로피룸)

A gallery of every title 애쉬 has enjoyed (webtoon, drama, movie, anime, novel, game, etc.), each shown as a "figure" on a glowing pedestal. Rarity (LEGENDARY/EPIC/RARE/UNCOMMON/COMMON) is derived from the rating and never stored.

## Data
- One row per title in Supabase `contents_items` (`supabase/contents.sql`), never inside `hub_user_data.payload`.
- Covers: resized to WebP in the browser, cached in IndexedDB (`hub-contents-v1` → `covers`), uploaded to the private `contents-covers` bucket at `<user id>/<cover id>` before the row that points at them.
- Local-first: IndexedDB `hub-contents-v1` → `accounts` holds every row with its last synced base and revision. Sync uses optimistic `revision` checks and the HUB three-way merge; conflicts keep recovery copies.
- Removing a title only sets `deletedAt`; the row stays (the table has no delete grant). Never hard-delete rows or change field meanings; add fields and let `validateItem` fill defaults.
- Backups: registered as the `contents` module backup provider (metadata only, covers stay in Storage).
