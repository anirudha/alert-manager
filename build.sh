#!/bin/bash
# Build the Alert Manager OSD plugin artifact
# Produces build/alertManager.zip ready for: opensearch-dashboards-plugin install
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PLUGIN_DIR/build"
STAGE_DIR="$BUILD_DIR/alertManager"
STUBS_DIR="$PLUGIN_DIR/stubs"

echo "=== Building Alert Manager OSD Plugin ==="
echo "Source: $PLUGIN_DIR"
echo "Output: $BUILD_DIR/alertManager.zip"

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$STAGE_DIR"

# 1. Copy manifest and package files
cp "$PLUGIN_DIR/opensearch_dashboards.json" "$STAGE_DIR/"

cat > "$STAGE_DIR/package.json" << 'EOF'
{
  "name": "alert-manager",
  "version": "1.0.0",
  "main": "target/public/alertManager.plugin.js",
  "opensearchDashboards": {
    "version": "3.6.0",
    "templateVersion": "1.0.0"
  }
}
EOF

# 2. Create temporary stubs at the exact paths where server imports resolve
#    server/plugin.ts: '../../../src/core/server' -> $PLUGIN_DIR/server/../../../src/core/server
#    Which equals $PLUGIN_DIR/../../src/core/server
OSD_STUB_DIR="$(cd "$PLUGIN_DIR/../.." && pwd)/src/core/server"
if [ ! -d "$OSD_STUB_DIR" ]; then
  OSD_STUB_CREATED=true
else
  OSD_STUB_CREATED=false
fi
# Always copy latest stubs (a previous build may have left a stale version)
mkdir -p "$OSD_STUB_DIR"
cp "$STUBS_DIR/src/core/server/index.d.ts" "$OSD_STUB_DIR/"

# 3. Compile server-side TypeScript (core/ + server/ + common/)
echo "Compiling server-side TypeScript..."

cat > "$BUILD_DIR/tsconfig.server.json" << TSCONF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "types": ["node"],
    "outDir": "$STAGE_DIR",
    "rootDir": "$PLUGIN_DIR",
    "strict": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "declaration": false,
    "sourceMap": false,
    "ignoreDeprecations": "6.0",
    "baseUrl": "$PLUGIN_DIR",
    "paths": {
      "../../../../src/core/server": ["$STUBS_DIR/src/core/server"],
      "../../../src/core/server": ["$STUBS_DIR/src/core/server"],
      "@osd/config-schema": ["$STUBS_DIR/@osd/config-schema"]
    }
  },
  "include": [
    "$PLUGIN_DIR/core/**/*.ts",
    "$PLUGIN_DIR/server/**/*.ts",
    "$PLUGIN_DIR/common/**/*.ts"
  ],
  "exclude": [
    "$PLUGIN_DIR/core/__tests__/**",
    "$PLUGIN_DIR/server/**/__tests__/**",
    "$PLUGIN_DIR/**/*.test.ts",
    "$PLUGIN_DIR/core/testing.ts",
    "$PLUGIN_DIR/core/mock_backend.ts"
  ]
}
TSCONF

# Strip ignoreDeprecations if TS < 5 (option added in TS 5.0)
TS_MAJOR=$(node -e "console.log(require('typescript').version.split('.')[0])")
if [ "$TS_MAJOR" -lt 5 ] 2>/dev/null; then
  sed -i.bak '/"ignoreDeprecations"/d' "$BUILD_DIR/tsconfig.server.json"
  rm -f "$BUILD_DIR/tsconfig.server.json.bak"
fi

npx tsc --project "$BUILD_DIR/tsconfig.server.json" 2>&1 || {
  echo "Server compilation failed, trying with skipLibCheck..."
  npx tsc --project "$BUILD_DIR/tsconfig.server.json" --skipLibCheck 2>&1 || exit 1
}

# 4. Build client bundle via webpack
#    IMPORTANT: Uses mode 'none' (no production optimizations) to prevent
#    tree-shaking and minification from breaking module resolution at runtime.
#    Production mode's tree-shaking was silently eliminating tab definitions
#    and component imports, causing only 3 of 5 tabs to render and ECharts
#    to fail to load.
echo "Building client bundle via webpack..."
mkdir -p "$STAGE_DIR/target/public"

npx webpack --config "$PLUGIN_DIR/webpack.osd.config.js" \
  --output-path "$STAGE_DIR/target/public" 2>&1

if [ ! -f "$STAGE_DIR/target/public/alertManager.plugin.js" ]; then
  echo "ERROR: Webpack build failed — alertManager.plugin.js not produced"
  exit 1
fi

BUNDLE_SIZE=$(du -h "$STAGE_DIR/target/public/alertManager.plugin.js" | cut -f1)
echo "  Bundle ready: target/public/alertManager.plugin.js ($BUNDLE_SIZE)"

# 5. Create the zip with OSD-required structure:
#    opensearch-dashboards/alertManager/opensearch_dashboards.json
echo "Creating plugin zip..."
mkdir -p "$BUILD_DIR/opensearch-dashboards"
mv "$STAGE_DIR" "$BUILD_DIR/opensearch-dashboards/alertManager"
cd "$BUILD_DIR"
zip -r alertManager.zip opensearch-dashboards/ -x "opensearch-dashboards/alertManager/node_modules/*" "opensearch-dashboards/alertManager/__tests__/*"
# Move back for local inspection
mv "$BUILD_DIR/opensearch-dashboards/alertManager" "$STAGE_DIR"

# Cleanup temporary stubs -- only remove the specific directory we created
if [ "$OSD_STUB_CREATED" = true ]; then
  rm -rf "$OSD_STUB_DIR"
  rmdir "$(cd "$PLUGIN_DIR/../.." && pwd)/src/core" 2>/dev/null || true
  rmdir "$(cd "$PLUGIN_DIR/../.." && pwd)/src" 2>/dev/null || true
fi

echo ""
echo "=== Build complete ==="
echo "Artifact: $BUILD_DIR/alertManager.zip"
echo "Size: $(du -h $BUILD_DIR/alertManager.zip | cut -f1)"
echo ""
echo "To install:"
echo "  docker exec opensearch-dashboards /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin remove alertManager 2>/dev/null || true"
echo "  docker restart opensearch-dashboards  # picks up plugin from bind-mounted zip"
