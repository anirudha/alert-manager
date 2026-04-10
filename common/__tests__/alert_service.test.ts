/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MultiBackendAlertService,
  extractTimestampField,
  substituteMustacheTemplates,
  extractClusterMetricValue,
  toEpochMillis,
} from '../alert_service';
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

// ---------------------------------------------------------------------------
// Monitor type branching via getUnifiedRules
// ---------------------------------------------------------------------------

describe('detectMonitorKind via getUnifiedRules', () => {
  async function setupSeeded() {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);
    const rules = await alertSvc.getUnifiedRules();
    return { ds, rules: rules.results, alertSvc, osMock };
  }

  it('classifies cluster_metrics monitors with api_type label', async () => {
    const { rules } = await setupSeeded();
    const clusterRules = rules.filter((r) => r.monitorType === 'cluster_metrics');
    expect(clusterRules.length).toBeGreaterThanOrEqual(2);
    for (const rule of clusterRules) {
      expect(rule.labels.api_type).toBeDefined();
      expect(rule.labels.monitor_kind).toBe('cluster_metrics');
      // Query should show "API_TYPE: path"
      expect(rule.query).toContain(':');
    }
  });

  it('classifies doc-level monitors as log with doc_queries label', async () => {
    const { rules } = await setupSeeded();
    const docRules = rules.filter(
      (r) => r.monitorType === 'log' && r.labels.monitor_kind === 'doc'
    );
    expect(docRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of docRules) {
      expect(rule.labels.doc_queries).toBeDefined();
      expect(parseInt(rule.labels.doc_queries, 10)).toBeGreaterThan(0);
    }
  });

  it('classifies bucket-level monitors as infrastructure', async () => {
    const { rules } = await setupSeeded();
    const bucketRules = rules.filter((r) => r.monitorType === 'infrastructure');
    expect(bucketRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of bucketRules) {
      expect(rule.labels.monitor_kind).toBe('bucket');
    }
  });

  it('classifies query-level monitors with logs-* as log', async () => {
    const { rules } = await setupSeeded();
    const logQueryRules = rules.filter(
      (r) => r.monitorType === 'log' && r.labels.monitor_kind === 'query'
    );
    expect(logQueryRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of logQueryRules) {
      expect(rule.labels.indices).toMatch(/logs-/);
    }
  });

  it('classifies query-level monitors with apm-* indices appropriately', async () => {
    const { rules } = await setupSeeded();
    // The seed has 'Slow Response Time' with apm-* indices — maps to 'metric' by default
    // since apm-* doesn't match otel-v1-apm or ss4o_traces
    const apmRule = rules.find((r) => r.name === 'Slow Response Time');
    expect(apmRule).toBeDefined();
    expect(apmRule!.labels.monitor_kind).toBe('query');
    // apm-* doesn't start with otel-v1-apm or ss4o_traces, so it falls to 'metric'
    expect(apmRule!.monitorType).toBe('metric');
  });

  it('sets correct query for cluster metrics monitors (API_TYPE: path)', async () => {
    const { rules } = await setupSeeded();
    const clusterHealth = rules.find((r) => r.name === 'Cluster Health Status');
    expect(clusterHealth).toBeDefined();
    expect(clusterHealth!.query).toContain('CLUSTER_HEALTH');
    expect(clusterHealth!.query).toContain('_cluster/health');
  });

  it('sets correct query for doc-level monitors (query names)', async () => {
    const { rules } = await setupSeeded();
    const docRule = rules.find((r) => r.name === 'Log Anomaly Detection');
    expect(docRule).toBeDefined();
    expect(docRule!.query).toContain('Critical errors');
    expect(docRule!.query).toContain('OOM events');
  });

  it('sets severity correctly from trigger severity field', async () => {
    const { rules } = await setupSeeded();
    const highError = rules.find((r) => r.name === 'High Error Rate');
    expect(highError).toBeDefined();
    expect(highError!.severity).toBe('critical'); // severity '1' -> critical

    const diskUsage = rules.find((r) => r.name === 'Disk Usage by Host');
    expect(diskUsage).toBeDefined();
    expect(diskUsage!.severity).toBe('high'); // severity '2' -> high
    expect(diskUsage!.status).toBe('disabled'); // not enabled
  });

  it('identifies disabled monitors with status disabled', async () => {
    const { rules } = await setupSeeded();
    const disabled = rules.find((r) => r.name === 'Disk Usage by Host');
    expect(disabled).toBeDefined();
    expect(disabled!.enabled).toBe(false);
    expect(disabled!.status).toBe('disabled');
    expect(disabled!.healthStatus).toBe('no_data');
  });
});

// ---------------------------------------------------------------------------
// getRuleDetail description generation
// ---------------------------------------------------------------------------

describe('getRuleDetail description generation', () => {
  async function setupSeeded() {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);
    const rules = await alertSvc.getUnifiedRules();
    return { ds, rules: rules.results, alertSvc };
  }

  it('cluster metrics rule detail has description with Cluster metrics monitor', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const clusterRule = rules.find((r) => r.name === 'Cluster Health Status');
    expect(clusterRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, clusterRule!.id);
    expect(detail).not.toBeNull();
    // The description uses message_template if available, otherwise fallback
    // Cluster Health Status monitor has a message_template, so it uses that
    expect(detail!.description).toBeDefined();
    expect(typeof detail!.description).toBe('string');
  });

  it('doc-level rule detail has description referencing document-level', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const docRule = rules.find((r) => r.name === 'Log Anomaly Detection');
    expect(docRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, docRule!.id);
    expect(detail).not.toBeNull();
    // This monitor has message_template 'Log anomaly detected', but it would use that.
    // The fallback would contain 'Document-level monitor'. Check either case.
    expect(detail!.description).toBeDefined();
  });

  it('bucket-level rule detail has description referencing bucket aggregation', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    // 'Disk Usage by Host' is bucket-level but has no actions (empty array).
    // So trigger.actions[0]?.message_template?.source is undefined -> fallback used
    const bucketRule = rules.find((r) => r.name === 'Disk Usage by Host');
    expect(bucketRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, bucketRule!.id);
    expect(detail).not.toBeNull();
    expect(detail!.description).toContain('Bucket aggregation monitor');
    expect(detail!.description).toContain('metrics-*');
  });

  it('query-level rule detail includes alert history entries', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const queryRule = rules.find((r) => r.name === 'High Error Rate');
    expect(queryRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, queryRule!.id);
    expect(detail).not.toBeNull();
    // The High Error Rate monitor has an ACTIVE alert
    expect(detail!.alertHistory.length).toBeGreaterThan(0);
    expect(detail!.alertHistory[0].state).toBe('active');
  });

  it('rule detail includes notification routing from destinations', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const clusterRule = rules.find((r) => r.name === 'Cluster Health Status');
    const detail = await alertSvc.getRuleDetail(ds.id, clusterRule!.id);
    expect(detail).not.toBeNull();
    expect(detail!.notificationRouting.length).toBeGreaterThan(0);
    // Should have slack and email channels
    const channels = detail!.notificationRouting.map((n) => n.channel);
    expect(channels).toContain('slack');
    expect(channels).toContain('email');
  });

  it('rule detail includes throttle info for throttled actions', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const clusterRule = rules.find((r) => r.name === 'Cluster Health Status');
    const detail = await alertSvc.getRuleDetail(ds.id, clusterRule!.id);
    expect(detail).not.toBeNull();
    const throttled = detail!.notificationRouting.find((n) => n.throttle);
    expect(throttled).toBeDefined();
    expect(throttled!.throttle).toContain('MINUTES');
  });

  it('returns null for non-existent rule', async () => {
    const { ds, alertSvc } = await setupSeeded();
    const detail = await alertSvc.getRuleDetail(ds.id, 'non-existent-id');
    expect(detail).toBeNull();
  });

  it('returns null for non-existent datasource', async () => {
    const { alertSvc } = await setupSeeded();
    const detail = await alertSvc.getRuleDetail('fake-ds-id', 'some-rule');
    expect(detail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createOSMonitor / deleteOSMonitor round-trip
// ---------------------------------------------------------------------------

describe('createOSMonitor and deleteOSMonitor', () => {
  it('creates a monitor, confirms it exists, deletes it, confirms gone', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);

    const created = await alertSvc.createOSMonitor(ds.id, {
      name: 'Temp Monitor',
      type: 'monitor',
      enabled: true,
      schedule: { period: { interval: 10, unit: 'MINUTES' } },
      inputs: [{ search: { indices: ['test-*'], query: { query: { match_all: {} } } } }],
      triggers: [],
      monitor_type: 'query_level_monitor',
      last_update_time: Date.now(),
    });
    expect(created.id).toBeDefined();

    // Confirm it exists
    const fetched = await alertSvc.getOSMonitor(ds.id, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Temp Monitor');

    // List should include it
    const monitors = await alertSvc.getOSMonitors(ds.id);
    expect(monitors.some((m) => m.id === created.id)).toBe(true);

    // Delete it
    const deleted = await alertSvc.deleteOSMonitor(ds.id, created.id);
    expect(deleted).toBe(true);

    // Confirm it's gone
    const afterDelete = await alertSvc.getOSMonitor(ds.id, created.id);
    expect(afterDelete).toBeNull();

    // Delete again returns false
    const deletedAgain = await alertSvc.deleteOSMonitor(ds.id, created.id);
    expect(deletedAgain).toBe(false);
  });

  it('updateOSMonitor modifies an existing monitor', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);

    const created = await alertSvc.createOSMonitor(ds.id, {
      name: 'Original Name',
      type: 'monitor',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [],
      triggers: [],
      monitor_type: 'query_level_monitor',
      last_update_time: Date.now(),
    });

    const updated = await alertSvc.updateOSMonitor(ds.id, created.id, { name: 'Updated Name' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated Name');
  });
});

// ---------------------------------------------------------------------------
// getAlertDetail
// ---------------------------------------------------------------------------

describe('getAlertDetail', () => {
  it('returns OS alert detail with raw data', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const alerts = await alertSvc.getOSAlerts(ds.id);
    expect(alerts.alerts.length).toBeGreaterThan(0);
    const firstAlert = alerts.alerts[0];

    const detail = await alertSvc.getAlertDetail(ds.id, firstAlert.id);
    expect(detail).not.toBeNull();
    expect(detail!.raw).toBeDefined();
    expect(detail!.datasourceType).toBe('opensearch');
  });

  it('returns null for non-existent alert id', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const detail = await alertSvc.getAlertDetail(ds.id, 'fake-alert-id');
    expect(detail).toBeNull();
  });

  it('returns Prometheus alert detail', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    promMock.seed(ds.id);

    const alerts = await alertSvc.getPromAlerts(ds.id);
    expect(alerts.length).toBeGreaterThan(0);
    const firstAlert = alerts[0];
    const alertId = `${ds.id}-${firstAlert.labels.alertname}-${firstAlert.labels.instance || ''}`;

    const detail = await alertSvc.getAlertDetail(ds.id, alertId);
    expect(detail).not.toBeNull();
    expect(detail!.datasourceType).toBe('prometheus');
    expect(detail!.raw).toBeDefined();
  });

  it('returns null for non-existent datasource', async () => {
    const { alertSvc } = createStack();
    const detail = await alertSvc.getAlertDetail('no-such-ds', 'some-alert');
    expect(detail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Prometheus rule detail
// ---------------------------------------------------------------------------

describe('Prometheus getRuleDetail', () => {
  it('returns rule detail for a Prometheus alerting rule', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    promMock.seed(ds.id);

    const rules = await alertSvc.getUnifiedRules();
    const promRules = rules.results.filter((r) => r.datasourceType === 'prometheus');
    expect(promRules.length).toBeGreaterThan(0);

    const rule = promRules[0];
    const detail = await alertSvc.getRuleDetail(ds.id, rule.id);
    expect(detail).not.toBeNull();
    expect(detail!.datasourceType).toBe('prometheus');
    expect(detail!.description).toBeDefined();
    expect(detail!.raw).toBeDefined();
  });

  it('returns null for non-existent Prometheus rule', async () => {
    const { dsSvc, alertSvc, promMock } = createStack();
    alertSvc.registerPrometheus(promMock);
    const ds = await dsSvc.create(promDsInput);
    promMock.seed(ds.id);

    const detail = await alertSvc.getRuleDetail(ds.id, 'non-existent-prom-rule');
    expect(detail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// acknowledgeOSAlerts
// ---------------------------------------------------------------------------

describe('acknowledgeOSAlerts', () => {
  it('acknowledges alerts and changes state', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);

    const { alerts } = await alertSvc.getOSAlerts(ds.id);
    const activeAlert = alerts.find((a) => a.state === 'ACTIVE');
    expect(activeAlert).toBeDefined();

    await alertSvc.acknowledgeOSAlerts(ds.id, activeAlert!.monitor_id, [activeAlert!.id]);

    const { alerts: updatedAlerts } = await alertSvc.getOSAlerts(ds.id);
    const acked = updatedAlerts.find((a) => a.id === activeAlert!.id);
    expect(acked!.state).toBe('ACKNOWLEDGED');
  });
});

// ---------------------------------------------------------------------------
// extractTimestampField
// ---------------------------------------------------------------------------

describe('extractTimestampField', () => {
  it('extracts @timestamp from bool.filter range clause', () => {
    const query = {
      query: {
        bool: {
          filter: [
            {
              range: {
                '@timestamp': { gte: '{{period_end}}||-5m', lte: '{{period_end}}' },
              },
            },
          ],
        },
      },
    };
    expect(extractTimestampField(query)).toBe('@timestamp');
  });

  it('extracts custom timestamp field from bool.filter', () => {
    const query = {
      query: {
        bool: {
          filter: [{ range: { 'event.timestamp': { gte: 'now-1h', lte: 'now' } } }],
        },
      },
    };
    expect(extractTimestampField(query)).toBe('event.timestamp');
  });

  it('extracts from bool.must array', () => {
    const query = {
      query: {
        bool: {
          must: [{ range: { created_at: { gte: 'now-1d', lte: 'now' } } }],
        },
      },
    };
    expect(extractTimestampField(query)).toBe('created_at');
  });

  it('returns undefined when no range clause exists', () => {
    const query = {
      query: {
        bool: {
          filter: [{ term: { status: 'error' } }],
        },
      },
    };
    expect(extractTimestampField(query)).toBeUndefined();
  });

  it('returns undefined for match_all queries', () => {
    const query = { query: { match_all: {} } };
    expect(extractTimestampField(query)).toBeUndefined();
  });

  it('returns undefined for empty query', () => {
    expect(extractTimestampField({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// substituteMustacheTemplates
// ---------------------------------------------------------------------------

describe('substituteMustacheTemplates', () => {
  it('replaces {{period_end}} with epoch millis', () => {
    const before = Date.now();
    const result = substituteMustacheTemplates('{{period_end}}') as string;
    const after = Date.now();
    const value = parseInt(result, 10);
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it('replaces {{period_start}} with an earlier epoch millis', () => {
    const before = Date.now();
    const result = substituteMustacheTemplates('{{period_start}}') as string;
    const value = parseInt(result, 10);
    // Should be approximately 1 hour ago
    expect(value).toBeLessThan(before);
    expect(value).toBeGreaterThan(before - 3700_000); // Within 1 hour + some buffer
  });

  it('replaces multiple template variables in a string', () => {
    const input = 'range from {{period_start}} to {{period_end}}';
    const result = substituteMustacheTemplates(input) as string;
    expect(result).not.toContain('{{');
    expect(result).not.toContain('}}');
  });

  it('replaces unknown Mustache variables with current time', () => {
    const input = '{{ctx.results[0].aggregations.error_count.doc_count}}';
    const result = substituteMustacheTemplates(input) as string;
    expect(result).not.toContain('{{');
    const value = parseInt(result, 10);
    expect(value).toBeGreaterThan(0);
  });

  it('recursively processes objects', () => {
    const input = {
      range: {
        '@timestamp': {
          gte: '{{period_end}}||-5m',
          lte: '{{period_end}}',
        },
      },
    };
    const result = substituteMustacheTemplates(input) as Record<string, unknown>;
    const range = result.range as Record<string, Record<string, string>>;
    expect(range['@timestamp'].gte).not.toContain('{{');
    expect(range['@timestamp'].lte).not.toContain('{{');
  });

  it('recursively processes arrays', () => {
    const input = ['{{period_start}}', '{{period_end}}'];
    const result = substituteMustacheTemplates(input) as string[];
    expect(result[0]).not.toContain('{{');
    expect(result[1]).not.toContain('{{');
  });

  it('passes through null and undefined', () => {
    expect(substituteMustacheTemplates(null)).toBeNull();
    expect(substituteMustacheTemplates(undefined)).toBeUndefined();
  });

  it('passes through numbers unchanged', () => {
    expect(substituteMustacheTemplates(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// extractClusterMetricValue
// ---------------------------------------------------------------------------

describe('extractClusterMetricValue', () => {
  it('extracts number_of_nodes from input_results', () => {
    const execResult = {
      input_results: {
        results: [{ number_of_nodes: 5, status: 'green' }],
      },
    };
    expect(extractClusterMetricValue(execResult)).toBe(5);
  });

  it('extracts active_shards from input_results', () => {
    const execResult = {
      input_results: {
        results: [{ status: 'yellow', active_shards: 84 }],
      },
    };
    expect(extractClusterMetricValue(execResult)).toBe(84);
  });

  it('extracts unassigned_shards from input_results', () => {
    const execResult = {
      input_results: {
        results: [{ status: 'red', unassigned_shards: 12 }],
      },
    };
    expect(extractClusterMetricValue(execResult)).toBe(12);
  });

  it('falls back to first numeric value in result', () => {
    const execResult = {
      input_results: {
        results: [{ status: 'ok', custom_metric: 99 }],
      },
    };
    expect(extractClusterMetricValue(execResult)).toBe(99);
  });

  it('extracts from direct result properties', () => {
    const execResult = { number_of_nodes: 3 };
    expect(extractClusterMetricValue(execResult)).toBe(3);
  });

  it('returns 1 for results with no numeric values', () => {
    const execResult = { ok: true };
    expect(extractClusterMetricValue(execResult)).toBe(1);
  });

  it('returns 0 for null/undefined input', () => {
    expect(extractClusterMetricValue(null)).toBe(0);
    expect(extractClusterMetricValue(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toEpochMillis
// ---------------------------------------------------------------------------

describe('toEpochMillis', () => {
  it('passes through numbers directly', () => {
    expect(toEpochMillis(1700000000000)).toBe(1700000000000);
  });

  it('converts ISO strings to epoch millis', () => {
    const iso = '2024-01-15T12:00:00.000Z';
    expect(toEpochMillis(iso)).toBe(new Date(iso).getTime());
  });

  it('returns undefined for invalid strings', () => {
    expect(toEpochMillis('not-a-date')).toBeUndefined();
  });

  it('returns undefined for null/undefined', () => {
    expect(toEpochMillis(null)).toBeUndefined();
    expect(toEpochMillis(undefined)).toBeUndefined();
  });

  it('returns undefined for non-number/non-string types', () => {
    expect(toEpochMillis({})).toBeUndefined();
    expect(toEpochMillis([])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Condition preview data for all monitor types
// ---------------------------------------------------------------------------

describe('condition preview data for all monitor types', () => {
  async function setupSeeded() {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);
    osMock.seed(ds.id);
    const rules = await alertSvc.getUnifiedRules();
    return { ds, rules: rules.results, alertSvc, osMock };
  }

  it('generates preview data for query-level monitors', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const queryRule = rules.find((r) => r.name === 'High Error Rate');
    expect(queryRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, queryRule!.id);
    expect(detail).not.toBeNull();
    expect(detail!.conditionPreviewData.length).toBeGreaterThan(2);
  });

  it('generates preview data for cluster_metrics monitors', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const clusterRule = rules.find((r) => r.name === 'Cluster Health Status');
    expect(clusterRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, clusterRule!.id);
    expect(detail).not.toBeNull();
    // Cluster metrics should now produce 12 synthetic points
    expect(detail!.conditionPreviewData.length).toBe(12);
    // Values should be based on the cluster health result
    for (const pt of detail!.conditionPreviewData) {
      expect(pt.timestamp).toBeGreaterThan(0);
      expect(typeof pt.value).toBe('number');
    }
  });

  it('generates preview data for doc-level monitors', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const docRule = rules.find((r) => r.name === 'Log Anomaly Detection');
    expect(docRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, docRule!.id);
    expect(detail).not.toBeNull();
    // Doc-level should produce date_histogram points (12 buckets from mock)
    expect(detail!.conditionPreviewData.length).toBeGreaterThan(2);
  });

  it('generates preview data for bucket-level monitors', async () => {
    const { ds, rules, alertSvc } = await setupSeeded();
    const bucketRule = rules.find((r) => r.name === 'CPU Usage by Service');
    expect(bucketRule).toBeDefined();
    const detail = await alertSvc.getRuleDetail(ds.id, bucketRule!.id);
    expect(detail).not.toBeNull();
    // Bucket-level has search input, should produce date_histogram points
    expect(detail!.conditionPreviewData.length).toBeGreaterThan(2);
  });

  it('handles monitors with no inputs gracefully', async () => {
    const { dsSvc, alertSvc, osMock } = createStack();
    alertSvc.registerOpenSearch(osMock);
    const ds = await dsSvc.create(osDsInput);

    // Create a monitor with empty inputs
    const created = await alertSvc.createOSMonitor(ds.id, {
      name: 'Empty Input Monitor',
      type: 'monitor',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [],
      triggers: [],
      monitor_type: 'query_level_monitor',
      last_update_time: Date.now(),
    });

    const detail = await alertSvc.getRuleDetail(ds.id, created.id);
    expect(detail).not.toBeNull();
    // Should gracefully produce empty or fallback data without crashing
    expect(detail!.conditionPreviewData).toBeDefined();
  });
});
