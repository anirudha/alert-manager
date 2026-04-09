/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleListDatasources,
  handleGetDatasource,
  handleCreateDatasource,
  handleUpdateDatasource,
  handleDeleteDatasource,
  handleTestDatasource,
  handleGetOSMonitors,
  handleGetOSMonitor,
  handleCreateOSMonitor,
  handleUpdateOSMonitor,
  handleDeleteOSMonitor,
  handleGetOSAlerts,
  handleAcknowledgeOSAlerts,
  handleGetPromRuleGroups,
  handleGetPromAlerts,
  handleGetUnifiedAlerts,
  handleGetUnifiedRules,
  handleGetRuleDetail,
  handleGetAlertDetail,
  handleListWorkspaces,
} from '../handlers';
import { InMemoryDatasourceService, MultiBackendAlertService, Logger } from '../../../common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function createDatasourceService(): InMemoryDatasourceService {
  return new InMemoryDatasourceService(noopLogger);
}

function createAlertService(dsSvc: InMemoryDatasourceService): MultiBackendAlertService {
  return new MultiBackendAlertService(dsSvc, noopLogger);
}

const dsInput = {
  name: 'Test',
  type: 'opensearch' as const,
  url: 'http://localhost:9200',
  enabled: true,
};

// ---------------------------------------------------------------------------
// Datasource Handlers
// ---------------------------------------------------------------------------

describe('handleListDatasources', () => {
  it('returns 200 with empty array when no datasources', async () => {
    const svc = createDatasourceService();
    const result = await handleListDatasources(svc);
    expect(result.status).toBe(200);
    expect(result.body.datasources).toEqual([]);
  });

  it('returns 200 with datasources after creating one', async () => {
    const svc = createDatasourceService();
    await svc.create(dsInput);
    const result = await handleListDatasources(svc);
    expect(result.status).toBe(200);
    expect(result.body.datasources).toHaveLength(1);
    expect(result.body.datasources[0].name).toBe('Test');
  });
});

describe('handleGetDatasource', () => {
  it('returns 404 for non-existent datasource', async () => {
    const svc = createDatasourceService();
    const result = await handleGetDatasource(svc, 'non-existent');
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Datasource not found');
  });

  it('returns 200 with datasource when found', async () => {
    const svc = createDatasourceService();
    const ds = await svc.create(dsInput);
    const result = await handleGetDatasource(svc, ds.id);
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Test');
  });
});

describe('handleCreateDatasource', () => {
  it('returns 400 when name is missing', async () => {
    const svc = createDatasourceService();
    const result = await handleCreateDatasource(svc, {
      name: '',
      type: 'opensearch',
      url: 'http://localhost',
      enabled: true,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('required');
  });

  it('returns 400 when url is missing', async () => {
    const svc = createDatasourceService();
    const result = await handleCreateDatasource(svc, {
      name: 'Test',
      type: 'opensearch',
      url: '',
      enabled: true,
    });
    expect(result.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const svc = createDatasourceService();
    const result = await handleCreateDatasource(svc, {
      name: 'Test',
      type: 'invalid' as any,
      url: 'http://localhost',
      enabled: true,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('type must be');
  });

  it('returns 201 on successful creation', async () => {
    const svc = createDatasourceService();
    const result = await handleCreateDatasource(svc, {
      name: 'My OS',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
    });
    expect(result.status).toBe(201);
    expect(result.body.name).toBe('My OS');
    expect(result.body.id).toBeDefined();
  });
});

describe('handleUpdateDatasource', () => {
  it('returns 404 for non-existent datasource', async () => {
    const svc = createDatasourceService();
    const result = await handleUpdateDatasource(svc, 'non-existent', { name: 'Updated' });
    expect(result.status).toBe(404);
  });

  it('returns 200 on successful update', async () => {
    const svc = createDatasourceService();
    const ds = await svc.create(dsInput);
    const result = await handleUpdateDatasource(svc, ds.id, { name: 'New' });
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('New');
  });
});

describe('handleDeleteDatasource', () => {
  it('returns 404 for non-existent datasource', async () => {
    const svc = createDatasourceService();
    const result = await handleDeleteDatasource(svc, 'non-existent');
    expect(result.status).toBe(404);
  });

  it('returns 200 on successful delete', async () => {
    const svc = createDatasourceService();
    const ds = await svc.create(dsInput);
    const result = await handleDeleteDatasource(svc, ds.id);
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
  });
});

describe('handleTestDatasource', () => {
  it('returns result from testConnection', async () => {
    const svc = createDatasourceService();
    const ds = await svc.create(dsInput);
    const result = await handleTestDatasource(svc, ds.id);
    expect(result.status).toBeDefined();
    expect(result.body).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// OpenSearch Monitor / Alert / Prometheus Handlers (error paths)
// ---------------------------------------------------------------------------

describe('handleGetOSMonitors', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSMonitors(alertSvc, 'non-existent-ds');
    expect(result.status).toBe(404);
    expect(result.body.error).toBeDefined();
  });
});

describe('handleGetOSMonitor', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSMonitor(alertSvc, 'bad-ds', 'monitor-1');
    expect(result.status).toBe(404);
  });
});

describe('handleCreateOSMonitor', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleCreateOSMonitor(alertSvc, 'bad-ds', { name: 'test' } as any);
    expect(result.status).toBe(404);
  });
});

describe('handleUpdateOSMonitor', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleUpdateOSMonitor(alertSvc, 'bad-ds', 'mon-1', { name: 'updated' });
    expect(result.status).toBe(404);
  });
});

describe('handleDeleteOSMonitor', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleDeleteOSMonitor(alertSvc, 'bad-ds', 'mon-1');
    expect(result.status).toBe(404);
  });
});

describe('handleGetOSAlerts', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSAlerts(alertSvc, 'bad-ds');
    expect(result.status).toBe(404);
  });
});

describe('handleAcknowledgeOSAlerts', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleAcknowledgeOSAlerts(alertSvc, 'bad-ds', 'mon-1', { alerts: [] });
    expect(result.status).toBe(404);
  });
});

describe('handleGetPromRuleGroups', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetPromRuleGroups(alertSvc, 'bad-ds');
    expect(result.status).toBe(404);
  });
});

describe('handleGetPromAlerts', () => {
  it('returns 404 when datasource not found', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetPromAlerts(alertSvc, 'bad-ds');
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Unified View Handlers
// ---------------------------------------------------------------------------

describe('handleGetUnifiedAlerts', () => {
  it('returns 200 with empty results when no datasources', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedAlerts(alertSvc);
    expect(result.status).toBe(200);
    expect(result.body.results).toEqual([]);
  });

  it('parses dsIds query parameter', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedAlerts(alertSvc, { dsIds: 'ds-1,ds-2' });
    expect(result.status).toBe(200);
  });

  it('parses timeout query parameter', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedAlerts(alertSvc, { timeout: '5000' });
    expect(result.status).toBe(200);
  });
});

describe('handleGetUnifiedRules', () => {
  it('returns 200 with empty results when no datasources', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedRules(alertSvc);
    expect(result.status).toBe(200);
    expect(result.body.results).toEqual([]);
  });

  it('parses dsIds query parameter', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedRules(alertSvc, { dsIds: 'ds-1' });
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Success-path helpers (mock backend)
// ---------------------------------------------------------------------------

async function createServicesWithMockBackend() {
  const dsSvc = createDatasourceService();
  const alertSvc = createAlertService(dsSvc);
  const ds = await dsSvc.create(dsInput);
  const { MockOpenSearchBackend } = await import('../../../common/testing');
  const mockBackend = new MockOpenSearchBackend(noopLogger);
  alertSvc.registerOpenSearch(mockBackend);
  return { dsSvc, alertSvc, dsId: ds.id, mockBackend };
}

// ---------------------------------------------------------------------------
// toHandlerResult (exported implicitly via handlers — test via handler responses)
// ---------------------------------------------------------------------------

describe('toHandlerResult — error classification behaviour', () => {
  it('masks internal errors to generic message with 500 status', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    // Spy to throw an error that does NOT contain "not found" / "required" / "must be"
    jest.spyOn(alertSvc, 'getOSMonitors').mockRejectedValueOnce(new Error('Connection refused'));
    const result = await handleGetOSMonitors(alertSvc, 'some-ds');
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });

  it('passes through "not found" messages', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const result = await handleGetOSMonitor(alertSvc, dsId, 'non-existent-monitor');
    expect(result.status).toBe(404);
    expect(result.body.error).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// OpenSearch Monitor Handler — success paths
// ---------------------------------------------------------------------------

describe('handleGetOSMonitor — success path', () => {
  it('returns 200 with monitor when found', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const monitors = await alertSvc.getOSMonitors(dsId);
    const monitorId = monitors[0].id;
    const result = await handleGetOSMonitor(alertSvc, dsId, monitorId);
    expect(result.status).toBe(200);
    expect(result.body.id).toBe(monitorId);
    expect(result.body.name).toBeDefined();
  });

  it('returns 404 when monitor not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleGetOSMonitor(alertSvc, dsId, 'non-existent');
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Monitor not found');
  });
});

describe('handleUpdateOSMonitor — success path', () => {
  it('returns 200 on successful update', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const monitors = await alertSvc.getOSMonitors(dsId);
    const monitorId = monitors[0].id;
    const result = await handleUpdateOSMonitor(alertSvc, dsId, monitorId, {
      name: 'Updated Monitor',
    });
    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Updated Monitor');
  });

  it('returns 404 when monitor not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleUpdateOSMonitor(alertSvc, dsId, 'non-existent', { name: 'x' });
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Monitor not found');
  });
});

describe('handleDeleteOSMonitor — success path', () => {
  it('returns 200 with deleted:true on success', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const monitors = await alertSvc.getOSMonitors(dsId);
    const monitorId = monitors[0].id;
    const result = await handleDeleteOSMonitor(alertSvc, dsId, monitorId);
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
  });

  it('returns 404 when monitor not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleDeleteOSMonitor(alertSvc, dsId, 'non-existent');
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Monitor not found');
  });
});

// ---------------------------------------------------------------------------
// Prometheus Handler — success paths
// ---------------------------------------------------------------------------

describe('handleGetPromRuleGroups — success path', () => {
  it('returns 200 wrapping groups in Prometheus-compatible response', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const ds = await dsSvc.create({
      name: 'Prom',
      type: 'prometheus',
      url: 'http://localhost:9090',
      enabled: true,
    });
    const { MockPrometheusBackend } = await import('../../../common/testing');
    const promBackend = new MockPrometheusBackend(noopLogger);
    promBackend.seed(ds.id);
    alertSvc.registerPrometheus(promBackend);

    const result = await handleGetPromRuleGroups(alertSvc, ds.id);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('success');
    expect(result.body.data).toBeDefined();
    expect(result.body.data.groups).toBeDefined();
    expect(Array.isArray(result.body.data.groups)).toBe(true);
  });
});

describe('handleGetPromAlerts — success path', () => {
  it('returns 200 wrapping alerts in Prometheus-compatible response', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const ds = await dsSvc.create({
      name: 'Prom',
      type: 'prometheus',
      url: 'http://localhost:9090',
      enabled: true,
    });
    const { MockPrometheusBackend } = await import('../../../common/testing');
    const promBackend = new MockPrometheusBackend(noopLogger);
    promBackend.seed(ds.id);
    alertSvc.registerPrometheus(promBackend);

    const result = await handleGetPromAlerts(alertSvc, ds.id);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('success');
    expect(result.body.data).toBeDefined();
    expect(result.body.data.alerts).toBeDefined();
    expect(Array.isArray(result.body.data.alerts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unified Handlers — maxResults and error paths
// ---------------------------------------------------------------------------

describe('handleGetUnifiedAlerts — additional paths', () => {
  it('parses maxResults query parameter', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedAlerts(alertSvc, { maxResults: '10' });
    expect(result.status).toBe(200);
    expect(result.body.results).toEqual([]);
  });

  it('returns 500 when alertSvc throws', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    jest.spyOn(alertSvc, 'getUnifiedAlerts').mockRejectedValueOnce(new Error('boom'));
    const result = await handleGetUnifiedAlerts(alertSvc);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });
});

describe('handleGetUnifiedRules — additional paths', () => {
  it('parses maxResults query parameter', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetUnifiedRules(alertSvc, { maxResults: '5' });
    expect(result.status).toBe(200);
    expect(result.body.results).toEqual([]);
  });

  it('returns 500 when alertSvc throws', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    jest.spyOn(alertSvc, 'getUnifiedRules').mockRejectedValueOnce(new Error('boom'));
    const result = await handleGetUnifiedRules(alertSvc);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });
});

// ---------------------------------------------------------------------------
// Detail View Handlers
// ---------------------------------------------------------------------------

describe('handleGetRuleDetail', () => {
  it('returns 200 with rule detail when found', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const unified = await alertSvc.getUnifiedRules({ dsIds: [dsId] });
    const ruleId = unified.results[0].id;
    const result = await handleGetRuleDetail(alertSvc, dsId, ruleId);
    expect(result.status).toBe(200);
    expect(result.body.id).toBe(ruleId);
  });

  it('returns 404 when rule not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleGetRuleDetail(alertSvc, dsId, 'non-existent-rule');
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Rule not found');
  });

  it('returns 500 when backend throws', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    jest.spyOn(alertSvc, 'getRuleDetail').mockRejectedValueOnce(new Error('DB crash'));
    const result = await handleGetRuleDetail(alertSvc, 'ds-1', 'rule-1');
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });
});

describe('handleGetAlertDetail', () => {
  it('returns 200 with alert detail when found', async () => {
    const { alertSvc, dsId, mockBackend } = await createServicesWithMockBackend();
    mockBackend.seed(dsId);
    const unified = await alertSvc.getUnifiedAlerts({ dsIds: [dsId] });
    if (unified.results.length > 0) {
      const alertId = unified.results[0].id;
      const result = await handleGetAlertDetail(alertSvc, dsId, alertId);
      expect(result.status).toBe(200);
      expect(result.body.id).toBe(alertId);
    }
  });

  it('returns 404 when alert not found', async () => {
    const { alertSvc, dsId } = await createServicesWithMockBackend();
    const result = await handleGetAlertDetail(alertSvc, dsId, 'non-existent-alert');
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('Alert not found');
  });

  it('returns 500 when backend throws', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    jest.spyOn(alertSvc, 'getAlertDetail').mockRejectedValueOnce(new Error('timeout'));
    const result = await handleGetAlertDetail(alertSvc, 'ds-1', 'alert-1');
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('An internal error occurred');
  });
});

// ---------------------------------------------------------------------------
// Workspace Discovery
// ---------------------------------------------------------------------------

describe('handleListWorkspaces', () => {
  it('returns 200 with workspaces', async () => {
    const svc = createDatasourceService();
    await svc.create({ name: 'Prom', type: 'prometheus', url: 'http://prom:9090', enabled: true });
    const result = await handleListWorkspaces(svc, 'ds-1');
    expect(result.status).toBe(200);
    expect(result.body.workspaces).toBeDefined();
  });

  it('returns 500 when service throws', async () => {
    const svc = createDatasourceService();
    jest.spyOn(svc, 'listWorkspaces').mockRejectedValueOnce(new Error('fail'));
    const result = await handleListWorkspaces(svc, 'ds-1');
    expect(result.status).toBe(500);
    expect(result.body.error).toBeDefined();
  });
});
