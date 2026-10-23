#!/usr/bin/env bash
# HTTP API integration tests
# Tests external service APIs (AdGuard, MySpeed, Nextcloud, etc.)
set -uo pipefail

PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo "  ○ $1 — $2"; SKIP=$((SKIP+1)); }

# Service URLs (via Tailscale)
ADGUARD_URL="https://adguard.tailf6d3b4.ts.net:8443"
ADGUARD_USER="slayerbrk"
ADGUARD_PASS="${ADGUARD_PASS:?set ADGUARD_PASS in your shell}"
MYSPEED_URL="http://myspeed.tailf6d3b4.ts.net:3052"
NEXTCLOUD_URL="https://nextcloud.tailf6d3b4.ts.net"

echo "=== HTTP API Integration Tests ==="

# --- AdGuard Home ---
echo ""
echo "--- AdGuard Home ---"

# Test 1: AdGuard reachable
AG_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
  -u "$ADGUARD_USER:$ADGUARD_PASS" \
  "$ADGUARD_URL/control/status" 2>/dev/null || echo "000")
if [ "$AG_STATUS" = "200" ]; then
  pass "AdGuard reachable (HTTP $AG_STATUS)"
else
  fail "AdGuard reachable" "HTTP $AG_STATUS"
fi

# Test 2: AdGuard stats
AG_STATS=$(curl -sk --max-time 10 \
  -u "$ADGUARD_USER:$ADGUARD_PASS" \
  "$ADGUARD_URL/control/stats" 2>/dev/null || echo "")
if echo "$AG_STATS" | grep -q "dns_queries"; then
  QUERIES=$(echo "$AG_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dns_queries',{}).get('sum_all',0))" 2>/dev/null || echo "?")
  BLOCKED=$(echo "$AG_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('blocked_filtering',{}).get('sum_all',0))" 2>/dev/null || echo "?")
  pass "AdGuard stats: $QUERIES queries, $BLOCKED blocked"
else
  fail "AdGuard stats" "invalid response"
fi

# Test 3: AdGuard protection status
AG_PROT=$(curl -sk --max-time 10 \
  -u "$ADGUARD_USER:$ADGUARD_PASS" \
  "$ADGUARD_URL/control/status" 2>/dev/null || echo "")
if echo "$AG_PROT" | grep -q "protection_enabled"; then
  ENABLED=$(echo "$AG_PROT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('active' if d.get('protection_enabled') else 'disabled')" 2>/dev/null || echo "?")
  pass "AdGuard protection: $ENABLED"
else
  fail "AdGuard protection status" "invalid response"
fi

# Test 4: AdGuard filters
AG_FILTERS=$(curl -sk --max-time 10 \
  -u "$ADGUARD_USER:$ADGUARD_PASS" \
  "$ADGUARD_URL/control/filtering/set_rules" 2>/dev/null || echo "")
if echo "$AG_FILTERS" | grep -q "user_rules"; then
  RULES=$(echo "$AG_FILTERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('user_rules',[])))" 2>/dev/null || echo "?")
  pass "AdGuard user rules: $RULES"
else
  skip "AdGuard user rules" "endpoint not accessible"
fi

# --- MySpeed ---
echo ""
echo "--- MySpeed ---"

# Test 5: MySpeed reachable
MS_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
  "$MYSPEED_URL/api/speedtests" 2>/dev/null)
MS_EXIT=$?
if [ "$MS_STATUS" = "200" ]; then
  pass "MySpeed reachable (HTTP $MS_STATUS)"
elif [ $MS_EXIT -ne 0 ] || [ "$MS_STATUS" = "000" ]; then
  skip "MySpeed reachable" "service unreachable from this host"
else
  fail "MySpeed reachable" "HTTP $MS_STATUS"
fi

# Test 6: MySpeed speed tests
if [ "$MS_STATUS" = "200" ]; then
  MS_TESTS=$(curl -sk --max-time 10 \
    "$MYSPEED_URL/api/speedtests" 2>/dev/null || echo "")
  if echo "$MS_TESTS" | grep -q "download"; then
    COUNT=$(echo "$MS_TESTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
    pass "MySpeed speed tests: $COUNT records"
  else
    fail "MySpeed speed tests" "invalid response"
  fi
else
  skip "MySpeed speed tests" "service unreachable"
fi

# --- Nextcloud ---
echo ""
echo "--- Nextcloud ---"

# Test 7: Nextcloud reachable
NC_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
  "$NEXTCLOUD_URL/status.php" 2>/dev/null)
NC_EXIT=$?
if [ "$NC_STATUS" = "200" ]; then
  pass "Nextcloud reachable (HTTP $NC_STATUS)"
elif [ $NC_EXIT -ne 0 ] || [ "$NC_STATUS" = "000" ]; then
  skip "Nextcloud reachable" "service unreachable from this host"
else
  fail "Nextcloud reachable" "HTTP $NC_STATUS"
fi

# Test 8: Nextcloud version
if [ "$NC_STATUS" = "200" ]; then
  NC_INFO=$(curl -sk --max-time 10 \
    "$NEXTCLOUD_URL/status.php" 2>/dev/null || echo "")
  if echo "$NC_INFO" | grep -q "version"; then
    VER=$(echo "$NC_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version','?'))" 2>/dev/null || echo "?")
    pass "Nextcloud version: $VER"
  else
    fail "Nextcloud version" "invalid response"
  fi
else
  skip "Nextcloud version" "service unreachable"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ $FAIL -eq 0 ] && exit 0 || exit 1
