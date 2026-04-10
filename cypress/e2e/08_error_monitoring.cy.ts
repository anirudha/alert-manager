/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Console & Network Health', () => {
  const tabs = ['Alerts', 'Rules', 'Routing', 'Suppression', 'SLOs'];

  // Collect console errors across all tab navigations
  const consoleErrors: string[] = [];
  const networkErrors: { url: string; status: number }[] = [];

  before(() => {
    // Intercept all API requests to catch 4xx/5xx responses
    cy.intercept('**/*', (req) => {
      req.continue((res) => {
        if (res.statusCode >= 400 && res.statusCode !== 401) {
          // 401 is expected before auth completes in OSD mode
          networkErrors.push({ url: req.url, status: res.statusCode });
        }
      });
    }).as('allRequests');

    // Listen for console errors
    Cypress.on('window:before:load', (win) => {
      const origError = win.console.error;
      win.console.error = (...args: unknown[]) => {
        const msg = args.map(String).join(' ');
        // Ignore known benign errors
        if (
          !msg.includes('ResizeObserver') &&
          !msg.includes('Warning: React') &&
          !msg.includes('validateDOMNesting')
        ) {
          consoleErrors.push(msg);
        }
        origError.apply(win.console, args);
      };
    });
  });

  it('navigates through all tabs without JavaScript errors', () => {
    cy.ensureLoaded();

    tabs.forEach((tab) => {
      cy.contains(tab).click();
      cy.wait(1000); // Allow async renders to settle
    });

    // Assert no console errors were captured
    cy.then(() => {
      if (consoleErrors.length > 0) {
        const summary = consoleErrors.slice(0, 5).join('\n  ');
        throw new Error(`Found ${consoleErrors.length} console error(s):\n  ${summary}`);
      }
    });
  });

  it('no 404 or 500 errors in network requests during navigation', () => {
    cy.ensureLoaded();

    tabs.forEach((tab) => {
      cy.contains(tab).click();
      cy.wait(1000);
    });

    cy.then(() => {
      // Filter out known acceptable 404s (e.g., optional metadata endpoints)
      const realErrors = networkErrors.filter(
        (e) => e.status >= 500 || (e.status === 404 && !e.url.includes('metadata'))
      );
      if (realErrors.length > 0) {
        const summary = realErrors
          .slice(0, 5)
          .map((e) => `${e.status} ${e.url}`)
          .join('\n  ');
        throw new Error(`Found ${realErrors.length} network error(s):\n  ${summary}`);
      }
    });
  });
});
