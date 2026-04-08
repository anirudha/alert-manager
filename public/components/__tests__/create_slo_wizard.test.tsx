/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, configure, fireEvent } from '@testing-library/react';
import { CreateSloWizard } from '../create_slo_wizard';

configure({ testIdAttribute: 'data-test-subj' });

function createMockApiClient() {
  return {
    createSlo: jest.fn().mockResolvedValue({ id: 'new-slo' }),
    getMetricNames: jest.fn().mockResolvedValue({ metrics: [], total: 0, truncated: false }),
    getLabelNames: jest.fn().mockResolvedValue({ labels: [] }),
    getLabelValues: jest.fn().mockResolvedValue({ values: [], total: 0, truncated: false }),
    getMetricMetadata: jest.fn().mockResolvedValue({ metadata: [] }),
  };
}

const defaultProps = {
  datasourceId: 'ds-1',
  onClose: jest.fn(),
  onCreated: jest.fn(),
};

describe('CreateSloWizard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the flyout with title', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText('Create Service Level Objective (SLO)')).toBeDefined();
  });

  it('renders all 5 accordion sections', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Section text may appear multiple times due to completion badges
    expect(screen.getAllByText(/Section 1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Section 2/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Section 3/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Section 4/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Section 5/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders SLI form fields inside Section 1', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Prometheus metric/)).toBeDefined();
    expect(screen.getByText(/Source type/)).toBeDefined();
    expect(screen.getByText(/Calculate/)).toBeDefined();
    // "SLI type" appears both as a label and in the template helper text, so use getAllByText
    expect(screen.getAllByText(/SLI type/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders service and operation fields', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText('Service')).toBeDefined();
    expect(screen.getByText('Operation')).toBeDefined();
  });

  it('renders good events filter for availability SLI (default)', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Good events filter/)).toBeDefined();
  });

  it('renders target and warning threshold in Section 2', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Attainment goal/)).toBeDefined();
    // Label was renamed to "Budget warning threshold" in Round 3
    expect(
      screen.getAllByText(/Budget warning|Warn when error budget/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Measurement window/)).toBeDefined();
  });

  it('renders SLO name in Section 3', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getAllByText(/SLO name/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Rule group:/)).toBeDefined();
  });

  it('renders burn rate alert tiers section', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Heading was renamed from "Burn rate tiers (MWMBR)" to "Burn rate alert tiers"
    expect(screen.getAllByText(/Burn rate|burn rate/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Use recommended button', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Use recommended/)).toBeDefined();
  });

  it('renders SLO alarm checkboxes', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Checkbox labels were shortened in Round 3 UX review
    expect(screen.getAllByText(/SLI health|health alarm/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/[Aa]ttainment breach|[Aa]ttainment/).length).toBeGreaterThanOrEqual(
      1
    );
    expect(
      screen.getAllByText(/[Bb]udget.*warning|[Bb]udget depletion/).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders Add burn rate tier button', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Add burn rate tier/)).toBeDefined();
  });

  it('renders Add tag button in Section 5', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Add tag/)).toBeDefined();
  });

  it('renders preview panel with title', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText('Generated Prometheus Rules')).toBeDefined();
  });

  it('renders cancel and create buttons', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.getByText('Create SLO')).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    render(
      <CreateSloWizard {...defaultProps} onClose={onClose} apiClient={createMockApiClient()} />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders burn rate tier panels (default 4 Google SRE tiers)', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Default MWMBR has 4 tiers, each with a remove button
    const trashButtons = document.querySelectorAll('[data-eui="EuiButtonIcon"]');
    expect(trashButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders select dropdowns for SLI configuration', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    const selects = document.querySelectorAll('[data-eui="EuiSelect"]');
    // calcMethod, sliType, windowDuration, + label name selects
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it('renders radio group for source type', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(document.querySelectorAll('[data-eui="EuiRadioGroup"]').length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('renders form rows', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(document.querySelectorAll('[data-eui="EuiFormRow"]').length).toBeGreaterThan(5);
  });

  it('renders combo boxes and text inputs for SLI fields', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Metric, service value, operation value, good events filter are now EuiComboBox
    const comboBoxes = document.querySelectorAll('[data-eui="EuiComboBox"]');
    expect(comboBoxes.length).toBeGreaterThanOrEqual(1);
    // Some fields remain EuiFieldText (SLO name, burn rate windows, tags)
    const textFields = document.querySelectorAll('[data-eui="EuiFieldText"]');
    expect(textFields.length).toBeGreaterThanOrEqual(1);
  });

  it('renders SLO template selector cards', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    const cards = document.querySelectorAll('[data-eui="EuiCard"]');
    expect(cards.length).toBeGreaterThanOrEqual(4); // At least 4 templates (HTTP, gRPC, Custom, etc.)
  });

  it('renders description subtitle', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    // Header was rewritten in Round 3 to be more welcoming
    expect(screen.getAllByText(/SLO defines|Define your SLO/).length).toBeGreaterThanOrEqual(1);
  });
});
