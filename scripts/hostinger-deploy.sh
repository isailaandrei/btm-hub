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
# ── Why the upload is a TUS dance, not one multipart POST ─────────────────────
# The old one-shot `POST .../nodejs/builds/from-archive` (multipart `archive`)
# is DEAD. Hostinger now fronts developers.hostinger.com with Cloudflare bot
# protection that answers multipart POSTs with a 403 challenge page (verified
# 2026-07-12). That WAF fingerprints the HTTP client: `curl` passes for
# non-multipart methods, but a plain Node/Python `fetch`/urllib gets 403 even on
# a GET. So EVERY developers.hostinger.com call here uses `curl`, and the upload
# is split into the flow the official hostinger-api-mcp package uses
# (handleJavascriptApplicationDeploy):
#   a. POST /files/upload-urls              → { url, auth_key, rest_auth_key }
#   b. TUS-upload the .tar.gz to that file host (srv*-files.hstgr.io — NOT
#      Cloudflare-fronted, so plain fetch is fine there). Done by the Node
#      companion scripts/hostinger-tus-upload.mjs: create (POST → 201) then
#      chunked PATCH (application/offset+octet-stream → 204).
#   c. GET  /nodejs/builds/settings/from-archive?archive_path=<name> → settings
#   d. POST /nodejs/builds  { ...settings, source_type:"archive",
#                             source_options:{ archive_path:<name> } } → { uuid }
#   e. poll /nodejs/builds until completed/failed (fail loud; unchanged).
# Cache purge is now `DELETE .../cache/clear` — the old POST returns 405.
#
# Interactive alternative (no script): the hostinger-hosting MCP tool
# `hosting_deployJsApplication` runs this same upload+build flow end to end.
#
# What it does (and why):
#   1. git-archives the SHA (source only — Hostinger's Node.js Apps pipeline
#      REQUIRES source archives and always builds server-side; prebuilt
#      artifacts are not supported by the platform, so "rollback" means
#      "rebuild a known-good SHA", ~2.5 min).
#   2. Uploads it via the upload-urls + TUS flow above and starts the
#      server-side build, polling to completed/failed. A FAILED build leaves the
#      previous app serving (verified pilot behavior) — the script fails loud
#      and touches nothing. It then VERIFIES the build actually ran
#      `next build` (see "the silent no-op deploy" below).
#
# ── The silent no-op deploy (Jul 28 2026) ─────────────────────────────────────
# `GET /nodejs/builds/settings/from-archive` returned EMPTY settings — no
# app_type, no build_script, no output_directory. Those were spread verbatim
# into the build request, so Hostinger ran `npm install`, exited 0, and reported
# state "completed" while never running `next build`. The deploy of 2b0a31c
# looked green in every log, but prod kept serving the previous build for days.
# Two guards now make that unreproducible:
#   * settings are validated against known-good pins and repaired LOUDLY (3b);
#   * a completed build is rejected unless its logs show `next build` (4b).
# node_version is likewise pinned from the deployed SHA's engines.node — that
# same deploy silently fell back to Node 20 against an engines: 22.x app.
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

# Tools: curl carries every developers.hostinger.com call (see header); node
# runs the file-host TUS upload. Resolve both robustly (PATH may be minimal).
CURL="$(command -v curl || echo /usr/bin/curl)"
[ -x "$CURL" ] || { echo "!! curl not found (looked on PATH and /usr/bin/curl)" >&2; exit 1; }
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "!! node not found on PATH (required for the TUS upload)" >&2; exit 1; }

API="https://developers.hostinger.com/api/hosting/v1"
DOMAIN="${HOSTINGER_DOMAIN:-preview.behind-the-mask.com}"
USERNAME="${HOSTINGER_USERNAME:?set HOSTINGER_USERNAME (hosting account username)}"
TOKEN="${HOSTINGER_API_TOKEN:?set HOSTINGER_API_TOKEN}"
SHA="$(git rev-parse "${1:-origin/main}")"
SHORT="${SHA:0:7}"
BASE="$API/accounts/$USERNAME/websites/$DOMAIN"
AUTH=(-H "Authorization: Bearer $TOKEN")
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Deploying $SHORT to $DOMAIN"

# 1. Source archive of the exact commit (never the working tree).
ARCHIVE="$(mktemp -d)/btm-hub-$SHORT.tar.gz"
git archive --format=tar.gz -o "$ARCHIVE" "$SHA"
NAME="$(basename "$ARCHIVE")"
SIZE=$(du -m "$ARCHIVE" | cut -f1)
echo "==> Archive: $ARCHIVE (${SIZE}MB)"
if [ "$SIZE" -ge 50 ]; then
  echo "!! Archive exceeds Hostinger's 50MB limit" >&2
  exit 1
fi

# 2a. Request a one-time upload URL + auth keys for the website's file host.
UPLOAD_JSON=$("$CURL" -sf "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$API/files/upload-urls" \
  -d "{\"username\":\"$USERNAME\",\"domain\":\"$DOMAIN\"}")
{ read -r UPLOAD_URL; read -r UPLOAD_AUTH; read -r UPLOAD_AUTH_REST; } < <(
  printf '%s' "$UPLOAD_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
d = d.get("data", d) if isinstance(d, dict) and "url" not in d else d
print(d["url"]); print(d["auth_key"]); print(d["rest_auth_key"])')
[ -n "${UPLOAD_URL:-}" ] || { echo "!! upload-urls returned no url" >&2; exit 1; }

# 2b. TUS-upload the archive to the (non-Cloudflare) file host. Auth keys go via
#     env, not argv, so they never surface in `ps`.
echo "==> Uploading archive via TUS to file host"
HOSTINGER_UPLOAD_AUTH="$UPLOAD_AUTH" HOSTINGER_UPLOAD_AUTH_REST="$UPLOAD_AUTH_REST" \
  "$NODE" "$HERE/hostinger-tus-upload.mjs" "$UPLOAD_URL" "$ARCHIVE"

# 3a. Auto-detect build settings for the uploaded archive.
SETTINGS=$("$CURL" -sf "${AUTH[@]}" \
  "$BASE/nodejs/builds/settings/from-archive?archive_path=$NAME")

# 3b. Node major comes from the DEPLOYED SHA's engines.node — never a literal
#     default. Hostinger's hPanel dropdown is decorative for archive deploys,
#     so this field is the only thing that picks the runtime.
NODE_MAJOR="$(git show "$SHA:package.json" | python3 -c '
import json, re, sys
engines = json.load(sys.stdin).get("engines", {}).get("node", "")
m = re.search(r"(\d+)", engines)
if not m:
    sys.stderr.write("!! no engines.node in package.json at %s\n" % sys.argv[1])
    sys.exit(1)
print(m.group(1))' "$SHORT")"
echo "==> Node version (from engines.node at $SHORT): $NODE_MAJOR"

# 3c. Start the server-side build from the archive (settings + archive source).
#     Body mirrors hostinger-api-mcp's triggerBuild: the auto-detected settings
#     spread verbatim, with node_version/source_type/source_options set on top.
#     Detection is NOT trusted blind — missing build fields are repaired from
#     pinned known-good values and the substitution is announced (see header).
BUILD_BODY=$(printf '%s' "$SETTINGS" | python3 -c '
import json, sys
s = json.load(sys.stdin)
name, node_major = sys.argv[1], int(sys.argv[2])
body = dict(s)

# Without these three, Hostinger installs deps and exits 0 WITHOUT building.
PINS = {"app_type": "next", "build_script": "build", "output_directory": ".next"}
missing = [k for k in PINS if not body.get(k)]
if missing:
    sys.stderr.write(
        "!! Build-settings auto-detect returned no %s.\n"
        "!! Detected: %s\n"
        "!! Repairing with pinned Next.js values: %s\n"
        "!! (Unrepaired, this is the Jul 28 2026 silent no-op deploy: npm\n"
        "!!  install runs, state reports completed, no app is ever built.)\n"
        % (", ".join(missing), json.dumps(s), json.dumps({k: PINS[k] for k in missing}))
    )
    body.update({k: PINS[k] for k in missing})

body["node_version"] = node_major
body["source_type"] = "archive"
body["source_options"] = {"archive_path": name}
print(json.dumps(body))' "$NAME" "$NODE_MAJOR")
BUILD_UUID=$("$CURL" -sf "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$BASE/nodejs/builds" -d "$BUILD_BODY" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(d.get("uuid") or d.get("data", {}).get("uuid", ""))')
[ -n "${BUILD_UUID:-}" ] || { echo "!! builds POST returned no uuid" >&2; exit 1; }
echo "==> Build started: $BUILD_UUID"

# 4. Poll to a terminal state (fail loud; a failed build never goes live).
STATE="pending"
for _ in $(seq 1 120); do # up to 10 min
  sleep 5
  STATE=$("$CURL" -sf "${AUTH[@]}" "$BASE/nodejs/builds?per_page=10" |
    python3 -c 'import json,sys
uuid = sys.argv[1]
builds = json.load(sys.stdin)["data"]
print(next((b["state"] for b in builds if b["uuid"] == uuid), "unknown"))' "$BUILD_UUID" 2>/dev/null) || STATE="poll-error"
  echo "    build: $STATE"
  case "$STATE" in
    completed) break ;;
    failed)
      echo "!! Build FAILED — previous build keeps serving. Logs:" >&2
      "$CURL" -sf "${AUTH[@]}" "$BASE/nodejs/builds/$BUILD_UUID/logs" | tail -40 >&2 || true
      exit 1 ;;
  esac
done
[ "$STATE" = "completed" ] || { echo "!! Build did not complete in 10 min (state: $STATE)" >&2; exit 1; }

# 4b. "completed" is NOT proof anything was built — a settings-less build runs
#     npm install and exits 0 (see header). Require the compile in the logs
#     before touching the cache or the rollback ledger. A build that started
#     `next build` and then failed to compile reports state "failed" above, so
#     the presence of the invocation is the signal worth gating on.
BUILD_LOGS=$("$CURL" -sf "${AUTH[@]}" "$BASE/nodejs/builds/$BUILD_UUID/logs" || true)
if ! printf '%s' "$BUILD_LOGS" | grep -q 'next build'; then
  echo "!! Build reported 'completed' but never ran \`next build\` — NOT a deploy." >&2
  echo "!! The previous build keeps serving. Cache was not purged and nothing" >&2
  echo "!! was written to .hostinger-deploys.log. Last 40 log lines:" >&2
  printf '%s' "$BUILD_LOGS" | tail -40 >&2
  exit 1
fi
echo "==> Verified: next build ran server-side"

# 5. Purge website + CDN cache (Server-Action skew mitigation — see header).
#    Method is DELETE: the old POST .../cache/clear now returns 405.
"$CURL" -sf "${AUTH[@]}" -X DELETE "$BASE/cache/clear" >/dev/null
echo "==> Cache purged"

# 6. Smoke checks: homepage 200, /login 200, admin gate redirects (307/308).
sleep 5
ok=true
for probe in "/ 200" "/login 200" "/admin 3xx"; do
  path="${probe% *}"; want="${probe#* }"
  code=$("$CURL" -s -o /dev/null -w "%{http_code}" --max-time 15 "https://$DOMAIN$path")
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
