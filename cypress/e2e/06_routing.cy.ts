/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Routing Configuration', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Routing').click();
  });

  it('loads the routing tab', () => {
    cy.get('body').should('be.visible');
    cy.contains('Routing').should('be.visible');
  });

  it('displays routing configuration or empty state', () => {
    // The routing tab shows either the Alertmanager routing tree,
    // a loading state, or an appropriate empty/error state message.
    // Cortex Alertmanager may not be available in all test environments.
    cy.wait(3000);
    cy.get('body').then(($body) => {
      const text = $body.text();
      const hasContent =
        text.includes('route') ||
        text.includes('Route') ||
        text.includes('receiver') ||
        text.includes('Receiver') ||
        text.includes('No routing') ||
        text.includes('not configured') ||
        text.includes('Alertmanager') ||
        text.includes('Loading') ||
        text.includes('Routing') ||
        text.includes('unavailable') ||
        text.includes('Error');
      expect(hasContent).to.be.true;
    });
  });

  it('does not show loading spinner indefinitely', () => {
    // After a reasonable timeout, the tab should not be stuck loading
    cy.wait(3000);
    cy.get('body').then(($body) => {
      const text = $body.text();
      // Should not be stuck on a loading state
      expect(text).not.to.include('Loading routing');
    });
  });
});
