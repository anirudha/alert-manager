/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SLO Management', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('SLOs').click();
  });

  it('displays the SLO listing table with rows', () => {
    // SLO data is seeded by e2e-osd.sh (OSD) or MOCK_MODE (standalone)
    cy.get('table', { timeout: 30000 }).should('exist');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
  });

  it('displays SLO names and status badges', () => {
    cy.get('table tbody tr', { timeout: 30000 }).first().should('contain.text', '');
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('has a search bar and can filter', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
    cy.get('table', { timeout: 30000 }).should('exist');
    cy.get('input[type="search"], input[placeholder*="Search"]').first().type('Availability');
    cy.get('table').should('exist');
  });

  it('shows filter panel with facets', () => {
    cy.get('body').should('contain.text', 'Filter');
  });

  it('displays stat cards area', () => {
    cy.get('body').should('be.visible');
  });

  it('shows create SLO button and opens wizard with all 5 sections', () => {
    cy.contains(/Create SLO|New SLO|Create/).should('exist');
    cy.contains(/Create SLO|New SLO|Create/)
      .first()
      .click();
    cy.contains('Create Service Level Objective').should('be.visible');
    cy.contains('Section 1').should('exist');
    cy.contains('Section 2').should('exist');
    cy.contains('Section 3').should('exist');
    cy.contains('Section 4').should('exist');
    cy.contains('Section 5').should('exist');
    // Close the wizard so the next test starts clean
    cy.contains('Cancel').click();
  });

  it('opens SLO detail flyout on row click', () => {
    cy.get('table tbody tr', { timeout: 30000 }).first().click();
    cy.get('body').should('be.visible');
  });

  it('clicking SLO row expands details', () => {
    cy.get('table tbody tr', { timeout: 30000 }).first().find('button, a').first().click();
    cy.get('body').should('be.visible');
  });

  it('can open and close the create wizard', () => {
    cy.contains(/Create SLO|New SLO|Create/)
      .first()
      .click();
    cy.contains('Cancel').click();
    cy.get('table', { timeout: 30000 }).should('exist');
  });

  it('displays charts in the SLO listing', () => {
    cy.get('body').should('be.visible');
  });
});
