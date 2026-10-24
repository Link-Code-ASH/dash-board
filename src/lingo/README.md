# Lingo Japanese vocabulary

The Japanese tab supports Excel/UTF-8 CSV imports, manually assigned stages 1–5,
and temporary flashcard sessions. Right removes a card from this session; left
moves it to the back. Neither action changes the stored stage.

## Word pool and word books

Every import (Excel, CSV, Google Sheets) adds to one pool deck, `id: "pool"`
(`전체 단어`). The import panel no longer asks for a deck. Word books are made in
the app: `내 단어장 → 새 단어장`, or select words and use `단어장에 담기`. A book is a
`lingo_decks` row with `kind: "book"`, empty `words`, and `items: [{ id }]`, where
each id is a word's entry key (`wordEntryKey(deckId, wordId)`), so stages and
favorites stay on the pool word. In a book, `단어장에서 빼기` removes references only.
Deleting a book sets `deleted: true` (the table has no DELETE grant) and keeps
its items. Decks created by earlier imports stay as they were and are listed as
`예전 가져오기` groups; their words also appear in 전체 단어. See `books.js`.

## Import format

The first row is the header. Required columns: `일본어`, `한국어 뜻`.
The downloadable format uses these ten columns in order: `일본어`, `한국어 뜻`,
`읽는 법`, `한자 훈음`, `예문`, `예문 읽는 법`, `예문 해석`, `품사`, `JLPT`, `특성`.
Only the first two are required. Column order is flexible;
unrecognized columns are ignored. Blank rows are skipped. Duplicate required or
optional headers, duplicate Japanese/reading pairs, and missing required cells
block the entire import. Uploads accept `.xlsx` and UTF-8 `.csv`, at most 10 MB
and 10,000 nonempty data rows per import. The XLSX download has `단어 양식`, `예시`,
and `작성 안내` tabs; blank CSV and example CSV downloads use the same headers.
Google Sheets can use the same format or import the downloaded workbook.

`품사` and `특성` accept freeform semicolon-separated tags, trimmed and deduplicated.
`JLPT` accepts one of N5, N4, N3, N2, N1 or blank; other values block import with
a row error. `한자 훈음` contains manually entered Korean Hanja meanings/readings,
such as `食 먹을 식`, with multiple characters separated by in-cell newlines.
`예문 읽는 법` is the manually entered full Hiragana example reading.

Within one deck, trimmed Japanese + reading identifies a word. Reimport replaces
content but preserves IDs, stages, and favorites. Old five-column imports remain supported:
absent new columns preserve stored Hanja, example reading, POS, JLPT, and topics;
present new columns with blank cells clear that field. The original optional
reading/example/translation fields retain their previous clearing behavior.
Missing source words stay in the deck. Changes to spelling or reading create new
words. New word IDs are derived from the identity pair so concurrent imports on
two devices do not duplicate the same word. Imported text is rendered as text,
never HTML. Spreadsheet formulas are not executed.

## 특성 groups

Imported `특성` tags are fine-grained (the first 5,000-word import had 823, a
quarter of them on one word). `topicGroups.js` maps each tag to one of 18 broad
groups (음식·요리, 집·생활, …). The list, filters and cards show groups; the
stored `topics` are never rewritten, so filtering by a raw tag still works and a
tag missing from the table shows as itself. In the filter, 특성 appears only
after a 품사 or JLPT box is checked and lists the groups found in those words;
checked groups that disappear are unchecked. `미분류` shows only when some
words in the current scope lack a value.

## Study list and cards

The initial scope is all decks; importing opens the target deck. POS, JLPT, and
topics each allow multiple selections (OR within a group, AND between groups),
including uncategorized words. Search and stage constraints also apply. Changing
scope resets all conditions, selections, and page; changing a condition resets
selection and page. The result selection creates a temporary study list, without
copying words or creating saved filter presets. All-deck rows show their source.
Selection uses `(deck ID, word ID)`, so matching words in different decks remain
independent. Bulk stage changes validate every source deck before one local write,
then use the existing per-deck cloud synchronization.

Each word has an independent `favorite` boolean. Legacy words normalize to false;
imports preserve existing favorites and create new words without a star. The
sidebar's `즐겨찾기` scope collects original starred words across decks, without
copying them, and supports the same stage/category/search filters and sessions.
Individual stars toggle immediately. The bulk star covers the entire current
filter result, including other pages: a mixed result adds every word; an entirely
starred result removes every star. These changes validate all source targets
against the latest decks before one local write, then use ordinary sync/backup.
Removing words from the favorites scope resets selection and pagination so hidden
words never enter a subsequent session. The empty result region reserves a small
baseline height and the Lingo library keeps a stable scroll gutter/alignment.

Both faces share a compact header with POS, JLPT, topic badges, and a stage selector
at the upper right. The front shows Japanese. The back repeats the Japanese word,
followed by reading, meaning,
Korean Hanja entries in a wrapping horizontal row, and the example with Furigana
and Korean translation directly below. Empty optional fields are hidden.
Furigana uses the existing full `예문 읽는 법`: Kana anchors align the supplied
reading to Han runs; uncertain or mismatched alignment shows the complete supplied
reading above the whole example instead of guessing individual readings.
Clicking, tapping, or Space flips the card. Arrow keys and buttons provide the
same actions as horizontal swipes.
The white surface, frame, shadow, and focus ring are painted on one rotating
element; both content faces are transparent and turn with it. Rotation stays
separate from swipe transforms and respects reduced motion. Both faces share the taller face's height
so flipping keeps their bounds and the judgment buttons aligned. The hidden face
is inert; focus follows the current face. Long answers use vertical page scrolling.
The judgment buttons show `알아요` on the left and `다시 볼게요` on the right;
right swipes/arrow keys still complete a word and left swipes/arrow keys repeat it.

Manually chosen stages remain in the current session draft, including across
again/undo and the completion screen. Explicit exit or the completion return
validates and saves all final stage changes with one local write before returning
to the library. A failed explicit save leaves the session and draft available
for retry. Ordinary language/module navigation also attempts the draft save;
the store reports storage failures on that path. Refresh discards the unsaved
session draft. Account changes dispose the old store and block stale writes.
Judgments still never change stages automatically.

## Storage and deployment

`supabase/lingo.sql` creates `public.lingo_decks`, owner-only RLS, and an optimistic
revision trigger. It was applied to the existing DASHBOARD Supabase project as
`create_lingo_decks`. For a new environment apply it once before deploying the UI.
The primary key is `(user_id, deck_id)`. Only authenticated owner SELECT/INSERT/
UPDATE is granted; there is no destructive DELETE API in this version.

The shared Supabase auth client supplies the account identity. Lingo data is
separate from Dashboard payloads. IndexedDB `hub-lingo-v1` stores per-account
decks, acknowledged bases, pending changes, and recovery snapshots. Cloud writes
use revision comparisons; conflicts use the Hub three-way merge with local
values winning actual conflicts. Base/local/remote copies are persisted before
uploading merged data. Unknown versions and invalid merges stop writes.

Web Locks serialize same-origin reads/edits/syncs. Browsers without Web Locks
serialize only within one page; simultaneous tabs on those browsers cannot
guarantee atomic local changes. Sync runs after edits, every 30 seconds, on focus,
and on reconnection. Status and recovery downloads appear in Lingo. Background
requests have a 15-second timeout. Offline edits remain queued.

The provider mounts with the Hub rather than the Japanese screen, registering
the `lingo` backup provider even when the screen has never been opened. Restore
validates all decks first, saves a recovery copy, replaces matching deck IDs and
adds missing IDs; decks absent from the backup remain untouched. Session queues
are not backed up or synced. Schema version remains 1: missing new word fields
normalize to empty strings/arrays (and `favorite: false`) in local decks, sync bases, server responses,
and backups. Unknown fields remain intact. No database migration is required
for the new word information. Signed-out data belongs to a separate `local` scope;
use a Hub backup and restore to move it to an account explicitly.

## Google Sheets configuration

The Google connection is separate from Supabase login. There is no server-side
Google refresh token or background source sync. Tokens live only in memory and
are cleared on app account changes. Reimport requires a user click and requests
a new token when expired. No requests write to the original spreadsheet.

1. In one Google Cloud project enable Google Drive API, Google Picker API, and
   Google Sheets API. Configure the OAuth consent screen and its test users or
   production publishing status.
2. Create a Web application OAuth client with authorized JavaScript origins for
   the deployed site and `http://127.0.0.1:5173` for development. GIS uses the
   popup token model; the Supabase callback URL is not used for this connection.
3. Create a browser API key restricted to Google Picker/Drive APIs and approved
   website referrers, including the deployed site, development origin, and
   `https://docs.google.com/*` for Picker's iframe. Use the same project's numeric
   project number as the App ID.
4. Copy `.env.example` to `.env.local` and fill `VITE_GOOGLE_CLIENT_ID`,
   `VITE_GOOGLE_PICKER_API_KEY`, and `VITE_GOOGLE_APP_ID`. Restart Vite.
   For GitHub Pages, set the same three repository Actions **variables**;
   the existing build workflow passes them to Vite. All are browser-visible.
5. Test connecting, selecting a private sheet, changing tabs, importing,
   cancelling the popup/Picker, revoked access, and reauthenticating after expiry.

The requested scope is `https://www.googleapis.com/auth/drive.file`. Although
Google describes it as file read/write permission, the app only performs Sheets
GET requests and only accesses selected files. Missing configuration disables
Google import with a visible explanation; file imports remain functional.

References: [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[Google Picker configuration](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample),
[Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes).

## Verification

Run `npm test` and `npm run build`. `tests/lingo.test.js` covers real XLSX sheets,
CSV validation, reimport/stage behavior, queue gestures, account separation,
concurrent devices/tabs, offline retry, CAS races, failed storage, stale account
responses, category filters/composite selection keys, atomic cross-deck changes,
metadata merges/recovery, old format compatibility, and global backup/restore.
`tests/lingo-import-file.test.js` checks the actual shipped workbook and CSV
downloads; `tests/lingo-google.test.js` checks Sheets responses and auth isolation.
`tests/lingo-favorites.test.js` checks legacy normalization, preserved imports,
all-page atomic changes, offline/backup/merge behavior, and account disposal.
`supabase/tests/lingo_rls.sql` runs a
transaction-only owner/foreign/anonymous access and revision smoke test against
a database with at least one auth user, then rolls back all fixtures.

Browser checks should include desktop and 390px mobile layouts, actual file
selection, switching workbook sheets, multi-select/stages, keyboard shortcuts,
horizontal drag versus vertical scroll, undo after completion, and reload.
