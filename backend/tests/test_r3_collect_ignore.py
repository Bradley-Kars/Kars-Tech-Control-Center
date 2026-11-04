"""R3: conftest.py must ignore phasef_helpers / real-tree tests so pytest collects cleanly.

These tests snapshot and restore the REAL vault and REAL ~/.ticketing and must
never run in CI or on a dev machine (queue rule: never run tests that touch the
real vault or real ~/.ticketing).
"""

from pathlib import Path

CONFTEST = Path(__file__).parent / "conftest.py"

PHASEF_TESTS = [
    "test_cli.py",
    "test_counters.py",
    "test_evidence.py",
    "test_g4_numbering.py",
    "test_h2b_auth.py",
    "test_real_untouched.py",
    "test_ticket_id_schema.py",
    "test_validator.py",
]


def test_conftest_defines_collect_ignore_glob():
    source = CONFTEST.read_text()
    assert "collect_ignore_glob" in source


def test_collect_ignore_glob_covers_all_phasef_tests():
    source = CONFTEST.read_text()
    for name in PHASEF_TESTS:
        assert name in source, f"collect_ignore_glob must ignore {name}"
