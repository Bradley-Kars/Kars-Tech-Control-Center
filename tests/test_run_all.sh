#!/usr/bin/env bash
# Full system test orchestrator
# Runs all integration tests and reports results
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
FAILED_SUITES=()

run_suite() {
  local name="$1"
  local script="$2"
  echo ""
  echo "========================================"
  echo "  $name"
  echo "========================================"
  
  if [ ! -f "$script" ]; then
    echo "  ✗ Script not found: $script"
    TOTAL_FAIL=$((TOTAL_FAIL+1))
    FAILED_SUITES+=("$name")
    return
  fi
  
  OUTPUT=$(bash "$script" 2>&1) || true
  echo "$OUTPUT"
  
  # Parse the final "Results: X passed, Y failed, Z skipped" line
  local result_line=$(echo "$OUTPUT" | grep "^Results:" | tail -1)
  if [ -n "$result_line" ]; then
    local p=$(echo "$result_line" | sed 's/^Results: \([0-9]*\) passed.*/\1/')
    local f=$(echo "$result_line" | sed 's/^Results: [0-9]* passed, \([0-9]*\) failed.*/\1/')
    local s=$(echo "$result_line" | sed 's/^Results: [0-9]* passed, [0-9]* failed, \([0-9]*\) skipped/\1/')
    TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
    TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0}))
    TOTAL_SKIP=$((TOTAL_SKIP + ${s:-0}))
  fi
  
  # Track failed suites
  local sf=$(echo "$result_line" | sed 's/^Results: [0-9]* passed, \([0-9]*\) failed.*/\1/')
  if [ "${sf:-0}" -gt 0 ] 2>/dev/null; then
    FAILED_SUITES+=("$name")
  fi
}

echo "╔══════════════════════════════════════╗"
echo "║  Kars Tech Control Center — Full     ║"
echo "║  Integration Test Suite              ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Date: $(date)"
echo "Host: $(hostname)"

# Run all test suites
run_suite "KDE Connect D-Bus Tests" "$SCRIPT_DIR/test_kdeconnect.sh"
run_suite "ADB Phone Tests" "$SCRIPT_DIR/test_adb.sh"
run_suite "HTTP API Tests" "$SCRIPT_DIR/test_http_api.sh"

# Final summary
echo ""
echo "========================================"
echo "  FINAL RESULTS"
echo "========================================"
echo ""
echo "  ✓ $TOTAL_PASS tests passed"
echo "  ✗ $TOTAL_FAIL tests failed"
echo "  ○ $TOTAL_SKIP tests skipped"

if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  echo ""
  echo "  Failed suites:"
  for suite in "${FAILED_SUITES[@]}"; do
    echo "    - $suite"
  done
fi

echo ""
TOTAL=$((TOTAL_PASS + TOTAL_FAIL + TOTAL_SKIP))
if [ $TOTAL -gt 0 ]; then
  RATE=$((TOTAL_PASS * 100 / TOTAL))
  echo "  Pass rate: $RATE% ($TOTAL_PASS/$TOTAL)"
fi

echo ""
if [ $TOTAL_FAIL -eq 0 ]; then
  echo "  All tests passed!"
  exit 0
else
  echo "  Some tests failed."
  exit 1
fi
