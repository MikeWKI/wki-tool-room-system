# JB inventory reconcile (fill-gaps strategy)

Michael selected **fill-gaps** (no deletes, no blind Excel import).

## Sources

- **Live:** MongoDB `parts` (~606 rows).
- **JB:** `backend/data/inventory-jb-2026-02-04.json` (325 rows; ~76 overlapping real P#s).

## Fill-gaps rules (when `RECONCILE_APPLY_TO_LIVE=true`)

| Action | Rule |
|--------|------|
| **Shelf update** | If live shelf is TBD, empty, or unmapped → set shelf from JB for matching P#. |
| **Location conflict** | If live has a mapped non-TBD shelf that disagrees with JB (~6 rows) → **only** if staging decision is `accept_jb`. |
| **Add** | JB P# not in live (~39 real P#s) → insert new part (new id). NOPN-* rows are not auto-added. |
| **Skip** | Staging `skip` or `accept_live` → no changes for that P#. |
| **accept_jb** | On matched rows: apply JB shelf (incl. conflicts) plus description/category/qty diffs. |
| **Never** | Delete live parts; relocate non-TBD shelves without `accept_jb`. |

## API

- `GET /api/reconcile/fill-gaps-plan` — always-on dry run.
- `POST /api/reconcile/apply` — `{ "dryRun": true }` preview; `{ "confirm": true }` writes only when `RECONCILE_APPLY_TO_LIVE=true`.
- Staging: `POST /api/reconcile/staging/accept` — per-row decisions (required for the 6 shelf conflicts).

## Gate

Keep `RECONCILE_APPLY_TO_LIVE=false` on production until you run the plan in staging and confirm counts.
