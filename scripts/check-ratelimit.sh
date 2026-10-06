#!/usr/bin/env bash
# Sequential read-only GET of the health endpoint. Prints rate-limit remaining
# so one client can see whether the bucket counts down or jumps between edges.
#
# Usage:
#   scripts/check-ratelimit.sh
#   scripts/check-ratelimit.sh https://wki-tool-room-system-1.onrender.com/api/health 6
#
# After the client-IP fix is deployed, remaining from one machine should drop
# by 1 each line (for example 99, 98, 97) while uptime stays on the same
# instance. The current production build keys on a rotating Cloudflare edge,
# so the numbers jump.
set -u
URL="${1:-https://wki-tool-room-system-1.onrender.com/api/health}"
COUNT="${2:-6}"
echo "url=$URL count=$COUNT"
i=1
while [ "$i" -le "$COUNT" ]; do
  hdr=$(mktemp)
  body=$(mktemp)
  code=$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' "$URL") || code="curl_error"
  remaining=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="x-ratelimit-remaining:" {print $2; exit}')
  standard=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="ratelimit-remaining:" {print $2; exit}')
  cf_ray=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="cf-ray:" {print $2; exit}')
  render=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="x-render-origin-server:" {print $2; exit}')
  uptime=$(sed -n 's/.*"uptime":\([0-9.][0-9.]*\).*/\1/p' "$body")
  rm -f "$hdr" "$body"
  echo "$i http=$code x-ratelimit-remaining=${remaining:-} ratelimit-remaining=${standard:-} cf-ray=${cf_ray:-} x-render-origin-server=${render:-} uptime=${uptime:-}"
  i=$((i + 1))
done
