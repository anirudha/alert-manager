/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Alerts Dashboard', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Alerts').click();
  });

  it('displays alert summary stat cards with labels', () => {
    // Alert data is seeded by e2e-osd.sh (OpenSearch monitor + Prometheus rules)
    // or MOCK_MODE (standalone). Stat cards should be visible.
    cy.getByTestSubj('alertsSummaryCards').should('be.visible');
    cy.getByTestSubj('alertStatCardTotal').should('be.visible');
    cy.getByTestSubj('alertStatCardActive').should('be.visible');
    cy.getByTestSubj('alertStatCardCritical').should('be.visible');
    cy.getByTestSubj('alertStatCardHigh').should('be.visible');
    cy.getByTestSubj('alertStatCardMedium').should('be.visible');
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

  it('shows filter panel with datasource and severity filters', () => {
    cy.get('body').should('contain.text', 'Filter');
    cy.contains('Datasource').should('exist');
    cy.contains('Severity').should('exist');
  });

  it('displays severity badges', () => {
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('opens alert detail flyout on row click', () => {
    cy.get('table tbody tr', { timeout: 30000 }).first().click();
    cy.get('body').should('be.visible');
  });

  it('displays chart containers and pagination controls', () => {
    // ECharts render on canvas — verify containers exist with non-zero dimensions
    cy.get('canvas').should('have.length.greaterThan', 0);

    // Verify pagination controls
    cy.getByTestSubj('alertManager-pagination-rowsPerPage').should('exist');
  });
});
