#!/bin/bash
# scripts/smoke-real.sh
#
# Read-only smoke checks through the web app API against the real servers.json.
# GET requests only. Prints a pass/fail table per service.
#
# DO NOT RUN THIS SCRIPT - it is for the owner to execute against real servers.
# It reads ~/.config/master-control/servers.json which contains real hostnames,
# tokens, and credentials. The script itself contains no secrets.
#
# Usage: ./scripts/smoke-real.sh

set -euo pipefail

SERVERS_FILE="${HOME}/.config/master-control/servers.json"

if [ ! -f "$SERVERS_FILE" ]; then
    echo "ERROR: $SERVERS_FILE not found" >&2
    exit 1
fi

echo "Smoke test results against real servers (from $SERVERS_FILE):"
echo "=============================================================="
printf "%-30s %-25s %-10s\n" "SERVER" "ENDPOINT" "STATUS"
printf "%-30s %-25s %-10s\n" "------" "--------" "------"

python3 - <<'PYEOF'
import json
import os
import subprocess
import sys

servers_file = os.path.expanduser('~/.config/master-control/servers.json')

try:
    with open(servers_file) as f:
        servers = json.load(f)
except Exception as e:
    print(f"ERROR: cannot read {servers_file}: {e}", file=sys.stderr)
    sys.exit(1)

# GET-only endpoints to smoke-test on each server
ENDPOINTS = [
    '/api/fleet/servers',
    '/api/fleet/local/stats',
]

for server in servers:
    sid = server.get('id', 'unknown')
    name = server.get('name', sid)
    hostname = server.get('hostname', '')
    port = server.get('port', 22)

    if not hostname:
        print(f'{name:<30} {"(no hostname)":<25} SKIP')
        continue

    base_url = f'http://{hostname}:{port}'

    for ep in ENDPOINTS:
        url = f'{base_url}{ep}'
        try:
            result = subprocess.run(
                ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', url],
                capture_output=True, text=True, timeout=5
            )
            status = result.stdout.strip()
            if status == '200':
                print(f'{name:<30} {ep:<25} PASS')
            elif status == '401':
                print(f'{name:<30} {ep:<25} AUTH')
            elif status == '403':
                print(f'{name:<30} {ep:<25} FORBID')
            elif status == '404':
                print(f'{name:<30} {ep:<25} NOT-FOUND')
            elif status == '000':
                print(f'{name:<30} {ep:<25} CONN-FAIL')
            else:
                print(f'{name:<30} {ep:<25} FAIL({status})')
        except Exception:
            print(f'{name:<30} {ep:<25} ERROR')

PYEOF

echo ""
echo "Done. Review PASS/AUTH/FORBID/NOT-FOUND/CONN-FAIL/FAIL/ERROR results above."
echo "This script is read-only (GET requests only) and safe to run."