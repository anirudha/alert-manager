/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './commands';

// Ignore ResizeObserver loop errors — these are benign browser internals
// that fire when layout recalculations can't complete in a single frame.
// See: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('ResizeObserver loop')) {
    return false; // prevent Cypress from failing the test
  }
  // Let other errors fail normally
  return true;
});
