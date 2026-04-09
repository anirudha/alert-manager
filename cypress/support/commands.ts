/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

declare namespace Cypress {
  interface Chainable {
    /** Select element by data-test-subj attribute (OSD convention). */
    getByTestSubj(selector: string): Chainable<JQuery>;
    /** Navigate to a page and wait for the main heading to be visible. */
    visitAndWait(path: string, heading?: string): Chainable<void>;
    /**
     * Ensure the Alert Manager app is loaded. In OSD mode with testIsolation
     * disabled, reuses the current page if already on the plugin URL — avoiding
     * a costly full OSD app reload (~2-3s per visit).
     */
    ensureLoaded(): Chainable<void>;
    /** Wait for OSD loading indicators to clear and the plugin UI to be interactive. */
    waitForPageReady(): Chainable<void>;
    /** Login to OSD (no-op in standalone mode). */
    login(): Chainable<void>;
    /** Get the API base path for the current mode. */
    getApiBase(): Chainable<string>;
  }
}

Cypress.Commands.add('getByTestSubj', (selector: string) => {
  return cy.get(`[data-test-subj="${selector}"]`);
});

/**
 * Wait for OSD's loading indicators to disappear and the plugin to be interactive.
 * Handles the OSD loading spinner, "Loading OpenSearch Dashboards" message, and
 * error pages. In standalone mode this is a lightweight check.
 */
Cypress.Commands.add('waitForPageReady', () => {
  const mode = Cypress.env('mode') || 'standalone';

  if (mode === 'osd') {
    // Wait for OSD's "Loading OpenSearch Dashboards" overlay to clear.
    // The osdLoadingMessage element stays in the DOM but the visible text disappears
    // once the React app mounts. Wait up to 60s for slow CI environments.
    cy.get('body', { timeout: 60000 }).should('not.contain.text', 'Loading OpenSearch Dashboards');

    // Ensure no error page is displayed.
    // OSD's workspace plugin can crash on first load in headless Chrome with
    // "OpenSearch Dashboards did not load properly" or "Something went wrong".
    // Retry up to 2 times with increasing waits to let OSD's server-side
    // bundle caching warm up.
    const maxRetries = 2;
    const checkAndRecover = (attempt: number) => {
      cy.get('body').then(($body) => {
        const text = $body.text();
        const hasError =
          text.includes('Something went wrong') ||
          text.includes('workspace_fatal_error') ||
          text.includes('did not load properly');
        if (hasError && attempt < maxRetries) {
          cy.wait(3000);
          cy.visit(Cypress.env('osdBasePath') + '/');
          cy.get('body', { timeout: 60000 }).should(
            'not.contain.text',
            'Loading OpenSearch Dashboards'
          );
          checkAndRecover(attempt + 1);
        } else if (hasError) {
          // Last resort: visit OSD root first to initialize core, then navigate
          cy.visit('/');
          cy.wait(5000);
          cy.visit(Cypress.env('osdBasePath') + '/');
          cy.get('body', { timeout: 60000 }).should(
            'not.contain.text',
            'Loading OpenSearch Dashboards'
          );
        }
      });
    };
    checkAndRecover(0);
  }

  // Final check: the Alert Manager heading must be visible
  cy.contains('Alert Manager', { timeout: 60000 }).should('be.visible');
});

Cypress.Commands.add('visitAndWait', (path: string, heading = 'Alert Manager') => {
  const mode = Cypress.env('mode') || 'standalone';
  const fullPath = mode === 'osd' ? `${Cypress.env('osdBasePath')}${path}` : path;
  cy.visit(fullPath);
  if (mode === 'osd') {
    cy.waitForPageReady();
  } else {
    cy.contains(heading, { timeout: 15000 }).should('be.visible');
  }
});

Cypress.Commands.add('ensureLoaded', () => {
  const mode = Cypress.env('mode') || 'standalone';
  if (mode === 'osd') {
    // In OSD mode with testIsolation: false, the page persists between tests.
    // Only visit if we're not already on the plugin page.
    cy.url().then((url) => {
      if (url.includes('/app/alertManager') && !url.includes('workspace_fatal_error')) {
        // Dismiss any open modals/flyouts/wizards from previous test
        cy.get('body').then(($body) => {
          if ($body.find('button:contains("Cancel")').length) {
            cy.contains('button', 'Cancel').click();
            cy.wait(300);
          }
          if ($body.find('[data-test-subj="euiFlyoutCloseButton"]').length) {
            cy.get('[data-test-subj="euiFlyoutCloseButton"]').first().click();
            cy.wait(300);
          }
        });
        cy.waitForPageReady();
      } else {
        // Not on the plugin page, or hit an error page — do a fresh visit.
        cy.request({
          method: 'POST',
          url: 'http://localhost:5601/auth/login',
          headers: { 'osd-xsrf': 'osd-fetch', 'Content-Type': 'application/json' },
          body: { username: 'admin', password: 'My_password_123!@#' },
          failOnStatusCode: false,
        });
        // Visit OSD homepage first to initialize workspace plugin
        cy.visit('/');
        cy.wait(3000);
        // Navigate to Alert Manager
        cy.visit(Cypress.env('osdBasePath') + '/');
        cy.waitForPageReady();
      }
    });
  } else {
    cy.visitAndWait('/');
  }
});

Cypress.Commands.add('login', () => {
  const mode = Cypress.env('mode') || 'standalone';
  if (mode !== 'osd') {
    return;
  }
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

Cypress.Commands.add('getApiBase', () => {
  const mode = Cypress.env('mode') || 'standalone';
  return cy.wrap(mode === 'osd' ? '/api/alerting' : '/api');
});
