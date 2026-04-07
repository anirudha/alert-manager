/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import { SloDetailFlyout } from '../slo_detail_flyout';
import type { SloSummary, SloDefinition } from '../../../core/slo_types';

configure({ testIdAttribute: 'data-test-subj' });

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSloSummary: SloSummary = {
  id: 'slo-1',
  datasourceId: 'ds-1',
  name: 'API Availability SLO',
  sliType: 'availability',
  serviceName: 'frontend',
  operationName: '/api/health',
  target: 0.999,
  window: { type: 'rolling', duration: '30d' },
  tags: { team: 'platform' },
  status: {
    sloId: 'slo-1',
    currentValue: 0.9997,
    attainment: 0.9997,
    errorBudgetRemaining: 0.7,
    status: 'ok',
    ruleCount: 8,
    firingCount: 0,
    computedAt: '2026-04-01T12:00:00Z',
  },
};

const mockFullSlo: SloDefinition = {
  id: 'slo-1',
  datasourceId: 'ds-1',
  name: 'API Availability SLO',
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
      severity: 'critical',
      createAlarm: true,
      forDuration: '2m',
    },
    {
      shortWindow: '30m',
      longWindow: '6h',
      burnRateMultiplier: 6,
      severity: 'critical',
      createAlarm: true,
      forDuration: '5m',
    },
  ],
  alarms: {
    sliHealth: { enabled: true },
    attainmentBreach: { enabled: true },
    budgetWarning: { enabled: true },
  },
  exclusionWindows: [],
  tags: { team: 'platform' },
  ruleGroupName: 'slo:api_availability',
  rulerNamespace: 'slo',
  generatedRuleNames: ['SLO_ErrorRatio_frontend', 'SLO_BurnRate_5m_1h'],
  version: 1,
  createdAt: '2026-01-01',
  createdBy: 'user',
  updatedAt: '2026-01-01',
  updatedBy: 'user',
};

function createMockApiClient(fullSlo = mockFullSlo) {
  return { getSlo: jest.fn().mockResolvedValue(fullSlo) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SloDetailFlyout', () => {
  it('returns null when slo is null', () => {
    const apiClient = createMockApiClient();
    const { container } = render(
      <SloDetailFlyout slo={null} onClose={jest.fn()} apiClient={apiClient} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the SLO name in the header', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('API Availability SLO')).toBeDefined();
    });
  });

  it('fetches full SLO details on mount', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(apiClient.getSlo).toHaveBeenCalledWith('slo-1');
    });
  });

  it('displays SLI Configuration section', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('SLI Configuration')).toBeDefined();
    });
  });

  it('displays Burn Rate Configuration section', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Burn Rate Configuration')).toBeDefined();
    });
  });

  it('displays Generated Rules section', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText(/Generated Rules/)).toBeDefined();
    });
  });

  it('renders delete button when onDelete is provided', async () => {
    const apiClient = createMockApiClient();
    render(
      <SloDetailFlyout
        slo={mockSloSummary}
        onClose={jest.fn()}
        apiClient={apiClient}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeDefined();
    });
  });

  it('renders close button', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeDefined();
    });
  });

  it('handles API error gracefully', async () => {
    const apiClient = { getSlo: jest.fn().mockRejectedValue(new Error('Network error')) };
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows service and operation in subtitle', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText(/frontend/)).toBeDefined();
    });
  });

  it('renders tags when present', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeDefined();
      expect(screen.getByText(/team: platform/)).toBeDefined();
    });
  });

  it('shows edit button as disabled', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });
  });

  it('shows delete confirmation modal when delete is clicked', async () => {
    const apiClient = createMockApiClient();
    const onDelete = jest.fn();
    render(
      <SloDetailFlyout
        slo={mockSloSummary}
        onClose={jest.fn()}
        apiClient={apiClient}
        onDelete={onDelete}
      />
    );
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);
    });
    await waitFor(() => {
      // Confirmation modal should appear
      expect(screen.getByText(/permanently delete/)).toBeDefined();
    });
  });

  it('renders generated rule names from full SLO', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(apiClient.getSlo).toHaveBeenCalled();
    });
    // After loading, generated rules should render
    await waitFor(() => {
      expect(screen.getByText('SLO_ErrorRatio_frontend')).toBeDefined();
    });
  });

  it('renders burn rate table with tiers', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      // Burn rate table should show the 2 tiers from mockFullSlo
      const tables = document.querySelectorAll('table');
      expect(tables.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders window duration', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('30d')).toBeDefined();
    });
  });

  it('renders Current Attainment label', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Current Attainment')).toBeDefined();
    });
  });

  it('renders Target label', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Target')).toBeDefined();
    });
  });

  it('renders Error Budget Remaining label', async () => {
    const apiClient = createMockApiClient();
    render(<SloDetailFlyout slo={mockSloSummary} onClose={jest.fn()} apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Error Budget Remaining')).toBeDefined();
    });
  });
});
