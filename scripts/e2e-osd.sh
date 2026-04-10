#!/usr/bin/env bash
# =============================================================================
# E2E test runner for Alert Manager OSD plugin mode
#
# Builds the plugin, brings up a clean observability-stack with Docker Compose,
# waits for OSD to become healthy, and runs Cypress against the OSD plugin.
#
# Works on any contributor's machine -- prompts for missing configuration and
# can clone the observability-stack repo if not found locally.
#
# Usage:
#   ./scripts/e2e-osd.sh                # interactive: prompts for stack location
#   ./scripts/e2e-osd.sh --running      # skip teardown/rebuild, test against running stack
#   ./scripts/e2e-osd.sh --no-rebuild   # teardown + restart stack, skip plugin build
#
# Environment overrides (skip prompts):
#   OBSERVABILITY_STACK_DIR=/path/to/observability-stack ./scripts/e2e-osd.sh
# =============================================================================
set -euo pipefail

# --- Constants ---------------------------------------------------------------

ALERT_MANAGER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_OBS_REPO="https://github.com/lezzago/observability-stack.git"
DEFAULT_OBS_BRANCH="update-alerting"
MAX_WAIT=180

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

REBUILD=true
TEARDOWN=true
for arg in "$@"; do
  case $arg in
    --no-rebuild) REBUILD=false ;;
    --running)    TEARDOWN=false; REBUILD=false ;;
    --help|-h)
      echo "Usage: $0 [--running | --no-rebuild | --help]"
      echo ""
      echo "  (no flags)     Full run: teardown, rebuild plugin, clean stack, Cypress"
      echo "  --no-rebuild   Teardown + restart stack, skip plugin build"
      echo "  --running      Skip teardown, test against already-running stack"
      echo ""
      echo "Environment variables:"
      echo "  OBSERVABILITY_STACK_DIR   Path to observability-stack checkout"
      echo "  OBS_STACK_REPO            Git clone URL (default: $DEFAULT_OBS_REPO)"
      echo "  OBS_STACK_BRANCH          Git branch (default: $DEFAULT_OBS_BRANCH)"
      exit 0
      ;;
    *) warn "Unknown flag: $arg (ignored)" ;;
  esac
done

# --- Step 0: Preflight checks -----------------------------------------------

echo ""
echo -e "${BOLD}=== Alert Manager E2E (OSD Plugin Mode) ===${NC}"
echo ""

# 0a. Docker
info "Checking Docker..."
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed. Install from https://docs.docker.com/get-docker/"
fi
if ! docker info &>/dev/null; then
  fail "Docker daemon is not running. Please start Docker Desktop (or 'systemctl start docker') and try again."
fi
ok "Docker is running"

# 0b. Docker Compose
if docker compose version &>/dev/null; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  fail "Docker Compose not found. Install the Compose plugin: https://docs.docker.com/compose/install/"
fi
ok "Docker Compose available ($COMPOSE_CMD)"

# 0c. Node / npx / Cypress
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node 18+ from https://nodejs.org/"
fi
NODE_VERSION=$(node -v)
ok "Node.js $NODE_VERSION"

if [ ! -d "$ALERT_MANAGER_DIR/node_modules" ]; then
  fail "node_modules not found. Run 'npm install --legacy-peer-deps' in $ALERT_MANAGER_DIR first."
fi

# --- Step 1: Locate or clone the observability-stack -------------------------

info "Locating observability-stack..."

OBS_STACK_DIR="${OBSERVABILITY_STACK_DIR:-}"

if [ -z "$OBS_STACK_DIR" ]; then
  # Try common locations relative to alert-manager
  for candidate in \
    "$ALERT_MANAGER_DIR/../observability-stack" \
    "$HOME/Documents/workspace/observability-stack" \
    "$HOME/workspace/observability-stack" \
    "$HOME/observability-stack"; do
    if [ -f "$candidate/docker-compose.yml" ]; then
      OBS_STACK_DIR="$(cd "$candidate" && pwd)"
      break
    fi
  done
fi

if [ -n "$OBS_STACK_DIR" ] && [ -f "$OBS_STACK_DIR/docker-compose.yml" ]; then
  ok "Found observability-stack at: $OBS_STACK_DIR"
else
  echo ""
  echo -e "  ${YELLOW}The observability-stack repo was not found automatically.${NC}"
  echo ""
  echo "  Options:"
  echo "    1) Enter the path to your existing checkout"
  echo "    2) Clone it now (into $ALERT_MANAGER_DIR/../observability-stack)"
  echo ""
  printf "  Enter path or press Enter to clone: "
  read -r USER_PATH

  if [ -n "$USER_PATH" ]; then
    # User provided a path
    USER_PATH="${USER_PATH/#\~/$HOME}"  # expand tilde
    if [ ! -f "$USER_PATH/docker-compose.yml" ]; then
      fail "No docker-compose.yml found at $USER_PATH -- is this the right directory?"
    fi
    OBS_STACK_DIR="$(cd "$USER_PATH" && pwd)"
    ok "Using: $OBS_STACK_DIR"
  else
    # Clone the repo
    CLONE_REPO="${OBS_STACK_REPO:-$DEFAULT_OBS_REPO}"
    CLONE_BRANCH="${OBS_STACK_BRANCH:-$DEFAULT_OBS_BRANCH}"
    CLONE_DIR="$ALERT_MANAGER_DIR/../observability-stack"

    echo ""
    printf "  Git repo URL [${CLONE_REPO}]: "
    read -r INPUT_REPO
    CLONE_REPO="${INPUT_REPO:-$CLONE_REPO}"

    printf "  Branch [${CLONE_BRANCH}]: "
    read -r INPUT_BRANCH
    CLONE_BRANCH="${INPUT_BRANCH:-$CLONE_BRANCH}"

    info "Cloning $CLONE_REPO (branch: $CLONE_BRANCH)..."
    git clone --branch "$CLONE_BRANCH" --depth 1 "$CLONE_REPO" "$CLONE_DIR"
    OBS_STACK_DIR="$(cd "$CLONE_DIR" && pwd)"
    ok "Cloned to: $OBS_STACK_DIR"
  fi
fi

# --- Step 2: Verify observability-stack branch -------------------------------

if [ -d "$OBS_STACK_DIR/.git" ]; then
  OBS_BRANCH=$(cd "$OBS_STACK_DIR" && git branch --show-current 2>/dev/null || echo "unknown")
  OBS_REMOTE=$(cd "$OBS_STACK_DIR" && git remote get-url origin 2>/dev/null || echo "unknown")
  echo -e "    Branch: ${BOLD}$OBS_BRANCH${NC}  Remote: $OBS_REMOTE"

  if [ "$OBS_BRANCH" != "$DEFAULT_OBS_BRANCH" ]; then
    warn "Expected branch '$DEFAULT_OBS_BRANCH' but found '$OBS_BRANCH'."
    printf "  Continue anyway? [Y/n]: "
    read -r CONFIRM
    if [[ "$CONFIRM" =~ ^[Nn] ]]; then
      echo "  Aborting. Switch to '$DEFAULT_OBS_BRANCH' and re-run."
      exit 1
    fi
  fi
fi

# --- Step 3: Configure plugin zip path in .env ------------------------------

# plugin-helpers build produces build/alertManager-{version}.zip — use glob to find it
PLUGIN_ZIP=$(ls -1t "$ALERT_MANAGER_DIR"/build/alertManager-*.zip 2>/dev/null | head -1)
if [ -z "$PLUGIN_ZIP" ]; then
  # Fallback for legacy builds that produce alertManager.zip
  PLUGIN_ZIP="$ALERT_MANAGER_DIR/build/alertManager.zip"
fi

if [ -f "$OBS_STACK_DIR/.env" ]; then
  # Update the ALERT_MANAGER_PLUGIN_ZIP line to point at this checkout
  CURRENT_ZIP=$(grep '^ALERT_MANAGER_PLUGIN_ZIP=' "$OBS_STACK_DIR/.env" 2>/dev/null | cut -d= -f2-)
  if [ "$CURRENT_ZIP" != "$PLUGIN_ZIP" ]; then
    info "Updating ALERT_MANAGER_PLUGIN_ZIP in .env..."
    if grep -q '^ALERT_MANAGER_PLUGIN_ZIP=' "$OBS_STACK_DIR/.env"; then
      sed -i.bak "s|^ALERT_MANAGER_PLUGIN_ZIP=.*|ALERT_MANAGER_PLUGIN_ZIP=$PLUGIN_ZIP|" "$OBS_STACK_DIR/.env"
      rm -f "$OBS_STACK_DIR/.env.bak"
    else
      echo "ALERT_MANAGER_PLUGIN_ZIP=$PLUGIN_ZIP" >> "$OBS_STACK_DIR/.env"
    fi
    ok "Set ALERT_MANAGER_PLUGIN_ZIP=$PLUGIN_ZIP"
  fi
fi

# --- Step 4: Summary ---------------------------------------------------------

echo ""
echo -e "${BOLD}  Configuration:${NC}"
echo "    Alert Manager:        $ALERT_MANAGER_DIR"
echo "    Observability Stack:  $OBS_STACK_DIR"
echo "    Plugin ZIP:           $PLUGIN_ZIP"
echo "    Rebuild plugin:       $REBUILD"
echo "    Teardown stack:       $TEARDOWN"
echo ""

# --- Step 5: Teardown --------------------------------------------------------

if [ "$TEARDOWN" = true ]; then
  info "Tearing down observability stack (removing volumes for clean state)..."
  cd "$OBS_STACK_DIR"
  $COMPOSE_CMD down -v --remove-orphans 2>/dev/null || true
  ok "Stack torn down"
fi

# --- Step 6: Build plugin ----------------------------------------------------

if [ "$REBUILD" = true ]; then
  info "Building alert-manager plugin..."
  cd "$ALERT_MANAGER_DIR"
  ./build.sh
  # Re-resolve PLUGIN_ZIP after fresh build
  PLUGIN_ZIP=$(ls -1t "$ALERT_MANAGER_DIR"/build/alertManager-*.zip 2>/dev/null | head -1)
  if [ -z "$PLUGIN_ZIP" ]; then
    PLUGIN_ZIP="$ALERT_MANAGER_DIR/build/alertManager.zip"
  fi
  if [ ! -f "$PLUGIN_ZIP" ]; then
    fail "Build did not produce a zip in $ALERT_MANAGER_DIR/build/"
  fi
  ZIP_SIZE=$(du -h "$PLUGIN_ZIP" | cut -f1)
  ok "Built: $(basename "$PLUGIN_ZIP") ($ZIP_SIZE)"
fi

# Guard: ensure plugin zip exists regardless of --no-rebuild / --rebuild path
if [ ! -f "$PLUGIN_ZIP" ]; then
  fail "Plugin zip not found at $PLUGIN_ZIP. Run without --no-rebuild first, or run ./build.sh manually."
fi

# --- Step 7: Start stack -----------------------------------------------------

if [ "$TEARDOWN" = true ]; then
  info "Starting observability stack..."
  cd "$OBS_STACK_DIR"
  $COMPOSE_CMD up -d
  ok "Containers starting"
fi

# --- Step 8: Wait for OSD healthy --------------------------------------------

info "Waiting for OpenSearch Dashboards to become healthy (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  health=$(docker inspect --format='{{.State.Health.Status}}' opensearch-dashboards 2>/dev/null || echo "not_found")
  if [ "$health" = "healthy" ]; then
    ok "OSD healthy after ${elapsed}s"
    break
  fi
  if [ "$health" = "not_found" ]; then
    fail "Container 'opensearch-dashboards' not found. Is the stack running?"
  fi
  if [ $((elapsed % 15)) -eq 0 ]; then
    echo "    ${elapsed}s... (status: $health)"
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
if [ "$health" != "healthy" ]; then
  echo ""
  fail "OSD did not become healthy within ${MAX_WAIT}s. Last 30 lines of logs:"
  docker logs opensearch-dashboards 2>&1 | tail -30
  exit 1
fi

# --- Step 9: Wait for workspace init -----------------------------------------
# The opensearch-dashboards-init container creates the OKTIMo workspace,
# index patterns, and saved queries. OSD reports "healthy" before init finishes,
# so we must wait for the init container to exit successfully.

if [ "$TEARDOWN" = true ]; then
  info "Waiting for workspace initialization (OKTIMo workspace, index patterns)..."
  elapsed=0
  INIT_MAX=180
  init_status="unknown"
  while [ $elapsed -lt $INIT_MAX ]; do
    init_status=$(docker inspect --format='{{.State.Status}}' opensearch-dashboards-init 2>/dev/null || echo "not_found")
    if [ "$init_status" = "exited" ]; then
      init_exit=$(docker inspect --format='{{.State.ExitCode}}' opensearch-dashboards-init 2>/dev/null || echo "1")
      if [ "$init_exit" = "0" ]; then
        ok "Workspace init completed after ${elapsed}s"
        break
      else
        warn "Init container exited with code $init_exit"
        docker logs opensearch-dashboards-init 2>&1 | tail -15
        fail "Workspace initialization failed"
      fi
    fi
    if [ "$init_status" = "not_found" ]; then
      warn "opensearch-dashboards-init container not found -- skipping init wait"
      break
    fi
    if [ $((elapsed % 15)) -eq 0 ]; then
      echo "    ${elapsed}s... (init status: $init_status)"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  if [ "$init_status" = "running" ]; then
    fail "Workspace init did not complete within ${INIT_MAX}s"
  fi

  # Give OSD time to register the new workspace and clear stale cache.
  # OSD's workspace plugin needs extra time on a fresh stack to fully initialize
  # its internal caches. Without this, the first browser visit hits "Failed to fetch".
  sleep 15
fi

# --- Step 10: Detect workspace ID --------------------------------------------
# The observability-stack init creates a workspace with a random ID.
# Cypress needs this ID to build the correct URL path.

info "Detecting OSD workspace ID..."

# Login and query the workspaces API
LOGIN_JSON='{"username":"admin","password":"My_password_123!@#"}'
printf '%s' "$LOGIN_JSON" > /tmp/e2e-osd-login.json

curl -sf -c /tmp/e2e-osd-cookies \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d @/tmp/e2e-osd-login.json \
  'http://localhost:5601/auth/login' > /dev/null 2>&1 || fail "Could not login to OSD"

WORKSPACE_ID=$(curl -sf -b /tmp/e2e-osd-cookies \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d '{"perPage":100}' \
  'http://localhost:5601/api/workspaces/_list' 2>/dev/null \
  | python3 -c "import sys,json; ws=json.load(sys.stdin)['result']['workspaces']; print(ws[0]['id'] if ws else '')" 2>/dev/null || echo "")

if [ -z "$WORKSPACE_ID" ]; then
  rm -f /tmp/e2e-osd-login.json /tmp/e2e-osd-cookies
  fail "Could not detect workspace ID. Is the observability stack fully initialized?"
fi
ok "Workspace ID: $WORKSPACE_ID"

export CYPRESS_OSD_WORKSPACE_ID="$WORKSPACE_ID"

# --- Step 11: Seed SLO test data ---------------------------------------------
# On a clean stack there are no SLOs. Create 2 via the plugin API so that
# table/row/filter tests have data to work with. Idempotent — skips if SLOs exist.

info "Seeding SLO test data..."

SLO_API="http://localhost:5601/w/${WORKSPACE_ID}/api/alerting/slos"

SLO_COUNT=$(curl -sf -b /tmp/e2e-osd-cookies -H 'osd-xsrf: osd-fetch' \
  "$SLO_API" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('slos', d.get('data', []))))" 2>/dev/null || echo "0")

if [ "$SLO_COUNT" -gt 0 ] 2>/dev/null; then
  ok "SLOs already exist ($SLO_COUNT found) -- skipping seed"
else
  # Seed two SLOs via API
  cat > /tmp/e2e-slo-1.json << 'SLOJSON'
{"name":"Cypress Availability SLO","datasourceId":"ds-2","sli":{"type":"availability","calcMethod":"good_requests","sourceType":"service_operation","metric":"http_requests_total","goodEventsFilter":"status_code!~\"5..\"","service":{"labelName":"service","labelValue":"frontend"},"operation":{"labelName":"endpoint","labelValue":"/api/health"}},"target":0.999,"budgetWarningThreshold":0.3,"window":{"type":"rolling","duration":"7d"},"burnRates":[{"shortWindow":"5m","longWindow":"1h","burnRateMultiplier":14.4,"severity":"critical","createAlarm":true,"forDuration":"2m"},{"shortWindow":"30m","longWindow":"6h","burnRateMultiplier":6,"severity":"warning","createAlarm":true,"forDuration":"5m"}],"alarms":{"sliHealth":{"enabled":true},"attainmentBreach":{"enabled":true},"budgetWarning":{"enabled":true}},"exclusionWindows":[],"tags":{"team":"cypress","env":"test"}}
SLOJSON

  cat > /tmp/e2e-slo-2.json << 'SLOJSON'
{"name":"Cypress Latency p99 SLO","datasourceId":"ds-2","sli":{"type":"latency_p99","calcMethod":"good_requests","sourceType":"service_operation","metric":"http_request_duration_seconds_bucket","latencyThreshold":0.5,"service":{"labelName":"service","labelValue":"checkout"},"operation":{"labelName":"endpoint","labelValue":"/api/checkout"}},"target":0.995,"budgetWarningThreshold":0.3,"window":{"type":"rolling","duration":"30d"},"burnRates":[{"shortWindow":"5m","longWindow":"1h","burnRateMultiplier":14.4,"severity":"critical","createAlarm":true,"forDuration":"2m"}],"alarms":{"sliHealth":{"enabled":false},"attainmentBreach":{"enabled":true},"budgetWarning":{"enabled":false}},"exclusionWindows":[],"tags":{"team":"cypress"}}
SLOJSON

  for slo_file in /tmp/e2e-slo-1.json /tmp/e2e-slo-2.json; do
    slo_name=$(python3 -c "import sys,json; print(json.load(open('$slo_file'))['name'])")
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
      -b /tmp/e2e-osd-cookies \
      -H 'osd-xsrf: osd-fetch' \
      -H 'Content-Type: application/json' \
      -d @"$slo_file" \
      "$SLO_API" 2>/dev/null || echo "000")
    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
      ok "Created: $slo_name"
    else
      warn "Failed to create $slo_name (HTTP $http_code)"
    fi
  done
  rm -f /tmp/e2e-slo-1.json /tmp/e2e-slo-2.json
fi

# --- Step 12: Seed alert test data --------------------------------------------
# Create an OpenSearch always-fire monitor + a Prometheus always-fire rule
# so that alert table tests have data even on a fresh stack where the OTel demo
# hasn't generated errors yet. Idempotent — skips if Cypress monitors already exist.

OS_URL="https://localhost:9200"
OS_AUTH="admin:My_password_123%21%40%23"
DQ_NAME="ObservabilityStack_Prometheus"

info "Seeding alert test data..."

# 12a. OpenSearch alerting monitor (always-true condition, fires in 1 min)
OS_MONITOR_EXISTS=$(curl -sk "${OS_URL}/_plugins/_alerting/monitors/_search" \
  -u "admin:My_password_123!@#" \
  -H 'Content-Type: application/json' \
  -d '{"size":100,"_source":["monitor.name"]}' 2>/dev/null \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
names=[h['_source'].get('name','') for h in d.get('hits',{}).get('hits',[])]
print('yes' if 'Cypress E2E Always-Fire Monitor' in names else 'no')
" 2>/dev/null || echo "no")

if [ "$OS_MONITOR_EXISTS" = "yes" ]; then
  ok "OpenSearch monitor already exists -- skipping"
else
  cat > /tmp/e2e-os-monitor.json << 'MEOF'
{
  "type": "monitor",
  "name": "Cypress E2E Always-Fire Monitor",
  "monitor_type": "query_level_monitor",
  "enabled": true,
  "schedule": {"period": {"interval": 1, "unit": "MINUTES"}},
  "inputs": [{"search": {"indices": ["*"], "query": {"size": 0, "query": {"match_all": {}}}}}],
  "triggers": [{
    "name": "Always fire (cypress)",
    "severity": "3",
    "condition": {"script": {"source": "return true", "lang": "painless"}},
    "actions": []
  }]
}
MEOF
  http_code=$(curl -sk -o /dev/null -w "%{http_code}" \
    -u "admin:My_password_123!@#" \
    -X POST "${OS_URL}/_plugins/_alerting/monitors" \
    -H 'Content-Type: application/json' \
    -d @/tmp/e2e-os-monitor.json 2>/dev/null || echo "000")
  rm -f /tmp/e2e-os-monitor.json
  if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    ok "Created OpenSearch always-fire monitor"
  else
    warn "Failed to create OpenSearch monitor (HTTP $http_code)"
  fi
fi

# 12b. Prometheus/Cortex always-fire alerting rule (fires instantly, for: 0s)
PROM_RULE_EXISTS=$(curl -sk \
  -u "admin:My_password_123!@#" \
  "${OS_URL}/_plugins/_directquery/_resources/${DQ_NAME}/api/v1/rules" 2>/dev/null \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
groups = d.get('data',d).get('groups',[]) if isinstance(d.get('data',d), dict) else []
print('yes' if any(g['name']=='cypress_always_firing' for g in groups) else 'no')
" 2>/dev/null || echo "no")

if [ "$PROM_RULE_EXISTS" = "yes" ]; then
  ok "Prometheus rule already exists -- skipping"
else
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST 'http://localhost:9090/api/v1/rules/cypress_e2e' \
    -H 'Content-Type: application/yaml' \
    -d 'name: cypress_always_firing
interval: 15s
rules:
  - alert: CypressAlwaysFiring
    expr: vector(1)
    for: 0s
    labels:
      severity: warning
      team: cypress
    annotations:
      summary: Cypress E2E test alert always fires
  - alert: CypressCriticalAlert
    expr: vector(1)
    for: 0s
    labels:
      severity: critical
      team: cypress
    annotations:
      summary: Cypress E2E critical test alert
' 2>/dev/null || echo "000")
  if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
    ok "Created Prometheus always-fire rules (2 alerts)"
  else
    warn "Failed to create Prometheus rules (HTTP $http_code)"
  fi
fi

# 12c. Wait for alerts to fire (OS monitor runs every 1 min, Prom rule every 15s)
info "Waiting for seeded alerts to fire (up to 75s)..."
elapsed=0
while [ $elapsed -lt 75 ]; do
  alert_count=$(curl -sk \
    -u "admin:My_password_123!@#" \
    "${OS_URL}/_plugins/_alerting/monitors/alerts?size=1" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalAlerts',0))" 2>/dev/null || echo "0")
  if [ "$alert_count" -gt 0 ] 2>/dev/null; then
    ok "OpenSearch alerts active ($alert_count found) after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

rm -f /tmp/e2e-osd-login.json /tmp/e2e-osd-cookies

# --- Step 13: Warm up OSD plugin page ----------------------------------------
# Hit the Alert Manager plugin URL via curl to trigger OSD's optimizer to compile
# and cache the plugin bundle. On slow machines this prevents Cypress from timing
# out waiting for the first page load.

info "Warming up Alert Manager plugin page..."

# Re-login for warm-up requests
LOGIN_JSON='{"username":"admin","password":"My_password_123!@#"}'
printf '%s' "$LOGIN_JSON" > /tmp/e2e-osd-login.json
curl -sf -c /tmp/e2e-osd-cookies \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d @/tmp/e2e-osd-login.json \
  'http://localhost:5601/auth/login' > /dev/null 2>&1

# Verify plugin API responds (confirms plugin is installed and loaded)
API_URL="http://localhost:5601/w/${WORKSPACE_ID}/api/alerting/datasources"
elapsed=0
while [ $elapsed -lt 60 ]; do
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/e2e-osd-cookies \
    -H 'osd-xsrf: osd-fetch' "$API_URL" 2>/dev/null || echo "000")
  if [ "$http_code" = "200" ]; then
    ok "Plugin API responding after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

# Hit the plugin page to warm up OSD's bundle cache
curl -s -b /tmp/e2e-osd-cookies \
  "http://localhost:5601/w/${WORKSPACE_ID}/app/alertManager/" > /dev/null 2>&1
sleep 5

rm -f /tmp/e2e-osd-login.json /tmp/e2e-osd-cookies

# --- Step 14: Run Cypress ----------------------------------------------------

info "Running Cypress E2E tests (OSD mode)..."
cd "$ALERT_MANAGER_DIR"
rm -rf cypress/screenshots

CYPRESS_BASE_URL=http://localhost:5601 CYPRESS_MODE=osd npx cypress run --browser chrome

echo ""
echo -e "${GREEN}${BOLD}=== All OSD E2E tests passed ===${NC}"
echo ""
echo "  To re-run quickly without teardown:  $0 --running"
echo "  To teardown everything:              cd $OBS_STACK_DIR && $COMPOSE_CMD down -v"
echo ""
