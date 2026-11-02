# Backend Test Skips Categorization

**Source:** `backend/tests/` — 285 tests collected, 39 passed, 246 skipped

## Skip Categories

### Category 1: real_install (246 tests — all skips)

**Reason:** Tests marked with `real_install` keyword are skipped by default because they require the machine's real install:
- `~/.ticketing` code directory
- `~/.ticketing-sandbox` / `~/Documents/KTS Records-sandbox` data
- `~/.local/bin/ticket` binary

**Mechanism:** `backend/tests/conftest.py` — `pytest_collection_modifyitems()` adds `pytest.mark.skip()` to any test item whose keywords contain `"real_install"`, unless `--run-real-install` is passed on the command line.

**Files affected (skip count per file):**

| Test file | Skipped tests |
|-----------|---------------|
| `tests/test_h2b_auth.py` | 19 |
| `tests/test_g4_numbering.py` | 19 |
| `tests/test_mc2_t8_permissions.py` | 15 |
| `tests/test_isolation.py` | 14 |
| `tests/test_mc2_t7_update_knowledge.py` | 13 |
| `tests/test_stripe_client.py` | 12 |
| `tests/test_g4_generation.py` | 11 |
| `tests/test_cli.py` | 11 |
| `tests/test_ticket_id_schema.py` | 10 |
| `tests/test_mc2_version_fix.py` | 10 |
| `tests/test_mc2_t7_create_knowledge.py` | 10 |
| `tests/test_mc2_kb_service_bugfix.py` | 10 |
| `tests/test_mc2_task_service.py` | 9 |
| `tests/test_mc2_t5_create_task.py` | 9 |
| `tests/test_mc2_t3_update.py` | 9 |
| `tests/test_mc2_t2_status.py` | 9 |
| `tests/test_mc2_project_service.py` | 9 |
| `tests/test_mc2_t1_worklog.py` | 8 |
| `tests/test_h2c2_plugin.py` | 7 |
| `tests/test_g2_allowlist.py` | 7 |
| `tests/test_mc2_indexer.py` | 6 |
| `tests/test_evidence.py` | 5 |
| `tests/test_validator.py` | 3 |
| `tests/test_h2c1_plugin.py` | 3 |
| `tests/test_counters.py` | 3 |
| `tests/test_mc2_dupdefs.py` | 2 |
| `tests/test_real_untouched.py` | 1 |
| `tests/test_idbug.py` | 1 |
| `tests/test_h2a_loadgate.py` | 1 |

### Category 2: sandbox missing (0 tests)

**Mechanism:** `backend/tests/phasef_helpers.py` — `require_sandbox()` calls `testcase.skipTest()` when `SB_HOME` or `SB_VAULT` don't exist. No tests currently hit this skip path because the sandbox exists in this environment.

### Category 3: individual skipTest() calls (0 tests)

No test files call `self.skipTest()` directly outside of `require_sandbox()`.

## Can Be Un-skipped?

| Category | Can un-skip safely? | Reason |
|----------|---------------------|--------|
| real_install | NO — not in this environment | Requires `~/.ticketing`, `~/.ticketing-sandbox`, `~/.local/bin/ticket` which are not present |
| sandbox missing | N/A — 0 tests | No tests currently hit this path |
| individual skipTest() | N/A — 0 tests | No individual skipTest() calls found |

## Track 3.2 Result — Un-skip Attempt

No test categories can be safely un-skipped in this environment. All 246 skipped tests require `real_install` (the machine's real KTS ticketing installation), which is not available. The sandbox exists and `require_sandbox()` does not trigger any skips. There are no individual `self.skipTest()` calls outside of `require_sandbox()`.

**Action taken:** None. No tests were un-skipped.

**Reason:** All 246 skipped tests are gated behind `real_install` which needs `~/.ticketing`, `~/.ticketing-sandbox`/`~/Documents/KTS Records-sandbox`, and `~/.local/bin/ticket` — none of which exist in this sandboxed environment.
