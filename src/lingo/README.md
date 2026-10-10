# Lingo Japanese vocabulary

The Japanese tab supports Excel/UTF-8 CSV imports, manually assigned stages 1–5,
and temporary flashcard sessions. Right removes a card from this session; left
moves it to the back. Neither action changes the stored stage.

## Import format

The first row is the header. Required columns: `일본어`, `한국어 뜻`.
Optional columns: `읽는 법`, `예문`, `예문 해석`. Column order is flexible;
unrecognized columns are ignored. Blank rows are skipped. Duplicate required or
optional headers, duplicate Japanese/reading pairs, and missing required cells
block the entire import. Uploads accept `.xlsx` and UTF-8 `.csv`, at most 10 MB
and 10,000 nonempty data rows per import. The UI offers a CSV template with examples.

Within one deck, trimmed Japanese + reading identifies a word. Reimport replaces
content (including clearing optional fields) but preserves IDs and stages.
Missing source words stay in the deck. Changes to spelling or reading create new
words. New word IDs are derived from the identity pair so concurrent imports on
two devices do not duplicate the same word. Imported text is rendered as text,
never HTML. Spreadsheet formulas are not executed.

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
are not backed up or synced. Signed-out data belongs to a separate `local` scope;
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
responses, and global backup/restore. `supabase/tests/lingo_rls.sql` runs a
transaction-only owner/foreign/anonymous access and revision smoke test against
a database with at least one auth user, then rolls back all fixtures.

Browser checks should include desktop and 390px mobile layouts, actual file
selection, switching workbook sheets, multi-select/stages, keyboard shortcuts,
horizontal drag versus vertical scroll, undo after completion, and reload.
