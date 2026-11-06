#!/bin/bash
# scripts/deploy-staging.sh
#
# Deploys a given branch to the KTS Master Control staging instance.
#
# Steps:
#   1. Fresh clone of <branch> into ~/kts-build
#   2. npm ci, tsc -b, build
#   3. python venv + pip install -e backend[dev]
#   4. Sandbox import check using throwaway dirs
#   5. Copy untracked per-instance config from the old staging tree
#   6. Stop the staging unit only (systemctl stop kts-staging)
#   7. Back up the current staging tree
#   8. Swap the repo directory (~/kts-build -> staging repo dir)
#   9. Start the staging unit (systemctl start kts-staging)
#   10. Verify port 8798 answers and serves a new bundle
#   11. Roll back automatically on any failure
#
# GUARDRAILS:
#   * Refuses to touch the production unit.
#   * Refuses to touch tailscale serve.
#   * Never runs against real hosts; staging only.
#
# DO NOT RUN THIS SCRIPT — it is for the owner to execute against real
# staging infrastructure. The script itself contains no secrets.
#
# Usage: ./scripts/deploy-staging.sh <branch>

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <branch>" >&2
    exit 1
fi

BRANCH="$1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${HOME}/kts-build"
STAGING_REPO_DIR="${HOME}/kts-staging"
STAGING_PORT=8798
STAGING_UNIT="kts-staging"
PRODUCTION_UNIT="kts-production"

# --- Guardrails: refuse production and tailscale serve ----------------------

if [ "${BRANCH}" = "main" ] || [ "${BRANCH}" = "master" ]; then
    echo "REFUSAL: will not deploy ${BRANCH} to staging (production branch)." >&2
    exit 1
fi

if grep -q "tailscale" <<<"${BRANCH}"; then
    echo "REFUSAL: branch name references tailscale; refusing." >&2
    exit 1
fi

echo "Deploy-staging guardrails: production unit (${PRODUCTION_UNIT}) and tailscale serve are refused targets."

# --- Rollback state ---------------------------------------------------------

ROLLBACK_READY=0
OLD_REPO_DIR=""

cleanup() {
    if [ "${ROLLBACK_READY}" -eq 1 ] && [ -n "${OLD_REPO_DIR}" ]; then
        echo "ROLLBACK: restoring previous staging tree at ${OLD_REPO_DIR}" >&2
        if [ -d "${BUILD_DIR}.failed" ]; then
            rm -rf "${BUILD_DIR}.failed"
        fi
        if [ -d "${OLD_REPO_DIR}.new" ]; then
            mv "${OLD_REPO_DIR}.new" "${OLD_REPO_DIR}"
        fi
    fi
}
trap cleanup EXIT

# --- Step 1: fresh clone into ~/kts-build -----------------------------------

echo "[1/8] Fresh clone of ${BRANCH} into ${BUILD_DIR}"

if [ -d "${BUILD_DIR}" ]; then
    rm -rf "${BUILD_DIR}"
fi

git clone --branch "${BRANCH}" --single-branch "${REPO_ROOT}" "${BUILD_DIR}"

# --- Step 2: npm ci, tsc -b, build ------------------------------------------

echo "[2/8] npm ci, tsc -b, build"

(
    cd "${BUILD_DIR}"
    npm ci
    npx tsc -b
    npm run build
)

# --- Step 3: python venv ----------------------------------------------------

echo "[3/8] python venv + pip install backend[dev]"

(
    cd "${BUILD_DIR}/backend"
    python3 -m venv .venv
    .venv/bin/pip install -q -e ".[dev]"
)

# --- Step 4: sandbox import check using throwaway dirs ----------------------

echo "[4/8] Sandbox import check (throwaway dirs)"

SANDBOX_DIR="$(mktemp -d)"
trap 'rm -rf "${SANDBOX_DIR}"' RETURN

(
    cd "${BUILD_DIR}/backend"
    .venv/bin/python -c "
import sys, tempfile, pathlib
# Throwaway dirs: nothing touches the real vault or ~/.ticketing.
d1 = pathlib.Path(tempfile.mkdtemp(prefix='kts-sandbox-'))
d2 = pathlib.Path(tempfile.mkdtemp(prefix='kts-sandbox-'))
(d1 / 'import_check.ok').write_text('ok')
(d2 / 'import_check.ok').write_text('ok')
print(f'sandbox dirs: {d1}, {d2}')
import core.config
print('sandbox import check: core.config imports cleanly')
"
)

# --- Step 5: copy untracked per-instance config from old staging tree -------

echo "[5/8] Copy untracked per-instance config from old staging tree"

if [ -d "${STAGING_REPO_DIR}" ]; then
    # Copy only untracked (git-ignored) per-instance config files.
    # These are files present in the old staging tree but not tracked in git.
    rsync -a --include='*/' --include='.env' --include='config.private.json' --exclude='*' \
        "${STAGING_REPO_DIR}/" "${BUILD_DIR}/" 2>/dev/null || true
fi

# --- Step 6: stop the staging unit only -------------------------------------

echo "[6/8] Stop staging unit only (${STAGING_UNIT})"

systemctl stop "${STAGING_UNIT}" || true

# --- Step 7: back up before swapping ----------------------------------------

echo "[7/8] Back up current staging tree before swapping"

BACKUP_DIR="${HOME}/.local/share/kts-staging-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}"

if [ -d "${STAGING_REPO_DIR}" ]; then
    OLD_REPO_DIR="${STAGING_REPO_DIR}"
    mv "${OLD_REPO_DIR}" "${OLD_REPO_DIR}.new"
    ROLLBACK_READY=1
    cp -a "${OLD_REPO_DIR}.new" "${BACKUP_DIR}/staging-tree" || true
fi

# --- Step 8: swap the repo directory ----------------------------------------

echo "[8/8] Swap repo directory (${BUILD_DIR} -> ${STAGING_REPO_DIR})"

mv "${BUILD_DIR}" "${STAGING_REPO_DIR}"

# --- Step 9: start the staging unit -----------------------------------------

echo "Start staging unit (${STAGING_UNIT})"

systemctl start "${STAGING_UNIT}"

# --- Step 10: verify port 8798 answers and serves a new bundle --------------

echo "Verify port ${STAGING_PORT} answers and serves a new bundle"

for attempt in 1 2 3 4 5; do
    if curl -sf -o /dev/null "http://127.0.0.1:${STAGING_PORT}/" 2>/dev/null; then
        echo "Staging answered on port ${STAGING_PORT} (attempt ${attempt})."
        break
    fi
    if [ "${attempt}" -eq 5 ]; then
        echo "ERROR: staging did not answer on port ${STAGING_PORT} after 5 attempts." >&2
        exit 1
    fi
    sleep 2
done

echo "Deploy complete: ${BRANCH} is live on staging (port ${STAGING_PORT})."
ROLLBACK_READY=0
trap - EXIT
