/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, configure } from '@testing-library/react';
import { AlarmsPage } from '../alarms_page';

// OSD uses data-test-subj instead of data-testid
configure({ testIdAttribute: 'data-test-subj' });
import { AlarmsApiClient, HttpClient } from '../../services/alarms_client';
import { UnifiedAlertSummary, UnifiedRuleSummary, Datasource } from '../../../core';

// ---------------------------------------------------------------------------
// Helpers — use Partial with `as` cast since the component only reads
// display fields (name, state, severity, etc.), not the full type.
// ---------------------------------------------------------------------------

const mockAlerts = [
  {
    id: 'alert-1',
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    name: 'High CPU Alert',
    state: 'active',
    severity: 'critical',
    message: 'CPU usage above 90%',
    startTime: '2026-04-01T12:00:00Z',
    lastUpdated: '2026-04-01T12:00:00Z',
    labels: {},
    annotations: {},
  },
  {
    id: 'alert-2',
    datasourceId: 'ds-2',
    datasourceType: 'prometheus',
    name: 'Memory Warning',
    state: 'pending',
    severity: 'high',
    startTime: '2026-04-01T13:00:00Z',
    lastUpdated: '2026-04-01T13:00:00Z',
    labels: {},
    annotations: {},
  },
] as unknown as UnifiedAlertSummary[];

const mockRules = [
  {
    id: 'rule-1',
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    name: 'Error Rate Monitor',
    enabled: true,
    severity: 'high',
    query: 'count() > 100',
    condition: 'count() > 100',
    labels: {},
    annotations: {},
  },
] as unknown as UnifiedRuleSummary[];

const mockDatasources: Datasource[] = [
  {
    id: 'ds-1',
    name: 'Production OS',
    type: 'opensearch',
    url: 'http://localhost:9200',
    enabled: true,
  },
  {
    id: 'ds-2',
    name: 'Prometheus',
    type: 'prometheus',
    url: 'http://localhost:9090',
    enabled: true,
  },
];

function createMockHttpClient(): HttpClient {
  return {
    get: jest.fn().mockResolvedValue({}),
    post: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
}

function createMockApiClient(
  alerts: UnifiedAlertSummary[] = mockAlerts,
  rules: UnifiedRuleSummary[] = mockRules,
  datasources: Datasource[] = mockDatasources
): AlarmsApiClient {
  const client = createMockHttpClient();
  const apiClient = new AlarmsApiClient(client, 'standalone');
  // Override the methods to return mock data directly
  jest.spyOn(apiClient, 'listAlerts').mockResolvedValue(alerts);
  jest.spyOn(apiClient, 'listRules').mockResolvedValue(rules);
  jest.spyOn(apiClient, 'listDatasources').mockResolvedValue(datasources);
  return apiClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlarmsPage', () => {
  it('renders the page container with data-test-subj', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerPage')).toBeDefined();
    });
  });

  it('renders alerts tab and rules tab', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerTab-alerts')).toBeDefined();
      expect(screen.getByTestId('alertManagerTab-rules')).toBeDefined();
    });
  });

  it('shows alerts tab as selected by default', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      const alertsTab = screen.getByTestId('alertManagerTab-alerts');
      expect(alertsTab.getAttribute('data-selected')).toBe('true');
    });
  });

  it('renders alerts table with data when alerts exist', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerAlertsTable')).toBeDefined();
    });
  });

  it('shows empty prompt when no alerts', async () => {
    const apiClient = createMockApiClient([], mockRules, mockDatasources);
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerEmptyAlerts')).toBeDefined();
    });
  });

  it('switches to rules tab on click', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerTab-rules')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('alertManagerTab-rules'));

    await waitFor(() => {
      expect(screen.getByTestId('alertManagerRulesTable')).toBeDefined();
    });
  });

  it('shows empty prompt when switching to rules tab with no rules', async () => {
    const apiClient = createMockApiClient(mockAlerts, [], mockDatasources);
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerTab-rules')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('alertManagerTab-rules'));

    await waitFor(() => {
      expect(screen.getByTestId('alertManagerEmptyRules')).toBeDefined();
    });
  });

  it('displays alert counts in tab labels', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      const alertsTab = screen.getByTestId('alertManagerTab-alerts');
      expect(alertsTab.textContent).toContain('Alerts (2)');
    });
  });

  it('displays rule counts after switching to rules tab', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByTestId('alertManagerTab-rules')).toBeDefined();
    });

    // Rules are lazy-loaded — switch to rules tab first
    fireEvent.click(screen.getByTestId('alertManagerTab-rules'));

    await waitFor(() => {
      const rulesTab = screen.getByTestId('alertManagerTab-rules');
      expect(rulesTab.textContent).toContain('Rules (1)');
    });
  });

  it('calls alerts and datasources API on mount (lazy — rules not fetched)', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(apiClient.listAlerts).toHaveBeenCalled();
      expect(apiClient.listDatasources).toHaveBeenCalled();
    });
    // Rules are lazy-loaded — not fetched until tab is clicked
    expect(apiClient.listRules).not.toHaveBeenCalled();
  });
});
