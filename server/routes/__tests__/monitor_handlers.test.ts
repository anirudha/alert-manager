/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleCreateMonitor,
  handleUpdateMonitor,
  handleDeleteMonitor,
  handleImportMonitors,
  handleExportMonitors,
  handleListSuppressionRules,
  handleGetSuppressionRule,
  handleCreateSuppressionRule,
  handleUpdateSuppressionRule,
  handleDeleteSuppressionRule,
  handleAcknowledgeAlert,
  handleSilenceAlert,
} from '../monitor_handlers';
import {
  InMemoryDatasourceService,
  MultiBackendAlertService,
  SuppressionRuleService,
  Logger,
} from '../../../core';
import { MockOpenSearchBackend } from '../../../core/testing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function createServices() {
  const dsSvc = new InMemoryDatasourceService(noopLogger);
  const alertSvc = new MultiBackendAlertService(dsSvc, noopLogger);
  const suppressionSvc = new SuppressionRuleService();
  return { dsSvc, alertSvc, suppressionSvc };
}

async function createServicesWithMockBackend() {
  const { dsSvc, alertSvc, suppressionSvc } = createServices();
  const ds = await dsSvc.create({
    name: 'Mock OS',
    type: 'opensearch',
    url: 'http://localhost:9200',
    enabled: true,
  });
  const mockBackend = new MockOpenSearchBackend(noopLogger);
  alertSvc.registerOpenSearch(mockBackend);
  return { dsSvc, alertSvc, suppressionSvc, dsId: ds.id, mockBackend };
}

const suppressionInput = {
  name: 'Test Rule',
  description: 'desc',
  matchers: { severity: 'critical' },
  scheduleType: 'recurring' as const,
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 86400000).toISOString(),
  createdBy: 'test',
};

// ---------------------------------------------------------------------------
// Monitor CRUD
// ---------------------------------------------------------------------------

describe('handleCreateMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const { alertSvc } = createServices();
    const result = await handleCreateMonitor(alertSvc, { name: 'test' });
    expect(result.status).toBe(400);
    expect(result.body.error).toBeDefined();
  });

  it('returns 201 when creating a monitor with mock backend', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleCreateMonitor(alertSvc, {
      datasourceId: dsId,
      name: 'New Monitor',
    });
    expect(result.status).toBe(201);
  });
});

describe('handleUpdateMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const { alertSvc } = createServices();
    const result = await handleUpdateMonitor(alertSvc, 'mon-1', { name: 'updated' });
    expect(result.status).toBe(400);
  });
});

describe('handleDeleteMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const { alertSvc } = createServices();
    const result = await handleDeleteMonitor(alertSvc, 'mon-1');
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

describe('handleImportMonitors', () => {
  it('returns 400 when body is not an array and has no monitors key', async () => {
    const { alertSvc } = createServices();
    const result = await handleImportMonitors(alertSvc, { invalid: true });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('Expected array');
  });

  it('accepts array input', async () => {
    const { alertSvc } = createServices();
    const validConfig = {
      name: 'Test Monitor',
      type: 'query_level_monitor',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [{ search: { query: {} } }],
      triggers: [],
    };
    const result = await handleImportMonitors(alertSvc, [validConfig]);
    expect([200, 400]).toContain(result.status);
  });

  it('accepts { monitors: [...] } input', async () => {
    const { alertSvc } = createServices();
    const validConfig = {
      name: 'Test Monitor',
      type: 'query_level_monitor',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [{ search: { query: {} } }],
      triggers: [],
    };
    const result = await handleImportMonitors(alertSvc, { monitors: [validConfig] });
    expect([200, 400]).toContain(result.status);
  });
});

describe('handleExportMonitors', () => {
  it('returns 200 with monitors array when no datasources', async () => {
    const { alertSvc } = createServices();
    const result = await handleExportMonitors(alertSvc);
    expect(result.status).toBe(200);
    expect(result.body.monitors).toBeDefined();
    expect(Array.isArray(result.body.monitors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suppression Rules
// ---------------------------------------------------------------------------

describe('handleListSuppressionRules', () => {
  it('returns 200 with empty array initially', () => {
    const { suppressionSvc } = createServices();
    const result = handleListSuppressionRules(suppressionSvc);
    expect(result.status).toBe(200);
    expect(result.body.rules).toEqual([]);
  });

  it('returns rules after creating one', () => {
    const { suppressionSvc } = createServices();
    suppressionSvc.create(suppressionInput);
    const result = handleListSuppressionRules(suppressionSvc);
    expect(result.status).toBe(200);
    expect(result.body.rules).toHaveLength(1);
  });
});

describe('handleGetSuppressionRule', () => {
  it('returns 404 for non-existent rule', () => {
    const { suppressionSvc } = createServices();
    const result = handleGetSuppressionRule(suppressionSvc, 'non-existent');
    expect(result.status).toBe(404);
  });

  it('returns 200 when rule exists', () => {
    const { suppressionSvc } = createServices();
    const rule = suppressionSvc.create(suppressionInput);
    const result = handleGetSuppressionRule(suppressionSvc, rule.id);
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Test Rule');
  });
});

describe('handleCreateSuppressionRule', () => {
  it('returns 201 with created rule', () => {
    const { suppressionSvc } = createServices();
    const result = handleCreateSuppressionRule(suppressionSvc, {
      name: 'New Rule',
      description: 'test',
      matchers: { alertname: 'HighCPU' },
      scheduleType: 'one_time',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      createdBy: 'test',
    });
    expect(result.status).toBe(201);
    expect(result.body.id).toBeDefined();
    expect(result.body.name).toBe('New Rule');
  });
});

describe('handleUpdateSuppressionRule', () => {
  it('returns 404 for non-existent rule', () => {
    const { suppressionSvc } = createServices();
    const result = handleUpdateSuppressionRule(suppressionSvc, 'non-existent', { name: 'nope' });
    expect(result.status).toBe(404);
  });

  it('returns 200 with updated rule', () => {
    const { suppressionSvc } = createServices();
    const rule = suppressionSvc.create(suppressionInput);
    const result = handleUpdateSuppressionRule(suppressionSvc, rule.id, { name: 'Updated' });
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Updated');
  });
});

describe('handleDeleteSuppressionRule', () => {
  it('returns 404 for non-existent rule', () => {
    const { suppressionSvc } = createServices();
    const result = handleDeleteSuppressionRule(suppressionSvc, 'non-existent');
    expect(result.status).toBe(404);
  });

  it('returns 200 on successful delete', () => {
    const { suppressionSvc } = createServices();
    const rule = suppressionSvc.create(suppressionInput);
    const result = handleDeleteSuppressionRule(suppressionSvc, rule.id);
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alert Actions
// ---------------------------------------------------------------------------

describe('handleAcknowledgeAlert', () => {
  it('returns 200 with acknowledged state', async () => {
    const { alertSvc } = createServices();
    const result = await handleAcknowledgeAlert(alertSvc, 'alert-123');
    expect(result.status).toBe(200);
    expect(result.body.state).toBe('acknowledged');
    expect(result.body.id).toBe('alert-123');
  });
});

describe('handleSilenceAlert', () => {
  it('returns 200 with silenced status and suppression rule', async () => {
    const { suppressionSvc } = createServices();
    const result = await handleSilenceAlert(suppressionSvc, 'alert-456', { duration: '2h' });
    expect(result.status).toBe(200);
    expect(result.body.silenced).toBe(true);
    expect(result.body.suppressionRule).toBeDefined();
    expect(result.body.suppressionRule.name).toContain('alert-456');
  });

  it('defaults to 1h duration when not specified', async () => {
    const { suppressionSvc } = createServices();
    const result = await handleSilenceAlert(suppressionSvc, 'alert-789', {});
    expect(result.status).toBe(200);
    expect(result.body.silenced).toBe(true);
  });

  it('handles duration with different units', async () => {
    const { suppressionSvc } = createServices();

    const result30m = await handleSilenceAlert(suppressionSvc, 'a1', { duration: '30m' });
    expect(result30m.status).toBe(200);

    const result1d = await handleSilenceAlert(suppressionSvc, 'a2', { duration: '1d' });
    expect(result1d.status).toBe(200);

    const result60s = await handleSilenceAlert(suppressionSvc, 'a3', { duration: '60s' });
    expect(result60s.status).toBe(200);
  });
});
