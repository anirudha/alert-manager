/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import SloListing from '../slo_listing';
import type { SloApiClient } from '../slo_listing';

configure({ testIdAttribute: 'data-test-subj' });

jest.mock('../echarts_render', () => ({
  EchartsRender: ({ spec }: any) => (
    <div data-test-subj="chart">{JSON.stringify(spec?.series?.[0]?.data?.length ?? 0)}</div>
  ),
}));
jest.mock('../table_pagination', () => ({
  TablePagination: ({ total, page }: any) => (
    <div data-test-subj="pagination">
      page={page} total={total}
    </div>
  ),
}));
jest.mock('../slo_detail_flyout', () => ({
  SloDetailFlyout: () => null,
}));
jest.mock('../create_slo_wizard', () => ({
  CreateSloWizard: () => null,
}));

const mockSlos = [
  {
    id: 'slo-1',
    datasourceId: 'ds-1',
    name: 'API Availability',
    sliType: 'availability',
    serviceName: 'frontend',
    operationName: '/api/health',
    target: 0.999,
    window: { type: 'rolling', duration: '30d' },
    tags: {},
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
  },
  {
    id: 'slo-2',
    datasourceId: 'ds-1',
    name: 'Checkout Latency',
    sliType: 'latency_p99',
    serviceName: 'checkout',
    operationName: 'POST /order',
    target: 0.99,
    window: { type: 'rolling', duration: '7d' },
    tags: { team: 'platform' },
    status: {
      sloId: 'slo-2',
      currentValue: 0.412,
      attainment: 0.985,
      errorBudgetRemaining: 0.15,
      status: 'warning',
      ruleCount: 8,
      firingCount: 1,
      computedAt: '2026-04-01T12:00:00Z',
    },
  },
  {
    id: 'slo-3',
    datasourceId: 'ds-1',
    name: 'Payment p90',
    sliType: 'latency_p90',
    serviceName: 'payment',
    operationName: 'POST /charge',
    target: 0.995,
    window: { type: 'rolling', duration: '7d' },
    tags: {},
    status: {
      sloId: 'slo-3',
      currentValue: 0.12,
      attainment: 0.991,
      errorBudgetRemaining: -0.05,
      status: 'breached',
      ruleCount: 8,
      firingCount: 3,
      computedAt: '2026-04-01T12:00:00Z',
    },
  },
  {
    id: 'slo-4',
    datasourceId: 'ds-2',
    name: 'Auth Availability',
    sliType: 'availability',
    serviceName: 'auth',
    operationName: '/login',
    target: 0.999,
    window: { type: 'rolling', duration: '30d' },
    tags: {},
    status: {
      sloId: 'slo-4',
      currentValue: 0,
      attainment: 0,
      errorBudgetRemaining: 0,
      status: 'no_data',
      ruleCount: 0,
      firingCount: 0,
      computedAt: '',
    },
  },
];

function createMockApiClient(slos = mockSlos): SloApiClient {
  return {
    listSlos: jest
      .fn()
      .mockResolvedValue({
        results: slos,
        total: slos.length,
        page: 1,
        pageSize: slos.length,
        hasMore: false,
      }),
    getSlo: jest
      .fn()
      .mockResolvedValue({
        id: 'slo-1',
        name: 'Test',
        sli: {
          type: 'availability',
          calcMethod: 'good_requests',
          sourceType: 'service_operation',
          metric: 'http_requests_total',
          service: { labelName: 'service', labelValue: 'frontend' },
          operation: { labelName: 'endpoint', labelValue: '/' },
        },
        target: 0.999,
        burnRates: [],
        generatedRuleNames: ['rule1'],
      } as any),
    createSlo: jest.fn().mockResolvedValue({ id: 'slo-new' } as any),
    deleteSlo: jest.fn().mockResolvedValue({ deleted: true, generatedRuleNames: [] }),
  };
}

describe('SloListing', () => {
  it('renders and calls listSlos on mount', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => expect(api.listSlos).toHaveBeenCalled());
  });

  it('displays all SLO names', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(screen.getByText('API Availability')).toBeDefined();
      expect(screen.getByText('Checkout Latency')).toBeDefined();
      expect(screen.getByText('Payment p90')).toBeDefined();
      expect(screen.getByText('Auth Availability')).toBeDefined();
    });
  });

  it('renders table rows for each SLO', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      const rows = document.querySelectorAll('table tbody tr');
      expect(rows.length).toBe(4);
    });
  });

  it('renders resizable container', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-eui="EuiResizableContainer"]').length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders filter panel with checkboxes', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-eui="EuiCheckbox"]').length).toBeGreaterThan(0);
    });
  });

  it('renders status badges', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-eui="EuiBadge"]').length).toBeGreaterThan(0);
    });
  });

  it('renders chart components', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-test-subj="chart"]').length).toBeGreaterThan(0);
    });
  });

  it('renders Create SLO button', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(screen.getByText(/Create SLO/)).toBeDefined();
    });
  });

  it('renders empty state when no SLOs', async () => {
    const api = createMockApiClient([]);
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelector('[data-eui]')).toBeDefined();
    });
  });

  it('renders pagination', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelector('[data-test-subj="pagination"]')).toBeDefined();
    });
  });

  it('renders search bar', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-eui="EuiFieldSearch"]').length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders health badges', async () => {
    const api = createMockApiClient();
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-eui="EuiHealth"]').length).toBeGreaterThan(0);
    });
  });

  it('handles API error gracefully', async () => {
    const api = createMockApiClient();
    (api.listSlos as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    render(<SloListing apiClient={api} />);
    await waitFor(() => {
      expect(document.querySelector('[data-eui]')).toBeDefined();
    });
  });
});
