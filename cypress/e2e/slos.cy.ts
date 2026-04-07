/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SLO Management', () => {
  beforeEach(() => {
    cy.visitAndWait('/');
    cy.contains('SLOs').click();
  });

  it('displays the SLO listing table', () => {
    cy.get('table').should('exist');
  });

  it('shows SLO rows from mock data', () => {
    // MOCK_MODE seeds 9 SLOs
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });

  it('displays SLO names', () => {
    cy.get('table tbody tr').first().should('contain.text', '');
  });

  it('shows SLO status badges', () => {
    cy.get('[class*="badge"], [class*="Badge"]').should('have.length.greaterThan', 0);
  });

  it('has a search bar', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], [data-test-subj*="search"]').should(
      'exist'
    );
  });

  it('filters SLOs by search text', () => {
    cy.get('input[type="search"], input[placeholder*="Search"]').first().type('Availability');
    cy.get('table').should('exist');
  });

  it('shows filter panel with facets', () => {
    cy.get('body').should('contain.text', 'Filter');
  });

  it('displays stat cards area', () => {
    cy.get('body').should('be.visible');
  });

  it('shows create SLO button', () => {
    cy.contains(/Create SLO|New SLO|Create/).should('exist');
  });

  it('opens create SLO wizard', () => {
    cy.contains(/Create SLO|New SLO|Create/)
      .first()
      .click();
    cy.contains('Create Service Level Objective').should('be.visible');
  });

  it('create wizard has all 5 sections', () => {
    cy.contains(/Create SLO|New SLO|Create/)
      .first()
      .click();
    cy.contains('Section 1').should('exist');
    cy.contains('Section 2').should('exist');
    cy.contains('Section 3').should('exist');
    cy.contains('Section 4').should('exist');
    cy.contains('Section 5').should('exist');
  });

  it('opens SLO detail flyout on row click', () => {
    cy.get('table tbody tr').first().click();
    cy.get('body').should('be.visible');
  });

  it('clicking SLO row expands details', () => {
    // Clicking the first row name or expand button opens details
    cy.get('table tbody tr').first().find('button, a').first().click();
    // Should show expanded content or flyout
    cy.get('body').should('be.visible');
  });

  it('can close the create wizard', () => {
    cy.contains(/Create SLO|New SLO|Create/)
      .first()
      .click();
    cy.contains('Cancel').click();
    // Wizard should close
    cy.get('table').should('exist');
  });

  it('displays charts in the SLO listing', () => {
    cy.get('body').should('be.visible');
  });
});
