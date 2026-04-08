/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrometheusMetadataService } from '../prometheus_metadata_service';
import type {
  PrometheusMetadataProvider,
  DatasourceService,
  Datasource,
  Logger,
  PrometheusMetricMetadata,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const fakeDatasource: Datasource = {
  id: 'ds-1',
  name: 'Test Prometheus',
  type: 'prometheus',
  url: 'http://localhost:9090',
  enabled: true,
};

function createMockProvider(): jest.Mocked<PrometheusMetadataProvider> {
  return {
    getMetricNames: jest
      .fn()
      .mockResolvedValue(['http_requests_total', 'up', 'node_cpu_seconds_total']),
    getLabelNames: jest.fn().mockResolvedValue(['__name__', 'instance', 'job']),
    getLabelValues: jest.fn().mockResolvedValue(['value1', 'value2', 'value3']),
    getMetricMetadata: jest
      .fn()
      .mockResolvedValue([
        { metric: 'http_requests_total', type: 'counter', help: 'Total requests' },
      ] as PrometheusMetricMetadata[]),
  };
}

function createMockDatasourceService(): jest.Mocked<DatasourceService> {
  return {
    list: jest.fn(),
    get: jest.fn().mockResolvedValue(fakeDatasource),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    testConnection: jest.fn(),
    listWorkspaces: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrometheusMetadataService', () => {
  let provider: jest.Mocked<PrometheusMetadataProvider>;
  let dsService: jest.Mocked<DatasourceService>;
  let service: PrometheusMetadataService;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = createMockProvider();
    dsService = createMockDatasourceService();
    service = new PrometheusMetadataService(provider, dsService, mockLogger);
  });

  // ---- getMetricNames ----------------------------------------------------

  describe('getMetricNames', () => {
    it('returns metric names from provider', async () => {
      const names = await service.getMetricNames('ds-1');
      expect(names).toEqual(['http_requests_total', 'up', 'node_cpu_seconds_total']);
      expect(dsService.get).toHaveBeenCalledWith('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledWith(fakeDatasource);
    });

    it('caches results — second call does not hit provider', async () => {
      await service.getMetricNames('ds-1');
      await service.getMetricNames('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(1);
    });

    it('filters results when search is provided', async () => {
      const names = await service.getMetricNames('ds-1', 'http');
      expect(names).toEqual(['http_requests_total']);
    });

    it('search filtering is case-insensitive', async () => {
      const names = await service.getMetricNames('ds-1', 'HTTP');
      expect(names).toEqual(['http_requests_total']);
    });

    it('returns empty array on provider error', async () => {
      provider.getMetricNames.mockRejectedValueOnce(new Error('connection refused'));
      const names = await service.getMetricNames('ds-1');
      expect(names).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns empty array when datasource not found', async () => {
      dsService.get.mockResolvedValueOnce(null);
      const names = await service.getMetricNames('ds-unknown');
      expect(names).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ---- getLabelNames -----------------------------------------------------

  describe('getLabelNames', () => {
    it('returns label names from provider', async () => {
      const labels = await service.getLabelNames('ds-1');
      expect(labels).toEqual(['__name__', 'instance', 'job']);
    });

    it('passes metric filter to provider', async () => {
      await service.getLabelNames('ds-1', 'http_requests_total');
      expect(provider.getLabelNames).toHaveBeenCalledWith(fakeDatasource, 'http_requests_total');
    });
  });

  // ---- getLabelValues ----------------------------------------------------

  describe('getLabelValues', () => {
    it('returns label values from provider', async () => {
      const values = await service.getLabelValues('ds-1', 'job');
      expect(values).toEqual(['value1', 'value2', 'value3']);
    });

    it('passes selector to provider', async () => {
      await service.getLabelValues('ds-1', 'instance', '{job="prometheus"}');
      expect(provider.getLabelValues).toHaveBeenCalledWith(
        fakeDatasource,
        'instance',
        '{job="prometheus"}'
      );
    });
  });

  // ---- getMetricMetadata -------------------------------------------------

  describe('getMetricMetadata', () => {
    it('returns metric metadata from provider', async () => {
      const metadata = await service.getMetricMetadata('ds-1');
      expect(metadata).toEqual([
        { metric: 'http_requests_total', type: 'counter', help: 'Total requests' },
      ]);
    });
  });

  // ---- Datasource-not-found branches for other methods ------------------

  describe('datasource not found — other methods', () => {
    it('getLabelNames returns empty array when datasource not found', async () => {
      dsService.get.mockResolvedValueOnce(null);
      const labels = await service.getLabelNames('ds-unknown');
      expect(labels).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('getLabelValues returns empty array when datasource not found', async () => {
      dsService.get.mockResolvedValueOnce(null);
      const values = await service.getLabelValues('ds-unknown', 'job');
      expect(values).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('getMetricMetadata returns empty array when datasource not found', async () => {
      dsService.get.mockResolvedValueOnce(null);
      const metadata = await service.getMetricMetadata('ds-unknown');
      expect(metadata).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ---- Stale-while-revalidate -------------------------------------------

  describe('stale-while-revalidate', () => {
    it('returns stale data immediately and triggers background refresh', async () => {
      const realDateNow = Date.now;
      let now = realDateNow();
      Date.now = () => now;

      // First fetch populates the cache
      await service.getMetricNames('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(1);

      // Advance past TTL (5 minutes)
      now += 6 * 60_000;

      // Prepare new data for background refresh
      provider.getMetricNames.mockResolvedValueOnce(['refreshed_metric']);

      // Second call returns stale data but triggers background refresh
      const staleResult = await service.getMetricNames('ds-1');
      expect(staleResult).toEqual(['http_requests_total', 'up', 'node_cpu_seconds_total']); // stale data

      // Wait a tick for the background refresh to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(provider.getMetricNames).toHaveBeenCalledTimes(2);

      Date.now = realDateNow;
    });

    it('logs warning on background refresh failure', async () => {
      const realDateNow = Date.now;
      let now = realDateNow();
      Date.now = () => now;

      // Populate cache
      await service.getMetricNames('ds-1');

      // Advance past TTL
      now += 6 * 60_000;

      // Background refresh fails
      provider.getMetricNames.mockRejectedValueOnce(new Error('network error'));

      // Still returns stale data
      const result = await service.getMetricNames('ds-1');
      expect(result).toEqual(['http_requests_total', 'up', 'node_cpu_seconds_total']);

      // Wait for background refresh to complete (and fail)
      await new Promise((r) => setTimeout(r, 10));

      expect(mockLogger.warn).toHaveBeenCalled();

      Date.now = realDateNow;
    });
  });

  // ---- Cache invalidation -----------------------------------------------

  describe('cache invalidation', () => {
    it('invalidate clears cache for a specific datasource', async () => {
      await service.getMetricNames('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(1);

      service.invalidate('ds-1');

      await service.getMetricNames('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(2);
    });

    it('invalidateAll clears entire cache', async () => {
      await service.getMetricNames('ds-1');
      await service.getLabelNames('ds-1');

      service.invalidateAll();

      await service.getMetricNames('ds-1');
      await service.getLabelNames('ds-1');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(2);
      expect(provider.getLabelNames).toHaveBeenCalledTimes(2);
    });

    it('invalidate does not affect other datasources', async () => {
      // Set up ds-2
      const ds2: Datasource = { ...fakeDatasource, id: 'ds-2' };
      dsService.get.mockImplementation(async (id) => (id === 'ds-2' ? ds2 : fakeDatasource));

      await service.getMetricNames('ds-1');
      await service.getMetricNames('ds-2');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(2);

      service.invalidate('ds-1');

      // ds-1 is invalidated, ds-2 is still cached
      await service.getMetricNames('ds-1');
      await service.getMetricNames('ds-2');
      expect(provider.getMetricNames).toHaveBeenCalledTimes(3); // only ds-1 re-fetched
    });
  });
});
