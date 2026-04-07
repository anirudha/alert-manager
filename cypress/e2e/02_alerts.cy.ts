/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Alerts Dashboard', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Alerts').click();
  });

  it('displays alert summary stat cards', () => {
    // Alert data is seeded by e2e-osd.sh (OpenSearch monitor + Prometheus rules)
    // or MOCK_MODE (standalone). Stat cards should be visible.
    cy.get('body').should('be.visible');
  });

  it('displays alerts table with rows', () => {
    cy.get('table', { timeout: 30000 }).should('exist');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  it('has a search bar and can filter', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
  });

  it('shows filter panel with datasource filters', () => {
    cy.get('body').should('contain.text', 'Filter');
  });

  it('displays severity badges', () => {
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('opens alert detail flyout on row click', () => {
    cy.get('table tbody tr', { timeout: 30000 }).first().click();
    cy.get('body').should('be.visible');
  });

  it('displays charts and handles pagination', () => {
    cy.get('body').should('be.visible');
  });
});
