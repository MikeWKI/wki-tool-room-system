# Done receipt — rate-limit client IP and platform 401

- **Branch:** `fix/ratelimit-client-ip` (rebased onto `main` `e2cdef3`, wallpaper CSS included)
- **Feature commit:** `3bfe92c2fd395958bfb6ff89e55128af49604fac`
- **PR:** https://github.com/MikeWKI/wki-tool-room-system/pull/6
- **Not done:** no merge, no force-push, no Render env edits, no live data writes. Live check was GET `/api/health` only.

## Approach

**(b) CF-Connecting-IP only when the trusted-proxy peer is a Cloudflare IP.** Default `TRUST_PROXY_HOPS` is **1**.

Express counts `req.socket.remoteAddress` as hop 1, then walks `X-Forwarded-For` from the right ([Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html)). On `onrender.com` that socket is Render's load balancer. Render puts Cloudflare in front of every public web service ([DDoS protection](https://render.com/docs/ddos-protection), [uptime / CF-Ray](https://render.com/docs/uptime-best-practices), [client IP note](https://render.com/articles/how-render-handles-ddos-attacks)). Hop 1 therefore makes `req.ip` the address Render appended: a Cloudflare edge. That edge rotates. Live health checks on one instance (uptime 203.14s → 203.53s) returned `X-RateLimit-Remaining` 99, 99, 99, 99, 98, 98.

Cloudflare sets `CF-Connecting-IP` to the visitor that reached its edge, and it appends to `X-Forwarded-For` instead of letting the client replace the connecting address ([request headers](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/)). The limiter uses that header, then `True-Client-IP`, only when `req.ip` is inside the bundled Cloudflare ranges (`https://www.cloudflare.com/ips-v4` and `ips-v6`, retrieved 2026-10-06). If the peer is Cloudflare but neither header is a single IP, the key is the one address that peer appended (next entry to the left). Addresses further left are ignored. If the peer is not Cloudflare, the key is hop-count `req.ip` and both spoofed headers are ignored.

Hop count 2 was not the default. It would treat a client-supplied leftmost `X-Forwarded-For` as the client whenever the request did not actually pass through Cloudflare, which would mint new lockout buckets. The shop password is 7 characters, so that bypass matters.

IPv6 keys are masked to `/64`. `express-rate-limit` 7.5.1 does not export `ipKeyGenerator` (that helper is in v8). The auth limiter and the global limiter share this key function.

## Wrong shop password

`POST /api/auth/platform` now returns **401** `{ok:false,error:'incorrect_password'}`. Lockout stays 429. Unset password stays 503. Manage PIN and camera wrong guesses stay HTTP 200. `PlatformGate` / `PlatformLogin` still shows "Incorrect shop password." A 401 with `incorrect_password` does not count as an expired platform token (`shouldLockPlatform` returns false) and does not fire the lock event.

## Tests

- `cd backend && npm test` — 28 passed, 0 failed.
- `cd frontend && CI=true npm test -- --watchAll=false` — 8 suites, 20 passed.
- `cd frontend && npm run build` — compiled. Pre-existing eslint warnings remain. `CI=true npm run build` fails on those warnings; they are not from this change.

Supertest covers: one client behind three Cloudflare edges counts down 7, 6, 5, then manage PIN and camera continue 4, 3; a second client starts at 7; eight spoofed leftmost `X-Forwarded-For` / `CF-Connecting-IP` values from a non-Cloudflare peer share one bucket and the ninth is 429; IPv6 `/64` grouping; missing `CF-Connecting-IP` still keys on the address Cloudflare appended.

## Live baseline (current production, before this deploy)

`scripts/check-ratelimit.sh https://wki-tool-room-system-1.onrender.com/api/health 6` on 2026-10-06:

```
1 http=200 x-ratelimit-remaining=99 cf-ray=a46656c05d87efa4-PDX x-render-origin-server=Render uptime=203.141661355
2 http=200 x-ratelimit-remaining=99 cf-ray=a46656c0cfdffeff-PDX x-render-origin-server=Render uptime=203.219835423
3 http=200 x-ratelimit-remaining=99 cf-ray=a46656c14d99d106-PDX x-render-origin-server=Render uptime=203.29382829
4 http=200 x-ratelimit-remaining=99 cf-ray=a46656c1c8236e10-PDX x-render-origin-server=Render uptime=203.382160968
5 http=200 x-ratelimit-remaining=98 cf-ray=a46656c25aa21319-PDX x-render-origin-server=Render uptime=203.462140985
6 http=200 x-ratelimit-remaining=98 cf-ray=a46656c2dbbfccd1-PDX x-render-origin-server=Render uptime=203.525835938
```

Same instance. Not a steady countdown.

## After deploy

```
scripts/check-ratelimit.sh https://wki-tool-room-system-1.onrender.com/api/health 6
```

On one instance (uptime climbing by fractions of a second), remaining should drop by 1 each line. The counter is in-memory per process, so a second instance will not share the bucket.

## Optional env (do not set unless the re-run still jumps)

`TRUST_PROXY_HOPS` on the API service. Default **1** is correct for Render's load balancer plus Cloudflare and is already the code default. Set **2** only if a later Render hop means the address at hop 1 is no longer a Cloudflare IP, then redeploy and run the script again. Invalid values and values above 5 fall back to 1.
