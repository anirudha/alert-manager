/**
 * Webpack config for building the Alert Manager OSD plugin client bundle.
 *
 * Compiles public/ TypeScript into target/public/alertManager.plugin.js,
 * mapping OSD shared deps as externals and bundling ECharts inline.
 * Output is wrapped in __osdBundles__.define() for OSD's plugin loader.
 */
const path = require('path');
const webpack = require('webpack');

// ---------------------------------------------------------------------------
// OSD shared deps → externals
// When webpack sees `import X from 'react'`, it emits `__osdSharedDeps__.React`
// instead of bundling React.
// ---------------------------------------------------------------------------
const OSD_SHARED_DEPS = {
  // Core React
  react: 'React',
  'react-dom': 'ReactDom',
  'react-dom/server': 'ReactDomServer',
  'react-router': 'ReactRouter',
  'react-router-dom': 'ReactRouterDom',
  // OpenSearch UI (OUI) — primary; @elastic/eui kept as fallback alias
  '@opensearch-project/oui': 'ElasticEui',
  '@elastic/eui': 'ElasticEui',
  '@elastic/eui/lib/services': 'ElasticEuiLibServices',
  '@elastic/eui/lib/services/format': 'ElasticEuiLibServicesFormat',
  '@elastic/charts': 'ElasticCharts',
  '@elastic/eui/dist/eui_charts_theme': 'ElasticEuiChartsTheme',
  '@elastic/numeral': 'ElasticNumeral',
  // Utilities
  moment: 'Moment',
  'moment-timezone': 'MomentTimezone',
  lodash: 'Lodash',
  'lodash/fp': 'LodashFp',
  jquery: 'Jquery',
  // OSD core
  '@osd/i18n': 'OsdI18n',
  '@osd/i18n/react': 'OsdI18nReact',
  '@osd/monaco': 'OsdMonaco',
  'monaco-editor/esm/vs/editor/editor.api': 'MonacoBarePluginApi',
};

// Build a lookup of OSD shared dep keys for sub-path matching
const osdDepKeys = Object.keys(OSD_SHARED_DEPS);

const PLUGIN_DIR = __dirname;
const STUBS_DIR = path.resolve(PLUGIN_DIR, 'stubs');

module.exports = {
  mode: 'production',
  devtool: false,

  entry: './public/index.ts',

  output: {
    path: path.resolve(PLUGIN_DIR, 'build/alertManager/target/public'),
    filename: 'alertManager.plugin.js',
    // Use 'var' library so the bundle assigns exports to a global variable
    // that our wrapper plugin can capture and return from __osdBundles__.define()
    library: { type: 'var', name: '__alertManager_exports__' },
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      // OSD monorepo relative paths → local stubs
      [path.resolve(PLUGIN_DIR, 'public/../../../src/core/public')]: path.resolve(
        STUBS_DIR,
        'src/core/public'
      ),
      [path.resolve(PLUGIN_DIR, 'public/components/../../../../src/core/public')]: path.resolve(
        STUBS_DIR,
        'src/core/public'
      ),
      [path.resolve(PLUGIN_DIR, 'public/../../../src/plugins/navigation/public')]: path.resolve(
        STUBS_DIR,
        'src/plugins/navigation/public'
      ),
      [path.resolve(PLUGIN_DIR, 'public/components/../../../../src/plugins/navigation/public')]:
        path.resolve(STUBS_DIR, 'src/plugins/navigation/public'),
    },
  },

  externals: [
    function ({ request }, callback) {
      // Exact match
      if (OSD_SHARED_DEPS[request]) {
        return callback(null, '__osdSharedDeps__.' + OSD_SHARED_DEPS[request]);
      }
      // Sub-path match (e.g., @elastic/eui/lib/components/...)
      for (const pkg of osdDepKeys) {
        if (request.startsWith(pkg + '/')) {
          return callback(null, '__osdSharedDeps__.' + OSD_SHARED_DEPS[pkg]);
        }
      }
      // OSD core/public and navigation/public — these are type-only imports.
      // The actual objects are passed as arguments to the plugin at runtime.
      if (
        request.includes('src/core/public') ||
        request.includes('src/plugins/navigation/public')
      ) {
        // Return an empty module — the plugin receives core services as function args
        return callback(null, '{}');
      }
      callback();
    },
  ],

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(PLUGIN_DIR, 'tsconfig.osd.json'),
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        // Handle image imports (return empty string)
        test: /\.(png|jpg|gif|svg)$/,
        type: 'asset/inline',
      },
    ],
  },

  plugins: [
    // Wrap the bundle in __osdBundles__.define()
    new (class OsdBundleWrapperPlugin {
      apply(compiler) {
        compiler.hooks.compilation.tap('OsdBundleWrapper', (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'OsdBundleWrapper',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
            },
            (assets) => {
              for (const [name, source] of Object.entries(assets)) {
                if (name.endsWith('.js')) {
                  const wrapped = new webpack.sources.ConcatSource(
                    '__osdBundles__.define("plugin/alertManager/public", function() {\n',
                    source,
                    '\nreturn __alertManager_exports__;\n});\n'
                  );
                  compilation.updateAsset(name, wrapped);
                }
              }
            }
          );
        });
      }
    })(),

    // Ignore optional peer deps that aren't available
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
  ],

  optimization: {
    minimize: true,
    splitChunks: false, // OSD expects a single bundle file
  },

  // Suppress performance warnings for large bundles (ECharts adds ~300KB)
  performance: {
    maxAssetSize: 2 * 1024 * 1024,
    maxEntrypointSize: 2 * 1024 * 1024,
  },
};
