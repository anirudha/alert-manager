#!/bin/sh
# =============================================================================
# OSD initialization for CI E2E testing
#
# Runs inside an Alpine container with curl and jq.
# Creates workspace, registers Prometheus datasource, seeds test data.
#
# Outputs WORKSPACE_ID=<id> to stdout for the CI script to capture.
# =============================================================================
set -e

OSD_URL="http://opensearch-dashboards:5601"
OS_URL="https://opensearch:9200"
CORTEX_URL="http://cortex:9090"
AUTH="admin:My_password_123!@#"
HEADERS='-H "osd-xsrf: osd-fetch" -H "Content-Type: application/json"'
COOKIES="/tmp/cookies"
MAX_WAIT=300

info()  { echo ">>> $*"; }
ok()    { echo "    OK $*"; }
warn()  { echo "    WARN $*"; }
fail()  { echo "    ERROR: $*" >&2; exit 1; }

# =============================================================================
# Phase 1: Wait for OpenSearch
# =============================================================================

info "Waiting for OpenSearch to be healthy (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  health=$(curl -sk -u "$AUTH" "${OS_URL}/_cluster/health" 2>/dev/null \
    | jq -r '.status // empty' 2>/dev/null || echo "")
  if [ "$health" = "green" ] || [ "$health" = "yellow" ]; then
    ok "OpenSearch healthy ($health) after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
[ "$health" = "green" ] || [ "$health" = "yellow" ] || fail "OpenSearch not healthy after ${MAX_WAIT}s"

# =============================================================================
# Phase 2: Wait for OSD + Login
# =============================================================================

info "Waiting for OSD to be healthy (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  osd_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -u "$AUTH" "${OSD_URL}/api/status" 2>/dev/null || echo "000")
  if [ "$osd_code" = "200" ]; then
    ok "OSD healthy after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
[ "$osd_code" = "200" ] || fail "OSD not healthy after ${MAX_WAIT}s"

# Login to OSD
info "Logging in to OSD..."
curl -s -c "$COOKIES" \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"My_password_123!@#"}' \
  "${OSD_URL}/auth/login" > /dev/null 2>&1 || fail "Could not login to OSD"
ok "Logged in"

# =============================================================================
# Phase 3: Register Prometheus DirectQuery datasource via OSD API
# =============================================================================

info "Registering Prometheus DirectQuery datasource..."

# Use OSD's directquery API (not OpenSearch directly) so that OSD creates the
# corresponding data-connection saved object, which is needed for workspace association.
DS_PAYLOAD='{"name":"ObservabilityStack_Prometheus","allowedRoles":[],"connector":"prometheus","properties":{"prometheus.uri":"http://cortex:9090/prometheus"}}'

ds_code=$(curl -s -o /tmp/ds-response.json -w "%{http_code}" -b "$COOKIES" \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d "$DS_PAYLOAD" \
  "${OSD_URL}/api/directquery/dataconnections" 2>/dev/null || echo "000")

if [ "$ds_code" = "200" ] || [ "$ds_code" = "201" ]; then
  ok "Created Prometheus datasource"
elif [ "$ds_code" = "400" ]; then
  # Check if it's a duplicate error
  if grep -q "already exists" /tmp/ds-response.json 2>/dev/null; then
    ok "Prometheus datasource already exists"
  else
    warn "Datasource creation returned HTTP $ds_code"
    cat /tmp/ds-response.json 2>/dev/null || true
  fi
else
  warn "Datasource creation returned HTTP $ds_code"
  cat /tmp/ds-response.json 2>/dev/null || true
fi

# =============================================================================
# Phase 4: Create workspace
# =============================================================================

info "Creating E2E workspace..."

# Check if workspace already exists
WORKSPACE_ID=$(curl -s -b "$COOKIES" \
  -H 'osd-xsrf: osd-fetch' \
  -H 'Content-Type: application/json' \
  -d '{"perPage":100}' \
  "${OSD_URL}/api/workspaces/_list" 2>/dev/null \
  | jq -r '.result.workspaces[0].id // empty' 2>/dev/null || echo "")

if [ -n "$WORKSPACE_ID" ]; then
  ok "Workspace already exists: $WORKSPACE_ID"
else
  # Create new workspace
  WS_RESPONSE=$(curl -s -b "$COOKIES" \
    -H 'osd-xsrf: osd-fetch' \
    -H 'Content-Type: application/json' \
    -d '{"attributes":{"name":"E2E Test Workspace","description":"CI E2E testing workspace","features":["use-case-all"]}}' \
    "${OSD_URL}/api/workspaces" 2>/dev/null)

  WORKSPACE_ID=$(echo "$WS_RESPONSE" | jq -r '.result.id // empty' 2>/dev/null || echo "")

  if [ -z "$WORKSPACE_ID" ]; then
    echo "Workspace creation response: $WS_RESPONSE"
    fail "Could not create workspace"
  fi
  ok "Created workspace: $WORKSPACE_ID"
fi

# =============================================================================
# Phase 5: Associate Prometheus datasource with workspace (allow time for saved object creation)
# =============================================================================

info "Associating Prometheus datasource with workspace..."

# Wait for the data-connection saved object to appear (OSD creates it async after datasource registration)
DS_OBJ_ID=""
ds_elapsed=0
while [ $ds_elapsed -lt 30 ]; do
  DS_OBJ_ID=$(curl -s -b "$COOKIES" \
    -H 'osd-xsrf: osd-fetch' \
    "${OSD_URL}/api/saved_objects/_find?per_page=100&type=data-connection" 2>/dev/null \
    | jq -r '.saved_objects[] | select(.attributes.connectionId == "ObservabilityStack_Prometheus") | .id // empty' 2>/dev/null || echo "")
  if [ -n "$DS_OBJ_ID" ]; then
    break
  fi
  sleep 3
  ds_elapsed=$((ds_elapsed + 3))
done

if [ -n "$DS_OBJ_ID" ]; then
  assoc_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" \
    -H 'osd-xsrf: osd-fetch' \
    -H 'Content-Type: application/json' \
    -d "{\"workspaceId\":\"${WORKSPACE_ID}\",\"savedObjects\":[{\"type\":\"data-connection\",\"id\":\"${DS_OBJ_ID}\"}]}" \
    "${OSD_URL}/api/workspaces/_associate" 2>/dev/null || echo "000")
  if [ "$assoc_code" = "200" ]; then
    ok "Datasource associated with workspace"
  else
    warn "Datasource association returned HTTP $assoc_code (may already be associated)"
  fi
else
  warn "Could not find data-connection saved object -- datasource may not be visible in workspace"
fi

# =============================================================================
# Phase 6: Seed SLO test data
# =============================================================================

info "Seeding SLO test data..."
SLO_API="${OSD_URL}/w/${WORKSPACE_ID}/api/alerting/slos"

SLO_COUNT=$(curl -s -b "$COOKIES" -H 'osd-xsrf: osd-fetch' \
  "$SLO_API" 2>/dev/null \
  | jq '[.slos // .data // [] | length] | .[0]' 2>/dev/null || echo "0")

if [ "$SLO_COUNT" -gt 0 ] 2>/dev/null; then
  ok "SLOs already exist ($SLO_COUNT found) -- skipping"
else
  # SLO 1: Availability
  slo1_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" \
    -H 'osd-xsrf: osd-fetch' \
    -H 'Content-Type: application/json' \
    -d '{"name":"Cypress Availability SLO","datasourceId":"ds-2","sli":{"type":"availability","calcMethod":"good_requests","sourceType":"service_operation","metric":"http_requests_total","goodEventsFilter":"status_code!~\"5..\"","service":{"labelName":"service","labelValue":"frontend"},"operation":{"labelName":"endpoint","labelValue":"/api/health"}},"target":0.999,"budgetWarningThreshold":0.3,"window":{"type":"rolling","duration":"7d"},"burnRates":[{"shortWindow":"5m","longWindow":"1h","burnRateMultiplier":14.4,"severity":"critical","createAlarm":true,"forDuration":"2m"},{"shortWindow":"30m","longWindow":"6h","burnRateMultiplier":6,"severity":"warning","createAlarm":true,"forDuration":"5m"}],"alarms":{"sliHealth":{"enabled":true},"attainmentBreach":{"enabled":true},"budgetWarning":{"enabled":true}},"exclusionWindows":[],"tags":{"team":"cypress","env":"test"}}' \
    "$SLO_API" 2>/dev/null || echo "000")
  [ "$slo1_code" = "201" ] || [ "$slo1_code" = "200" ] && ok "Created: Cypress Availability SLO" || warn "SLO 1 returned HTTP $slo1_code"

  # SLO 2: Latency p99
  slo2_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" \
    -H 'osd-xsrf: osd-fetch' \
    -H 'Content-Type: application/json' \
    -d '{"name":"Cypress Latency p99 SLO","datasourceId":"ds-2","sli":{"type":"latency_p99","calcMethod":"good_requests","sourceType":"service_operation","metric":"http_request_duration_seconds_bucket","latencyThreshold":0.5,"service":{"labelName":"service","labelValue":"checkout"},"operation":{"labelName":"endpoint","labelValue":"/api/checkout"}},"target":0.995,"budgetWarningThreshold":0.3,"window":{"type":"rolling","duration":"30d"},"burnRates":[{"shortWindow":"5m","longWindow":"1h","burnRateMultiplier":14.4,"severity":"critical","createAlarm":true,"forDuration":"2m"}],"alarms":{"sliHealth":{"enabled":false},"attainmentBreach":{"enabled":true},"budgetWarning":{"enabled":false}},"exclusionWindows":[],"tags":{"team":"cypress"}}' \
    "$SLO_API" 2>/dev/null || echo "000")
  [ "$slo2_code" = "201" ] || [ "$slo2_code" = "200" ] && ok "Created: Cypress Latency p99 SLO" || warn "SLO 2 returned HTTP $slo2_code"
fi

# =============================================================================
# Phase 7: Seed OpenSearch always-fire monitor
# =============================================================================

info "Seeding OpenSearch alert test data..."

OS_MONITOR_EXISTS=$(curl -sk -u "$AUTH" \
  "${OS_URL}/_plugins/_alerting/monitors/_search" \
  -H 'Content-Type: application/json' \
  -d '{"size":100,"_source":["monitor.name"]}' 2>/dev/null \
  | jq -r '[.hits.hits[]._source.name // empty] | if any(. == "Cypress E2E Always-Fire Monitor") then "yes" else "no" end' 2>/dev/null || echo "no")

if [ "$OS_MONITOR_EXISTS" = "yes" ]; then
  ok "OpenSearch monitor already exists -- skipping"
else
  # Monitor 1: Always-fire (provides alert data)
  mon_code=$(curl -sk -o /dev/null -w "%{http_code}" \
    -u "$AUTH" \
    -X POST "${OS_URL}/_plugins/_alerting/monitors" \
    -H 'Content-Type: application/json' \
    -d '{
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
    }' 2>/dev/null || echo "000")
  [ "$mon_code" = "201" ] || [ "$mon_code" = "200" ] && ok "Created OpenSearch always-fire monitor" || warn "Monitor 1 returned HTTP $mon_code"

  # Monitor 2: Error Rate monitor (matches "Error" search filter in Cypress tests)
  mon2_code=$(curl -sk -o /dev/null -w "%{http_code}" \
    -u "$AUTH" \
    -X POST "${OS_URL}/_plugins/_alerting/monitors" \
    -H 'Content-Type: application/json' \
    -d '{
      "type": "monitor",
      "name": "High Error Rate",
      "monitor_type": "query_level_monitor",
      "enabled": true,
      "schedule": {"period": {"interval": 1, "unit": "MINUTES"}},
      "inputs": [{"search": {"indices": ["*"], "query": {"size": 0, "query": {"match_all": {}}}}}],
      "triggers": [{
        "name": "Error rate high (cypress)",
        "severity": "2",
        "condition": {"script": {"source": "return true", "lang": "painless"}},
        "actions": []
      }]
    }' 2>/dev/null || echo "000")
  [ "$mon2_code" = "201" ] || [ "$mon2_code" = "200" ] && ok "Created High Error Rate monitor" || warn "Monitor 2 returned HTTP $mon2_code"
fi

# =============================================================================
# Phase 8: Seed Prometheus always-fire rules via Cortex Ruler API
# =============================================================================

info "Seeding Prometheus alert rules..."

prom_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${CORTEX_URL}/api/v1/rules/cypress_e2e" \
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
[ "$prom_code" = "202" ] || [ "$prom_code" = "200" ] && ok "Created Prometheus always-fire rules" || warn "Prometheus rules returned HTTP $prom_code"

# =============================================================================
# Phase 9: Wait for alerts to fire
# =============================================================================

info "Waiting for seeded alerts to fire (up to 75s)..."
elapsed=0
while [ $elapsed -lt 75 ]; do
  alert_count=$(curl -sk -u "$AUTH" \
    "${OS_URL}/_plugins/_alerting/monitors/alerts?size=1" 2>/dev/null \
    | jq '.totalAlerts // 0' 2>/dev/null || echo "0")
  if [ "$alert_count" -gt 0 ] 2>/dev/null; then
    ok "OpenSearch alerts active ($alert_count found) after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

# =============================================================================
# Output workspace ID for CI script to capture
# =============================================================================

echo ""
echo "=== Initialization complete ==="
echo "WORKSPACE_ID=${WORKSPACE_ID}"
