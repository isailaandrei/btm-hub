#!/usr/bin/env bash
#
# Deploy (or roll back) the Hostinger pilot/production app.
#
#   ./scripts/hostinger-deploy.sh            # deploy current origin/main
#   ./scripts/hostinger-deploy.sh <sha>      # deploy a specific commit
#   ./scripts/hostinger-deploy.sh <sha>      # ...which is also the ROLLBACK:
#                                            #   point it at the last good SHA
#                                            #   (see .hostinger-deploys.log)
#
# Required env:
#   HOSTINGER_API_TOKEN   Bearer token (developers.hostinger.com)
#   HOSTINGER_USERNAME    hosting account username (u...)
# Optional env:
#   HOSTINGER_DOMAIN      default: preview.behind-the-mask.com
#
# What it does (and why):
#   1. git-archives the SHA (source only — Hostinger's Node.js Apps pipeline
#      REQUIRES source archives and always builds server-side; prebuilt
#      artifacts are not supported by the platform, so "rollback" means
#      "rebuild a known-good SHA", ~2.5 min).
#   2. POSTs it to the builds/from-archive endpoint and polls the build to
#      completed/failed. A FAILED build leaves the previous app serving
#      (verified pilot behavior) — the script fails loud and touches nothing.
#   3. Purges the website/CDN cache — REQUIRED after every deploy: cached
#      client bundles reference the previous build's Server Action IDs and
#      throw "Server Action not found" until purged. (The permanent fix is a
#      fixed NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in the hPanel env store; the
#      purge also covers stale HTML/RSC.)
#   4. Smoke-checks the live site and appends the SHA to .hostinger-deploys.log
#      (gitignored) so the previous line is always your rollback target.
#
# CI note: the same gates this script trusts (lint/types/tests/build on a
# CLEAN install) run in GitHub Actions on every push to main — check CI is
# green for the SHA before deploying. This script intentionally does NOT
# rebuild locally; local node_modules can mask missing deps (the Jul 10
# yjs/y-protocols incident).

set -euo pipefail

API="https://developers.hostinger.com/api/hosting/v1"
DOMAIN="${HOSTINGER_DOMAIN:-preview.behind-the-mask.com}"
USERNAME="${HOSTINGER_USERNAME:?set HOSTINGER_USERNAME (hosting account username)}"
TOKEN="${HOSTINGER_API_TOKEN:?set HOSTINGER_API_TOKEN}"
SHA="$(git rev-parse "${1:-origin/main}")"
SHORT="${SHA:0:7}"
BASE="$API/accounts/$USERNAME/websites/$DOMAIN"
AUTH=(-H "Authorization: Bearer $TOKEN")

echo "==> Deploying $SHORT to $DOMAIN"

# 1. Source archive of the exact commit (never the working tree).
ARCHIVE="$(mktemp -d)/btm-hub-$SHORT.tar.gz"
git archive --format=tar.gz -o "$ARCHIVE" "$SHA"
SIZE=$(du -m "$ARCHIVE" | cut -f1)
echo "==> Archive: $ARCHIVE (${SIZE}MB)"
if [ "$SIZE" -ge 50 ]; then
  echo "!! Archive exceeds Hostinger's 50MB limit" >&2
  exit 1
fi

# 2. Upload + start the server-side build.
BUILD_UUID=$(curl -sf "${AUTH[@]}" -F "archive=@$ARCHIVE" \
  "$BASE/nodejs/builds/from-archive" | python3 -c 'import json,sys; print(json.load(sys.stdin)["uuid"])')
echo "==> Build started: $BUILD_UUID"

# 3. Poll to a terminal state (fail loud; a failed build never goes live).
STATE="pending"
for _ in $(seq 1 120); do # up to 10 min
  sleep 5
  STATE=$(curl -sf "${AUTH[@]}" "$BASE/nodejs/builds?per_page=10" |
    python3 -c 'import json,sys
uuid = sys.argv[1]
builds = json.load(sys.stdin)["data"]
print(next((b["state"] for b in builds if b["uuid"] == uuid), "unknown"))' "$BUILD_UUID" 2>/dev/null) || STATE="poll-error"
  echo "    build: $STATE"
  case "$STATE" in
    completed) break ;;
    failed)
      echo "!! Build FAILED — previous build keeps serving. Logs:" >&2
      curl -sf "${AUTH[@]}" "$BASE/nodejs/builds/$BUILD_UUID/logs" | tail -40 >&2 || true
      exit 1 ;;
  esac
done
[ "$STATE" = "completed" ] || { echo "!! Build did not complete in 10 min (state: $STATE)" >&2; exit 1; }

# 4. Purge website + CDN cache (Server-Action skew mitigation — see header).
curl -sf "${AUTH[@]}" -X POST "$BASE/cache/clear" >/dev/null
echo "==> Cache purged"

# 5. Smoke checks: homepage 200, /login 200, admin gate redirects (307/308).
sleep 5
ok=true
for probe in "/ 200" "/login 200" "/admin 3xx"; do
  path="${probe% *}"; want="${probe#* }"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://$DOMAIN$path")
  case "$want" in
    3xx) [[ "$code" == 3* ]] || ok=false ;;
    *) [ "$code" = "$want" ] || ok=false ;;
  esac
  echo "    $path -> $code (want $want)"
done
if [ "$ok" != true ]; then
  echo "!! SMOKE CHECK FAILED — roll back with:" >&2
  echo "     ./scripts/hostinger-deploy.sh \$(tail -2 .hostinger-deploys.log | head -1 | cut -d' ' -f2)" >&2
  exit 1
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $SHA build=$BUILD_UUID" >> .hostinger-deploys.log
rm -f "$ARCHIVE"
echo "==> Deployed $SHORT OK (previous entries in .hostinger-deploys.log are rollback targets)"
