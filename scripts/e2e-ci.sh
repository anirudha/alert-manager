#!/usr/bin/env bash
# =============================================================================
# E2E test runner for Alert Manager OSD plugin mode (CI / non-interactive)
#
# Uses the slim Docker Compose stack in docker/ (OpenSearch + OSD + Cortex).
# No external observability-stack dependency, no interactive prompts.
#
# Usage:
#   ./scripts/e2e-ci.sh                    # Full run: start stack, wait, test, teardown
#   ./scripts/e2e-ci.sh --running          # Skip start/teardown, test against running stack
#   ./scripts/e2e-ci.sh --no-teardown      # Start + test but leave stack running after
#
# Environment:
#   ALERT_MANAGER_PLUGIN_ZIP   Path to plugin ZIP (default: auto-detect from build/)
#   CYPRESS_BROWSER            Browser for Cypress (default: chrome)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.yml"
MAX_INIT_WAIT=600

# --- Colors (disabled if not a terminal) -------------------------------------
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

info()  { echo -e "${CYAN}>>>${NC} $*"; }
ok()    { echo -e "${GREEN}    OK${NC} $*"; }
warn()  { echo -e "${YELLOW}    WARN${NC} $*"; }
fail()  { echo -e "${RED}    ERROR:${NC} $*" >&2; exit 1; }

# --- Parse flags -------------------------------------------------------------
START_STACK=true
TEARDOWN=true
for arg in "$@"; do
  case $arg in
    --running)      START_STACK=false; TEARDOWN=false ;;
    --no-teardown)  TEARDOWN=false ;;
    --help|-h)
      echo "Usage: $0 [--running | --no-teardown | --help]"
      echo ""
      echo "  (no flags)     Full run: start stack, wait, test, teardown"
      echo "  --running      Skip start/teardown, test against already-running stack"
      echo "  --no-teardown  Start + test but leave stack running"
      exit 0
      ;;
    *) warn "Unknown flag: $arg (ignored)" ;;
  esac
done

# --- Cleanup trap ------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [ "$TEARDOWN" = true ] && [ "$START_STACK" = true ]; then
    echo ""
    info "Collecting Docker logs..."
    mkdir -p "$REPO_DIR/docker-logs"
    docker compose -f "$COMPOSE_FILE" logs > "$REPO_DIR/docker-logs/all.log" 2>&1 || true
    docker compose -f "$COMPOSE_FILE" logs opensearch-dashboards > "$REPO_DIR/docker-logs/osd.log" 2>&1 || true
    docker compose -f "$COMPOSE_FILE" logs osd-init > "$REPO_DIR/docker-logs/init.log" 2>&1 || true

    info "Tearing down Docker stack..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    ok "Stack torn down"
  fi
  exit $exit_code
}
trap cleanup EXIT

# --- Preflight ---------------------------------------------------------------
echo ""
echo -e "${BOLD}=== Alert Manager E2E (OSD Plugin Mode - CI) ===${NC}"
echo ""

info "Checking prerequisites..."
command -v docker &>/dev/null || fail "Docker not found"
docker info &>/dev/null || fail "Docker daemon not running"
docker compose version &>/dev/null || fail "Docker Compose not found"
command -v node &>/dev/null || fail "Node.js not found"
ok "Docker, Docker Compose, Node.js available"

# --- Resolve plugin ZIP ------------------------------------------------------
PLUGIN_ZIP="${ALERT_MANAGER_PLUGIN_ZIP:-}"
if [ -z "$PLUGIN_ZIP" ]; then
  PLUGIN_ZIP=$(ls -1t "$REPO_DIR"/build/alertManager-*.zip 2>/dev/null | head -1 || echo "")
  if [ -z "$PLUGIN_ZIP" ]; then
    PLUGIN_ZIP=$(ls -1t "$REPO_DIR"/build/alertManager.zip 2>/dev/null | head -1 || echo "")
  fi
fi

if [ ! -f "$PLUGIN_ZIP" ]; then
  fail "Plugin ZIP not found. Build first with ./build.sh or set ALERT_MANAGER_PLUGIN_ZIP."
fi
ok "Plugin ZIP: $PLUGIN_ZIP"

export ALERT_MANAGER_PLUGIN_ZIP="$PLUGIN_ZIP"

# --- Start Docker stack ------------------------------------------------------
if [ "$START_STACK" = true ]; then
  info "Tearing down any existing stack..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true

  info "Starting slim Docker stack..."
  docker compose -f "$COMPOSE_FILE" up -d
  ok "Containers starting"
fi

# --- Wait for init container to complete -------------------------------------
info "Waiting for init container to complete (max ${MAX_INIT_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_INIT_WAIT ]; do
  init_status=$(docker inspect --format='{{.State.Status}}' osd-init 2>/dev/null || echo "not_found")

  if [ "$init_status" = "exited" ]; then
    init_exit=$(docker inspect --format='{{.State.ExitCode}}' osd-init 2>/dev/null || echo "1")
    if [ "$init_exit" = "0" ]; then
      ok "Init completed after ${elapsed}s"
      break
    else
      echo ""
      echo "--- Init container logs ---"
      docker logs osd-init 2>&1 | tail -30
      fail "Init container exited with code $init_exit"
    fi
  fi

  if [ "$init_status" = "not_found" ]; then
    fail "Init container not found. Is the stack running?"
  fi

  if [ $((elapsed % 30)) -eq 0 ]; then
    echo "    ${elapsed}s... (init status: $init_status)"
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

if [ "$init_status" != "exited" ]; then
  echo ""
  echo "--- Init container logs ---"
  docker logs osd-init 2>&1 | tail -30
  fail "Init container did not complete within ${MAX_INIT_WAIT}s"
fi

# --- Extract workspace ID ----------------------------------------------------
info "Extracting workspace ID..."

WORKSPACE_ID=$(docker logs osd-init 2>&1 | grep '^WORKSPACE_ID=' | tail -1 | cut -d= -f2)

if [ -z "$WORKSPACE_ID" ]; then
  echo "--- Init container logs ---"
  docker logs osd-init 2>&1
  fail "Could not extract WORKSPACE_ID from init container logs"
fi
ok "Workspace ID: $WORKSPACE_ID"

export CYPRESS_OSD_WORKSPACE_ID="$WORKSPACE_ID"

# --- Warm up OSD plugin page -------------------------------------------------
info "Warming up Alert Manager plugin page..."

# Login
curl -sf -c /tmp/e2e-ci-cookies \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"My_password_123!@#"}' \
  'http://localhost:5601/auth/login' > /dev/null 2>&1

# Verify plugin API responds
PLUGIN_API="http://localhost:5601/w/${WORKSPACE_ID}/api/alerting/datasources"
elapsed=0
while [ $elapsed -lt 60 ]; do
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/e2e-ci-cookies \
    -H 'osd-xsrf: osd-fetch' "$PLUGIN_API" 2>/dev/null || echo "000")
  if [ "$http_code" = "200" ]; then
    ok "Plugin API responding after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

# Hit the plugin page to warm OSD's bundle cache
curl -s -b /tmp/e2e-ci-cookies \
  "http://localhost:5601/w/${WORKSPACE_ID}/app/alertManager/" > /dev/null 2>&1
sleep 5

rm -f /tmp/e2e-ci-cookies

# --- Run Cypress -------------------------------------------------------------
info "Running Cypress E2E tests (OSD mode)..."
cd "$REPO_DIR"
rm -rf cypress/screenshots

BROWSER="${CYPRESS_BROWSER:-chrome}"
CYPRESS_MODE=osd npx cypress run --browser "$BROWSER"

echo ""
echo -e "${GREEN}${BOLD}=== All OSD E2E tests passed ===${NC}"
echo ""
echo "  To re-run against running stack:  $0 --running"
echo "  To teardown:                      docker compose -f docker/docker-compose.yml down -v"
echo ""
