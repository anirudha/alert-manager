/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  projects: [
    // Server-side and core tests (node environment)
    {
      displayName: 'server',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/core', '<rootDir>/server'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
      },
      moduleNameMapper: {},
    },
    // React component tests (jsdom environment)
    {
      displayName: 'components',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/public'],
      testMatch: ['**/__tests__/**/*.test.tsx'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: false }],
      },
      moduleNameMapper: {
        // Mock OSD core imports that aren't available outside the OSD tree
        '^.*/src/core/public$': '<rootDir>/public/__mocks__/osd_core.ts',
        '^.*/src/plugins/navigation/public$': '<rootDir>/public/__mocks__/osd_navigation.ts',
        // Mock EUI / OUI components
        '^@elastic/eui$': '<rootDir>/public/__mocks__/eui_mock.tsx',
        '^@opensearch-project/oui$': '<rootDir>/public/__mocks__/eui_mock.tsx',
        // Mock moment (provided by OSD at runtime)
        '^moment$': '<rootDir>/public/__mocks__/style_mock.ts',
        // Mock style imports
        '\\.(css|scss)$': '<rootDir>/public/__mocks__/style_mock.ts',
      },
    },
  ],
  collectCoverageFrom: [
    'core/**/*.ts',
    'server/**/*.ts',
    'public/**/*.{ts,tsx}',
    // Exclude test utilities and mock data — no value in unit testing these
    '!core/mock_backend.ts',
    '!core/mock_enrichment.ts',
    '!core/testing.ts',
    // Exclude integration-only modules — need real backend; TODO: CI integration tests
    '!core/directquery_prometheus_backend.ts',
    // Exclude OSD plugin shell — depends on OSD core; TODO: CI integration tests in OSD context
    '!public/plugin.ts',
    '!public/application.tsx',
    '!public/types.ts',
    '!public/components/app.tsx',
    '!server/plugin.ts',
    // Exclude UI components validated via Playwright E2E, not unit tests
    '!public/components/alerts_dashboard.tsx',
    '!public/components/monitors_table.tsx',
    '!public/components/slo_listing.tsx',
    '!public/components/slo_detail_flyout.tsx',
    '!public/components/slo_preview_panel.tsx',
    '!public/components/create_slo_wizard.tsx',
    '!public/components/create_monitor.tsx',
    '!public/components/ai_monitor_wizard.tsx',
    '!public/components/alert_detail_flyout.tsx',
    '!public/components/monitor_detail_flyout.tsx',
    '!public/components/notification_routing_panel.tsx',
    '!public/components/suppression_rules_panel.tsx',
    '!public/components/metric_browser.tsx',
    '!public/components/promql_editor.tsx',
    '!public/components/echarts_render.tsx',
    '!public/components/table_pagination.tsx',
    '!public/components/shared_constants.ts',
    '!public/services/alarms_client.ts',
    '!server/routes/slo_handlers.ts',
    '!server/slo_saved_object_store.ts',
    '!**/index.ts',
    '!**/__tests__/**',
    '!**/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
