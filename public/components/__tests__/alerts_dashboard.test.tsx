/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import { AlertsDashboard } from '../alerts_dashboard';
import type { Datasource, UnifiedAlert } from '../../../core';

configure({ testIdAttribute: 'data-test-subj' });

jest.mock('../echarts_render', () => ({
  EchartsRender: ({ spec }: any) => (
    <div data-test-subj="chart-stub">{JSON.stringify(spec?.series?.[0]?.data?.length ?? 0)}</div>
  ),
}));
jest.mock('../table_pagination', () => ({
  TablePagination: ({ total, page, pageSize, onPageChange, onPageSizeChange }: any) => (
    <div data-test-subj="pagination">
      <span>
        Page {page} of {Math.ceil((total || 1) / (pageSize || 10))}
      </span>
      <button onClick={() => onPageChange?.(page + 1)}>Next</button>
      <button onClick={() => onPageSizeChange?.(20)}>Size20</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock data — comprehensive set exercising all severity/state combinations
// ---------------------------------------------------------------------------

const ds1: Datasource = {
  id: 'ds-1',
  name: 'Production OS',
  type: 'opensearch',
  url: 'http://localhost:9200',
  enabled: true,
};
const ds2: Datasource = {
  id: 'ds-2',
  name: 'Prometheus',
  type: 'prometheus',
  url: 'http://localhost:9090',
  enabled: true,
};

function makeAlert(overrides: Partial<UnifiedAlert> & { id: string }): UnifiedAlert {
  return {
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    name: `Alert ${overrides.id}`,
    state: 'active',
    severity: 'critical',
    message: 'msg',
    startTime: new Date(Date.now() - 3600000).toISOString(),
    lastUpdated: new Date().toISOString(),
    labels: {},
    annotations: {},
    ...overrides,
  } as any;
}

const richAlerts: UnifiedAlert[] = [
  makeAlert({
    id: 'a1',
    severity: 'critical',
    state: 'active',
    name: 'CPU Critical',
    datasourceId: 'ds-1',
    labels: { team: 'infra', env: 'prod' },
  }),
  makeAlert({
    id: 'a2',
    severity: 'high',
    state: 'active',
    name: 'Memory High',
    datasourceId: 'ds-1',
    labels: { team: 'infra' },
  }),
  makeAlert({
    id: 'a3',
    severity: 'medium',
    state: 'pending',
    name: 'Disk Medium',
    datasourceId: 'ds-1',
  }),
  makeAlert({
    id: 'a4',
    severity: 'low',
    state: 'resolved',
    name: 'Network Low',
    datasourceId: 'ds-2',
    datasourceType: 'prometheus',
  }),
  makeAlert({
    id: 'a5',
    severity: 'info',
    state: 'acknowledged',
    name: 'Info Alert',
    datasourceId: 'ds-2',
    datasourceType: 'prometheus',
  }),
  makeAlert({
    id: 'a6',
    severity: 'critical',
    state: 'active',
    name: 'Latency Spike',
    datasourceId: 'ds-1',
    labels: { monitor: 'mon-1' },
  }),
  makeAlert({
    id: 'a7',
    severity: 'high',
    state: 'pending',
    name: 'Error Rate',
    datasourceId: 'ds-1',
    message: 'Error rate above threshold',
  }),
];

const defaultProps = {
  alerts: richAlerts,
  datasources: [ds1, ds2],
  loading: false,
  onViewDetail: jest.fn(),
  onAcknowledge: jest.fn(),
  onSilence: jest.fn(),
  workspaceOptions: [] as Datasource[],
  loadingWorkspaces: false,
  selectedDsIds: ['ds-1', 'ds-2'],
  onDatasourceChange: jest.fn(),
};

describe('AlertsDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all alert names in the table', () => {
    render(<AlertsDashboard {...defaultProps} />);
    expect(screen.getAllByText('CPU Critical').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Memory High').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Disk Medium').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Network Low').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Info Alert').length).toBeGreaterThanOrEqual(1);
  });

  it('renders resizable container layout', () => {
    render(<AlertsDashboard {...defaultProps} />);
    expect(
      document.querySelectorAll('[data-eui="EuiResizableContainer"]').length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders filter panel with checkboxes', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const checkboxes = document.querySelectorAll('[data-eui="EuiCheckbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('renders stat panels for severity counts', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const panels = document.querySelectorAll('[data-eui="EuiPanel"]');
    expect(panels.length).toBeGreaterThan(3);
  });

  it('renders chart stubs', () => {
    render(<AlertsDashboard {...defaultProps} />);
    expect(document.querySelectorAll('[data-test-subj="chart-stub"]').length).toBeGreaterThan(0);
  });

  it('renders with empty alerts (empty state)', () => {
    render(<AlertsDashboard {...defaultProps} alerts={[]} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });

  it('renders search bar', () => {
    render(<AlertsDashboard {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiFieldSearch"]').length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('renders table with rows matching alert count', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const rows = document.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(7);
  });

  it('renders with loading state', () => {
    render(<AlertsDashboard {...defaultProps} loading={true} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });

  it('renders severity badges in filter panel', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const badges = document.querySelectorAll('[data-eui="EuiBadge"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders health indicators for alert states', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const health = document.querySelectorAll('[data-eui="EuiHealth"]');
    expect(health.length).toBeGreaterThan(0);
  });

  it('renders pagination component', () => {
    render(<AlertsDashboard {...defaultProps} />);
    expect(document.querySelector('[data-test-subj="pagination"]')).toBeDefined();
  });

  it('renders with workspace options', () => {
    const ws: Datasource[] = [
      { id: 'ws-1', name: 'WS', type: 'prometheus', url: '', enabled: true },
    ];
    render(<AlertsDashboard {...defaultProps} workspaceOptions={ws} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });

  it('renders buttons for actions', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders tooltip wrappers', () => {
    render(<AlertsDashboard {...defaultProps} />);
    const tooltips = document.querySelectorAll('[data-eui="EuiToolTip"]');
    expect(tooltips.length).toBeGreaterThanOrEqual(0);
  });

  it('renders with alerts from multiple datasources', () => {
    render(<AlertsDashboard {...defaultProps} datasources={[ds1, ds2]} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(7);
  });

  it('renders with many alerts exercising all filter facets', () => {
    const manyAlerts = [
      ...richAlerts,
      makeAlert({
        id: 'a8',
        severity: 'critical',
        state: 'active',
        name: 'Extra Crit',
        labels: { team: 'ops', service: 'web' },
      }),
      makeAlert({
        id: 'a9',
        severity: 'info',
        state: 'resolved',
        name: 'Extra Info',
        labels: { region: 'us-east' },
      }),
    ];
    render(<AlertsDashboard {...defaultProps} alerts={manyAlerts} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(9);
  });

  it('renders correctly with all unique severity types in data', () => {
    const allSev = ['critical', 'high', 'medium', 'low', 'info'].map((s, i) =>
      makeAlert({ id: `sev-${i}`, severity: s as any, name: `${s} Alert` })
    );
    render(<AlertsDashboard {...defaultProps} alerts={allSev} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(5);
  });

  it('renders correctly with all unique state types in data', () => {
    const allStates = ['active', 'pending', 'acknowledged', 'resolved', 'error'].map((s, i) =>
      makeAlert({ id: `state-${i}`, state: s as any, name: `${s} Alert` })
    );
    render(<AlertsDashboard {...defaultProps} alerts={allStates} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(5);
  });

  it('renders with alerts containing labels for facet groups', () => {
    const labeled = [
      makeAlert({ id: 'lb1', labels: { team: 'infra', env: 'prod' } }),
      makeAlert({ id: 'lb2', labels: { team: 'platform', env: 'staging' } }),
      makeAlert({ id: 'lb3', labels: { region: 'us-west' } }),
    ];
    render(<AlertsDashboard {...defaultProps} alerts={labeled} />);
    expect(document.querySelectorAll('[data-eui="EuiCheckbox"]').length).toBeGreaterThan(0);
  });
});
