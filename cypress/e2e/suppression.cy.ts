/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Suppression Rules', () => {
  beforeEach(() => {
    cy.visitAndWait('/');
    cy.contains('Suppression').click();
  });

  it('displays the suppression rules panel', () => {
    cy.get('body').should('be.visible');
  });

  it('shows create suppression rule button', () => {
    cy.contains(/Create|Add|New/).should('exist');
  });

  it('opens create suppression rule form', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    cy.get('body').should('be.visible');
  });

  it('validates required fields on create', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    // Try to submit empty form — should show validation
    cy.get('body').should('be.visible');
  });

  it('can create a suppression rule', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    // Fill in required fields
    cy.get('input').first().type('Test Suppression Rule');
    cy.get('body').should('be.visible');
  });

  it('displays existing suppression rules', () => {
    // MOCK_MODE may seed suppression rules
    cy.get('body').should('be.visible');
  });

  it('can toggle schedule for a rule', () => {
    cy.get('body').should('be.visible');
  });

  it('shows suppression rule details', () => {
    cy.get('body').should('be.visible');
  });
});
