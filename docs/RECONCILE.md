# JB inventory reconcile (fill-gaps strategy)

Michael selected **fill-gaps** (no deletes, no blind Excel import).

## Sources

- **Live:** MongoDB `parts` (~606 rows).
- **JB:** `backend/data/inventory-jb-2026-02-04.json` (325 rows; ~76 overlapping real P#s).

## Fill-gaps rules (when `RECONCILE_APPLY_TO_LIVE=true`)

| Action | Rule |
|--------|------|
| **Shelf update** | If live shelf is TBD, empty, or unmapped → set shelf from JB for matching P#. |
| **JB Staging** | Every other live/JB difference (location conflict, description, category, quantity, non-TBD shelf label) waits for staging `accept_jb`. Fill-gaps does not silently overwrite those fields. |
| **Location conflict** | Mapped non-TBD shelf that disagrees with JB → listed as `skippedLocationConflict` and in `jbStaging` until `accept_jb`. |
| **Add** | JB P# not in live → insert new part (new id). NOPN-* rows are not auto-added. |
| **Skip** | Staging `skip` or `accept_live` → no changes for that P#. |
| **accept_jb** | Existing staging decision. Applies JB shelf (including conflicts) plus description/category/qty diffs. |
| **Never** | Delete live parts; relocate non-TBD shelves or overwrite field diffs without `accept_jb`. |

There is no third import strategy. The strategy name remains `fill-gaps`. JB Staging is the existing `accept_jb` / `accept_live` / `skip` review path.

## API

- `GET /api/reconcile/fill-gaps-plan` — always-on dry run.
- `POST /api/reconcile/apply` — `{ "dryRun": true }` preview; `{ "confirm": true }` writes only when `RECONCILE_APPLY_TO_LIVE=true`.
- Staging: `POST /api/reconcile/staging/accept` — per-row decisions (required for the 6 shelf conflicts).

## Gate

Keep `RECONCILE_APPLY_TO_LIVE=false` on production until you run the plan and confirm counts. Do not turn the gate on in source. The Reconcile screen defaults to **JB Staging** and labels dry-run vs apply.
