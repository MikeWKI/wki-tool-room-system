# Tool room door access

IT puts a Ubiquiti UniFi Access reader on the tool room door. Each badge entry should reach this app, show up in the audit log with the badge holder's name, and start a 10-minute window. If that person leaves, or the window ends with no tool check-out and no check-in by them, Jon Bennet gets an email. The email does not say a tool was taken. It says they entered and no check-out was recorded.

At 5:00 PM America/Chicago, Monday through Friday, the app emails each tech who still has a tool out and sends Jon one summary. Tools out more than a day are marked overdue.

## Webhook

Have the reader, or Alarm Manager, POST JSON to:

`https://wki-tool-room-system-1.onrender.com/api/door/events`

Send this header on every request:

`X-Door-Webhook-Secret: <the secret HQ sets as DOOR_WEBHOOK_SECRET>`

`POST /api/door/events` and `POST /api/door/email-inbound` are the only door routes that skip the shop platform token (`X-Platform-Token`). They do not use the manage PIN. They still require `X-Door-Webhook-Secret`. If `DOOR_WEBHOOK_SECRET` is unset or blank, those paths answer 503 `webhook_not_configured` and store nothing. A wrong secret answers 401 `webhook_secret_rejected`. Whitespace around the secret is ignored. Bodies over 64 KB answer 413.

Every other door route requires the platform token, the same way check-out does. The kiosk note (`POST /api/door/visits/:id/ack`) and `GET /api/door/open-visit` need that token and do not need a manage session. Badge mapping, simulate, outbox, and metrics need both the platform token and the manage session.

Preferred JSON:

```json
{
  "eventId": "unique-id-from-the-reader",
  "type": "entry",
  "occurredAt": "2026-10-06T20:04:00.000Z",
  "actorId": "badge-id",
  "actorName": "Noah R.",
  "credential": "card-number",
  "doorName": "Tool Room"
}
```

`type` is `entry` or `exit`. Use a stable `eventId` so a retry does not open a second visit.

The app also accepts a UniFi-shaped body and keeps the raw JSON. The field names in that adapter are assumed. They are not from a captured UniFi payload. After the first real event arrives, open Manage → Door accountability, or `GET /api/door/events` with a manage session, and confirm the stored raw body. Then the adapter can be locked to that shape. Fixtures are in `backend/fixtures/unifi-access-webhook.assumed.json` and are marked `assumed, verify against a real payload`.

Send an entry when someone badges in, and an exit when they badge out. A door-locked or door-secured signal is not treated as a person leaving.

The existing API rate limit still applies to this URL. One reader is well under it. Do not put the secret in the frontend.

## Email fallback

If the reader cannot POST yet, forward the notification to an inbound parser that POSTs to:

`https://wki-tool-room-system-1.onrender.com/api/door/email-inbound`

Same `X-Door-Webhook-Secret` header. Body:

```json
{ "subject": "Tool room door", "text": "Noah R. entered the tool room at 2026-10-06 15:04" }
```

Times without a zone are read as America/Chicago. The default pattern looks for a name, then entered/exited, then a time. HQ can replace it with `DOOR_EMAIL_PATTERN` (a JavaScript regex with named groups `name`, `action`, and `when`).

## What HQ sets on the API service

Set these on the Render API service (`wki-tool-room-system-1`). Do not commit real values.

| Variable | Purpose |
| --- | --- |
| `DOOR_WEBHOOK_SECRET` | Shared secret for the reader and the email fallback. Required or the webhook stays off. |
| `DOOR_VISIT_WINDOW_MINUTES` | Minutes after entry before an alert. Default 10. |
| `DOOR_ACK_SUPPRESSES_ALERT` | Default `false`. A kiosk note is logged and quoted in the email. It does not cancel the email unless this is `true`. |
| `DOOR_EMAIL_PATTERN` | Optional regex for the email fallback. |
| `EOD_SWEEP_TIME` | Default `17:00`, America/Chicago. |
| `EOD_SWEEP_DAYS` | Default `Mon-Fri`. |
| `ALERT_SUPERVISOR_EMAIL` | Jon Bennet's address. Visit alerts and the 5 PM summary go here. |
| `ALERTS_MODE` | `off`, `dry_run`, or `live`. Default `dry_run`: emails are stored in Manage and not sent. |
| `SMTP_HOST` | Required only for `live`. |
| `SMTP_PORT` | Usually 587. |
| `SMTP_USER` | SMTP username, if the server requires one. |
| `SMTP_PASS` | SMTP password. |
| `ALERT_FROM` | From address. Required for `live`. |

`live` without `SMTP_HOST`, `SMTP_PORT`, and `ALERT_FROM` does not send. Those messages stay in the outbox with a warning.

Manage screens (badge map, simulate, metrics, outbox) require the platform token and the manage session from `POST /api/auth/manage-pin`. The shop-floor kiosk uses the platform token only.

## Badge names

In Manage, map the reader id, the name printed on the event, or the card number to a roster tech and that tech's email. An unmapped badge still opens a visit labeled `Unknown badge (the raw name)` and still alerts.

## Demo without the reader

Manage → Door accountability → Simulate door entry / exit. Pick a tech and set the window to 1 minute. That traffic is marked simulated and is left out of the counts until Include simulated door events is checked.

Seeded shop history (the 95-day demo batch) is already marked with batch key `shop-activity-95d`. Metrics skip it unless Include seeded history is checked. Those rows are not deleted or rewritten.

## If the API is asleep at 5 PM

There is no `render.yaml` in this repo, and the live Render plan was not readable from here. Render free web services spin down after about 15 minutes without traffic. If this API is on that free instance, the one-minute checker is not running while the service is asleep, so a 10-minute door window or the 5 PM email can wait until the next request wakes the process. Deadlines are saved in the database. When the process comes back it catches up: overdue visits alert once, and the latest missed 5 PM sweep sends once. A paid always-on instance runs the checker about every 60 seconds, so those emails go out on time.
