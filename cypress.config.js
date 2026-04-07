/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path');

const mode = process.env.CYPRESS_MODE || 'standalone';
const isOsd = mode === 'osd';

module.exports = {
  e2e: {
    baseUrl: isOsd ? 'http://localhost:5601' : 'http://localhost:5603',
    viewportWidth: 1440,
    viewportHeight: 900,
    // Allow 1 retry: handles the first-spec cold start on a fresh OSD stack.
    // With ensureLoaded() optimizations, retries are cheap (~5s, not 30s).
    retries: { runMode: 1, openMode: 0 },
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: isOsd ? 60000 : 10000,
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    // Performance: free memory between tests (Cypress keeps DOM snapshots by default)
    numTestsKeptInMemory: 0,
    // Performance: disable test isolation in OSD mode to skip full page reloads
    // between tests. Each test's beforeEach still navigates, but the browser
    // context (cookies, localStorage) is preserved, saving ~2s per test.
    testIsolation: !isOsd,
    env: {
      mode,
      // Workspace ID varies per stack instance. Override via CYPRESS_OSD_WORKSPACE_ID env var.
      // The e2e-osd.sh script auto-detects and sets this.
      osdBasePath: `/w/${process.env.CYPRESS_OSD_WORKSPACE_ID || 'OKTIMo'}/app/alertManager`,
    },
    setupNodeEvents(on, config) {
      const wp = require('@cypress/webpack-preprocessor');
      const options = {
        webpackOptions: {
          resolve: { extensions: ['.ts', '.js'] },
          module: {
            rules: [
              {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                  {
                    loader: 'ts-loader',
                    options: {
                      configFile: path.resolve(__dirname, 'cypress', 'tsconfig.json'),
                      transpileOnly: true,
                      // Suppress deprecated-option diagnostics from the inherited tsconfig chain
                      // (TS5101: downlevelIteration, TS5107: moduleResolution=node10)
                      ignoreDiagnostics: [5101, 5107],
                    },
                  },
                ],
              },
            ],
          },
        },
      };
      on('file:preprocessor', wp(options));
      return config;
    },
  },
};
