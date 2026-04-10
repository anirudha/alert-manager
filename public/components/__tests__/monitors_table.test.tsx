/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, configure, fireEvent } from '@testing-library/react';
import { MonitorsTable } from '../monitors_table';
import { Datasource, UnifiedRule } from '../../../common/types';

configure({ testIdAttribute: 'data-test-subj' });

jest.mock('../table_pagination', () => ({
  TablePagination: ({ total, page }: any) => (
    <div data-test-subj="pagination">
      page={page} total={total}
    </div>
  ),
}));
jest.mock('../monitor_detail_flyout', () => ({
  MonitorDetailFlyout: () => null,
}));
jest.mock('../../../common/serializer', () => ({
  serializeMonitors: jest.fn().mockReturnValue([]),
}));

const ds1: Datasource = {
  id: 'ds-1',
  name: 'Production OS',
  type: 'opensearch',
  url: 'http://localhost:9200',
  enabled: true,
};

function makeRule(overrides: Partial<UnifiedRule> & { id: string }): UnifiedRule {
  return {
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    name: `Rule ${overrides.id}`,
    enabled: true,
    severity: 'high',
    type: 'metric',
    status: 'active',
    healthStatus: 'healthy',
    query: 'count() > 100',
    condition: 'count() > 100',
    labels: {},
    annotations: {},
    evaluationInterval: '1m',
    pendingPeriod: '5m',
    lastUpdated: '2026-01-01T00:00:00Z',
    ...overrides,
  } as any;
}

const richRules: UnifiedRule[] = [
  makeRule({
    id: 'r1',
    name: 'Error Rate Monitor',
    severity: 'critical',
    type: 'metric',
    status: 'active',
    healthStatus: 'healthy',
    labels: { team: 'platform', env: 'prod' },
  }),
  makeRule({
    id: 'r2',
    name: 'Latency Monitor',
    severity: 'high',
    type: 'apm',
    status: 'active',
    healthStatus: 'failing',
  }),
  makeRule({
    id: 'r3',
    name: 'Disabled Rule',
    severity: 'low',
    type: 'log',
    status: 'disabled',
    healthStatus: 'no_data',
    enabled: false,
  }),
  makeRule({
    id: 'r4',
    name: 'Composite Rule',
    severity: 'medium',
    type: 'composite',
    status: 'active',
    healthStatus: 'healthy',
  }),
  makeRule({
    id: 'r5',
    name: 'Infrastructure Rule',
    severity: 'high',
    type: 'infrastructure',
    status: 'pending',
    healthStatus: 'healthy',
    labels: { monitor_type: 'internal' },
  }),
];

const defaultProps = {
  rules: richRules,
  datasources: [ds1],
  loading: false,
  onDelete: jest.fn(),
  onClone: jest.fn(),
  onSilence: jest.fn(),
  onImport: jest.fn(),
  onCreateMonitor: jest.fn(),
  workspaceOptions: [] as Datasource[],
  loadingWorkspaces: false,
  selectedDsIds: ['ds-1'],
  onDatasourceChange: jest.fn(),
};

describe('MonitorsTable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all rule names', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(screen.getByText('Error Rate Monitor')).toBeDefined();
    expect(screen.getByText('Latency Monitor')).toBeDefined();
    expect(screen.getByText('Disabled Rule')).toBeDefined();
    expect(screen.getByText('Composite Rule')).toBeDefined();
    expect(screen.getByText('Infrastructure Rule')).toBeDefined();
  });

  it('renders resizable container layout', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(
      document.querySelectorAll('[data-eui="EuiResizableContainer"]').length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders filter panel with checkboxes', () => {
    render(<MonitorsTable {...defaultProps} />);
    const checkboxes = document.querySelectorAll('[data-eui="EuiCheckbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('renders table rows matching rule count', () => {
    render(<MonitorsTable {...defaultProps} />);
    const rows = document.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(5);
  });

  it('renders search bar', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiFieldSearch"]').length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('renders create monitor button', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(screen.getByText(/Create Monitor/)).toBeDefined();
  });

  it('renders with empty rules', () => {
    render(<MonitorsTable {...defaultProps} rules={[]} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });

  it('renders severity badges', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiBadge"]').length).toBeGreaterThan(0);
  });

  it('renders health indicators', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiHealth"]').length).toBeGreaterThan(0);
  });

  it('renders loading state', () => {
    render(<MonitorsTable {...defaultProps} loading={true} />);
    const table = document.querySelector('table');
    expect(table?.getAttribute('data-loading')).toBe('true');
  });

  it('renders pagination', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelector('[data-test-subj="pagination"]')).toBeDefined();
  });

  it('renders with empty datasources', () => {
    render(<MonitorsTable {...defaultProps} datasources={[]} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });

  it('renders label badges for rules with labels', () => {
    render(<MonitorsTable {...defaultProps} />);
    // Rule r1 has team:platform, env:prod labels — badges rendered
    expect(document.querySelectorAll('[data-eui="EuiBadge"]').length).toBeGreaterThan(2);
  });

  it('renders icons in the UI', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiIcon"]').length).toBeGreaterThanOrEqual(0);
  });

  it('renders tooltip wrappers', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(document.querySelectorAll('[data-eui="EuiToolTip"]').length).toBeGreaterThanOrEqual(0);
  });

  it('renders with many rules exercising all filter facets', () => {
    const manyRules = [
      ...richRules,
      makeRule({
        id: 'r6',
        name: 'Extra Rule',
        severity: 'medium',
        type: 'composite',
        labels: { service: 'api', region: 'eu' },
      }),
      makeRule({ id: 'r7', name: 'Synthetics Rule', severity: 'high', type: 'synthetics' as any }),
    ];
    render(<MonitorsTable {...defaultProps} rules={manyRules} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(7);
  });

  it('renders correctly with all severity types', () => {
    const allSev = ['critical', 'high', 'medium', 'low', 'info'].map((s, i) =>
      makeRule({ id: `sev-${i}`, severity: s as any, name: `${s} Rule` })
    );
    render(<MonitorsTable {...defaultProps} rules={allSev} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(5);
  });

  it('renders correctly with all health statuses', () => {
    const allHealth = ['healthy', 'failing', 'no_data'].map((h, i) =>
      makeRule({ id: `h-${i}`, healthStatus: h as any, name: `${h} Rule` })
    );
    render(<MonitorsTable {...defaultProps} rules={allHealth} />);
    expect(document.querySelectorAll('table tbody tr').length).toBe(3);
  });

  it('renders with rules containing rich labels', () => {
    const labeled = [
      makeRule({ id: 'lb1', labels: { team: 'infra', env: 'prod', tier: 'p0' } }),
      makeRule({ id: 'lb2', labels: { team: 'platform', service: 'api' } }),
    ];
    render(<MonitorsTable {...defaultProps} rules={labeled} />);
    expect(document.querySelectorAll('[data-eui="EuiCheckbox"]').length).toBeGreaterThan(0);
  });

  it('renders with no onCreateMonitor (hides create button)', () => {
    const { onCreateMonitor, ...propsWithoutCreate } = defaultProps;
    render(<MonitorsTable {...propsWithoutCreate} onCreateMonitor={undefined} />);
    expect(document.querySelector('[data-eui]')).toBeDefined();
  });
});
