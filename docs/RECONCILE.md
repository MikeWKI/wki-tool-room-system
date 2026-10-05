# JB inventory reconcile (draft)

## Sources

- **Live:** MongoDB `parts` collection (~606 rows in production).
- **JB physical (02/04/2026):** `backend/data/inventory-jb-2026-02-04.json` (325 rows, 76 overlapping real part numbers with live).

## Do not use blind Excel import

`/api/import/excel` assigns new numeric ids and **appends** rows. Re-importing the JB list would duplicate the ~76 overlapping P#s. Use **Reconcile** instead.

## Match rules

1. Normalize part numbers: uppercase, strip spaces/punctuation (`2203504`, `C-E-208` → `CE208`).
2. Skip synthetic JB rows (`NOPN-*`) from overlap counts; they are tracked as **No-P#** rows.
3. **Matched:** same normalized P# in JB and live.
4. **JB-only:** in JB, not in live (candidate *add* — staging only until strategy chosen).
5. **Live-only:** in live, not in JB (no delete; informational).
6. **Diffs:** shelf, description, category, quantity compared on matched rows.
7. **Location mapping:** `Section 1 / Shelf N` and `West Rack - Shelf N` resolve to Section 1 Cummins (1–7) or MX (8–12) using category when needed.

## TBD shelves

Live parts with `shelf=TBD` or unmapped shelf strings stay in **Unassigned** on Master Inventory until updated via a future approved apply or Location Manager.

## Staging

- `POST /api/reconcile/staging/accept` saves per-row `accept_jb`, `accept_live`, or `skip` to `reconcile_staging` (or `database/reconcile_staging.json` offline).
- `POST /api/reconcile/apply` returns **403** until `RECONCILE_APPLY_TO_LIVE=true` **and** Michael picks fill-gaps vs replace vs row-by-row (not implemented in this draft).

## Shelf seed

- `POST /api/shelves/seed-jb-layout?dryRun=true` — report only.
- `POST /api/shelves/seed-jb-layout` — additive merge into `shelves` collection (no part deletes).
