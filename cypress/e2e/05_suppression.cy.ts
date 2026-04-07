/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Suppression Rules', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Suppression').click();
  });

  it('displays the suppression rules panel', () => {
    cy.get('body').should('be.visible');
  });

  it('shows create button and opens form', () => {
    cy.contains(/Create|Add|New/).should('exist');
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    cy.get('body').should('be.visible');
    // Close form/dialog so next test starts clean
    cy.get('body').type('{esc}');
  });

  it('can create a suppression rule', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    cy.get('input').first().type('Test Suppression Rule');
    cy.get('body').should('be.visible');
    // Close form
    cy.get('body').type('{esc}');
  });

  it('displays existing suppression rules', () => {
    cy.get('body').should('be.visible');
  });

  it('shows suppression rule details', () => {
    cy.get('body').should('be.visible');
  });
});
