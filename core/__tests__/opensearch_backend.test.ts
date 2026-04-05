/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpOpenSearchBackend } from '../opensearch_backend';
import { Logger, Datasource } from '../types';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const osDs: Datasource = {
  id: 'ds-1',
  name: 'Test OS',
  type: 'opensearch',
  url: 'https://localhost:9200',
  enabled: true,
};

// Mock HttpClient at the module level
jest.mock('../http_client', () => {
  const mockRequest = jest.fn();
  return {
    HttpClient: jest.fn().mockImplementation(() => ({
      request: mockRequest,
      destroy: jest.fn(),
    })),
    buildAuthFromDatasource: jest.fn(),
    __mockRequest: mockRequest,
  };
});

function getMockRequest(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../http_client').__mockRequest;
}

describe('HttpOpenSearchBackend', () => {
  let backend: HttpOpenSearchBackend;
  let mockRequest: jest.Mock;

  beforeEach(() => {
    mockRequest = getMockRequest();
    mockRequest.mockReset();
    backend = new HttpOpenSearchBackend(noopLogger);
  });

  describe('getMonitors', () => {
    it('returns monitors from search response', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          hits: {
            hits: [
              {
                _id: 'mon-1',
                _source: {
                  name: 'Test Monitor',
                  type: 'monitor',
                  monitor_type: 'query_level_monitor',
                  enabled: true,
                  schedule: { period: { interval: 5, unit: 'MINUTES' } },
                  inputs: [],
                  triggers: [],
                  last_update_time: Date.now(),
                },
                sort: ['mon-1'],
              },
            ],
          },
        },
        headers: {},
      });

      const monitors = await backend.getMonitors(osDs);
      expect(monitors).toHaveLength(1);
      expect(monitors[0].id).toBe('mon-1');
      expect(monitors[0].name).toBe('Test Monitor');
    });

    it('returns empty array when no hits', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: { hits: { hits: [] } },
        headers: {},
      });

      const monitors = await backend.getMonitors(osDs);
      expect(monitors).toEqual([]);
    });

    it('paginates with search_after when more than PAGE_SIZE', async () => {
      // First page: 100 results
      const page1Hits = Array.from({ length: 100 }, (_, i) => ({
        _id: `mon-${i}`,
        _source: {
          name: `Monitor ${i}`,
          type: 'monitor',
          monitor_type: 'query_level_monitor',
          enabled: true,
          schedule: { period: { interval: 5, unit: 'MINUTES' } },
          inputs: [],
          triggers: [],
          last_update_time: Date.now(),
        },
        sort: [`mon-${i}`],
      }));

      // Second page: 10 results (less than PAGE_SIZE = done)
      const page2Hits = Array.from({ length: 10 }, (_, i) => ({
        _id: `mon-${100 + i}`,
        _source: {
          name: `Monitor ${100 + i}`,
          type: 'monitor',
          monitor_type: 'query_level_monitor',
          enabled: true,
          schedule: { period: { interval: 5, unit: 'MINUTES' } },
          inputs: [],
          triggers: [],
          last_update_time: Date.now(),
        },
        sort: [`mon-${100 + i}`],
      }));

      mockRequest
        .mockResolvedValueOnce({ status: 200, body: { hits: { hits: page1Hits } }, headers: {} })
        .mockResolvedValueOnce({ status: 200, body: { hits: { hits: page2Hits } }, headers: {} });

      const monitors = await backend.getMonitors(osDs);
      expect(monitors).toHaveLength(110);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      // Second call should include search_after
      const secondCallBody = mockRequest.mock.calls[1][0].body;
      expect(secondCallBody.search_after).toBeDefined();
    });
  });

  describe('getMonitor', () => {
    it('returns monitor when found', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          _id: 'mon-1',
          _seq_no: 5,
          _primary_term: 1,
          monitor: {
            name: 'Test',
            type: 'monitor',
            monitor_type: 'query_level_monitor',
            enabled: true,
            schedule: { period: { interval: 5, unit: 'MINUTES' } },
            inputs: [],
            triggers: [],
            last_update_time: Date.now(),
          },
        },
        headers: {},
      });

      const monitor = await backend.getMonitor(osDs, 'mon-1');
      expect(monitor).not.toBeNull();
      expect(monitor!.name).toBe('Test');
    });

    it('returns null on 404', async () => {
      mockRequest.mockRejectedValueOnce(new Error('HTTP 404'));
      const monitor = await backend.getMonitor(osDs, 'non-existent');
      expect(monitor).toBeNull();
    });
  });

  describe('createMonitor', () => {
    it('creates and returns monitor', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 201,
        body: {
          _id: 'new-mon',
          monitor: {
            name: 'New Monitor',
            type: 'monitor',
            monitor_type: 'query_level_monitor',
            enabled: true,
            schedule: { period: { interval: 5, unit: 'MINUTES' } },
            inputs: [],
            triggers: [],
            last_update_time: Date.now(),
          },
        },
        headers: {},
      });

      const monitor = await backend.createMonitor(osDs, {
        name: 'New Monitor',
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        last_update_time: Date.now(),
      });
      expect(monitor.id).toBe('new-mon');
    });
  });

  describe('updateMonitor', () => {
    it('uses optimistic concurrency with seq_no and primary_term', async () => {
      // GET response with version info
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          _id: 'mon-1',
          _seq_no: 10,
          _primary_term: 2,
          monitor: {
            name: 'Old Name',
            type: 'monitor',
            monitor_type: 'query_level_monitor',
            enabled: true,
            schedule: { period: { interval: 5, unit: 'MINUTES' } },
            inputs: [],
            triggers: [],
            last_update_time: Date.now(),
          },
        },
        headers: {},
      });

      // PUT response
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          _id: 'mon-1',
          monitor: {
            name: 'New Name',
            type: 'monitor',
            monitor_type: 'query_level_monitor',
            enabled: true,
            schedule: { period: { interval: 5, unit: 'MINUTES' } },
            inputs: [],
            triggers: [],
            last_update_time: Date.now(),
          },
        },
        headers: {},
      });

      const result = await backend.updateMonitor(osDs, 'mon-1', { name: 'New Name' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Name');

      // Verify PUT URL includes concurrency params
      const putUrl = mockRequest.mock.calls[1][0].url;
      expect(putUrl).toContain('if_seq_no=10');
      expect(putUrl).toContain('if_primary_term=2');
    });

    it('returns null when monitor not found', async () => {
      mockRequest.mockRejectedValueOnce(new Error('HTTP 404'));
      const result = await backend.updateMonitor(osDs, 'non-existent', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('deleteMonitor', () => {
    it('returns true on success', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, body: {}, headers: {} });
      const result = await backend.deleteMonitor(osDs, 'mon-1');
      expect(result).toBe(true);
    });

    it('returns false on 404', async () => {
      mockRequest.mockRejectedValueOnce(new Error('HTTP 404'));
      const result = await backend.deleteMonitor(osDs, 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getAlerts', () => {
    it('returns alerts with pagination', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          totalAlerts: 3,
          alerts: [
            {
              id: 'alert-1',
              monitor_id: 'm1',
              monitor_name: 'Mon1',
              trigger_id: 't1',
              trigger_name: 'Trig1',
              state: 'ACTIVE',
              severity: '2',
              start_time: Date.now(),
              last_notification_time: Date.now(),
            },
            {
              id: 'alert-2',
              monitor_id: 'm1',
              monitor_name: 'Mon1',
              trigger_id: 't1',
              trigger_name: 'Trig1',
              state: 'COMPLETED',
              severity: '3',
              start_time: Date.now(),
              last_notification_time: Date.now(),
            },
            {
              id: 'alert-3',
              monitor_id: 'm2',
              monitor_name: 'Mon2',
              trigger_id: 't2',
              trigger_name: 'Trig2',
              state: 'ACTIVE',
              severity: '1',
              start_time: Date.now(),
              last_notification_time: Date.now(),
            },
          ],
        },
        headers: {},
      });

      const result = await backend.getAlerts(osDs);
      expect(result.alerts).toHaveLength(3);
      expect(result.totalAlerts).toBe(3);
      expect(result.alerts[0].id).toBe('alert-1');
    });
  });

  describe('acknowledgeAlerts', () => {
    it('sends alert IDs to acknowledge endpoint', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, body: { success: true }, headers: {} });

      await backend.acknowledgeAlerts(osDs, 'mon-1', ['alert-1', 'alert-2']);

      const callBody = mockRequest.mock.calls[0][0].body;
      expect(callBody.alerts).toEqual(['alert-1', 'alert-2']);
    });
  });

  describe('getDestinations', () => {
    it('returns mapped destinations', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: {
          destinations: [
            { id: 'dest-1', type: 'slack', name: 'ops-slack', last_update_time: Date.now() },
          ],
        },
        headers: {},
      });

      const dests = await backend.getDestinations(osDs);
      expect(dests).toHaveLength(1);
      expect(dests[0].name).toBe('ops-slack');
    });
  });

  describe('TLS configuration', () => {
    it('uses datasource TLS config when available', async () => {
      const dsWithTls: Datasource = {
        ...osDs,
        tls: { rejectUnauthorized: true },
      };

      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: { hits: { hits: [] } },
        headers: {},
      });

      await backend.getMonitors(dsWithTls);

      const requestOpts = mockRequest.mock.calls[0][0];
      expect(requestOpts.rejectUnauthorized).toBe(true);
    });

    it('defaults to false when no TLS config', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        body: { hits: { hits: [] } },
        headers: {},
      });

      await backend.getMonitors(osDs);

      const requestOpts = mockRequest.mock.calls[0][0];
      expect(requestOpts.rejectUnauthorized).toBe(false);
    });
  });
});
