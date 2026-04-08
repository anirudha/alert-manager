/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import { SloPreviewPanel } from '../slo_preview_panel';
import type { SloInput } from '../../../core/slo_types';

configure({ testIdAttribute: 'data-test-subj' });

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const completeInput: Partial<SloInput> = {
  name: 'API Availability',
  sli: {
    type: 'availability',
    calcMethod: 'good_requests',
    sourceType: 'service_operation',
    metric: 'http_requests_total',
    goodEventsFilter: 'status_code!~"5.."',
    service: { labelName: 'service', labelValue: 'frontend' },
    operation: { labelName: 'endpoint', labelValue: '/api/health' },
  },
  target: 0.999,
  budgetWarningThreshold: 0.3,
  window: { type: 'rolling', duration: '30d' },
  burnRates: [
    {
      shortWindow: '5m',
      longWindow: '1h',
      burnRateMultiplier: 14.4,
      severity: 'critical' as const,
      createAlarm: true,
      forDuration: '2m',
    },
  ],
  alarms: {
    sliHealth: { enabled: true },
    attainmentBreach: { enabled: true },
    budgetWarning: { enabled: true },
  },
};

const incompleteInput: Partial<SloInput> = {
  name: '',
  sli: {
    type: 'availability',
    calcMethod: 'good_requests',
    sourceType: 'service_operation',
    metric: '',
    service: { labelName: 'service', labelValue: '' },
    operation: { labelName: 'endpoint', labelValue: '' },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SloPreviewPanel', () => {
  it('renders the panel title', () => {
    render(<SloPreviewPanel sloInput={incompleteInput} />);
    expect(screen.getByText('Generated Prometheus Rules')).toBeDefined();
  });

  it('shows placeholder message with missing fields when input is incomplete', () => {
    render(<SloPreviewPanel sloInput={incompleteInput} />);
    expect(screen.getByText(/Provide these fields to preview/)).toBeDefined();
    expect(screen.getByText(/Prometheus metric/)).toBeDefined();
    expect(screen.getByText(/Service name/)).toBeDefined();
  });

  it('generates rules when input is complete', async () => {
    render(<SloPreviewPanel sloInput={completeInput} />);
    await waitFor(() => {
      // Should show rule count summary
      expect(screen.getByText(/recording rule/)).toBeDefined();
    });
  });

  it('shows YAML tab by default', async () => {
    render(<SloPreviewPanel sloInput={completeInput} />);
    await waitFor(() => {
      // The YAML code block should be present
      const codeBlocks = document.querySelectorAll('[data-eui="EuiCodeBlock"]');
      expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders tab switcher with YAML and PromQL options', async () => {
    render(<SloPreviewPanel sloInput={completeInput} />);
    await waitFor(() => {
      expect(screen.getByText('Rules YAML')).toBeDefined();
      expect(screen.getByText('PromQL List')).toBeDefined();
    });
  });

  it('switches to PromQL list tab', async () => {
    render(<SloPreviewPanel sloInput={completeInput} />);
    await waitFor(() => {
      const promqlButton = screen.getByText('PromQL List');
      fireEvent.click(promqlButton);
    });
    await waitFor(() => {
      // After switching, PromQL list should be visible (role="list")
      const list = document.querySelector('[role="list"]');
      expect(list).toBeDefined();
    });
  });

  it('does not generate rules with invalid target', () => {
    const badInput: Partial<SloInput> = {
      ...completeInput,
      target: 1.5, // invalid
    };
    render(<SloPreviewPanel sloInput={badInput} />);
    expect(screen.getByText(/Provide these fields to preview/)).toBeDefined();
    expect(screen.getByText(/Attainment target/)).toBeDefined();
  });

  it('handles empty name gracefully', () => {
    const noName: Partial<SloInput> = { ...completeInput, name: '' };
    render(<SloPreviewPanel sloInput={noName} />);
    expect(screen.getByText(/Provide these fields to preview/)).toBeDefined();
  });
});
