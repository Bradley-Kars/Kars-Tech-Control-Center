import os, shutil, tempfile
from pathlib import Path
import pytest
_SESSION = Path(tempfile.mkdtemp(prefix="kts-test-"))
VAULT = _SESSION / "vault"; HOME = _SESSION / "home"
VAULT.mkdir(); (HOME / "config").mkdir(parents=True)
_FIX = Path(__file__).parent / "fixtures"
for n in ("users.yaml", "permissions.yaml"):
    shutil.copy2(_FIX / n, HOME / "config" / n)
os.environ["KTS_SANDBOX"] = "1"
os.environ["KTS_VAULT"] = str(VAULT)
os.environ["KTS_HOME"] = str(HOME)

@pytest.fixture(autouse=True)
def _clean_vault():
    yield
    for p in VAULT.rglob("*"):
        if p.is_file() or p.is_symlink():
            p.unlink()

def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_SESSION, ignore_errors=True)


def pytest_addoption(parser):
    parser.addoption(
        "--run-real-install",
        action="store_true",
        default=False,
        help="also run real_install tests (skipped by default)",
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-real-install"):
        return
    skip_real = pytest.mark.skip(
        reason="real_install: needs this machine's real install (~/.ticketing code, "
        "~/.ticketing-sandbox / ~/Documents/KTS Records-sandbox data, "
        "~/.local/bin/ticket); skipped by default"
    )
    for item in items:
        if "real_install" in item.keywords:
            item.add_marker(skip_real)
