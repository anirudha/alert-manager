/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateSloRuleGroup,
  sanitizeName,
  shortHash,
  parseDurationToMs,
} from '../slo_promql_generator';
import type { SloDefinition, GeneratedRule } from '../slo_types';
import { DEFAULT_MWMBR_TIERS } from '../slo_types';

// ============================================================================
// Test Fixtures
// ============================================================================

function makeAvailabilitySlo(overrides: Partial<SloDefinition> = {}): SloDefinition {
  return {
    id: 'slo-test-001',
    datasourceId: 'ds-prom-1',
    name: 'Pet Clinic Availability',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      goodEventsFilter: 'status_code!~"5.."',
      service: { labelName: 'service', labelValue: 'pet-clinic-frontend' },
      operation: { labelName: 'endpoint', labelValue: 'POST /api/customer/owners' },
    },
    target: 0.999,
    budgetWarningThreshold: 0.3,
    window: { type: 'rolling', duration: '1d' },
    burnRates: [...DEFAULT_MWMBR_TIERS],
    alarms: {
      sliHealth: { enabled: true },
      attainmentBreach: { enabled: true },
      budgetWarning: { enabled: true },
    },
    exclusionWindows: [],
    tags: { team: 'platform', env: 'prod' },
    ruleGroupName: '',
    rulerNamespace: 'slo-generated',
    generatedRuleNames: [],
    version: 1,
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: 'test-user',
    updatedAt: '2026-03-01T00:00:00Z',
    updatedBy: 'test-user',
    ...overrides,
  };
}

function makeLatencySlo(overrides: Partial<SloDefinition> = {}): SloDefinition {
  return makeAvailabilitySlo({
    id: 'slo-test-002',
    name: 'Checkout p99 Latency',
    sli: {
      type: 'latency_p99',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_request_duration_seconds_bucket',
      latencyThreshold: 0.5,
      service: { labelName: 'service', labelValue: 'checkout-service' },
      operation: { labelName: 'endpoint', labelValue: 'POST /api/checkout' },
    },
    ...overrides,
  });
}

function findRulesByType(rules: GeneratedRule[], type: 'recording' | 'alerting'): GeneratedRule[] {
  return rules.filter((r) => r.type === type);
}

function findRuleByNamePattern(rules: GeneratedRule[], pattern: string): GeneratedRule | undefined {
  return rules.find((r) => r.name.includes(pattern));
}

// ============================================================================
// Utility Tests
// ============================================================================

describe('sanitizeName', () => {
  it('lowercases and replaces non-alphanum', () => {
    expect(sanitizeName('Pet Clinic Availability')).toBe('pet_clinic_availability');
  });

  it('collapses repeated underscores', () => {
    expect(sanitizeName('foo--bar__baz')).toBe('foo_bar_baz');
  });

  it('trims leading/trailing underscores', () => {
    expect(sanitizeName('_foo_')).toBe('foo');
  });

  it('truncates to 64 chars', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeName(long).length).toBe(64);
  });
});

describe('shortHash', () => {
  it('returns 8 hex characters', () => {
    const h = shortHash('slo-test-001');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different hashes for different inputs', () => {
    expect(shortHash('slo-001')).not.toBe(shortHash('slo-002'));
  });

  it('is deterministic', () => {
    expect(shortHash('slo-test')).toBe(shortHash('slo-test'));
  });
});

describe('parseDurationToMs', () => {
  it('parses seconds', () => expect(parseDurationToMs('30s')).toBe(30_000));
  it('parses minutes', () => expect(parseDurationToMs('5m')).toBe(300_000));
  it('parses hours', () => expect(parseDurationToMs('2h')).toBe(7_200_000));
  it('parses days', () => expect(parseDurationToMs('1d')).toBe(86_400_000));
  it('parses weeks', () => expect(parseDurationToMs('1w')).toBe(604_800_000));
  it('returns 0 for invalid input', () => expect(parseDurationToMs('abc')).toBe(0));
});

// ============================================================================
// Availability SLI — Recording Rules
// ============================================================================

describe('generateSloRuleGroup — Availability SLI', () => {
  const slo = makeAvailabilitySlo();
  const result = generateSloRuleGroup(slo);

  it('generates a non-empty YAML string', () => {
    expect(result.yaml.length).toBeGreaterThan(0);
    expect(result.yaml).toContain('name:');
    expect(result.yaml).toContain('rules:');
  });

  it('sets a deterministic group name', () => {
    expect(result.groupName).toContain('slo:');
    expect(result.groupName).toContain('pet_clinic_availability');
    expect(result.groupName).toContain(shortHash(slo.id));
  });

  describe('intermediate recording rules', () => {
    const recordingRules = findRulesByType(result.rules, 'recording');

    it('generates recording rules at 7 window granularities', () => {
      expect(recordingRules.length).toBe(7);
    });

    it('generates rules for each standard window', () => {
      const windows = recordingRules.map((r) => r.labels.window);
      expect(windows).toEqual(['5m', '30m', '1h', '2h', '6h', '1d', '3d']);
    });

    it('includes the error ratio expression with good/total rate', () => {
      const rule5m = recordingRules[0];
      expect(rule5m.expr).toContain('1 - (');
      expect(rule5m.expr).toContain('status_code!~"5.."');
      expect(rule5m.expr).toContain('[5m]');
    });

    it('includes slo_id label', () => {
      for (const rule of recordingRules) {
        expect(rule.labels.slo_id).toBe(slo.id);
      }
    });

    it('includes slo_name label', () => {
      for (const rule of recordingRules) {
        expect(rule.labels.slo_name).toBe(slo.name);
      }
    });

    it('includes user tags with tag_ prefix', () => {
      for (const rule of recordingRules) {
        expect(rule.labels.tag_team).toBe('platform');
        expect(rule.labels.tag_env).toBe('prod');
      }
    });

    it('uses collision-safe names with slo_id hash', () => {
      const hash = shortHash(slo.id);
      for (const rule of recordingRules) {
        expect(rule.name).toContain(hash);
      }
    });

    it('never uses rate() over windows larger than 3d directly', () => {
      for (const rule of recordingRules) {
        // Each recording rule should use the rate window from its own labels
        const window = rule.labels.window;
        expect(rule.expr).toContain(`[${window}]`);
      }
    });
  });
});

// ============================================================================
// MWMBR Burn-Rate Alerts
// ============================================================================

describe('generateSloRuleGroup — MWMBR Burn-Rate Alerts', () => {
  const slo = makeAvailabilitySlo();
  const result = generateSloRuleGroup(slo);
  const burnAlerts = result.rules.filter(
    (r) => r.type === 'alerting' && r.labels.alarm_type === 'burn_rate'
  );

  it('generates one alert per burn rate tier with createAlarm=true', () => {
    const enabledTiers = slo.burnRates.filter((t) => t.createAlarm);
    expect(burnAlerts.length).toBe(enabledTiers.length);
  });

  it('uses paired short+long windows with AND condition', () => {
    for (const alert of burnAlerts) {
      expect(alert.expr).toContain('and');
      // Both windows must be present in the expression
      const shortWindow = alert.labels.burn_rate_short_window;
      const longWindow = alert.labels.burn_rate_long_window;
      expect(alert.expr).toContain(`ratio_rate_${shortWindow}`);
      expect(alert.expr).toContain(`ratio_rate_${longWindow}`);
    }
  });

  it('references pre-computed recording rules (not raw rate())', () => {
    for (const alert of burnAlerts) {
      expect(alert.expr).toContain('slo:sli_error:ratio_rate_');
      expect(alert.expr).not.toContain('rate(http_requests_total');
    }
  });

  it('includes the burn rate multiplier in the threshold', () => {
    const firstAlert = burnAlerts[0];
    // For 99.9% SLO, error_budget = 0.001, multiplier = 14.4
    // threshold = 14.4 * 0.001 = 0.0144
    expect(firstAlert.expr).toContain('0.0144');
  });

  it('sets correct for: durations', () => {
    expect(burnAlerts[0].for).toBe('2m'); // Critical tier
    expect(burnAlerts[1].for).toBe('5m'); // Warning tier
    expect(burnAlerts[2].for).toBe('10m'); // Ticket tier
    expect(burnAlerts[3].for).toBe('30m'); // Low tier
  });

  it('sets correct severity labels', () => {
    expect(burnAlerts[0].labels.severity).toBe('critical');
    expect(burnAlerts[1].labels.severity).toBe('critical');
    expect(burnAlerts[2].labels.severity).toBe('warning');
    expect(burnAlerts[3].labels.severity).toBe('warning');
  });

  it('names the first tier HighUrgency', () => {
    expect(burnAlerts[0].name).toContain('HighUrgency');
  });

  it('names the second tier MediumUrgency', () => {
    expect(burnAlerts[1].name).toContain('MediumUrgency');
  });

  it('includes all common labels on burn rate alerts', () => {
    for (const alert of burnAlerts) {
      expect(alert.labels.slo_id).toBe(slo.id);
      expect(alert.labels.slo_name).toBe(slo.name);
      expect(alert.labels.tag_team).toBe('platform');
    }
  });
});

// ============================================================================
// SLI Health Alert
// ============================================================================

describe('generateSloRuleGroup — SLI Health Alert', () => {
  it('generates SLI health alert when enabled', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const healthAlert = findRuleByNamePattern(result.rules, 'SLO_SLIHealth');
    expect(healthAlert).toBeDefined();
    expect(healthAlert!.type).toBe('alerting');
    expect(healthAlert!.labels.alarm_type).toBe('sli_health');
  });

  it('uses for: 5m (not 0s) to avoid noise', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const healthAlert = findRuleByNamePattern(result.rules, 'SLO_SLIHealth');
    expect(healthAlert!.for).toBe('5m');
  });

  it('references the 5m recording rule', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const healthAlert = findRuleByNamePattern(result.rules, 'SLO_SLIHealth');
    expect(healthAlert!.expr).toContain('ratio_rate_5m');
  });

  it('does not generate when disabled', () => {
    const slo = makeAvailabilitySlo({
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: true },
      },
    });
    const result = generateSloRuleGroup(slo);
    const healthAlert = findRuleByNamePattern(result.rules, 'SLO_SLIHealth');
    expect(healthAlert).toBeUndefined();
  });
});

// ============================================================================
// Attainment Breach Alert
// ============================================================================

describe('generateSloRuleGroup — Attainment Breach Alert', () => {
  it('generates attainment alert when enabled', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Attainment');
    expect(alert).toBeDefined();
    expect(alert!.labels.alarm_type).toBe('attainment');
    expect(alert!.labels.severity).toBe('critical');
  });

  it('references pre-computed recording rule (not raw rate)', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Attainment');
    expect(alert!.expr).toContain('slo:sli_error:ratio_rate_');
    expect(alert!.expr).not.toContain('rate(http_requests_total');
  });

  it('includes slo_target label', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Attainment');
    expect(alert!.labels.slo_target).toBe('0.999');
  });

  it('does not generate when disabled', () => {
    const slo = makeAvailabilitySlo({
      alarms: {
        sliHealth: { enabled: true },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: true },
      },
    });
    const result = generateSloRuleGroup(slo);
    expect(findRuleByNamePattern(result.rules, 'SLO_Attainment')).toBeUndefined();
  });
});

// ============================================================================
// Error Budget Warning Alert
// ============================================================================

describe('generateSloRuleGroup — Error Budget Warning Alert', () => {
  it('generates budget warning when enabled', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Warning');
    expect(alert).toBeDefined();
    expect(alert!.labels.alarm_type).toBe('error_budget_warning');
  });

  it('uses for: 15m', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Warning');
    expect(alert!.for).toBe('15m');
  });

  it('computes budget remaining correctly', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const alert = findRuleByNamePattern(result.rules, 'SLO_Warning');
    // error_budget = 1 - 0.999 = 0.001
    expect(alert!.expr).toContain('/ 0.001');
    expect(alert!.expr).toContain(`< ${slo.budgetWarningThreshold}`);
  });
});

// ============================================================================
// Latency SLI
// ============================================================================

describe('generateSloRuleGroup — Latency SLI', () => {
  const slo = makeLatencySlo();
  const result = generateSloRuleGroup(slo);

  it('generates histogram_quantile recording rules', () => {
    const latencyRules = result.rules.filter(
      (r) => r.type === 'recording' && r.name.includes('sli_latency')
    );
    expect(latencyRules.length).toBe(7); // one per window
  });

  it('uses correct quantile for p99', () => {
    const latencyRules = result.rules.filter(
      (r) => r.type === 'recording' && r.name.includes('sli_latency')
    );
    for (const rule of latencyRules) {
      expect(rule.expr).toContain('histogram_quantile(0.99');
    }
  });

  it('also generates error ratio recording rules for latency threshold', () => {
    const errorRatioRules = result.rules.filter(
      (r) => r.type === 'recording' && r.name.includes('sli_error:ratio_rate')
    );
    expect(errorRatioRules.length).toBe(7); // error ratio at each window for threshold-based alerting
  });

  it('uses _bucket metric suffix for histogram queries', () => {
    const latencyRules = result.rules.filter(
      (r) => r.type === 'recording' && r.name.includes('sli_latency')
    );
    for (const rule of latencyRules) {
      expect(rule.expr).toContain('_bucket');
    }
  });

  it('includes le label matcher for latency threshold', () => {
    const errorRatioRules = result.rules.filter(
      (r) => r.type === 'recording' && r.name.includes('sli_error:ratio_rate')
    );
    for (const rule of errorRatioRules) {
      expect(rule.expr).toContain('le="0.5"');
    }
  });
});

// ============================================================================
// Rule Count and Structure
// ============================================================================

describe('generateSloRuleGroup — overall structure', () => {
  it('generates correct total rule count for full availability SLO', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);

    const recording = findRulesByType(result.rules, 'recording');
    const alerting = findRulesByType(result.rules, 'alerting');

    // 7 recording rules (one per window)
    expect(recording.length).toBe(7);
    // 4 burn-rate + 1 SLI health + 1 attainment + 1 budget warning = 7 alerting
    expect(alerting.length).toBe(7);
    // Total: 14
    expect(result.rules.length).toBe(14);
  });

  it('sets evaluation interval to 60 seconds', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    expect(result.interval).toBe(60);
  });

  it('skips burn rate alerts when createAlarm is false', () => {
    const slo = makeAvailabilitySlo({
      burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t, createAlarm: false })),
    });
    const result = generateSloRuleGroup(slo);
    const burnAlerts = result.rules.filter(
      (r) => r.type === 'alerting' && r.labels.alarm_type === 'burn_rate'
    );
    expect(burnAlerts.length).toBe(0);
  });

  it('generates minimal rules when only recording rules enabled', () => {
    const slo = makeAvailabilitySlo({
      burnRates: [],
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: false },
      },
    });
    const result = generateSloRuleGroup(slo);

    // Only the 7 intermediate recording rules
    expect(findRulesByType(result.rules, 'recording').length).toBe(7);
    expect(findRulesByType(result.rules, 'alerting').length).toBe(0);
  });
});

// ============================================================================
// Rule Name Collision Prevention
// ============================================================================

describe('rule name collision prevention', () => {
  it('produces different rule names for same service/operation with different SLO IDs', () => {
    const slo1 = makeAvailabilitySlo({ id: 'slo-aaa' });
    const slo2 = makeAvailabilitySlo({ id: 'slo-bbb' });

    const result1 = generateSloRuleGroup(slo1);
    const result2 = generateSloRuleGroup(slo2);

    // All recording rule names should differ
    const names1 = new Set(result1.rules.map((r) => r.name));
    const names2 = new Set(result2.rules.map((r) => r.name));

    for (const name of names1) {
      expect(names2.has(name)).toBe(false);
    }
  });
});

// ============================================================================
// Tag Injection
// ============================================================================

describe('tag injection', () => {
  it('adds user tags with tag_ prefix to all rules', () => {
    const slo = makeAvailabilitySlo({
      tags: { team: 'platform', env: 'prod', cost_center: 'eng-123' },
    });
    const result = generateSloRuleGroup(slo);

    for (const rule of result.rules) {
      expect(rule.labels.tag_team).toBe('platform');
      expect(rule.labels.tag_env).toBe('prod');
      expect(rule.labels.tag_cost_center).toBe('eng-123');
    }
  });

  it('works with empty tags', () => {
    const slo = makeAvailabilitySlo({ tags: {} });
    const result = generateSloRuleGroup(slo);
    for (const rule of result.rules) {
      const tagKeys = Object.keys(rule.labels).filter((k) => k.startsWith('tag_'));
      expect(tagKeys.length).toBe(0);
    }
  });
});

// ============================================================================
// YAML Output
// ============================================================================

describe('YAML output', () => {
  it('contains group name and interval', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    expect(result.yaml).toContain(`name: ${result.groupName}`);
    expect(result.yaml).toContain('interval: 60');
  });

  it('contains record: entries for recording rules', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    expect(result.yaml).toContain('- record: slo:sli_error:ratio_rate_5m');
  });

  it('contains alert: entries for alerting rules', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    expect(result.yaml).toContain('- alert: SLO_BurnRate_HighUrgency');
    expect(result.yaml).toContain('- alert: SLO_SLIHealth');
    expect(result.yaml).toContain('- alert: SLO_Attainment');
    expect(result.yaml).toContain('- alert: SLO_Warning');
  });

  it('contains for: clauses on alerting rules', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    expect(result.yaml).toContain('for: 2m');
    expect(result.yaml).toContain('for: 5m');
    expect(result.yaml).toContain('for: 15m');
  });

  it('escapes quotes in YAML strings', () => {
    const slo = makeAvailabilitySlo({
      name: 'Test "SLO" with quotes',
    });
    const result = generateSloRuleGroup(slo);
    // The YAML should have escaped quotes
    expect(result.yaml).toContain('\\"');
  });
});

// ============================================================================
// Period-based SLI
// ============================================================================

describe('generateSloRuleGroup — Period-based SLI', () => {
  it('generates boolean period recording rule when calcMethod is good_periods', () => {
    const slo = makeAvailabilitySlo({
      sli: {
        ...makeAvailabilitySlo().sli,
        calcMethod: 'good_periods',
        periodLength: '1m',
      },
    });
    const result = generateSloRuleGroup(slo);
    const periodRule = findRuleByNamePattern(result.rules, 'good_period');
    expect(periodRule).toBeDefined();
    expect(periodRule!.type).toBe('recording');
    expect(periodRule!.expr).toContain('>= 0.999');
  });

  it('does not generate period rule for good_requests method', () => {
    const slo = makeAvailabilitySlo();
    const result = generateSloRuleGroup(slo);
    const periodRule = findRuleByNamePattern(result.rules, 'good_period');
    expect(periodRule).toBeUndefined();
  });
});

// ============================================================================
// Service Dependency
// ============================================================================

describe('generateSloRuleGroup — Service Dependency', () => {
  it('includes dependency label matcher when sourceType is service_dependency', () => {
    const slo = makeAvailabilitySlo({
      sli: {
        ...makeAvailabilitySlo().sli,
        sourceType: 'service_dependency',
        dependency: { labelName: 'peer_service', labelValue: 'payment-api' },
      },
    });
    const result = generateSloRuleGroup(slo);
    const recording = result.rules[0];
    expect(recording.expr).toContain('peer_service="payment-api"');
  });
});
