#!/usr/bin/env bash
# ADB phone integration tests
# Tests the ADB backend against the Galaxy S24 Ultra
set -euo pipefail

PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo "  ○ $1 — $2"; SKIP=$((SKIP+1)); }

ADB_HOST="b-s24-ultra.tailf6d3b4.ts.net"
ADB_PORT="36887"
ADB="adb -s $ADB_HOST:$ADB_PORT"

echo "=== ADB Phone Integration Tests ==="

# Test 1: ADB device connected
if $ADB get-state 2>/dev/null | grep -q "device"; then
  pass "ADB device is connected"
else
  fail "ADB connection" "device not reachable at $ADB_HOST:$ADB_PORT"
  echo ""
  echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
  exit 1
fi

# Test 2: Device model
MODEL=$($ADB shell getprop ro.product.model 2>/dev/null | tr -d '\r')
if echo "$MODEL" | grep -q "SM-S928U"; then
  pass "Device model: $MODEL"
else
  fail "Device model" "expected SM-S928U, got '$MODEL'"
fi

# Test 3: Android version
ANDROID=$($ADB shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')
if [ -n "$ANDROID" ]; then
  pass "Android version: $ANDROID"
else
  fail "Android version" "could not read"
fi

# Test 4: Battery level
BATTERY=$($ADB shell dumpsys battery 2>/dev/null | grep "  level:" | awk '{print $NF}' | tr -d '\r')
if [ -n "$BATTERY" ] && [ "$BATTERY" -ge 0 ] 2>/dev/null; then
  pass "Battery level: ${BATTERY}%"
else
  fail "Battery level" "could not read"
fi

# Test 5: Battery status (charging check)
STATUS=$($ADB shell dumpsys battery 2>/dev/null | grep "status:" | awk '{print $2}' | tr -d '\r')
if [ -n "$STATUS" ]; then
  pass "Battery status code: $STATUS"
else
  fail "Battery status" "could not read"
fi

# Test 6: Storage info
STORAGE=$($ADB shell df -h /data 2>/dev/null | tail -1)
if [ -n "$STORAGE" ]; then
  SIZE=$(echo "$STORAGE" | awk '{print $2}')
  pass "Storage info available: $SIZE total"
else
  fail "Storage info" "could not read"
fi

# Test 7: Memory info
MEM_TOTAL=$($ADB shell cat /proc/meminfo 2>/dev/null | grep "MemTotal" | awk '{print $2}')
if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ] 2>/dev/null; then
  MEM_GB=$((MEM_TOTAL / 1024 / 1024))
  pass "Memory total: ${MEM_GB}GB"
else
  fail "Memory info" "could not read"
fi

# Test 8: WiFi SSID
WIFI=$($ADB shell cmd wifi status 2>/dev/null | grep -o '"[^"]*"' | head -1 | tr -d '"' | tr -d '\r')
if [ -n "$WIFI" ]; then
  pass "WiFi SSID: $WIFI"
else
  skip "WiFi SSID" "could not read"
fi

# Test 9: Screen state
SCREEN=$($ADB shell dumpsys power 2>/dev/null | grep "mWakefulness=" | head -1 | awk -F= '{print $2}' | tr -d '\r')
if [ -n "$SCREEN" ]; then
  pass "Screen wakefulness: $SCREEN"
else
  skip "Screen state" "could not read"
fi

# Test 10: Kernel version
KERNEL=$($ADB shell uname -r 2>/dev/null | tr -d '\r')
if [ -n "$KERNEL" ]; then
  pass "Kernel: $KERNEL"
else
  skip "Kernel version" "could not read"
fi

# Test 11: SMS database readable
SMS_COUNT=$($ADB shell content query --uri content://sms --projection "_id" 2>/dev/null | grep -c "_id=" || echo "0")
if [ "$SMS_COUNT" -gt 0 ] 2>/dev/null; then
  pass "SMS database accessible: $SMS_COUNT messages"
else
  skip "SMS database" "query returned 0 or failed"
fi

# Test 12: Contacts database readable
CONTACTS=$($ADB shell content query --uri content://com.android.contacts/contacts --projection "display_name" 2>/dev/null | grep -c "display_name=" || echo "0")
if [ "$CONTACTS" -gt 0 ] 2>/dev/null; then
  pass "Contacts database accessible: $CONTACTS contacts"
else
  skip "Contacts database" "query returned 0 or failed"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ $FAIL -eq 0 ] && exit 0 || exit 1
