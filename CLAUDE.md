# DASH BOARD (HUB)

Personal daily-life dashboard: routines/scores, schedule, memos (Dashboard), a Notion-like document workspace (Mindfold), and settings/sync/backup (Vault).

- Stack: React 19 + Vite 7, plain JS/JSX. `src/App.jsx` uses `h = React.createElement` instead of JSX; keep that style there. Mindfold (`src/mindfold/`) uses JSX and Tiptap 3.
- Data: Supabase with Google sign-in (`src/accountSync.js`). Dashboard data lives in `hub_user_data.payload`; Mindfold in `mindfold_workspaces` / `mindfold_pages` (`supabase/*.sql`). Writes use optimistic `revision` checks.
- Commands: `npm run dev`, `npm run build`, `npm test` (node:test, `tests/`).
- Deploy: pushing to `main` tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
- UI text is a Korean/English mix; the owner communicates in Korean.
