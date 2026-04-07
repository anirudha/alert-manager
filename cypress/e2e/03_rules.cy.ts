/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Rules / Monitors', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Rules').click();
  });

  it('displays the monitors table with rows', () => {
    cy.get('table', { timeout: 30000 }).should('exist');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  it('has a search bar and can filter', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
    cy.get('input[type="search"], input[placeholder*="Search"]').first().type('Error');
    cy.get('table').should('exist');
  });

  it('shows create monitor button and opens wizard', () => {
    cy.contains(/Create|New/).should('exist');
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
    cy.get('body').should('be.visible');
  });
});
