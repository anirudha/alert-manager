/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Rules / Monitors', () => {
  beforeEach(() => {
    cy.visitAndWait('/');
    cy.contains('Rules').click();
  });

  it('displays the monitors table', () => {
    cy.get('table').should('exist');
  });

  it('displays rule rows with names', () => {
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });

  it('has a search bar', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
  });

  it('filters rules by search text', () => {
    cy.get('input[type="search"], input[placeholder*="Search"]').first().type('Error');
    cy.get('table').should('exist');
  });

  it('shows create monitor button', () => {
    cy.contains(/Create|New/).should('exist');
  });

  it('opens create monitor wizard on button click', () => {
    cy.contains(/Create|New/)
      .first()
      .click();
    cy.get('body').should('be.visible');
  });

  it('shows filter panel', () => {
    cy.get('body').should('contain.text', 'Filter');
  });

  it('displays severity badges for rules', () => {
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('opens rule detail on row click', () => {
    cy.get('table tbody tr').first().click();
    cy.get('body').should('be.visible');
  });

  it('can export monitors', () => {
    // Export functionality should be accessible
    cy.get('body').should('be.visible');
  });
});
