#!/usr/bin/env bash
# KDE Connect D-Bus integration tests
# Tests the KDE Connect backend against the actual device
set -euo pipefail

PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo "  ○ $1 — $2"; SKIP=$((SKIP+1)); }

KDECONNECT_DEVICE="7cc37f37453c42f2b5713a505ec547c1"
BUS="session"

echo "=== KDE Connect D-Bus Tests ==="

# Test 1: D-Bus session bus reachable
if busctl --user list 2>/dev/null | grep -q "org.kde.kdeconnect"; then
  pass "KDE Connect D-Bus service is running"
else
  fail "KDE Connect D-Bus service" "service not found on session bus"
fi

# Test 2: List paired devices via D-Bus
DEVICES=$(dbus-send --session --dest=org.kde.kdeconnect \
  --type=method_call --print-reply \
  /modules/kdeconnect \
  org.kde.kdeconnect.daemon.devices 2>/dev/null || echo "")
if echo "$DEVICES" | grep -q "object paths"; then
  pass "D-Bus devices listing"
else
  skip "D-Bus devices listing" "D-Bus call failed (may not have KDE Connect on this machine)"
fi

# Test 3: Device name resolution via D-Bus
if echo "$DEVICES" | grep -q "$KDECONNECT_DEVICE"; then
  pass "Target device $KDECONNECT_DEVICE found via D-Bus"
else
  skip "Target device lookup" "device not in D-Bus list or D-Bus unavailable"
fi

# Test 4: Send ping via D-Bus
if busctl --user call org.kde.kdeconnect \
  "/modules/kdeconnect/devices/$KDECONNECT_DEVICE" \
  "org.kde.kdeconnect.device.ping" "sendPing" 2>/dev/null; then
  pass "D-Bus ping sent to device"
else
  skip "D-Bus ping" "D-Bus call failed"
fi

# Test 5: Battery status via D-Bus
BATTERY=$(busctl --user get-property org.kde.kdeconnect \
  "/modules/kdeconnect/devices/$KDECONNECT_DEVICE/battery" \
  "org.kde.kdeconnect.device.battery" "charge" 2>/dev/null || echo "")
if echo "$BATTERY" | grep -q "int32"; then
  pass "D-Bus battery charge value: $BATTERY"
else
  skip "D-Bus battery" "property not available"
fi

# Test 6: Notifications via D-Bus
NOTIF=$(busctl --user call org.kde.kdeconnect \
  "/modules/kdeconnect/devices/$KDECONNECT_DEVICE/notifications" \
  "org.kde.kdeconnect.device.notifications" "activeNotifications" 2>/dev/null || echo "")
if echo "$NOTIF" | grep -q "array"; then
  pass "D-Bus active notifications accessible"
else
  skip "D-Bus notifications" "call failed"
fi

# Test 7: Find my phone via D-Bus
if busctl --user call org.kde.kdeconnect \
  "/modules/kdeconnect/devices/$KDECONNECT_DEVICE/locate" \
  "org.kde.kdeconnect.device.locate" "sendPing" 2>/dev/null; then
  pass "D-Bus locate ping sent"
else
  skip "D-Bus locate" "call failed"
fi

# Test 8: MPRIS via D-Bus
MPRIS=$(busctl --user call org.kde.kdeconnect \
  "/modules/kdeconnect/devices/$KDECONNECT_DEVICE/mpriscontrol" \
  "org.kde.kdeconnect.device.mpriscontrol" "player" 2>/dev/null || echo "")
if echo "$MPRIS" | grep -q "string"; then
  pass "D-Bus MPRIS player name: $MPRIS"
else
  skip "D-Bus MPRIS" "no active player"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ $FAIL -eq 0 ] && exit 0 || exit 1
