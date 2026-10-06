# Done receipt — platform shop-password gate

- **Branch:** `feature/platform-gate` (from `main` `cfa1886`)
- **Feature commit:** `7e8bc446c1204237aca15c060f19a1f4963f9580`
- **Not done:** no merge, no push to `main`, no force-push, no Render env edits, no password committed, no data deletes.

## What shipped

The whole Tool Room API sits behind one shop password. The Manage PIN stays a second tier with the same 10-hour bearer session.

- `POST /api/auth/platform` `{password}` compares SHA-256 digests with `timingSafeEqual`, then returns `tokenType: Bearer`. Default TTL is 30 days (`PLATFORM_SESSION_DAYS`, capped at 365). The existing 8-attempt / 15-minute auth limiter covers this route together with the manage PIN and the camera password.
- `GET /api/auth/platform/check` validates a stored token.
- Every `/api` route requires `X-Platform-Token`, except `GET /api/health`, `POST /api/auth/platform`, and CORS preflight.
- Manage routes need both `X-Platform-Token` and `Authorization: Bearer <manage token>`. Check-out and check-in need only the platform token.
- Platform tokens use `purpose: "platform"`. A manage token is rejected as a platform token, and a platform token is rejected as a manage token.
- Signing key is `SESSION_SECRET` when set. Otherwise it is derived from `PLATFORM_PASSWORD`, so rotating that password logs everyone out. If `SESSION_SECRET` is set, rotating the password does not invalidate tokens until `SESSION_SECRET` changes too.
- Unset `PLATFORM_PASSWORD` fails closed: login and gated routes return `503` `{error:"platform_password_not_configured"}`. Health stays open.
- Frontend shows a full-screen login on the tool-room wallpaper (JPEG fallback `frontend/public/login-wallpaper.jpg` 306KB, WebP `login-wallpaper.webp` 333KB) before the app. Token lives in `localStorage` (`wki-platform-session`). A `401` `platform_*` error or the unset-password `503` clears it and returns to the login screen. Header **Lock** logs out of the platform and clears the manage session so the next person does not inherit Manage.

## Tests

- `cd backend && npm test` — 18 passed.
- `cd frontend && CI=true npm test -- --watchAll=false` — 8 suites, 17 passed.
- `cd frontend && npm run build` — compiled. Bundle has no shop password and no `PLATFORM_PASSWORD`.

## Render, before merge

On the **API** service only (`wki-tool-room-system-1`):

- Required: `PLATFORM_PASSWORD`
- Optional: `SESSION_SECRET` (shared signing key for platform and manage tokens)
- Optional: `PLATFORM_SESSION_DAYS` (default 30)

Do not set the password on the frontend service and do not put it in the repo.

## Deploy-order risk

If this API revision deploys without `PLATFORM_PASSWORD`, every gated route returns 503 and the shop stops (health still answers). If the API deploys with the password before the new frontend, the current frontend does not send `X-Platform-Token`, so inventory, check-out, and Manage all 401 until the frontend deploy is live. Set the env var first, then deploy API and frontend together, or deploy the frontend immediately after the API.
