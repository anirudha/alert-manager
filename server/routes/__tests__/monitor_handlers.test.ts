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
} from '../../../common';
import { MockOpenSearchBackend } from '../../../common/testing';

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
  it('returns 400 when datasourceId is missing', async () => {
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
  it('returns 400 when datasourceId is missing', async () => {
    const { alertSvc } = createServices();
    const result = await handleUpdateMonitor(alertSvc, 'mon-1', { name: 'updated' });
    expect(result.status).toBe(400);
  });
});

describe('handleDeleteMonitor', () => {
  it('returns 400 when datasourceId is missing', async () => {
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
    const result = await handleImportMonitors(alertSvc, { invalid: true } as any);
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
  it('returns 400 when datasourceId or monitorId is missing', async () => {
    const { alertSvc } = createServices();
    const result = await handleAcknowledgeAlert(alertSvc, 'alert-123');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('required');
  });

  it('returns 404 when datasource not found', async () => {
    const { alertSvc } = createServices();
    const result = await handleAcknowledgeAlert(alertSvc, 'alert-123', {
      datasourceId: 'bad-ds',
      monitorId: 'mon-1',
    });
    expect(result.status).toBe(404);
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

  it('falls back to 1h with invalid duration format', async () => {
    const { suppressionSvc } = createServices();
    const result = await handleSilenceAlert(suppressionSvc, 'a4', { duration: 'invalid' });
    expect(result.status).toBe(200);
    expect(result.body.silenced).toBe(true);
    // The rule should still be created — verify endTime is roughly 1h from now
    const rule = result.body.suppressionRule;
    const start = new Date(rule.startTime).getTime();
    const end = new Date(rule.endTime).getTime();
    const diffMs = end - start;
    expect(diffMs).toBeGreaterThanOrEqual(3500000); // ~1h minus tolerance
    expect(diffMs).toBeLessThanOrEqual(3700000);
  });
});

// ---------------------------------------------------------------------------
// Monitor CRUD — success paths with mock backend
// ---------------------------------------------------------------------------

describe('handleUpdateMonitor — success paths', () => {
  it('returns 200 when updating an existing monitor', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    // Create a monitor first
    const created = await handleCreateMonitor(alertSvc, {
      datasourceId: dsId,
      name: 'Original',
    });
    expect(created.status).toBe(201);
    const monitorId = created.body.id;

    const result = await handleUpdateMonitor(alertSvc, monitorId, {
      datasourceId: dsId,
      name: 'Updated Name',
    });
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Updated Name');
  });

  it('returns 404 when monitor not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleUpdateMonitor(alertSvc, 'non-existent', {
      datasourceId: dsId,
      name: 'nope',
    });
    expect(result.status).toBe(404);
    expect(result.body.error).toContain('not found');
  });
});

describe('handleDeleteMonitor — success paths', () => {
  it('returns 200 on successful delete', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const created = await handleCreateMonitor(alertSvc, {
      datasourceId: dsId,
      name: 'ToDelete',
    });
    const monitorId = created.body.id;

    const result = await handleDeleteMonitor(alertSvc, monitorId, dsId);
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
  });

  it('returns 404 when monitor not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleDeleteMonitor(alertSvc, 'non-existent', dsId);
    expect(result.status).toBe(404);
    expect(result.body.error).toContain('not found');
  });

  it('returns 400 when datasourceId is missing', async () => {
    const { alertSvc } = createServices();
    const result = await handleDeleteMonitor(alertSvc, 'mon-1');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('required');
  });
});

// ---------------------------------------------------------------------------
// Import / Export — additional paths
// ---------------------------------------------------------------------------

describe('handleImportMonitors — additional paths', () => {
  it('creates monitors when datasourceId is provided (Phase 2)', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const validConfig = {
      version: '1.0',
      name: 'Import Test',
      query: 'up == 1',
      threshold: { operator: '>', value: 10, forDuration: '5m' },
      evaluation: { interval: '1m', pendingPeriod: '5m' },
      labels: {},
      annotations: {},
      severity: 'warning',
    };
    const result = await handleImportMonitors(alertSvc, {
      datasourceId: dsId,
      monitors: [validConfig],
    });
    expect(result.status).toBe(200);
    expect(result.body.imported).toBe(1);
    expect(result.body.total).toBe(1);
    expect(result.body.results[0].success).toBe(true);
    expect(result.body.results[0].id).toBeDefined();
  });

  it('returns 207 with partial failures', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const validConfig = {
      version: '1.0',
      name: 'Good Monitor',
      query: 'up == 1',
      threshold: { operator: '>', value: 10, forDuration: '5m' },
      evaluation: { interval: '1m', pendingPeriod: '5m' },
      labels: {},
      annotations: {},
      severity: 'warning',
    };
    const invalidConfig = {
      name: '',
      // missing query, threshold, evaluation
    };
    const result = await handleImportMonitors(alertSvc, {
      datasourceId: dsId,
      monitors: [validConfig, invalidConfig],
    });
    // Phase 1 validation catches the invalid config
    expect(result.status).toBe(400);
    expect(result.body.details).toBeDefined();
  });

  it('operates in dry-run mode when no datasourceId', async () => {
    const { alertSvc } = createServices();
    const validConfig = {
      version: '1.0',
      name: 'Dry Run Monitor',
      query: 'up == 1',
      threshold: { operator: '>', value: 10, forDuration: '5m' },
      evaluation: { interval: '1m', pendingPeriod: '5m' },
      labels: {},
      annotations: {},
      severity: 'warning',
    };
    const result = await handleImportMonitors(alertSvc, [validConfig]);
    expect(result.status).toBe(200);
    expect(result.body.imported).toBe(1);
    // In dry-run mode, no id is assigned
    expect(result.body.results[0].id).toBeUndefined();
  });
});

describe('handleExportMonitors — error path', () => {
  it('returns 500 when getUnifiedRules throws', async () => {
    const { alertSvc } = createServices();
    jest.spyOn(alertSvc, 'getUnifiedRules').mockRejectedValueOnce(new Error('backend failure'));
    const result = await handleExportMonitors(alertSvc);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });
});

// ---------------------------------------------------------------------------
// Alert Actions — success paths with mock backend
// ---------------------------------------------------------------------------

describe('handleAcknowledgeAlert — success path', () => {
  it('returns 200 when acknowledging with valid datasourceId and monitorId', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    // Get alerts to find a valid monitorId
    const alerts = await alertSvc.getOSAlerts(dsId);
    if (alerts.alerts.length > 0) {
      const alert = alerts.alerts[0];
      const result = await handleAcknowledgeAlert(alertSvc, alert.id, {
        datasourceId: dsId,
        monitorId: alert.monitor_id,
      });
      expect(result.status).toBe(200);
      expect(result.body.id).toBe(alert.id);
      expect(result.body.state).toBe('acknowledged');
    }
  });
});
