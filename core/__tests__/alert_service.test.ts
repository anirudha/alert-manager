/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MultiBackendAlertService } from '../alert_service';
import { InMemoryDatasourceService } from '../datasource_service';
import { MockOpenSearchBackend, MockPrometheusBackend } from '../mock_backend';
import { Logger, Datasource } from '../types';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const osDsInput: Omit<Datasource, 'id'> = {
  name: 'Test OS',
  type: 'opensearch',
  url: 'http://localhost:9200',
  enabled: true,
};

const promDsInput: Omit<Datasource, 'id'> = {
  name: 'Test Prom',
  type: 'prometheus',
  url: 'http://localhost:9090',
  enabled: true,
};

function createStack() {
  const dsSvc = new InMemoryDatasourceService(noopLogger);
  const alertSvc = new MultiBackendAlertService(dsSvc, noopLogger);
  const osMock = new MockOpenSearchBackend(noopLogger);
  const promMock = new MockPrometheusBackend(noopLogger);
  return { dsSvc, alertSvc, osMock, promMock };
}

// ---------------------------------------------------------------------------
// Backend Registration
// ---------------------------------------------------------------------------

describe('backend registration', () => {
  it('registerOpenSearch does not throw', () => {
    const { alertSvc, osMock } = createStack();
    expect(() => alertSvc.registerOpenSearch(osMock)).not.toThrow();
  });

  it('registerPrometheus does not throw', () => {
    const { alertSvc, promMock } = createStack();
    expect(() => alertSvc.registerPrometheus(promMock)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OpenSearch pass-through
// ---------------------------------------------------------------------------

describe('OpenSearch pass-through', () => {
  it('getOSMonitors throws for non-existent datasource', async () => {
    const { alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    await expect(alertSvc.getOSMonitors('non-existent')).rejects.toThrow();
  });

  it('getOSMonitors throws when datasource type is wrong', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(promDsInput);
    await expect(alertSvc.getOSMonitors(ds.id)).rejects.toThrow();
  });

  it('getOSMonitors returns empty array for valid OS datasource', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    const monitors = await alertSvc.getOSMonitors(ds.id);
    expect(monitors).toEqual([]);
  });

  it('createOSMonitor and getOSMonitor round-trip', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);

    const created = await alertSvc.createOSMonitor(ds.id, {
      name: 'Test Monitor',
      type: 'monitor',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [],
      triggers: [],
      monitor_type: 'query_level_monitor',
      last_update_time: Date.now(),
    });
    expect(created.id).toBeDefined();

    const fetched = await alertSvc.getOSMonitor(ds.id, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Test Monitor');
  });

  it('updateOSMonitor returns null for non-existent monitor', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    const result = await alertSvc.updateOSMonitor(ds.id, 'non-existent', { name: 'x' });
    expect(result).toBeNull();
  });

  it('deleteOSMonitor returns false for non-existent monitor', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    const result = await alertSvc.deleteOSMonitor(ds.id, 'non-existent');
    expect(result).toBe(false);
  });

  it('getOSAlerts returns empty alerts for datasource with no alerts', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    const result = await alertSvc.getOSAlerts(ds.id);
    expect(result.alerts).toEqual([]);
    expect(result.totalAlerts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Prometheus pass-through
// ---------------------------------------------------------------------------

describe('Prometheus pass-through', () => {
  it('getPromRuleGroups throws for non-existent datasource', async () => {
    const { alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    await expect(alertSvc.getPromRuleGroups('non-existent')).rejects.toThrow();
  });

  it('getPromRuleGroups returns empty for valid prom datasource', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    const groups = await alertSvc.getPromRuleGroups(ds.id);
    expect(groups).toEqual([]);
  });

  it('getPromAlerts returns empty for valid prom datasource', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    const alerts = await alertSvc.getPromAlerts(ds.id);
    expect(alerts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unified views
// ---------------------------------------------------------------------------

describe('getUnifiedAlerts', () => {
  it('returns empty results when no datasources exist', async () => {
    const { alertSvc } = createStack();
    const response = await alertSvc.getUnifiedAlerts();
    expect(response.results).toEqual([]);
    expect(response.totalDatasources).toBe(0);
    expect(response.completedDatasources).toBe(0);
    expect(response.fetchedAt).toBeDefined();
  });

  it('returns results from seeded OpenSearch backend', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const response = await alertSvc.getUnifiedAlerts();
    expect(response.totalDatasources).toBe(1);
    expect(response.completedDatasources).toBe(1);
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.datasourceStatus).toHaveLength(1);
    expect(response.datasourceStatus[0].status).toBe('success');
  });

  it('returns results from seeded Prometheus backend', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    promMock.seed(ds.id);

    const response = await alertSvc.getUnifiedAlerts();
    expect(response.totalDatasources).toBe(1);
    expect(response.results.length).toBeGreaterThan(0);
  });

  it('aggregates across multiple datasources', async () => {
    const { dsSvc, alertSvc, osMock, promMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    alertSvc.registerPrometheus(promMock);
    const osDs = await dsSvc.create(osDsInput);
    const promDs = await dsSvc.create(promDsInput);
    osMock.seed(osDs.id);
    promMock.seed(promDs.id);

    const response = await alertSvc.getUnifiedAlerts();
    expect(response.totalDatasources).toBe(2);
    expect(response.datasourceStatus).toHaveLength(2);
  });

  it('filters by dsIds when provided', async () => {
    const { dsSvc, alertSvc, osMock, promMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    alertSvc.registerPrometheus(promMock);
    const osDs = await dsSvc.create(osDsInput);
    await dsSvc.create(promDsInput);
    osMock.seed(osDs.id);

    const response = await alertSvc.getUnifiedAlerts({ dsIds: [osDs.id] });
    expect(response.totalDatasources).toBe(1);
    expect(response.datasourceStatus[0].datasourceId).toBe(osDs.id);
  });

  it('handles missing backend gracefully without blocking other datasources', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    // Create an OS datasource but register no prom backend
    const osDs = await dsSvc.create(osDsInput);
    await dsSvc.create(promDsInput);
    osMock.seed(osDs.id);

    const response = await alertSvc.getUnifiedAlerts();
    expect(response.totalDatasources).toBe(2);
    // OS succeeded and has results; prom handled gracefully
    const osStatus = response.datasourceStatus.find((s) => s.datasourceId === osDs.id);
    expect(osStatus?.status).toBe('success');
    expect(response.results.length).toBeGreaterThan(0);
  });
});

describe('getUnifiedRules', () => {
  it('returns empty results when no datasources exist', async () => {
    const { alertSvc } = createStack();
    const response = await alertSvc.getUnifiedRules();
    expect(response.results).toEqual([]);
    expect(response.totalDatasources).toBe(0);
  });

  it('returns rules from seeded backends', async () => {
    const { dsSvc, alertSvc, osMock, promMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    alertSvc.registerPrometheus(promMock);
    const osDs = await dsSvc.create(osDsInput);
    const promDs = await dsSvc.create(promDsInput);
    osMock.seed(osDs.id);
    promMock.seed(promDs.id);

    const response = await alertSvc.getUnifiedRules();
    expect(response.totalDatasources).toBe(2);
    expect(response.results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Paginated views
// ---------------------------------------------------------------------------

describe('getPaginatedRules', () => {
  it('returns paginated results with defaults', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const response = await alertSvc.getPaginatedRules();
    expect(response.page).toBe(1);
    expect(response.pageSize).toBe(20);
    expect(response.total).toBeGreaterThan(0);
    expect(response.results.length).toBeLessThanOrEqual(20);
  });

  it('respects page and pageSize', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const page1 = await alertSvc.getPaginatedRules({ page: 1, pageSize: 2 });
    expect(page1.results.length).toBeLessThanOrEqual(2);
    expect(page1.page).toBe(1);
  });

  it('returns empty results when no backends are registered', async () => {
    const { dsSvc, alertSvc } = createStack();
    await dsSvc.create(osDsInput);
    const response = await alertSvc.getPaginatedRules();
    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
  });
});

describe('getPaginatedAlerts', () => {
  it('returns paginated results', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const response = await alertSvc.getPaginatedAlerts();
    expect(response.page).toBe(1);
    expect(response.total).toBeGreaterThanOrEqual(0);
  });
});
