"""Pytest configuration for KTS backend tests.

Sets KTS_SANDBOX, KTS_VAULT, KTS_HOME environment variables BEFORE any test
module imports core.paths. core.paths resolves vault/home paths at import
time (_resolve_env runs at module load), so env vars must be set before any
test module is imported.

All tests run in sandbox mode using temp directories, never touching the real
~/.ticketing or ~/Documents/KTS Records.
"""
import os
import tempfile
from pathlib import Path

# Create a fresh sandbox for the entire test session
_tmp_vault = Path(tempfile.mkdtemp(prefix="kts-vault-"))
_tmp_home = Path(tempfile.mkdtemp(prefix="kts-home-"))

os.environ["KTS_SANDBOX"] = "1"
os.environ["KTS_VAULT"] = str(_tmp_vault)
os.environ["KTS_HOME"] = str(_tmp_home)

# Create the directory structure that paths.resolve_env expects
(_tmp_vault / "Tickets").mkdir(parents=True, exist_ok=True)
(_tmp_home / "config").mkdir(parents=True, exist_ok=True)


def pytest_configure(config):
    """Write the sandbox env info to a file for debugging if needed."""
    pass


