/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path');

module.exports = {
  e2e: {
    baseUrl: 'http://localhost:5603',
    viewportWidth: 1440,
    viewportHeight: 900,
    retries: { runMode: 1, openMode: 0 },
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
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
