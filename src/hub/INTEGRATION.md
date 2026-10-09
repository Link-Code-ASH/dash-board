# Hub Infrastructure

These modules have no React, browser, storage, network, or learning-data dependencies.
They do not change the dashboard UI or register any sources automatically.

## Three-Way Merge

`mergeDashboard(base, local, remote)` from `./merge.js` returns `{ data, conflicts }`.
Pass complete acyclic JSON-like snapshots, not patches. `base` must be the last
common synced snapshot. Inputs are never mutated; returned data and conflict
snapshots are detached from the inputs and from each other.

- Object fields merge recursively, including unknown module fields. A missing
  property or `undefined` means deletion; `null` is a stored value. Deleted object
  properties and deleted keyed-array rows are omitted from the result.
- A one-sided edit wins; equal edits do not conflict. Incompatible edits and
  delete-versus-edit conflicts choose local, including a local deletion.
- Arrays merge by a common unique `planKey`, then `id`, then `key`.
  Every row in all present versions must have that identity. Nonempty strings
  and finite numbers are accepted and kept distinct. This covers dashboard
  `days`, memo/note arrays and the actual `key`-based categories and presets.
  Routine choices have new random ids but stable `planKey` values: preferring
  that identity prevents competing Y/N choices from becoming two scored rows.
- Arrays without a common unique identity (unkeyed date markers, mixed-identity
  rows, or duplicate ids without unique keys) are atomic values, never guessed
  to be positional rows.
  Type replacements are also atomic when the base has a different type.
- `updatedAt` properties are metadata, never conflict causes, including when
  comparing a deleted object with a metadata-only edit. During object-field
  merging, remote metadata is used if local metadata is unchanged; otherwise
  local is used. No clock is read or timestamp fabricated. The caller stamps
  the final saved state. Atomic content-equivalent values prefer local.

### Array Order

Membership and row content merge independently of order. Compare the relative
order of surviving base identities, ignoring insertions and deletions. A local
reorder wins; otherwise a remote reorder wins; otherwise prefer local order.
Both sides introducing the same new identity also express order intent.
If both sides express order changes and disagree on the relative order of
shared identities, report an `order` conflict and use local order. Equal
reorders, independent insertions, and deletion alone are not order conflicts.

After choosing order, insert other-side-only surviving rows in that side's
order, immediately after its nearest preceding already-placed identity. With
no preceding anchor, insert before the nearest following placed identity, or
append if there is no anchor. This deterministic placement is not a CRDT and
does not claim to preserve incompatible orderings or merge arbitrary moves.

### Conflicts And Recovery

Each conflict is `{ path, kind, base, local, remote }`:

- `kind` is `value`, `delete-edit`, or `order`.
- `path` uses JSON Pointer escaping (`~0`, `~1`), with the empty string for the
  root. Keyed array segments are `@planKey=<JSON identity>`, `@id=<JSON identity>`,
  or `@key=<JSON identity>`,
  for example `/memos/cards/@id="memo-life"/title`. These are identity selectors,
  not array indexes or directly executable JSON Pointers.
- Value conflicts contain the values at that path, with an explicit
  `undefined` for deletion. Order conflicts point to the array and contain
  ordered identity lists for all three versions.

The caller must persist complete base/local/remote recovery snapshots and the
conflicts before replacing local or remote state. Conflicts are diagnostics,
not a full recovery archive. JSON.stringify omits `undefined` object fields:
encode conflict-side deletion explicitly when persisting this report. Keep
the complete original remote snapshot even though conflict resolution chooses
local. This helper does not save recovery copies, perform optimistic revision
checks, retry writes, normalize data, or manage account boundaries.

Memo cards have one schema-specific safeguard: each of `leftText`, `leftTextExtra`,
`centerText`, `centerTextExtra`, `rightText`, and `rightTextExtra` merges atomically
with its corresponding `textFormats[field]`. If both sides changed a pair
differently, the complete local pair wins; text from one side is never combined
with the other's mark offsets. Other pairs and card properties still merge
independently. This applies to keyed rows under `memos.cards` with object or absent
`textFormats`; callers remain responsible for validating malformed input.

A coupled conflict uses `kind: "value"`, points to the text field, and includes
the matching format path in `relatedPaths`. Its base/local/remote snapshots are
`{ text, marks }` pairs; an absent component is omitted. Full recovery snapshots
remain the caller's responsibility. No extra caller-side pairing fix is needed
for these six existing memo fields.

## Flow Sources

`registerFlowSource(source)` returns an idempotent unregister function. Contract:

```js
{
  id,                              // Stable, nonempty module namespace.
  getItems(date),                   // Module-owned items or Promise of items.
  subscribe(callback),             // Must synchronously return a teardown.
  openTarget(itemId),               // Return { moduleId, section? }.
  execute(itemId, command, payload)  // Optional; result may be a Promise.
}
```

`getFlowSources()` returns a frozen snapshot of source facades in registration
order. The minimum Flow UI item contract is:

```js
{ id, title, commands: [{ id, label, payload }] }
```

`commands` and each command's `payload` are optional. The owner namespace comes
from `source.id`, not an item-supplied owner id. The parent executes commands as
`source.execute(item.id, command.id, command.payload)`. `openTarget(item.id)`
returns `{ moduleId, section? }`; the parent validates this against its module
whitelist and navigates only through internal paths. It is a resolver, not a
navigation side effect. The registry remains pass-through: the UI validates
items/targets, catches and displays source errors, and implements commands.
No Edu/Lingo learning schema, sample data, or concrete commands are supplied.
The caller defines the date convention with each real module. Method arguments,
results, and provider errors pass through without transformation.

Duplicate ids and invalid contracts throw. Sources without `execute` remain
read-only. Subscribe through the returned facade, not the original source.
Unmount must call each subscription's teardown; module/account shutdown must
call unregister. Both paths clean each subscription once, suppress late
notifications, and invalidate stale facades. Unregister attempts every teardown
even if one fails, then throws an AggregateError. A provider must itself honor
the teardown contract; an invalid provider cannot be repaired by this registry.

`subscribeFlowSources(listener)` observes registry membership, including sources
registered after view mount. It calls `listener()` synchronously after successful
registration and after unregistration/cleanup, even if provider cleanup failed.
Reread `getFlowSources()` inside the listener and reconcile source subscriptions.
Subscribe first, then perform an initial read; subscribing itself does not call
the listener. Its returned unsubscribe is idempotent. Failed registrations and
repeated unregister calls do not notify. Listener exceptions are surfaced in a
microtask so they cannot interrupt registration or another listener's cleanup.
The source's own `subscribe` still observes that source's item changes. Unmount
must unsubscribe both the registry listener and all per-source subscriptions.

## Backup Contributions

`registerBackupProvider({ id, exportBackup, restoreBackup })` returns an
idempotent unregister function. Callback methods may be async. Registration is
independent of flow sources; use the same namespace for a module's two roles.

- `await exportModuleBackups()` returns `{ [moduleId]: payload }`, using a
  snapshot of registered providers. Store this whole object in a dedicated
  parent-owned backup field, alongside existing dashboard/image/Mindfold data.
- `await restoreModuleBackups(backups)` validates the entire JSON envelope,
  rejects every unknown module id before invoking any provider, then restores
  present modules sequentially in envelope key order. Missing registered modules
  are untouched. An empty envelope restores nothing. Success returns
  `{ restored: [moduleId, ...] }`.
- Unknown backups are rejected, never discarded. Preserve the imported backup
  and register the missing real provider before retrying. Run this preflight
  before unrelated dashboard writes as part of the parent import workflow.
- Payloads are opaque, detached JSON values; each module owns versioning,
  validation, migration, and semantics. Undefined, sparse arrays, non-finite
  numbers, cycles, non-JSON objects/properties (including symbol keys, accessors,
  non-enumerable fields, and custom array properties) are rejected instead of being silently
  lost during JSON serialization. Use `null` for an intentionally empty payload.
- Export errors reject the whole operation. Restore is not transactional: on a
  provider failure, the error has `moduleId`, `restored` (completed ids), and
  `cause`. The failing provider may also have partially written. No later
  providers run. Preserve a pre-import backup and handle recovery in the caller;
  the registry cannot roll back module storage. Provider snapshots mean an
  already-started operation is not canceled by unregister.

## Verification

Run `node --test tests/hub.test.js` for focused registry/merge tests or
`npm test` for HUB, Dashboard synchronization, Mindfold, and PWA checks.

## Application Wiring

- `App.jsx`: shared navigation, settings, error boundaries, and connection status.
- `routing.js`: hash routes inside each real deployment entry page.
- `registry.jsx`: the five lazy-loaded feature screens.
- `context.jsx` and `dashboard/useDashboard.js`: existing Dashboard data adapter.
  Flow and Routine share this adapter; neither stores a second copy of checks.
- `views/Edu.jsx` and `views/lingo/`: integration placeholders, not learning or
  academy-management implementations. Future data belongs to separate repositories.
- `dashboard/syncState.js`: local journals, Web Locks, and recoverable three-way
  merging. Chrome's Web Locks serialize same-origin writers; browsers without
  Web Locks cannot guarantee cross-window atomic writes.
- `dashboard/recovery.js`: account-scoped read-only recovery exports, surfaced in
  Settings. Do not silently prune unresolved recovery snapshots.
- `scripts/PWA.md`: installation entries and service-worker policy. Real-device
  installation and OAuth return paths must be checked after deployment.
