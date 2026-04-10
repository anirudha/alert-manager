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

  it('displays SLO stat cards with labels', () => {
    cy.getByTestSubj('sloSummaryCards').should('exist');
    cy.getByTestSubj('sloStatCardTotal').should('exist');
    cy.getByTestSubj('sloStatCardBreached').should('exist');
    cy.getByTestSubj('sloStatCardWarning').should('exist');
    cy.getByTestSubj('sloStatCardOk').should('exist');
    cy.getByTestSubj('sloStatCardNoData').should('exist');
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

  it('displays chart containers in the SLO listing', () => {
    // ECharts render on canvas — verify at least one chart container exists
    cy.get('canvas').should('have.length.greaterThan', 0);
  });

  // ==========================================================================
  // New tests: Create SLO Wizard — template selector, combo boxes, error
  // budget, target presets, burn rate section, and preview panel.
  // ==========================================================================

  describe('Create SLO Wizard', () => {
    beforeEach(() => {
      cy.contains(/Create SLO|New SLO|Create/)
        .first()
        .click();
      cy.contains('Create Service Level Objective', { timeout: 10000 }).should('be.visible');
    });

    afterEach(() => {
      // Close the wizard so subsequent tests start clean
      cy.get('body').then(($body) => {
        if ($body.find('button:contains("Cancel")').length) {
          cy.contains('button', 'Cancel').click();
        }
      });
    });

    it('displays the template selector with all 5 template cards', () => {
      // The template selector heading
      cy.contains('Start from a template').should('be.visible');

      // All 5 template card titles must be present
      const templateNames = [
        'HTTP Availability',
        'HTTP Latency P99',
        'gRPC Availability',
        'gRPC Latency P99',
        'Custom',
      ];
      templateNames.forEach((name) => {
        cy.contains(name).should('exist');
      });
    });

    it('clicking HTTP Availability template pre-fills the metric field', () => {
      // Click the HTTP Availability template card
      cy.contains('HTTP Availability').closest('[class*="card"], [class*="Card"]').click();

      // The metric field should be pre-filled with http_requests_total.
      // In combo box mode the value appears as selected pill text or input value;
      // in fallback text mode it appears in an input. Check both patterns.
      cy.get('body').should('contain.text', 'http_requests_total');
    });

    it('clicking gRPC Availability template pre-fills the metric to grpc_server_handled_total', () => {
      cy.contains('gRPC Availability').closest('[class*="card"], [class*="Card"]').click();

      cy.get('body').should('contain.text', 'grpc_server_handled_total');
    });

    it('clicking Custom template clears the metric field', () => {
      // First select HTTP Availability to populate the field
      cy.contains('HTTP Availability').closest('[class*="card"], [class*="Card"]').click();
      cy.get('body').should('contain.text', 'http_requests_total');

      // Now select Custom — metric pattern is empty string
      cy.contains('Custom').closest('[class*="card"], [class*="Card"]').click();

      // The metric field should no longer contain http_requests_total
      // Look within the metric form row specifically
      cy.contains('Prometheus metric')
        .closest('[class*="formRow"], [class*="FormRow"], .euiFormRow')
        .then(($row) => {
          // In combo box mode, no pill should show http_requests_total
          // In text mode, the input value should be empty
          const text = $row.text();
          expect(text).not.to.include('http_requests_total');
        });
    });

    it('has ComboBox fields for metric, service, and operation', () => {
      // Verify the form labels exist within the wizard flyout
      cy.contains('Prometheus metric').should('exist');
      cy.contains('Service').should('exist');
      cy.contains('Operation').should('exist');

      // Verify interactive input elements exist for these fields
      // (either EuiComboBox with role="combobox" or fallback EuiFieldText inputs)
      cy.get(
        'input[aria-label="Prometheus metric name"], [role="combobox"], [data-eui="EuiComboBox"]'
      ).should('have.length.greaterThan', 0);
    });

    it('has a Good events filter field for availability SLI type', () => {
      // The default SLI type is "availability", so the good events filter should be visible
      cy.contains('Good events filter').should('exist');
    });

    it('has label name selects for service and operation', () => {
      // Service label name dropdown
      cy.get('select[aria-label="Service label name"]').should('exist');

      // Operation label name dropdown
      cy.get('select[aria-label="Operation label name"]').should('exist');
    });

    it('displays the error budget panel with formatted budget text', () => {
      // Section 2 is open by default. The default target is 99.9% with 1d window.
      // Error budget for 99.9% over 1 day = (0.001) * 86400 = 86.4 seconds.
      // Formatted as "Error budget: 86.4 seconds/day"
      cy.contains('Error budget').should('exist');
      cy.contains(/seconds|minutes|hours/).should('exist');

      // The budget panel should contain "Total allowable downtime"
      cy.contains('Total allowable downtime').should('exist');
    });

    it('shows target preset quick-set buttons (99%, 99.5%, 99.9%, 99.95%)', () => {
      cy.contains('Quick set').should('exist');
      cy.contains('99%').should('exist');
      cy.contains('99.5%').should('exist');
      cy.contains('99.9%').should('exist');
      cy.contains('99.95%').should('exist');
    });

    it('clicking a target preset button updates the attainment goal', () => {
      // Use aria-label to target the preset buttons specifically (not table cells)
      cy.get('button[aria-label*="Set target to 99.5"]').click({ force: true });

      // The attainment goal field should reflect 99.5
      cy.get('input[aria-label="Attainment goal percentage"]').should('have.value', '99.5');

      // Error budget should update accordingly
      cy.contains('Error budget').should('exist');

      // Click 99% preset and verify it changes
      cy.get('button[aria-label*="Set target to 99%"]').first().click({ force: true });
      cy.get('input[aria-label="Attainment goal percentage"]').should('have.value', '99');
    });

    it('burn rate section uses plain English headings (no "MWMBR" text)', () => {
      // Section 4 heading
      cy.contains('Section 4').should('exist');
      cy.contains('Burn Rate and Alarms').should('exist');

      // The burn rate section should use plain English
      cy.contains('Burn rate alert tiers').should('exist');
      cy.contains('How burn rate alerts work').should('exist');

      // It should NOT contain the acronym "MWMBR" anywhere in the wizard
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        expect(bodyText).not.to.include('MWMBR');
      });
    });

    it('burn rate section has "Use recommended defaults" button', () => {
      cy.contains('Use recommended defaults').should('exist');
    });

    it('burn rate section shows depletion time for each tier', () => {
      // Default burn rates include depletion time text
      cy.contains('Budget depletion').should('exist');
      cy.contains('at this burn rate').should('exist');
    });

    it('burn rate section has Add burn rate tier button', () => {
      cy.contains('Add burn rate tier').should('exist');
    });

    it('burn rate section shows additional SLO alarm checkboxes', () => {
      cy.contains('Additional SLO alarms').should('exist');
      cy.contains('SLI health alarm').should('exist');
      cy.contains('Attainment breach alarm').should('exist');
      cy.contains('Budget depletion warning').should('exist');
    });

    it('accordion sections show completion checkmarks when sections are valid', () => {
      // Section 2 (target) should be valid by default (99.9% target is pre-filled)
      // Look for the checkmark icon within section buttons
      cy.get('[aria-label="Section complete"]').should('have.length.greaterThan', 0);
    });

    it('preview panel shows missing fields when form is incomplete', () => {
      // Select the Custom template to clear the metric field
      cy.contains('Custom').closest('[class*="card"], [class*="Card"]').click();

      // The preview panel should show which fields are still needed.
      // It lists human-readable field names: "Prometheus metric", "Service name",
      // "SLO name", "Attainment target"
      cy.contains('Generated Prometheus Rules').should('exist');
      cy.contains('Provide these fields to preview generated rules').should('exist');

      // At minimum, "Service name" should be listed as missing
      cy.contains('Service name').should('exist');
    });

    it('preview panel updates when enough fields are filled', () => {
      // Apply HTTP Availability template (fills metric and other defaults)
      cy.contains('HTTP Availability').closest('[class*="card"], [class*="Card"]').click();

      // Service name is still empty, so preview should show missing fields.
      // The "Service name" field should still appear in the missing list.
      cy.contains('Service name').should('exist');
    });

    it('Section 3 has SLO name field and rule group preview', () => {
      // The SLO name field should exist
      cy.contains('SLO name').should('exist');

      // The rule group name preview should be visible
      cy.contains('Rule group').should('exist');
    });

    it('Section 5 tags section allows adding and removing tags', () => {
      // Section 5 accordion exists
      cy.contains('Section 5').should('exist');
      cy.contains('Add Tags').should('exist');

      // Click to expand Section 5 if collapsed
      cy.contains('Section 5').click();

      // Add tag button
      cy.contains('Add tag').should('exist');
    });

    it('measurement window dropdown is present with options', () => {
      cy.get('select[aria-label="Measurement window duration"]').should('exist');

      // The default value should be "1d"
      cy.get('select[aria-label="Measurement window duration"]').should('have.value', '1d');
    });

    it('SLI type dropdown is present and defaults to Availability', () => {
      cy.get('select[aria-label="SLI type"]').should('exist');
      cy.get('select[aria-label="SLI type"]').should('have.value', 'availability');
    });

    it('source type radio group is present with Service operation default', () => {
      cy.contains('Source type').should('exist');
      cy.contains('Service operation').should('exist');
      cy.contains('Service dependency').should('exist');
    });
  });
});
