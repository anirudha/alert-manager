import { serializeMonitor, serializeMonitors, deserializeMonitor, MonitorConfig } from '../serializer';
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
    expect(config.annotations).toEqual({ summary: 'Error rate is high', runbook: 'https://wiki/errors' });
  });

  it('omits routing when empty', () => {
    const config = serializeMonitor(sampleRule);
    expect(config.routing).toBeUndefined();
  });

  it('includes routing when present', () => {
    const rule = {
      ...sampleRule,
      notificationRouting: [{ channel: 'slack', destination: '#alerts', severity: ['critical' as const], throttle: '5m' }],
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
    expect(errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects missing query', () => {
    const { errors } = deserializeMonitor({ ...validInput, query: undefined });
    expect(errors.some(e => e.includes('query'))).toBe(true);
  });

  it('rejects missing threshold', () => {
    const { errors } = deserializeMonitor({ ...validInput, threshold: undefined });
    expect(errors.some(e => e.includes('threshold'))).toBe(true);
  });

  it('rejects invalid threshold.value', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: Infinity, forDuration: '5m' },
    });
    expect(errors.some(e => e.includes('threshold.value'))).toBe(true);
  });

  it('rejects invalid threshold.forDuration', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      threshold: { operator: '>', value: 10, forDuration: 'bad' },
    });
    expect(errors.some(e => e.includes('threshold.forDuration'))).toBe(true);
  });

  it('rejects missing evaluation', () => {
    const { errors } = deserializeMonitor({ ...validInput, evaluation: undefined });
    expect(errors.some(e => e.includes('evaluation'))).toBe(true);
  });

  it('rejects invalid evaluation.interval', () => {
    const { errors } = deserializeMonitor({
      ...validInput,
      evaluation: { interval: 'bad', pendingPeriod: '5m' },
    });
    expect(errors.some(e => e.includes('evaluation.interval'))).toBe(true);
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
});
