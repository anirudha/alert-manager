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
  }
}

Cypress.Commands.add('getByTestSubj', (selector: string) => {
  return cy.get(`[data-test-subj="${selector}"]`);
});

Cypress.Commands.add('visitAndWait', (path: string, heading = 'Alert Manager') => {
  cy.visit(path);
  cy.contains(heading, { timeout: 15000 }).should('be.visible');
});
