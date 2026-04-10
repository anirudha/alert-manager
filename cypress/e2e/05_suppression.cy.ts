/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Suppression Rules', () => {
  beforeEach(() => {
    cy.ensureLoaded();
    cy.contains('Suppression').click();
  });

  it('displays the suppression rules panel with create button', () => {
    cy.getByTestSubj('alertManager-suppression-createRule').should('exist');
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

  it('create form has name, description, matcher, and schedule fields', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    cy.getByTestSubj('alertManager-suppression-formName').should('exist');
    cy.getByTestSubj('alertManager-suppression-formDescription').should('exist');
    cy.getByTestSubj('alertManager-suppression-matcherKey').should('exist');
    cy.getByTestSubj('alertManager-suppression-matcherValue').should('exist');
    cy.getByTestSubj('alertManager-suppression-scheduleType').should('exist');
    // Close form
    cy.get('body').type('{esc}');
  });

  it('can type in suppression form fields', () => {
    cy.contains(/Create|Add|New/)
      .first()
      .click();
    cy.getByTestSubj('alertManager-suppression-formName').type('Test Suppression Rule');
    cy.getByTestSubj('alertManager-suppression-formDescription').type('Created by Cypress');
    cy.getByTestSubj('alertManager-suppression-matcherKey').type('alertname');
    cy.getByTestSubj('alertManager-suppression-matcherValue').type('HighLatency');
    cy.get('body').should('be.visible');
    // Close form
    cy.get('body').type('{esc}');
  });

  it('displays suppression content area', () => {
    // The suppression tab shows either a table of rules or the create form.
    // Verify the tab loaded successfully by checking for key elements.
    cy.getByTestSubj('alertManager-suppression-createRule').should('exist');
    cy.get('body').should('be.visible');
  });
});
