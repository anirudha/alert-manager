/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  root: true,
  extends: ['@elastic/eslint-config-kibana', 'plugin:@elastic/eui/recommended'],
  rules: {
    '@osd/eslint/require-license-header': [
      'error',
      {
        licenses: [
          '/*\n * Copyright OpenSearch Contributors\n * SPDX-License-Identifier: Apache-2.0\n */',
        ],
      },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['standalone/dist/**', 'standalone/node_modules/**', 'dist/**', 'target/**'],
};
