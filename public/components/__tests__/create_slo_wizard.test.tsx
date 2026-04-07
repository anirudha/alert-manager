/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import { CreateSloWizard } from '../create_slo_wizard';

configure({ testIdAttribute: 'data-test-subj' });

function createMockApiClient() {
  return { createSlo: jest.fn().mockResolvedValue({ id: 'new-slo' }) };
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
    expect(screen.getByText(/Section 1/)).toBeDefined();
    expect(screen.getByText(/Section 2/)).toBeDefined();
    expect(screen.getByText(/Section 3/)).toBeDefined();
    expect(screen.getByText(/Section 4/)).toBeDefined();
    expect(screen.getByText(/Section 5/)).toBeDefined();
  });

  it('renders SLI form fields inside Section 1', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Prometheus metric/)).toBeDefined();
    expect(screen.getByText(/Source type/)).toBeDefined();
    expect(screen.getByText(/Calculate/)).toBeDefined();
    expect(screen.getByText(/SLI type/)).toBeDefined();
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
    expect(screen.getByText(/Warn when error budget/)).toBeDefined();
    expect(screen.getByText(/Measurement window/)).toBeDefined();
  });

  it('renders SLO name in Section 3', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/SLO name/)).toBeDefined();
    expect(screen.getByText(/Rule group:/)).toBeDefined();
  });

  it('renders burn rate tiers with MWMBR info', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Burn rate tiers/)).toBeDefined();
    expect(screen.getByText(/Multi-window multi-burn-rate/)).toBeDefined();
  });

  it('renders Use recommended button', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Use recommended/)).toBeDefined();
  });

  it('renders SLO alarm checkboxes', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/SLI health alarm/)).toBeDefined();
    expect(screen.getByText(/attainment breach/)).toBeDefined();
    expect(screen.getByText(/Error budget warning/)).toBeDefined();
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
    expect(selects.length).toBeGreaterThanOrEqual(3); // calcMethod, sliType, windowDuration
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

  it('renders field text inputs for metric, service, operation', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(document.querySelectorAll('[data-eui="EuiFieldText"]').length).toBeGreaterThan(3);
  });

  it('renders description subtitle', () => {
    render(<CreateSloWizard {...defaultProps} apiClient={createMockApiClient()} />);
    expect(screen.getByText(/Define your SLO/)).toBeDefined();
  });
});
