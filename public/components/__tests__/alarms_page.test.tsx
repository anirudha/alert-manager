/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure } from '@testing-library/react';
import { AlarmsPage } from '../alarms_page';

// OSD uses data-test-subj instead of data-testid
configure({ testIdAttribute: 'data-test-subj' });
import { AlarmsApiClient, HttpClient } from '../../services/alarms_client';
import { Datasource } from '../../../core';

// ---------------------------------------------------------------------------
// Mock data
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
];

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
];

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
    put: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
}

function createMockApiClient(
  alerts = mockAlerts,
  rules = mockRules,
  datasources = mockDatasources
): AlarmsApiClient {
  const client = createMockHttpClient();
  const apiClient = new AlarmsApiClient(client, 'standalone');
  jest.spyOn(apiClient, 'listDatasources').mockResolvedValue(datasources);
  jest.spyOn(apiClient, 'listWorkspaces').mockResolvedValue([]);
  jest.spyOn(apiClient, 'listAlertsPaginated').mockResolvedValue({
    results: alerts as any,
    total: alerts.length,
    page: 1,
    pageSize: alerts.length,
    hasMore: false,
  });
  jest.spyOn(apiClient, 'listRulesPaginated').mockResolvedValue({
    results: rules as any,
    total: rules.length,
    page: 1,
    pageSize: rules.length,
    hasMore: false,
  });
  return apiClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlarmsPage', () => {
  it('renders the page heading', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByText('Alert Manager')).toBeDefined();
    });
  });

  it('renders all 5 tabs', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Alerts/i })).toBeDefined();
      expect(screen.getByRole('tab', { name: /Rules/i })).toBeDefined();
      expect(screen.getByRole('tab', { name: /Routing/i })).toBeDefined();
      expect(screen.getByRole('tab', { name: /Suppression/i })).toBeDefined();
      expect(screen.getByRole('tab', { name: /SLOs/i })).toBeDefined();
    });
  });

  it('calls datasources API on mount', async () => {
    const apiClient = createMockApiClient();
    render(<AlarmsPage apiClient={apiClient} />);
    await waitFor(() => {
      expect(apiClient.listDatasources).toHaveBeenCalled();
    });
  });
});
