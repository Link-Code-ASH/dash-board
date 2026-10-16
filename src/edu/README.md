# Edu

Edu manages student profiles, freeform memos, consultations, and edit history.
Courses, tuition, and payments are outside this version.

## Student data and saving

The Dashboard snapshot owns `edu: { version: 1, students, consultations, events }`.
It uses existing account-scoped local journals, cloud revision checks, conflict
recovery, and full backups. No additional database table or backup provider is
required. Unsupported Edu data stays in the snapshot; the provider blocks edits
and displays an error instead of replacing the records.

`applyEduAction` produces a complete immutable Edu snapshot containing both the
change and its history. `EduProvider.save(action)` waits for the local journal to
flush and rejects on failure or account change. Cloud delivery follows existing
Dashboard synchronization. Saving is explicit; unchanged saves add no event.

## Age and academic year

Dates use `Asia/Seoul`. Counting age is `currentYear - birthYear + 1`.
Numeric grades 1–6 are primary school, 7–9 middle school, 10–12 high school,
and 13 graduation. Students retain an academic anchor with `referenceGrade`,
`referenceYear`, and `referenceId`; the current grade is derived from that anchor.
Manual corrections replace the anchor together. The Dashboard merge treats the
whole anchor as one value to avoid mixing different corrections.

Each January 1 transition has deterministic identity
`promotion:<studentId>:<referenceId>:<effectiveYear>` and effective midnight KST
as its timestamp. Startup, date boundaries, resume, and data synchronization
reconcile missing events. Duplicate reconciliation cannot advance grades twice.
Only middle grade 3 to high grade 1 displays the persistent confirmation badge.
Explicit confirmations refer to promotion event IDs, so confirmations survive
sync and do not hide later transitions. School names remain user-entered.

## Consultations and Flow

Consultations keep a Seoul calendar date and `HH:mm` time, plus title, notes,
student ID, and `scheduled`, `completed`, or `cancelled` status. Edu shows the
monthly calendar and daily agenda. The app-lifetime provider registers one `edu`
Flow source for the active account, using the same snapshot. Flow displays booked
consultations for its selected date, opens `edu/student:<id>`, and completes a
consultation through the same guarded save action. Account changes invalidate
the source and pending UI callbacks.

## Checks

Run `node --test tests/edu*.test.js` for model, Flow, storage, account guards,
backup, and concurrency scenarios. Run `npm test` and `npm run build` for the
whole app. On Windows, sandbox filesystem restrictions may require the Vite/PWA
checks to run outside the sandbox.

## 문항 연구소 (removed)

The 문항 연구소 screen and its code were removed on 2026-10-16. 애쉬 now asks Claude
in the project thread instead, and the records are kept as files in the project
library.

The Supabase tables `edu_notes`, `edu_items` and `edu_lab_logs` were left as they
were, and their SQL files stay in `supabase/` as a record of that schema. The app
no longer reads or writes them. Do not drop these tables or delete their rows.
