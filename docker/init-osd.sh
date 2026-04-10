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
# Phase 7: Seed Prometheus recording rules for synthetic metrics
# =============================================================================
# Recording rules generate queryable time-series data inside Cortex so that
# the metadata APIs (metric names, labels, label values) and range queries
# return data. This enables SLO wizard autocomplete and chart rendering.

info "Seeding Cortex recording rules for synthetic metrics..."

prom_metrics_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${CORTEX_URL}/api/v1/rules/synthetic_metrics" \
  -H 'Content-Type: application/yaml' \
  -d 'name: synthetic_http_metrics
interval: 15s
rules:
  # HTTP request counters (used by SLO availability wizard)
  - record: http_requests_total
    expr: vector(12345)
    labels:
      service: frontend
      endpoint: /api/health
      status_code: "200"
      method: GET
  - record: http_requests_total
    expr: vector(23)
    labels:
      service: frontend
      endpoint: /api/health
      status_code: "500"
      method: GET
  - record: http_requests_total
    expr: vector(8901)
    labels:
      service: checkout
      endpoint: /api/checkout
      status_code: "200"
      method: POST
  # HTTP latency histogram buckets (used by SLO latency p99 wizard)
  - record: http_request_duration_seconds_bucket
    expr: vector(950)
    labels:
      service: checkout
      endpoint: /api/checkout
      le: "0.1"
  - record: http_request_duration_seconds_bucket
    expr: vector(990)
    labels:
      service: checkout
      endpoint: /api/checkout
      le: "0.5"
  - record: http_request_duration_seconds_bucket
    expr: vector(998)
    labels:
      service: checkout
      endpoint: /api/checkout
      le: "1.0"
  - record: http_request_duration_seconds_bucket
    expr: vector(1000)
    labels:
      service: checkout
      endpoint: /api/checkout
      le: "+Inf"
  # gRPC counters (used by SLO gRPC availability template)
  - record: grpc_server_handled_total
    expr: vector(5678)
    labels:
      grpc_service: payment.PaymentService
      grpc_method: ProcessPayment
      grpc_code: OK
  - record: grpc_server_handled_total
    expr: vector(12)
    labels:
      grpc_service: payment.PaymentService
      grpc_method: ProcessPayment
      grpc_code: Internal
  # Node metrics (common infrastructure metrics for autocomplete)
  - record: node_cpu_seconds_total
    expr: vector(86400)
    labels:
      instance: node-1
      mode: idle
  - record: node_memory_MemAvailable_bytes
    expr: vector(4294967296)
    labels:
      instance: node-1
  - record: up
    expr: vector(1)
    labels:
      job: prometheus
      instance: cortex:9090
' 2>/dev/null || echo "000")
[ "$prom_metrics_code" = "202" ] || [ "$prom_metrics_code" = "200" ] && ok "Created synthetic metric recording rules" || warn "Recording rules returned HTTP $prom_metrics_code"

# =============================================================================
# Phase 8: Seed Prometheus alerting rules + OpenSearch monitors
# =============================================================================

info "Seeding Prometheus alerting rules..."

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
      service: frontend
    annotations:
      summary: Cypress E2E test alert always fires
  - alert: CypressCriticalAlert
    expr: vector(1)
    for: 0s
    labels:
      severity: critical
      team: cypress
      service: checkout
    annotations:
      summary: Cypress E2E critical test alert
  - alert: HighErrorRate
    expr: vector(1)
    for: 0s
    labels:
      severity: warning
      team: platform
      service: frontend
    annotations:
      summary: Error rate above 5%
' 2>/dev/null || echo "000")
[ "$prom_code" = "202" ] || [ "$prom_code" = "200" ] && ok "Created Prometheus alerting rules (3 alerts)" || warn "Alerting rules returned HTTP $prom_code"

info "Seeding OpenSearch monitors..."

# Helper: create monitor and return its ID
create_monitor() {
  local name="$1" severity="$2"
  local response
  response=$(curl -sk \
    -u "$AUTH" \
    -X POST "${OS_URL}/_plugins/_alerting/monitors" \
    -H 'Content-Type: application/json' \
    -d "{
      \"type\": \"monitor\",
      \"name\": \"${name}\",
      \"monitor_type\": \"query_level_monitor\",
      \"enabled\": true,
      \"schedule\": {\"period\": {\"interval\": 1, \"unit\": \"MINUTES\"}},
      \"inputs\": [{\"search\": {\"indices\": [\"*\"], \"query\": {\"size\": 0, \"query\": {\"match_all\": {}}}}}],
      \"triggers\": [{
        \"name\": \"${name} trigger\",
        \"severity\": \"${severity}\",
        \"condition\": {\"script\": {\"source\": \"return true\", \"lang\": \"painless\"}},
        \"actions\": []
      }]
    }" 2>/dev/null)
  echo "$response" | jq -r '._id // empty' 2>/dev/null
}

OS_MONITOR_EXISTS=$(curl -sk -u "$AUTH" \
  "${OS_URL}/_plugins/_alerting/monitors/_search" \
  -H 'Content-Type: application/json' \
  -d '{"size":100,"_source":["monitor.name"]}' 2>/dev/null \
  | jq -r '[.hits.hits[]._source.name // empty] | if any(. == "Cypress E2E Always-Fire Monitor") then "yes" else "no" end' 2>/dev/null || echo "no")

MONITOR_IDS=""
if [ "$OS_MONITOR_EXISTS" = "yes" ]; then
  ok "OpenSearch monitors already exist -- skipping creation"
  # Collect existing monitor IDs for execution
  MONITOR_IDS=$(curl -sk -u "$AUTH" \
    "${OS_URL}/_plugins/_alerting/monitors/_search" \
    -H 'Content-Type: application/json' \
    -d '{"size":100,"_source":["monitor.name"]}' 2>/dev/null \
    | jq -r '.hits.hits[]._id' 2>/dev/null)
else
  id1=$(create_monitor "Cypress E2E Always-Fire Monitor" "3")
  [ -n "$id1" ] && ok "Created: Cypress E2E Always-Fire Monitor ($id1)" || warn "Failed to create monitor 1"

  id2=$(create_monitor "High Error Rate" "2")
  [ -n "$id2" ] && ok "Created: High Error Rate ($id2)" || warn "Failed to create monitor 2"

  MONITOR_IDS="$id1
$id2"
fi

# =============================================================================
# Phase 9: Execute monitors immediately to fire alerts
# =============================================================================
# Instead of waiting 60-75s for the scheduled interval, use the _execute API
# to trigger each monitor immediately. This fires alerts in seconds.

info "Executing monitors to fire alerts immediately..."

for mon_id in $MONITOR_IDS; do
  [ -z "$mon_id" ] && continue
  exec_code=$(curl -sk -o /dev/null -w "%{http_code}" \
    -u "$AUTH" \
    -X POST "${OS_URL}/_plugins/_alerting/monitors/${mon_id}/_execute" \
    -H 'Content-Type: application/json' \
    -d '{"dryrun": false}' 2>/dev/null || echo "000")
  if [ "$exec_code" = "200" ]; then
    ok "Executed monitor $mon_id"
  else
    warn "Monitor execute returned HTTP $exec_code for $mon_id"
  fi
done

# Brief pause for alert state to persist, then verify
sleep 3

# =============================================================================
# Phase 10: Verify alerts from both datasources
# =============================================================================

info "Verifying alerts..."

# Verify OpenSearch alerts
os_alert_count=$(curl -sk -u "$AUTH" \
  "${OS_URL}/_plugins/_alerting/monitors/alerts?size=1" 2>/dev/null \
  | jq '.totalAlerts // 0' 2>/dev/null || echo "0")
[ "$os_alert_count" -gt 0 ] 2>/dev/null && ok "OpenSearch alerts: $os_alert_count active" || warn "No OpenSearch alerts found"

# Verify Prometheus rules are firing (via Cortex API directly)
prom_firing=$(curl -s "${CORTEX_URL}/prometheus/api/v1/alerts" 2>/dev/null \
  | jq '[.data.alerts[] | select(.state=="firing")] | length' 2>/dev/null || echo "0")
[ "$prom_firing" -gt 0 ] 2>/dev/null && ok "Prometheus alerts: $prom_firing firing" || warn "No Prometheus alerts firing yet (Cortex ruler may need ~15s)"

# Verify synthetic metrics are queryable
metric_count=$(curl -s "${CORTEX_URL}/prometheus/api/v1/label/__name__/values" 2>/dev/null \
  | jq '[.data[] | select(startswith("http_") or startswith("grpc_") or startswith("node_"))] | length' 2>/dev/null || echo "0")
[ "$metric_count" -gt 0 ] 2>/dev/null && ok "Prometheus metrics: $metric_count synthetic metrics available" || warn "Synthetic metrics not yet available (recording rules may need ~15s)"

# =============================================================================
# Output workspace ID for CI script to capture
# =============================================================================

echo ""
echo "=== Initialization complete ==="
echo "WORKSPACE_ID=${WORKSPACE_ID}"
