# WKI Tool Room Inventory System

A comprehensive inventory management system for tool rooms with check-in/check-out functionality.

## Features
- Part search and lookup
- Shelf location tracking
- Check-in/check-out system
- Transaction history
- Real-time dashboard
- Kenworth Red themed UI

## Tech Stack
- Frontend: React, Tailwind CSS, Lucide React
- Backend: Node.js, Express
- Database: JSON files (upgradeable to SQL/NoSQL)
- Deployment: Render

## Development Setup

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment Variables

### Backend (.env)
```
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:3001/api
```

## Deployment

Render runs two services:

- Frontend static site: `https://wki-tool-room-system.onrender.com`
- API web service: `https://wki-tool-room-system-1.onrender.com` (`PORT` from the platform, bind `0.0.0.0`)

Set `PLATFORM_PASSWORD`, `MANAGE_PIN`, and `CAMERA_ACCESS_PASSWORD` on the API only. Do not put them in the frontend bundle. Leave `RECONCILE_APPLY_TO_LIVE=false` unless someone explicitly enables fill-gaps apply on the API. Enrichment fields are additive; existing parts stay, and unknown values stay null.

The shop password gates the whole API. `POST /api/auth/platform` with `{ "password" }` returns a platform token (`tokenType: Bearer`, default 30 days, override with `PLATFORM_SESSION_DAYS`). The browser stores it in `localStorage` and sends `X-Platform-Token` on every API call. `GET /api/auth/platform/check` validates that token. If `PLATFORM_PASSWORD` is unset, login and every gated route return `503` `{ "error": "platform_password_not_configured" }`. `GET /api/health` and CORS preflight stay open. The same 8-attempt / 15-minute auth limiter covers the shop password, the manage PIN, and the camera password.

Manage writes still use a second token from `POST /api/auth/manage-pin` (about 10 hours, `Authorization: Bearer`, `sessionStorage`). Those routes need both headers. Shop-floor check-out and check-in need the platform token only: they record the tech name sent as `user`. The platform token's `purpose` is `platform`; a manage token cannot be used as one, and a platform token cannot be used as a manage token. Optional `SESSION_SECRET` signs both tokens. If it is unset, the platform key is derived from `PLATFORM_PASSWORD` (rotating that password logs everyone out) and the manage key is derived from `MANAGE_PIN`. Optional `FRONTEND_ORIGIN` overrides the CORS allowlist (default `https://wki-tool-room-system.onrender.com`, plus localhost when `NODE_ENV` is not production). Camera page URLs are returned only after a correct camera password, and that route is behind the platform token. `GET /api/debug/database` is 404 when `NODE_ENV=production`. If `MANAGE_PIN` is unset, manage login and manage writes fail closed.

## Part enrichment JSON

`POST /api/parts/enrich-batch` or:

```bash
cd backend
node scripts/load-enrichment.js ./data/enrichment.example.json
node scripts/load-enrichment.js ./data/enrichment-batch-20261005.json --apply
```

`enrichment-batch-20261005.json` is the research batch (118 part numbers: 58 found, 14 ambiguous, 46 unfound). The API accepts that array as-is. Found and ambiguous rows write only the non-null fields in the file. `description` is stored as `polishedDescription` and does not replace the shop description. A specific engine string is kept in notes and sets the shop chip only when it names one family (MX, Cummins, Detroit, and so on). Two families in one string, such as a Cummins tool that also lists Paccar PX, leave the chip empty. Unfound rows are skipped and do not clear existing fields. Nothing in that file is added beyond the JSON.

Against the Render API after deploy, from a clone of this branch. Enrich-batch requires a manage session:

```bash
API=https://wki-tool-room-system-1.onrender.com
read_token() { node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{console.log(JSON.parse(s).token||'')})"; }
PLATFORM=$(curl -sS -X POST "$API/api/auth/platform" \
  -H 'Content-Type: application/json' \
  -d '{"password":"'"$PLATFORM_PASSWORD"'"}' | read_token)
TOKEN=$(curl -sS -X POST "$API/api/auth/manage-pin" \
  -H 'Content-Type: application/json' \
  -H "X-Platform-Token: $PLATFORM" \
  -d '{"pin":"'"$MANAGE_PIN"'"}' | read_token)
curl -sS -X POST "$API/api/parts/enrich-batch" \
  -H "Content-Type: application/json" \
  -H "X-Platform-Token: $PLATFORM" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @backend/data/enrichment-batch-20261005.json
curl -sS "$API/api/parts/enrichment-coverage" \
  -H "X-Platform-Token: $PLATFORM"
```

Shape (`items` or `parts` array). Omit a key to leave it unchanged. Use null when unknown. Do not invent specs.

```json
{
  "items": [
    {
      "partNumber": "2892427",
      "id": 123,
      "polishedDescription": null,
      "manufacturer": null,
      "vendor": null,
      "engineFamily": "Cummins",
      "notes": null,
      "specs": null,
      "sourceUrl": null,
      "aliases": ["ISX timing"],
      "parentId": null,
      "kitComponents": [{ "partNumber": "3164736", "description": null, "qty": 4 }]
    }
  ]
}
```

On the canonical shape, `engineFamily` is one of MX, Cummins, CAT, Detroit, Allison, Paccar, General, or null. A research row may send a longer engine string with `researchStatus`; that string is kept in notes and sets the chip only when it names a single family. Matching is by `id` when that id exists, otherwise by part number (duplicates all update). Quantity, shelf, status, and the inventory description are ignored. Parts are never created or deleted.

Coverage: `GET /api/parts/enrichment-coverage`.

## Shop activity history

About 95 days of check-out / check-in history, America/Chicago, using only the 14-name short roster (Laryssa J. through Danny C.). Mark P., Trenton W., and every other previous name are not used. Preview, then write. This does not delete parts. `confirm: true` replaces the whole `shop-activity-95d` batch. The same call reassigns leftover transactions and `checkedOutBy` values that still use a removed name, and sets the fill-gaps apply label to `System`. Import rows already named `System` stay.

Against the Render API after deploy:

```bash
API=https://wki-tool-room-system-1.onrender.com
curl -s -X POST "$API/api/audit/load-activity" \
  -H 'Content-Type: application/json' \
  -H "X-Platform-Token: $PLATFORM" \
  -d '{"pin":"'"$MANAGE_PIN"'","confirm":false}'
curl -s -X POST "$API/api/audit/load-activity" \
  -H 'Content-Type: application/json' \
  -H "X-Platform-Token: $PLATFORM" \
  -d '{"pin":"'"$MANAGE_PIN"'","confirm":true}'
```

Or on a machine that has `MONGODB_URI`:

```bash
cd backend
node scripts/seed-shop-activity.js
node scripts/seed-shop-activity.js --apply
```

The Audit view filters by tech, date, part, and action. Manage also has Preview / Load history, which sends the PIN to the API.

## Reconcile

See `docs/RECONCILE.md`. Fill-gaps still fills TBD shelves and adds missing P#s when `RECONCILE_APPLY_TO_LIVE=true`. Location and field differences stay in JB Staging until Accept JB.
