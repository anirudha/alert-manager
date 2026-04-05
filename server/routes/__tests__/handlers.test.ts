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
} from '../handlers';
import { InMemoryDatasourceService, MultiBackendAlertService, Logger } from '../../../core';

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
  it('returns 400 when backend throws', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSMonitors(alertSvc, 'non-existent-ds');
    expect(result.status).toBe(400);
    expect(result.body.error).toBeDefined();
  });
});

describe('handleGetOSMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSMonitor(alertSvc, 'bad-ds', 'monitor-1');
    expect(result.status).toBe(400);
  });
});

describe('handleCreateOSMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleCreateOSMonitor(alertSvc, 'bad-ds', { name: 'test' } as any);
    expect(result.status).toBe(400);
  });
});

describe('handleUpdateOSMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleUpdateOSMonitor(alertSvc, 'bad-ds', 'mon-1', { name: 'updated' });
    expect(result.status).toBe(400);
  });
});

describe('handleDeleteOSMonitor', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleDeleteOSMonitor(alertSvc, 'bad-ds', 'mon-1');
    expect(result.status).toBe(400);
  });
});

describe('handleGetOSAlerts', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetOSAlerts(alertSvc, 'bad-ds');
    expect(result.status).toBe(400);
  });
});

describe('handleAcknowledgeOSAlerts', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleAcknowledgeOSAlerts(alertSvc, 'bad-ds', 'mon-1', { alerts: [] });
    expect(result.status).toBe(400);
  });
});

describe('handleGetPromRuleGroups', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetPromRuleGroups(alertSvc, 'bad-ds');
    expect(result.status).toBe(400);
  });
});

describe('handleGetPromAlerts', () => {
  it('returns 400 when backend throws for unknown datasource', async () => {
    const dsSvc = createDatasourceService();
    const alertSvc = createAlertService(dsSvc);
    const result = await handleGetPromAlerts(alertSvc, 'bad-ds');
    expect(result.status).toBe(400);
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
