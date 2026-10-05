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

Set `MANAGE_PIN` and `CAMERA_ACCESS_PASSWORD` on the API only. Do not put them in the frontend bundle. Leave `RECONCILE_APPLY_TO_LIVE=false` unless someone explicitly enables fill-gaps apply on the API. Enrichment fields are additive; existing parts stay, and unknown values stay null.

## Part enrichment JSON

`POST /api/parts/enrich-batch` or:

```bash
cd backend
node scripts/load-enrichment.js ./data/enrichment.example.json
node scripts/load-enrichment.js ./data/enrichment-batch-20261005.json --apply
```

`enrichment-batch-20261005.json` is the research batch (118 part numbers: 58 found, 14 ambiguous, 46 unfound). The API accepts that array as-is. Found and ambiguous rows write only the non-null fields in the file. `description` is stored as `polishedDescription` and does not replace the shop description. A specific engine string is kept in notes and sets the shop chip only when it names one family (MX, Cummins, Detroit, and so on). Two families in one string, such as a Cummins tool that also lists Paccar PX, leave the chip empty. Unfound rows are skipped and do not clear existing fields. Nothing in that file is added beyond the JSON.

Against the Render API after deploy, from a clone of this branch:

```bash
API=https://wki-tool-room-system-1.onrender.com
curl -sS -X POST "$API/api/parts/enrich-batch" \
  -H "Content-Type: application/json" \
  --data-binary @backend/data/enrichment-batch-20261005.json
curl -sS "$API/api/parts/enrichment-coverage"
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

About 95 weekdays of check-out / check-in history, America/Chicago, using the shop roster. Preview, then write. This does not delete parts. Running it again replaces only the previous activity batch.

Against the Render API after deploy:

```bash
API=https://wki-tool-room-system-1.onrender.com
curl -s -X POST "$API/api/audit/load-activity" \
  -H 'Content-Type: application/json' \
  -d '{"pin":"'"$MANAGE_PIN"'","confirm":false}'
curl -s -X POST "$API/api/audit/load-activity" \
  -H 'Content-Type: application/json' \
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
