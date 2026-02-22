/**
 * Monitor serialization for JSON export/import.
 */
import { UnifiedRule } from './types';
import { parseDuration } from './validators';

export interface MonitorConfig {
  version: '1.0';
  name: string;
  query: string;
  threshold: { operator: string; value: number; unit?: string; forDuration: string };
  evaluation: { interval: string; pendingPeriod: string; firingPeriod?: string };
  labels: Record<string, string>;
  annotations: Record<string, string>;
  severity: string;
  routing?: Array<{ channel: string; destination: string; severity?: string[]; throttle?: string }>;
}

export function serializeMonitor(rule: UnifiedRule): MonitorConfig {
  return {
    version: '1.0',
    name: rule.name,
    query: rule.query,
    threshold: {
      operator: rule.threshold?.operator || '>',
      value: rule.threshold?.value ?? 0,
      unit: rule.threshold?.unit,
      forDuration: rule.pendingPeriod || '5m',
    },
    evaluation: {
      interval: rule.evaluationInterval || '1m',
      pendingPeriod: rule.pendingPeriod || '5m',
      firingPeriod: rule.firingPeriod,
    },
    labels: { ...rule.labels },
    annotations: { ...rule.annotations },
    severity: rule.severity,
    routing: rule.notificationRouting.length > 0
      ? rule.notificationRouting.map(r => ({
          channel: r.channel,
          destination: r.destination,
          severity: r.severity,
          throttle: r.throttle,
        }))
      : undefined,
  };
}

export function serializeMonitors(rules: UnifiedRule[]): MonitorConfig[] {
  return rules.map(serializeMonitor);
}

export function deserializeMonitor(json: unknown): { config: MonitorConfig | null; errors: string[] } {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') {
    return { config: null, errors: ['Input must be a JSON object'] };
  }
  const obj = json as Record<string, any>;

  if (!obj.name || typeof obj.name !== 'string') errors.push('name: required string field');
  if (!obj.query || typeof obj.query !== 'string') errors.push('query: required string field');

  if (!obj.threshold || typeof obj.threshold !== 'object') {
    errors.push('threshold: required object with operator, value, forDuration');
  } else {
    if (typeof obj.threshold.operator !== 'string') errors.push('threshold.operator: required string');
    if (typeof obj.threshold.value !== 'number' || !isFinite(obj.threshold.value)) errors.push('threshold.value: required finite number');
    if (obj.threshold.forDuration) {
      const dur = parseDuration(obj.threshold.forDuration);
      if (!dur.valid) errors.push(`threshold.forDuration: ${dur.error}`);
    } else {
      errors.push('threshold.forDuration: required duration string');
    }
  }

  if (!obj.evaluation || typeof obj.evaluation !== 'object') {
    errors.push('evaluation: required object with interval, pendingPeriod');
  } else {
    for (const field of ['interval', 'pendingPeriod']) {
      if (obj.evaluation[field]) {
        const dur = parseDuration(obj.evaluation[field]);
        if (!dur.valid) errors.push(`evaluation.${field}: ${dur.error}`);
      } else {
        errors.push(`evaluation.${field}: required duration string`);
      }
    }
    if (obj.evaluation.firingPeriod) {
      const dur = parseDuration(obj.evaluation.firingPeriod);
      if (!dur.valid) errors.push(`evaluation.firingPeriod: ${dur.error}`);
    }
  }

  if (errors.length > 0) return { config: null, errors };

  const config: MonitorConfig = {
    version: '1.0',
    name: obj.name,
    query: obj.query,
    threshold: {
      operator: obj.threshold.operator,
      value: obj.threshold.value,
      unit: obj.threshold.unit,
      forDuration: obj.threshold.forDuration,
    },
    evaluation: {
      interval: obj.evaluation.interval,
      pendingPeriod: obj.evaluation.pendingPeriod,
      firingPeriod: obj.evaluation.firingPeriod,
    },
    labels: obj.labels && typeof obj.labels === 'object' ? { ...obj.labels } : {},
    annotations: obj.annotations && typeof obj.annotations === 'object' ? { ...obj.annotations } : {},
    severity: obj.severity || 'medium',
    routing: Array.isArray(obj.routing) ? obj.routing : undefined,
  };

  return { config, errors: [] };
}
