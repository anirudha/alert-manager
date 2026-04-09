/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleGetMetricNames,
  handleGetLabelNames,
  handleGetLabelValues,
  handleGetMetricMetadata,
} from '../metadata_handlers';
import type { PrometheusMetadataService } from '../../../common/prometheus_metadata_service';
import type { Logger, PrometheusMetricMetadata } from '../../../common/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function createMockService(): jest.Mocked<
  Pick<
    PrometheusMetadataService,
    'getMetricNames' | 'getLabelNames' | 'getLabelValues' | 'getMetricMetadata'
  >
> {
  return {
    getMetricNames: jest.fn().mockResolvedValue([]),
    getLabelNames: jest.fn().mockResolvedValue([]),
    getLabelValues: jest.fn().mockResolvedValue([]),
    getMetricMetadata: jest.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// handleGetMetricNames
// ---------------------------------------------------------------------------

describe('handleGetMetricNames', () => {
  let svc: jest.Mocked<
    Pick<
      PrometheusMetadataService,
      'getMetricNames' | 'getLabelNames' | 'getLabelValues' | 'getMetricMetadata'
    >
  >;

  beforeEach(() => {
    svc = createMockService();
    jest.clearAllMocks();
  });

  it('returns sorted, truncated metrics', async () => {
    // Generate 250 metric names (exceeds MAX_RESULTS=200)
    const metrics = Array.from({ length: 250 }, (_, i) => `metric_${String(i).padStart(3, '0')}`);
    svc.getMetricNames.mockResolvedValue(metrics);

    const result = await handleGetMetricNames(svc as unknown as PrometheusMetadataService, 'ds-1');
    expect(result.status).toBe(200);
    const body = result.body as { metrics: string[]; total: number; truncated: boolean };
    expect(body.metrics).toHaveLength(200);
    expect(body.total).toBe(250);
    expect(body.truncated).toBe(true);
    // Verify sorted
    for (let i = 1; i < body.metrics.length; i++) {
      expect(body.metrics[i] >= body.metrics[i - 1]).toBe(true);
    }
  });

  it('returns all metrics when under MAX_RESULTS', async () => {
    svc.getMetricNames.mockResolvedValue(['alpha', 'gamma', 'beta']);
    const result = await handleGetMetricNames(svc as unknown as PrometheusMetadataService, 'ds-1');
    expect(result.status).toBe(200);
    const body = result.body as { metrics: string[]; total: number; truncated: boolean };
    expect(body.metrics).toEqual(['alpha', 'beta', 'gamma']); // sorted
    expect(body.total).toBe(3);
    expect(body.truncated).toBe(false);
  });

  it('passes search filter to service', async () => {
    svc.getMetricNames.mockResolvedValue(['http_requests_total']);
    const result = await handleGetMetricNames(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'http'
    );
    expect(result.status).toBe(200);
    expect(svc.getMetricNames).toHaveBeenCalledWith('ds-1', 'http');
  });

  it('returns empty result on service error (with logger)', async () => {
    svc.getMetricNames.mockRejectedValue(new Error('timeout'));
    const result = await handleGetMetricNames(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      undefined,
      mockLogger
    );
    expect(result.status).toBe(200);
    const body = result.body as { metrics: string[]; total: number; truncated: boolean };
    expect(body.metrics).toEqual([]);
    expect(body.total).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns empty result on service error (without logger)', async () => {
    svc.getMetricNames.mockRejectedValue(new Error('timeout'));
    const result = await handleGetMetricNames(svc as unknown as PrometheusMetadataService, 'ds-1');
    expect(result.status).toBe(200);
    const body = result.body as { metrics: string[]; total: number; truncated: boolean };
    expect(body.metrics).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleGetLabelNames
// ---------------------------------------------------------------------------

describe('handleGetLabelNames', () => {
  let svc: ReturnType<typeof createMockService>;

  beforeEach(() => {
    svc = createMockService();
    jest.clearAllMocks();
  });

  it('returns sorted labels', async () => {
    svc.getLabelNames.mockResolvedValue(['job', 'instance', '__name__']);
    const result = await handleGetLabelNames(svc as unknown as PrometheusMetadataService, 'ds-1');
    expect(result.status).toBe(200);
    const body = result.body as { labels: string[] };
    expect(body.labels).toEqual(['__name__', 'instance', 'job']);
  });

  it('passes metric filter to service', async () => {
    svc.getLabelNames.mockResolvedValue(['status_code']);
    await handleGetLabelNames(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'http_requests_total'
    );
    expect(svc.getLabelNames).toHaveBeenCalledWith('ds-1', 'http_requests_total');
  });

  it('returns empty labels on service error (with logger)', async () => {
    svc.getLabelNames.mockRejectedValue(new Error('network error'));
    const result = await handleGetLabelNames(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      undefined,
      mockLogger
    );
    expect(result.status).toBe(200);
    const body = result.body as { labels: string[] };
    expect(body.labels).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns empty labels on service error (without logger)', async () => {
    svc.getLabelNames.mockRejectedValue(new Error('network error'));
    const result = await handleGetLabelNames(svc as unknown as PrometheusMetadataService, 'ds-1');
    expect(result.status).toBe(200);
    const body = result.body as { labels: string[] };
    expect(body.labels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleGetLabelValues
// ---------------------------------------------------------------------------

describe('handleGetLabelValues', () => {
  let svc: ReturnType<typeof createMockService>;

  beforeEach(() => {
    svc = createMockService();
    jest.clearAllMocks();
  });

  it('returns sorted, truncated values', async () => {
    const values = Array.from({ length: 250 }, (_, i) => `val_${String(i).padStart(3, '0')}`);
    svc.getLabelValues.mockResolvedValue(values);

    const result = await handleGetLabelValues(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'instance'
    );
    expect(result.status).toBe(200);
    const body = result.body as { values: string[]; total: number; truncated: boolean };
    expect(body.values).toHaveLength(200);
    expect(body.total).toBe(250);
    expect(body.truncated).toBe(true);
  });

  it('returns all values when under limit', async () => {
    svc.getLabelValues.mockResolvedValue(['z-val', 'a-val', 'm-val']);
    const result = await handleGetLabelValues(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'job'
    );
    expect(result.status).toBe(200);
    const body = result.body as { values: string[]; total: number; truncated: boolean };
    expect(body.values).toEqual(['a-val', 'm-val', 'z-val']); // sorted
    expect(body.truncated).toBe(false);
  });

  it('returns empty values on service error (with logger)', async () => {
    svc.getLabelValues.mockRejectedValue(new Error('timeout'));
    const result = await handleGetLabelValues(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'job',
      undefined,
      mockLogger
    );
    expect(result.status).toBe(200);
    const body = result.body as { values: string[]; total: number; truncated: boolean };
    expect(body.values).toEqual([]);
    expect(body.total).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns empty values on service error (without logger)', async () => {
    svc.getLabelValues.mockRejectedValue(new Error('timeout'));
    const result = await handleGetLabelValues(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      'job'
    );
    expect(result.status).toBe(200);
    const body = result.body as { values: string[]; total: number; truncated: boolean };
    expect(body.values).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleGetMetricMetadata
// ---------------------------------------------------------------------------

describe('handleGetMetricMetadata', () => {
  let svc: ReturnType<typeof createMockService>;

  beforeEach(() => {
    svc = createMockService();
    jest.clearAllMocks();
  });

  it('returns metadata from service', async () => {
    const mockMetadata: PrometheusMetricMetadata[] = [
      { metric: 'http_requests_total', type: 'counter', help: 'Total HTTP requests' },
    ];
    svc.getMetricMetadata.mockResolvedValue(mockMetadata);

    const result = await handleGetMetricMetadata(
      svc as unknown as PrometheusMetadataService,
      'ds-1'
    );
    expect(result.status).toBe(200);
    const body = result.body as { metadata: PrometheusMetricMetadata[] };
    expect(body.metadata).toEqual(mockMetadata);
  });

  it('returns empty metadata on service error (with logger)', async () => {
    svc.getMetricMetadata.mockRejectedValue(new Error('failed'));
    const result = await handleGetMetricMetadata(
      svc as unknown as PrometheusMetadataService,
      'ds-1',
      mockLogger
    );
    expect(result.status).toBe(200);
    const body = result.body as { metadata: PrometheusMetricMetadata[] };
    expect(body.metadata).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns empty metadata on service error (without logger)', async () => {
    svc.getMetricMetadata.mockRejectedValue(new Error('failed'));
    const result = await handleGetMetricMetadata(
      svc as unknown as PrometheusMetadataService,
      'ds-1'
    );
    expect(result.status).toBe(200);
    const body = result.body as { metadata: PrometheusMetricMetadata[] };
    expect(body.metadata).toEqual([]);
  });
});
