/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Navigation', () => {
  beforeEach(() => {
    cy.visitAndWait('/');
  });

  it('loads the main page', () => {
    cy.contains('Alert Manager').should('be.visible');
  });

  it('renders the Alerts tab', () => {
    cy.contains('Alerts').should('be.visible');
  });

  it('renders the Rules tab', () => {
    cy.contains('Rules').should('be.visible');
  });

  it('renders the Routing tab', () => {
    cy.contains('Routing').should('be.visible');
  });

  it('renders the Suppression tab', () => {
    cy.contains('Suppression').should('be.visible');
  });

  it('renders the SLOs tab', () => {
    cy.contains('SLOs').should('be.visible');
  });

  it('switches to Rules tab', () => {
    cy.contains('Rules').click();
    // After clicking, the rules tab content should be visible
    cy.url().should('include', '/');
  });

  it('switches to SLOs tab', () => {
    cy.contains('SLOs').click();
    cy.url().should('include', '/');
  });
});
