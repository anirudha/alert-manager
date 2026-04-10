#!/bin/bash
# =============================================================================
# Custom OSD entrypoint for CI E2E testing
#
# Strips non-essential OSD plugins to dramatically speed up bundle loading,
# installs the alertManager plugin, applies config, and starts OSD.
#
# Uses an allowlist approach: only plugins in KEEP_PLUGINS survive.
# This ensures new plugins added in future OSD versions are auto-stripped.
# =============================================================================
set -e

PLUGINS_DIR="/usr/share/opensearch-dashboards/plugins"
OSD_CONFIG="/usr/share/opensearch-dashboards/config/opensearch_dashboards.yml"

# Only keep securityDashboards (authentication) -- everything else is unnecessary
# for Alert Manager E2E testing and slows down OSD bundle loading.
KEEP_PLUGINS="securityDashboards"

echo "=== OSD CI Entrypoint: Stripping non-essential plugins ==="

for plugin_dir in "$PLUGINS_DIR"/*/; do
  plugin_name=$(basename "$plugin_dir")

  # Skip the allowlist
  if echo "$KEEP_PLUGINS" | grep -qw "$plugin_name"; then
    echo "  KEEP: $plugin_name"
    continue
  fi

  # Skip alertManager if already installed (e.g., from a previous run)
  if [ "$plugin_name" = "alertManager" ]; then
    echo "  KEEP: $plugin_name (target plugin)"
    continue
  fi

  echo "  REMOVE: $plugin_name"
  rm -rf "$plugin_dir"
done

# Install alertManager plugin from the bind-mounted ZIP
if [ -f /tmp/alertManager.zip ] && [ ! -d "$PLUGINS_DIR/alertManager" ]; then
  echo ""
  echo "=== Installing Alert Manager plugin ==="
  /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install \
    file:///tmp/alertManager.zip --single-version ignore
fi

# Apply custom config
if [ -f /tmp/opensearch_dashboards.yml ]; then
  echo ""
  echo "=== Applying custom OSD config ==="
  cp /tmp/opensearch_dashboards.yml "$OSD_CONFIG"
fi

# Register Prometheus datasource in OpenSearch SQL plugin BEFORE OSD starts.
# The alertManager plugin auto-discovers datasources during startup by querying
# /_plugins/_query/_datasources. Registration must happen before OSD starts so
# the plugin finds it on first boot.
echo ""
echo "=== Pre-registering Prometheus datasource in OpenSearch ==="
DS_PAYLOAD='{"name":"ObservabilityStack_Prometheus","allowedRoles":[],"connector":"prometheus","properties":{"prometheus.uri":"http://cortex:9090/prometheus"}}'
ds_code=$(curl -sk -o /dev/null -w "%{http_code}" \
  -u "admin:My_password_123!@#" \
  -X POST "https://opensearch:9200/_plugins/_query/_datasources" \
  -H "Content-Type: application/json" \
  -d "$DS_PAYLOAD" 2>/dev/null || echo "000")
echo "  Datasource registration: HTTP $ds_code"

echo ""
echo "=== Starting OpenSearch Dashboards ==="
exec /usr/share/opensearch-dashboards/opensearch-dashboards-docker-entrypoint.sh opensearch-dashboards
