#!/usr/bin/env bash
#
# Zero-setup wrapper around hostinger-deploy.sh: pulls the Hostinger API token
# from the local (untracked) .mcp.json so a deploy — upload, server-side build,
# cache purge, smoke checks, rollback log — is ONE command with no env setup:
#
#   ./scripts/hostinger-deploy-local.sh            # deploy origin/main
#   ./scripts/hostinger-deploy-local.sh <sha>      # deploy/rollback a SHA
#
# NB: local main is often ahead of origin/main in this repo — pass the SHA
# explicitly (e.g. `$(git rev-parse main)`) when deploying unpushed work.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
MCP_JSON="$REPO/.mcp.json"

[ -f "$MCP_JSON" ] || {
  echo "!! $MCP_JSON not found — set HOSTINGER_API_TOKEN manually and use hostinger-deploy.sh" >&2
  exit 1
}

TOKEN="$(python3 -c '
import json, sys
cfg = json.load(open(sys.argv[1]))
print(cfg["mcpServers"]["hostinger-hosting"]["env"]["HOSTINGER_API_TOKEN"])
' "$MCP_JSON")"

export HOSTINGER_API_TOKEN="$TOKEN"
export HOSTINGER_USERNAME="${HOSTINGER_USERNAME:-u371234864}"

exec "$HERE/hostinger-deploy.sh" "$@"
