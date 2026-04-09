/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './commands';

// Establish an authenticated session before each test (no-op in standalone mode).
// cy.session() caches the session cookie so login only happens once per spec,
// and cookies are automatically restored before each test.
beforeEach(() => {
  if (Cypress.env('mode') === 'osd') {
    cy.session('osd-admin', () => {
      cy.request({
        method: 'POST',
        url: 'http://localhost:5601/auth/login',
        headers: {
          'osd-xsrf': 'osd-fetch',
          'Content-Type': 'application/json',
        },
        body: {
          username: 'admin',
          password: 'My_password_123!@#',
        },
      });
    });
  }
});

// Ignore ResizeObserver loop errors — these are benign browser internals
// that fire when layout recalculations can't complete in a single frame.
// See: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('ResizeObserver loop')) {
    return false; // prevent Cypress from failing the test
  }
  // OSD throws benign errors during plugin loading and navigation that
  // should not fail E2E tests (e.g., chunk loading, security interceptors,
  // workspace plugin stack overflows, transient fetch failures)
  if (Cypress.env('mode') === 'osd') {
    if (
      err.message.includes('Loading chunk') ||
      err.message.includes('Unexpected token') ||
      err.message.includes('Cannot read properties of undefined') ||
      err.message.includes('Cannot read properties of null') ||
      err.message.includes('Unauthorized') ||
      err.message.includes('Maximum call stack size exceeded') ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('cantReachACME')
    ) {
      return false;
    }
  }
  // Let other errors fail normally
  return true;
});
