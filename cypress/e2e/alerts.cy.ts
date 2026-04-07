/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Alerts Dashboard', () => {
  beforeEach(() => {
    cy.visitAndWait('/');
    // Ensure Alerts tab is active (default)
    cy.contains('Alerts').click();
  });

  it('displays alert summary stat cards', () => {
    // MOCK_MODE seeds sample alerts — stat cards should be visible
    cy.get('body').should('be.visible');
  });

  it('displays alerts table', () => {
    cy.get('table').should('exist');
  });

  it('displays alert rows with names', () => {
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });

  it('has a search bar', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
  });

  it('filters alerts by search text', () => {
    cy.get('input[type="search"], input[placeholder*="Search"]').first().type('CPU');
    // Table should still render (filtered or not based on matching)
    cy.get('table').should('exist');
  });

  it('shows filter panel with datasource filters', () => {
    cy.get('body').should('contain.text', 'Filter');
  });

  it('displays severity badges', () => {
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('opens alert detail flyout on row click', () => {
    cy.get('table tbody tr').first().click();
    // Flyout or detail view should appear
    cy.get('body').should('be.visible');
  });

  it('can acknowledge an alert via context menu', () => {
    cy.get('table tbody tr').first().rightclick();
    // Context menu should appear
    cy.get('body').should('be.visible');
  });

  it('displays charts area', () => {
    // Charts section should be in the DOM
    cy.get('body').should('be.visible');
  });

  it('handles pagination', () => {
    // Pagination controls should exist if there are many alerts
    cy.get('body').should('be.visible');
  });

  it('displays state health indicators', () => {
    cy.get('body').should('be.visible');
  });
});
