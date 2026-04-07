/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  serializeMonitor,
  serializeMonitors,
  deserializeMonitor,
  MonitorConfig,
} from '../serializer';
import { UnifiedRule } from '../types';

const sampleRule = {
  id: 'rule-1',
  datasourceId: 'ds-1',
  datasourceType: 'opensearch' as const,
  name: 'High Error Rate',
  query: 'rate(errors_total[5m]) > 0.1',
  status: 'active',
  severity: 'critical' as const,
  monitorType: 'metric' as const,
  enabled: true,
  threshold: { operator: '>', value: 0.1, unit: 'errors/s' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  firingPeriod: '10m',
  labels: { team: 'platform', env: 'prod' },
  annotations: { summary: 'Error rate is high', runbook: 'https://wiki/errors' },
  lastUpdated: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  healthStatus: 'healthy',
  notificationRouting: [],
  notificationDestinations: [],
  alertHistory: [],
  conditionPreviewData: [],
  suppressionRules: [],
  raw: {} as any,
  source: 'opensearch',
} as unknown as UnifiedRule;

describe('serializeMonitor', () => {
  it('produces a valid MonitorConfig', () => {
    const config = serializeMonitor(sampleRule);
    expect(config.version).toBe('1.0');
    expect(config.name).toBe('High Error Rate');
    expect(config.query).toBe('rate(errors_total[5m]) > 0.1');
    expect(config.threshold.operator).toBe('>');
    expect(config.threshold.value).toBe(0.1);
    expect(config.severity).toBe('critical');
    expect(config.labels).toEqual({ team: 'platform', env: 'prod' });
    expect(config.annotations).toEqual({
      summary: 'Error rate is high',
      runbook: 'https://wiki/errors',
    });
  });

  it('omits routing when empty', () => {
    const config = serializeMonitor(sampleRule);
    expect(config.routing).toBeUndefined();
  });

  it('includes routing when present', () => {
    const rule = {
      ...sampleRule,
      notificationRouting: [
        {
          channel: 'slack',
          destination: '#alerts',
          severity: ['critical' as const],
          throttle: '5m',
        },
      ],
    };
    const config = serializeMonitor(rule);
    expect(config.routing).toHaveLength(1);
    expect(config.routing![0].channel).toBe('slack');
  });

  it('does not mutate original labels', () => {
    const originalLabels = { ...sampleRule.labels };
    const config = serializeMonitor(sampleRule);
    config.labels.newKey = 'mutated';
    expect(sampleRule.labels).toEqual(originalLabels);
  });
});

describe('serializeMonitors', () => {
  it('serializes an array of rules', () => {
    const configs = serializeMonitors([sampleRule, { ...sampleRule, name: 'Second Rule' }]);
    expect(configs).toHaveLength(2);
    expect(configs[0].name).toBe('High Error Rate');
    expect(configs[1].name).toBe('Second Rule');
  });
});

describe('deserializeMonitor', () => {
  const validInput: MonitorConfig = {
    version: '1.0',
    name: 'Test Monitor',
    query: 'up == 1',
    threshold: { operator: '>', value: 10, forDuration: '5m' },
    evaluation: { interval: '1m', pendingPeriod: '5m' },
    labels: { env: 'test' },
    annotations: {},
    severity: 'warning',
  };

  it('deserializes valid input', () => {
    const { config, errors } = deserializeMonitor(validInput);
    expect(errors).toHaveLength(0);
    expect(config).not.toBeNull();
    expect(config!.name).toBe('Test Monitor');
  });

  it('rejects null input', () => {
    const { config, errors } = deserializeMonitor(null);
    expect(config).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects missing name', () => {
    const { errors } = deserializeMonitor({ ...validInput, name: undefined });
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects missing query', () => {
    const { errors } = deserializeMonitor({ ...validInput, query: undefined });
    expect(errors.some((e) => e.includes('query'))).toBe(true);
  });

  it('rejects missing threshold', () => {
    const { errors } = deserializeMonitor({ ...validInput, threshold: undefined });
    expect(errors.some((e) => e.includes('threshold'))).toBe(true);
  });

  it('rejects invalid threshold.value', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: Infinity, forDuration: '5m' },
    });
    expect(errors.some((e) => e.includes('threshold.value'))).toBe(true);
  });

  it('rejects invalid threshold.forDuration', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: 10, forDuration: 'bad' },
    });
    expect(errors.some((e) => e.includes('threshold.forDuration'))).toBe(true);
  });

  it('rejects missing evaluation', () => {
    const { errors } = deserializeMonitor({ ...validInput, evaluation: undefined });
    expect(errors.some((e) => e.includes('evaluation'))).toBe(true);
  });

  it('rejects invalid evaluation.interval', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { interval: 'bad', pendingPeriod: '5m' },
    });
    expect(errors.some((e) => e.includes('evaluation.interval'))).toBe(true);
  });

  it('defaults severity to medium when missing', () => {
    const input = { ...validInput, severity: undefined };
    const { config } = deserializeMonitor(input);
    expect(config!.severity).toBe('medium');
  });

  it('handles missing labels gracefully', () => {
    const input = { ...validInput, labels: undefined };
    const { config } = deserializeMonitor(input);
    expect(config!.labels).toEqual({});
  });

  // --- Additional coverage ---

  it('rejects input too large (>1MB)', () => {
    const huge = { ...validInput, query: 'x'.repeat(1_100_000) };
    const { config, errors } = deserializeMonitor(huge);
    expect(config).toBeNull();
    expect(errors).toEqual(['Input too large (max 1MB)']);
  });

  it('rejects non-string name', () => {
    const { errors } = deserializeMonitor({ ...validInput, name: 42 });
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects name too long', () => {
    const { errors } = deserializeMonitor({ ...validInput, name: 'x'.repeat(10_001) });
    expect(errors.some((e) => e.includes('name') && e.includes('too long'))).toBe(true);
  });

  it('rejects non-string query', () => {
    const { errors } = deserializeMonitor({ ...validInput, query: 123 });
    expect(errors.some((e) => e.includes('query'))).toBe(true);
  });

  it('rejects query too long', () => {
    const { errors } = deserializeMonitor({ ...validInput, query: 'x'.repeat(10_001) });
    expect(errors.some((e) => e.includes('query') && e.includes('too long'))).toBe(true);
  });

  it('rejects missing threshold object', () => {
    const { errors } = deserializeMonitor({ ...validInput, threshold: null });
    expect(errors.some((e) => e.includes('threshold'))).toBe(true);
  });

  it('rejects threshold with non-string operator', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: 123, value: 10, forDuration: '5m' },
    });
    expect(errors.some((e) => e.includes('threshold.operator'))).toBe(true);
  });

  it('rejects threshold with NaN value', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: NaN, forDuration: '5m' },
    });
    expect(errors.some((e) => e.includes('threshold.value'))).toBe(true);
  });

  it('rejects threshold with Infinity value', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: Infinity, forDuration: '5m' },
    });
    expect(errors.some((e) => e.includes('threshold.value'))).toBe(true);
  });

  it('rejects threshold with invalid forDuration', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: 10, forDuration: 'xyz' },
    });
    expect(errors.some((e) => e.includes('threshold.forDuration'))).toBe(true);
  });

  it('rejects threshold missing forDuration', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: 10 },
    });
    expect(errors.some((e) => e.includes('threshold.forDuration'))).toBe(true);
  });

  it('rejects missing evaluation object', () => {
    const { errors } = deserializeMonitor({ ...validInput, evaluation: null });
    expect(errors.some((e) => e.includes('evaluation'))).toBe(true);
  });

  it('rejects evaluation with invalid interval', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { interval: 'xyz', pendingPeriod: '5m' },
    });
    expect(errors.some((e) => e.includes('evaluation.interval'))).toBe(true);
  });

  it('rejects evaluation with invalid pendingPeriod', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { interval: '1m', pendingPeriod: 'xyz' },
    });
    expect(errors.some((e) => e.includes('evaluation.pendingPeriod'))).toBe(true);
  });

  it('rejects evaluation missing interval', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { pendingPeriod: '5m' },
    });
    expect(errors.some((e) => e.includes('evaluation.interval'))).toBe(true);
  });

  it('rejects evaluation with invalid firingPeriod', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { interval: '1m', pendingPeriod: '5m', firingPeriod: 'bad' },
    });
    expect(errors.some((e) => e.includes('evaluation.firingPeriod'))).toBe(true);
  });

  it('deserializes valid config with labels, annotations, and routing', () => {
    const input = {
      ...validInput,
      labels: { env: 'prod', team: 'sre' },
      annotations: { summary: 'test', runbook: 'https://wiki/test' },
      routing: [{ channel: 'slack', destination: '#alerts', severity: ['critical'] }],
    };
    const { config, errors } = deserializeMonitor(input);
    expect(errors).toHaveLength(0);
    expect(config).not.toBeNull();
    expect(config!.labels).toEqual({ env: 'prod', team: 'sre' });
    expect(config!.annotations).toEqual({ summary: 'test', runbook: 'https://wiki/test' });
    expect(config!.routing).toHaveLength(1);
    expect(config!.routing![0].channel).toBe('slack');
  });

  it('rejects string input', () => {
    const { config, errors } = deserializeMonitor('not an object' as any);
    expect(config).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects number input', () => {
    const { config, errors } = deserializeMonitor(42 as any);
    expect(config).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
