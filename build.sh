#!/bin/bash
# Build the Alert Manager OSD plugin artifact
# Produces build/alertManager-{version}.zip ready for: opensearch-dashboards-plugin install
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd -P)"
OSD_ROOT="$(cd "$PLUGIN_DIR/../.." && pwd -P)"

echo "=== Building Alert Manager OSD Plugin ==="

if [ ! -f "$OSD_ROOT/package.json" ] || ! grep -q '"name": "opensearch-dashboards"' "$OSD_ROOT/package.json"; then
  echo "ERROR: Plugin must be at <OSD_ROOT>/plugins/alertManager/"
  exit 1
fi

cd "$PLUGIN_DIR"

# Clean stale build artifacts to prevent accumulation of versioned zips
rm -rf build/

OSD_VERSION=$(node -p "require('$OSD_ROOT/package.json').version")
yarn plugin-helpers build --opensearch-dashboards-version "$OSD_VERSION"

echo ""
echo "=== Build complete ==="
ls -lh build/*.zip 2>/dev/null || echo "WARNING: No zip produced"
