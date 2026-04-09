/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlarmsApiClient, HttpClient } from '../alarms_client';
import type { SloInput } from '../../../common/slo_types';

// ---------------------------------------------------------------------------
// Mock HttpClient
// ---------------------------------------------------------------------------

function createMockHttp(): HttpClient & {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
} {
  return {
    get: jest.fn().mockResolvedValue({}),
    post: jest.fn().mockResolvedValue({}),
    put: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
}

// ---------------------------------------------------------------------------
// Constructor / path selection
// ---------------------------------------------------------------------------

describe('AlarmsApiClient', () => {
  describe('constructor', () => {
    it('defaults to OSD mode', () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http);
      expect(client.rawHttp).toBe(http);
    });

    it('uses standalone paths in standalone mode', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ datasources: [] });
      const client = new AlarmsApiClient(http, 'standalone');
      await client.listDatasources();
      expect(http.get).toHaveBeenCalledWith('/api/datasources');
    });

    it('uses OSD paths in osd mode', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ datasources: [] });
      const client = new AlarmsApiClient(http, 'osd');
      await client.listDatasources();
      expect(http.get).toHaveBeenCalledWith('/api/alerting/datasources');
    });
  });

  // ---- Datasources -------------------------------------------------------

  describe('listDatasources', () => {
    it('returns datasources from response', async () => {
      const http = createMockHttp();
      const ds = [{ id: 'ds-1', name: 'Test' }];
      http.get.mockResolvedValue({ datasources: ds });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listDatasources();
      expect(result).toEqual(ds);
    });

    it('returns empty array when response has no datasources', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({});
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listDatasources();
      expect(result).toEqual([]);
    });
  });

  describe('listWorkspaces', () => {
    it('returns empty array in OSD mode', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'osd');
      const result = await client.listWorkspaces('ds-1');
      expect(result).toEqual([]);
      expect(http.get).not.toHaveBeenCalled();
    });

    it('fetches workspaces in standalone mode', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ workspaces: [{ id: 'ws-1' }] });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listWorkspaces('ds-1');
      expect(result).toEqual([{ id: 'ws-1' }]);
      expect(http.get).toHaveBeenCalledWith('/api/datasources/ds-1/workspaces');
    });
  });

  // ---- Alerts -------------------------------------------------------------

  describe('listAlertsPaginated', () => {
    it('returns paginated response from results field', async () => {
      const http = createMockHttp();
      const alerts = [{ id: 'a-1' }, { id: 'a-2' }];
      http.get.mockResolvedValue({ results: alerts });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listAlertsPaginated(['ds-1'], 1, 50);
      expect(result.results).toEqual(alerts);
      expect(result.total).toBe(2);
    });

    it('falls back to alerts field', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ alerts: [{ id: 'a-1' }] });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listAlertsPaginated([], 1, 50);
      expect(result.results).toHaveLength(1);
    });

    it('passes query params in OSD mode', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ results: [] });
      const client = new AlarmsApiClient(http, 'osd');
      await client.listAlertsPaginated(['ds-1', 'ds-2'], 1, 25);
      expect(http.get).toHaveBeenCalledWith(
        '/api/alerting/unified/alerts',
        expect.objectContaining({ query: { maxResults: '25', dsIds: 'ds-1,ds-2' } })
      );
    });
  });

  // ---- Rules --------------------------------------------------------------

  describe('listRulesPaginated', () => {
    it('returns paginated response', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ rules: [{ id: 'r-1' }] });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.listRulesPaginated([], 1, 50);
      expect(result.results).toHaveLength(1);
    });
  });

  // ---- Monitor CRUD -------------------------------------------------------

  describe('monitor CRUD', () => {
    it('creates monitor', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.createMonitor({ name: 'mon' }, 'ds-1');
      expect(http.post).toHaveBeenCalledWith('/api/monitors', { name: 'mon' });
    });

    it('updates monitor', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.updateMonitor('m-1', { name: 'updated' }, 'ds-1');
      expect(http.put).toHaveBeenCalledWith('/api/monitors/m-1', { name: 'updated' });
    });

    it('deletes monitor', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.deleteMonitor('m-1', 'ds-1');
      expect(http.delete).toHaveBeenCalledWith('/api/monitors/m-1');
    });

    it('imports monitors', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.importMonitors([{ name: 'mon' }], 'ds-1');
      expect(http.post).toHaveBeenCalledWith('/api/monitors/import', [{ name: 'mon' }]);
    });

    it('exports monitors', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.exportMonitors('ds-1');
      expect(http.get).toHaveBeenCalledWith('/api/monitors/export');
    });

    it('uses OSD paths for monitors', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'osd');
      await client.createMonitor({ name: 'mon' }, 'ds-99');
      expect(http.post).toHaveBeenCalledWith('/api/alerting/opensearch/ds-99/monitors', {
        name: 'mon',
      });
    });
  });

  // ---- Suppression rules --------------------------------------------------

  describe('suppression rules', () => {
    it('lists suppression rules', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.listSuppressionRules();
      expect(http.get).toHaveBeenCalledWith('/api/suppression-rules');
    });

    it('creates suppression rule', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.createSuppressionRule({ name: 'rule' });
      expect(http.post).toHaveBeenCalledWith('/api/suppression-rules', { name: 'rule' });
    });

    it('updates suppression rule', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.updateSuppressionRule('r-1', { name: 'updated' });
      expect(http.put).toHaveBeenCalledWith('/api/suppression-rules/r-1', { name: 'updated' });
    });

    it('deletes suppression rule', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.deleteSuppressionRule('r-1');
      expect(http.delete).toHaveBeenCalledWith('/api/suppression-rules/r-1');
    });
  });

  // ---- SLO CRUD -----------------------------------------------------------

  describe('SLO CRUD', () => {
    it('lists SLOs', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.listSlos();
      expect(http.get).toHaveBeenCalledWith('/api/slos');
    });

    it('gets single SLO', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getSlo('slo-1');
      expect(http.get).toHaveBeenCalledWith('/api/slos/slo-1');
    });

    it('creates SLO', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.createSlo({ name: 'New SLO' } as unknown as SloInput);
      expect(http.post).toHaveBeenCalledWith('/api/slos', { name: 'New SLO' });
    });

    it('deletes SLO', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.deleteSlo('slo-1');
      expect(http.delete).toHaveBeenCalledWith('/api/slos/slo-1');
    });

    it('URL-encodes SLO id', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getSlo('slo/with spaces');
      expect(http.get).toHaveBeenCalledWith('/api/slos/slo%2Fwith%20spaces');
    });
  });

  // ---- Alert actions ------------------------------------------------------

  describe('alert actions', () => {
    it('acknowledges alert', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.acknowledgeAlert('a-1', 'ds-1', 'mon-1');
      expect(http.post).toHaveBeenCalledWith('/api/alerts/a-1/acknowledge', {
        datasourceId: 'ds-1',
        monitorId: 'mon-1',
      });
    });

    it('silences alert with default duration', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.silenceAlert('a-1');
      expect(http.post).toHaveBeenCalledWith('/api/alerts/a-1/silence', { duration: '1h' });
    });

    it('silences alert with custom duration', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.silenceAlert('a-1', '4h');
      expect(http.post).toHaveBeenCalledWith('/api/alerts/a-1/silence', { duration: '4h' });
    });
  });

  // ---- Cache --------------------------------------------------------------

  describe('caching', () => {
    it('caches GET requests for listDatasources', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ datasources: [{ id: 'ds-1' }] });
      const client = new AlarmsApiClient(http, 'standalone');

      await client.listDatasources();
      await client.listDatasources();
      // Should only call HTTP once due to caching
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('invalidateCache clears cached data', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ datasources: [{ id: 'ds-1' }] });
      const client = new AlarmsApiClient(http, 'standalone');

      await client.listDatasources();
      client.invalidateCache();
      await client.listDatasources();
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('cache expires after TTL', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ datasources: [] });
      const client = new AlarmsApiClient(http, 'standalone');

      const realDateNow = Date.now;
      let now = realDateNow();
      Date.now = () => now;

      await client.listDatasources();
      expect(http.get).toHaveBeenCalledTimes(1);

      // Advance past TTL (30s)
      now += 31_000;
      await client.listDatasources();
      expect(http.get).toHaveBeenCalledTimes(2);

      Date.now = realDateNow;
    });

    it('deduplicates concurrent in-flight requests', async () => {
      const http = createMockHttp();
      let resolveGet: (v: unknown) => void;
      http.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          })
      );

      const client = new AlarmsApiClient(http, 'standalone');

      const p1 = client.listDatasources();
      const p2 = client.listDatasources();

      // Only one HTTP call should have been made
      expect(http.get).toHaveBeenCalledTimes(1);

      resolveGet!({ datasources: [{ id: 'ds-1' }] });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(r2);
    });
  });

  // ---- Alertmanager config ------------------------------------------------

  describe('alertmanager config', () => {
    it('fetches alertmanager config', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getAlertmanagerConfig();
      expect(http.get).toHaveBeenCalledWith('/api/alertmanager/config');
    });
  });

  // ---- Detail views (flyouts) ---------------------------------------------

  describe('detail views', () => {
    it('fetches alert detail (standalone)', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getAlertDetail('ds-1', 'alert-123');
      expect(http.get).toHaveBeenCalledWith('/api/alerts/ds-1/alert-123');
    });

    it('fetches alert detail (OSD mode)', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'osd');
      await client.getAlertDetail('ds-1', 'alert-123');
      expect(http.get).toHaveBeenCalledWith('/api/alerting/alerts/ds-1/alert-123');
    });

    it('fetches rule detail (standalone)', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getRuleDetail('ds-1', 'rule-456');
      expect(http.get).toHaveBeenCalledWith('/api/rules/ds-1/rule-456');
    });

    it('fetches rule detail (OSD mode)', async () => {
      const http = createMockHttp();
      const client = new AlarmsApiClient(http, 'osd');
      await client.getRuleDetail('ds-1', 'rule-456');
      expect(http.get).toHaveBeenCalledWith('/api/alerting/rules/ds-1/rule-456');
    });
  });

  // ---- Prometheus Metadata ------------------------------------------------

  describe('getMetricNames', () => {
    it('fetches metric names without search (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ metrics: ['up'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.getMetricNames('ds-1');
      expect(result.metrics).toEqual(['up']);
      expect(http.get).toHaveBeenCalledWith('/api/datasources/ds-1/metadata/metrics');
    });

    it('fetches metric names with search (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ metrics: ['http_requests_total'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getMetricNames('ds-1', 'http');
      expect(http.get).toHaveBeenCalledWith('/api/datasources/ds-1/metadata/metrics?search=http');
    });

    it('fetches metric names with search (OSD mode uses query option)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ metrics: ['http_requests_total'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'osd');
      await client.getMetricNames('ds-1', 'http');
      expect(http.get).toHaveBeenCalledWith('/api/alerting/prometheus/ds-1/metadata/metrics', {
        query: { search: 'http' },
      });
    });
  });

  describe('getLabelNames', () => {
    it('fetches label names without metric (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ labels: ['job', 'instance'] });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.getLabelNames('ds-1');
      expect(result.labels).toEqual(['job', 'instance']);
    });

    it('fetches label names with metric filter (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ labels: ['status_code'] });
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getLabelNames('ds-1', 'http_requests_total');
      expect(http.get).toHaveBeenCalledWith(
        '/api/datasources/ds-1/metadata/labels?metric=http_requests_total'
      );
    });

    it('fetches label names with metric filter (OSD mode)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ labels: ['status_code'] });
      const client = new AlarmsApiClient(http, 'osd');
      await client.getLabelNames('ds-1', 'http_requests_total');
      expect(http.get).toHaveBeenCalledWith('/api/alerting/prometheus/ds-1/metadata/labels', {
        query: { metric: 'http_requests_total' },
      });
    });
  });

  describe('getLabelValues', () => {
    it('fetches label values without selector (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ values: ['val1'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.getLabelValues('ds-1', 'job');
      expect(result.values).toEqual(['val1']);
    });

    it('fetches label values with selector (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ values: ['val1'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'standalone');
      await client.getLabelValues('ds-1', 'instance', '{job="prom"}');
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/metadata/label-values/instance?selector=')
      );
    });

    it('fetches label values with selector (OSD mode)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ values: ['val1'], total: 1, truncated: false });
      const client = new AlarmsApiClient(http, 'osd');
      await client.getLabelValues('ds-1', 'instance', '{job="prom"}');
      expect(http.get).toHaveBeenCalledWith(
        '/api/alerting/prometheus/ds-1/metadata/label-values/instance',
        { query: { selector: '{job="prom"}' } }
      );
    });
  });

  describe('getMetricMetadata', () => {
    it('fetches metric metadata (standalone)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ metadata: [{ metric: 'up', type: 'gauge', help: 'Up' }] });
      const client = new AlarmsApiClient(http, 'standalone');
      const result = await client.getMetricMetadata('ds-1');
      expect(result.metadata).toHaveLength(1);
      expect(http.get).toHaveBeenCalledWith('/api/datasources/ds-1/metadata/metric-metadata');
    });

    it('fetches metric metadata (OSD mode)', async () => {
      const http = createMockHttp();
      http.get.mockResolvedValue({ metadata: [] });
      const client = new AlarmsApiClient(http, 'osd');
      await client.getMetricMetadata('ds-1');
      expect(http.get).toHaveBeenCalledWith(
        '/api/alerting/prometheus/ds-1/metadata/metric-metadata'
      );
    });
  });
});
