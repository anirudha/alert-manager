/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateSloForm, validateSloFormFull, isSloFormValid } from '../slo_validators';
import type { SloInput } from '../slo_types';
import { DEFAULT_MWMBR_TIERS } from '../slo_types';

// ============================================================================
// Test Fixture
// ============================================================================

function makeValidInput(overrides: Partial<SloInput> = {}): SloInput {
  return {
    name: 'Test SLO',
    datasourceId: 'ds-1',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      goodEventsFilter: 'status_code!~"5.."',
      service: { labelName: 'service', labelValue: 'test-svc' },
      operation: { labelName: 'endpoint', labelValue: 'GET /health' },
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
    tags: { env: 'test' },
    ...overrides,
  } as SloInput;
}

// ============================================================================
// Valid Input
// ============================================================================

describe('validateSloForm — valid input', () => {
  it('returns empty errors for a valid SLO input', () => {
    const errors = validateSloForm(makeValidInput());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('isSloFormValid returns true for valid input', () => {
    expect(isSloFormValid(makeValidInput())).toBe(true);
  });
});

// ============================================================================
// Required Fields
// ============================================================================

describe('validateSloForm — required fields', () => {
  it('rejects missing name', () => {
    const errors = validateSloForm(makeValidInput({ name: '' }));
    expect(errors.name).toBeDefined();
  });

  it('rejects missing datasourceId', () => {
    const errors = validateSloForm(makeValidInput({ datasourceId: '' }));
    expect(errors.datasourceId).toBeDefined();
  });

  it('rejects missing target', () => {
    const errors = validateSloForm({ ...makeValidInput(), target: undefined } as any);
    expect(errors.target).toBeDefined();
  });

  it('rejects missing alarms', () => {
    const errors = validateSloForm({ ...makeValidInput(), alarms: undefined } as any);
    expect(errors.alarms).toBeDefined();
  });
});

// ============================================================================
// Target Range
// ============================================================================

describe('validateSloForm — target boundaries', () => {
  it('accepts target=0.9 (90%)', () => {
    const errors = validateSloForm(makeValidInput({ target: 0.9 }));
    expect(errors.target).toBeUndefined();
  });

  it('accepts target=0.9999 (99.99%)', () => {
    const errors = validateSloForm(makeValidInput({ target: 0.9999 }));
    expect(errors.target).toBeUndefined();
  });

  it('rejects target=0.89', () => {
    const errors = validateSloForm(makeValidInput({ target: 0.89 }));
    expect(errors.target).toBeDefined();
  });

  it('rejects target=1.0', () => {
    const errors = validateSloForm(makeValidInput({ target: 1.0 }));
    expect(errors.target).toBeDefined();
  });
});

// ============================================================================
// Window Duration
// ============================================================================

describe('validateSloForm — window duration', () => {
  it('accepts 1d (minimum)', () => {
    const errors = validateSloForm(makeValidInput({ window: { type: 'rolling', duration: '1d' } }));
    expect(errors['window.duration']).toBeUndefined();
  });

  it('accepts 30d (maximum)', () => {
    const errors = validateSloForm(
      makeValidInput({ window: { type: 'rolling', duration: '30d' } })
    );
    expect(errors['window.duration']).toBeUndefined();
  });

  it('rejects 31d', () => {
    const errors = validateSloForm(
      makeValidInput({ window: { type: 'rolling', duration: '31d' } })
    );
    expect(errors['window.duration']).toBeDefined();
  });

  it('rejects window.type other than rolling', () => {
    const errors = validateSloForm(
      makeValidInput({ window: { type: 'calendar' as any, duration: '1d' } })
    );
    expect(errors['window.type']).toBeDefined();
  });
});

// ============================================================================
// SLI Type Enum Validation
// ============================================================================

describe('validateSloForm — SLI type enum', () => {
  it('accepts valid SLI types', () => {
    for (const type of ['availability', 'latency_p99', 'latency_p90', 'latency_p50'] as const) {
      const input = makeValidInput();
      input.sli.type = type;
      if (type !== 'availability') {
        input.sli.latencyThreshold = 0.5;
      }
      const errors = validateSloForm(input);
      expect(errors['sli.type']).toBeUndefined();
    }
  });

  it('rejects invalid SLI type', () => {
    const input = makeValidInput();
    (input.sli as any).type = 'garbage';
    const errors = validateSloForm(input);
    expect(errors['sli.type']).toBeDefined();
    expect(errors['sli.type']).toContain('garbage');
  });
});

// ============================================================================
// Label Name / Value Validation
// ============================================================================

describe('validateSloForm — label validation', () => {
  it('rejects label name with hyphens', () => {
    const input = makeValidInput();
    input.sli.service.labelName = 'my-label';
    const errors = validateSloForm(input);
    expect(errors['sli.service.labelName']).toBeDefined();
  });

  it('rejects label value with double quotes', () => {
    const input = makeValidInput();
    input.sli.service.labelValue = 'my"service';
    const errors = validateSloForm(input);
    expect(errors['sli.service.labelValue']).toBeDefined();
  });

  it('accepts valid label names and values', () => {
    const input = makeValidInput();
    input.sli.service.labelName = 'service_name';
    input.sli.service.labelValue = 'my-service-v2';
    const errors = validateSloForm(input);
    expect(errors['sli.service.labelName']).toBeUndefined();
    expect(errors['sli.service.labelValue']).toBeUndefined();
  });
});

// ============================================================================
// Latency Threshold Warning
// ============================================================================

describe('validateSloFormFull — latency threshold warning', () => {
  it('warns when latencyThreshold >= 60', () => {
    const input = makeValidInput();
    input.sli.type = 'latency_p99';
    input.sli.latencyThreshold = 500;
    const { errors, warnings } = validateSloFormFull(input);
    expect(errors['sli.latencyThreshold']).toBeUndefined();
    expect(warnings['sli.latencyThreshold']).toBeDefined();
    expect(warnings['sli.latencyThreshold']).toContain('seconds');
  });

  it('warns at exactly 60', () => {
    const input = makeValidInput();
    input.sli.type = 'latency_p99';
    input.sli.latencyThreshold = 60;
    const { warnings } = validateSloFormFull(input);
    expect(warnings['sli.latencyThreshold']).toBeDefined();
  });

  it('does not warn for normal threshold', () => {
    const input = makeValidInput();
    input.sli.type = 'latency_p99';
    input.sli.latencyThreshold = 0.5;
    const { warnings } = validateSloFormFull(input);
    expect(warnings['sli.latencyThreshold']).toBeUndefined();
  });
});

// ============================================================================
// Burn Rate Window Warnings
// ============================================================================

describe('validateSloFormFull — burn rate window warnings', () => {
  it('warns for non-standard short window', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '15m',
          longWindow: '1h',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const { errors, warnings } = validateSloFormFull(input);
    expect(errors['burnRates[0].shortWindow']).toBeUndefined();
    expect(warnings['burnRates[0].shortWindow']).toBeDefined();
    expect(warnings['burnRates[0].shortWindow']).toContain('recording rule');
  });

  it('does not warn for standard windows', () => {
    const { warnings } = validateSloFormFull(makeValidInput());
    const windowWarnings = Object.keys(warnings).filter((k) => k.includes('Window'));
    expect(windowWarnings).toHaveLength(0);
  });
});

// ============================================================================
// Unreachable Threshold Warning
// ============================================================================

describe('validateSloFormFull — unreachable threshold warning', () => {
  it('warns when target=0.9 with multiplier=14.4 (threshold > 1.0)', () => {
    const input = makeValidInput({
      target: 0.9,
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const { warnings } = validateSloFormFull(input);
    expect(warnings['burnRates[0].burnRateMultiplier']).toBeDefined();
    expect(warnings['burnRates[0].burnRateMultiplier']).toContain('never fire');
  });

  it('does not warn for target=0.999 with multiplier=14.4 (threshold 0.0144)', () => {
    const { warnings } = validateSloFormFull(makeValidInput());
    expect(warnings['burnRates[0].burnRateMultiplier']).toBeUndefined();
  });
});

// ============================================================================
// Empty Burn Rates Warning
// ============================================================================

describe('validateSloFormFull — empty burn rates', () => {
  it('warns when burnRates is empty', () => {
    const input = makeValidInput({ burnRates: [] });
    const { errors, warnings } = validateSloFormFull(input);
    expect(errors.burnRates).toBeUndefined();
    expect(warnings.burnRates).toBeDefined();
    expect(warnings.burnRates).toContain('No burn rate');
  });
});

// ============================================================================
// Tags Validation
// ============================================================================

describe('validateSloForm — tags validation', () => {
  it('accepts empty tags object', () => {
    const errors = validateSloForm(makeValidInput({ tags: {} }));
    expect(errors.tags).toBeUndefined();
  });

  it('rejects array as tags', () => {
    const errors = validateSloForm(makeValidInput({ tags: [] as any }));
    expect(errors.tags).toBeDefined();
  });

  it('rejects null as tags', () => {
    const errors = validateSloForm(makeValidInput({ tags: null as any }));
    expect(errors.tags).toBeDefined();
    expect(errors.tags).toContain('plain object');
  });
});

// ============================================================================
// Name Length Validation
// ============================================================================

describe('validateSloForm — name length', () => {
  it('rejects name longer than 128 characters', () => {
    const errors = validateSloForm(makeValidInput({ name: 'x'.repeat(129) }));
    expect(errors.name).toBeDefined();
    expect(errors.name).toContain('128');
  });
});

// ============================================================================
// Budget Warning Threshold Validation
// ============================================================================

describe('validateSloForm — budgetWarningThreshold', () => {
  it('rejects missing budgetWarningThreshold', () => {
    const input = { ...makeValidInput(), budgetWarningThreshold: undefined } as any;
    const errors = validateSloForm(input);
    expect(errors.budgetWarningThreshold).toBeDefined();
    expect(errors.budgetWarningThreshold).toContain('required');
  });

  it('rejects budgetWarningThreshold below 0.01', () => {
    const errors = validateSloForm(makeValidInput({ budgetWarningThreshold: 0.001 }));
    expect(errors.budgetWarningThreshold).toBeDefined();
  });

  it('rejects budgetWarningThreshold above 0.99', () => {
    const errors = validateSloForm(makeValidInput({ budgetWarningThreshold: 1.0 }));
    expect(errors.budgetWarningThreshold).toBeDefined();
  });
});

// ============================================================================
// Window Duration — additional edge cases
// ============================================================================

describe('validateSloForm — window edge cases', () => {
  it('rejects window duration shorter than 1d', () => {
    const errors = validateSloForm(
      makeValidInput({ window: { type: 'rolling', duration: '12h' } })
    );
    expect(errors['window.duration']).toBeDefined();
    expect(errors['window.duration']).toContain('Minimum');
  });

  it('rejects missing window duration', () => {
    const errors = validateSloForm(makeValidInput({ window: { type: 'rolling', duration: '' } }));
    expect(errors['window.duration']).toBeDefined();
    expect(errors['window.duration']).toContain('required');
  });

  it('rejects window type other than rolling', () => {
    const errors = validateSloForm(
      makeValidInput({ window: { type: 'calendar' as any, duration: '7d' } })
    );
    expect(errors['window.type']).toBeDefined();
    expect(errors['window.type']).toContain('rolling');
  });
});

// ============================================================================
// SLI Enum Validation — additional types
// ============================================================================

describe('validateSloForm — calcMethod and sourceType enums', () => {
  it('rejects invalid calcMethod', () => {
    const input = makeValidInput();
    (input.sli as any).calcMethod = 'bad_method';
    const errors = validateSloForm(input);
    expect(errors['sli.calcMethod']).toBeDefined();
    expect(errors['sli.calcMethod']).toContain('bad_method');
  });

  it('rejects invalid sourceType', () => {
    const input = makeValidInput();
    (input.sli as any).sourceType = 'bad_source';
    const errors = validateSloForm(input);
    expect(errors['sli.sourceType']).toBeDefined();
    expect(errors['sli.sourceType']).toContain('bad_source');
  });
});

// ============================================================================
// SLI Metric Validation
// ============================================================================

describe('validateSloForm — metric validation', () => {
  it('rejects missing metric', () => {
    const input = makeValidInput();
    (input.sli as any).metric = '';
    const errors = validateSloForm(input);
    expect(errors['sli.metric']).toBeDefined();
    expect(errors['sli.metric']).toContain('required');
  });

  it('rejects invalid metric name (starts with digit)', () => {
    const input = makeValidInput();
    input.sli.metric = '0_invalid_metric';
    const errors = validateSloForm(input);
    expect(errors['sli.metric']).toBeDefined();
    expect(errors['sli.metric']).toContain('Invalid');
  });
});

// ============================================================================
// SLI Service — additional validation
// ============================================================================

describe('validateSloForm — service validation', () => {
  it('rejects missing service labelValue', () => {
    const input = makeValidInput();
    input.sli.service.labelValue = '';
    const errors = validateSloForm(input);
    expect(errors['sli.service']).toBeDefined();
    expect(errors['sli.service']).toContain('required');
  });

  it('rejects service labelName that fails LABEL_NAME_RE', () => {
    const input = makeValidInput();
    input.sli.service.labelName = '0starts_with_digit';
    const errors = validateSloForm(input);
    expect(errors['sli.service.labelName']).toBeDefined();
    expect(errors['sli.service.labelName']).toContain('Invalid');
  });

  it('rejects unsafe service label value (contains backslash)', () => {
    const input = makeValidInput();
    input.sli.service.labelValue = 'my\\service';
    const errors = validateSloForm(input);
    expect(errors['sli.service.labelValue']).toBeDefined();
    expect(errors['sli.service.labelValue']).toContain('backslashes');
  });
});

// ============================================================================
// SLI Operation — additional validation
// ============================================================================

describe('validateSloForm — operation validation', () => {
  it('rejects invalid operation labelName', () => {
    const input = makeValidInput();
    input.sli.operation.labelName = 'has-hyphen';
    const errors = validateSloForm(input);
    expect(errors['sli.operation.labelName']).toBeDefined();
  });

  it('rejects unsafe operation label value (contains newline)', () => {
    const input = makeValidInput();
    input.sli.operation.labelValue = 'line1\nline2';
    const errors = validateSloForm(input);
    expect(errors['sli.operation.labelValue']).toBeDefined();
  });
});

// ============================================================================
// SLI Dependency — validation
// ============================================================================

describe('validateSloForm — dependency validation', () => {
  it('rejects invalid dependency labelName', () => {
    const input = makeValidInput();
    input.sli.dependency = { labelName: 'bad-name', labelValue: 'dep-svc' };
    const errors = validateSloForm(input);
    expect(errors['sli.dependency.labelName']).toBeDefined();
  });

  it('rejects unsafe dependency label value', () => {
    const input = makeValidInput();
    input.sli.dependency = { labelName: 'dep', labelValue: 'dep"svc' };
    const errors = validateSloForm(input);
    expect(errors['sli.dependency.labelValue']).toBeDefined();
  });
});

// ============================================================================
// Latency Threshold — missing for latency SLI
// ============================================================================

describe('validateSloForm — latency threshold for latency SLI', () => {
  it('requires latencyThreshold for latency SLI types', () => {
    const input = makeValidInput();
    input.sli.type = 'latency_p99';
    input.sli.latencyThreshold = undefined;
    const errors = validateSloForm(input);
    expect(errors['sli.latencyThreshold']).toBeDefined();
    expect(errors['sli.latencyThreshold']).toContain('greater than 0');
  });
});

// ============================================================================
// Alarms — missing
// ============================================================================

describe('validateSloForm — missing alarms', () => {
  it('rejects undefined alarms', () => {
    const input = { ...makeValidInput(), alarms: undefined } as any;
    const errors = validateSloForm(input);
    expect(errors.alarms).toBeDefined();
    expect(errors.alarms).toContain('required');
  });
});

// ============================================================================
// Exclusion Windows — max
// ============================================================================

describe('validateSloForm — exclusion windows', () => {
  it('rejects more than 10 exclusion windows', () => {
    const windows = Array.from({ length: 11 }, (_, i) => ({
      name: `window-${i}`,
      schedule: '0 0 * * *',
      duration: '1h',
    }));
    const errors = validateSloForm(makeValidInput({ exclusionWindows: windows }));
    expect(errors.exclusionWindows).toBeDefined();
    expect(errors.exclusionWindows).toContain('10');
  });
});

// ============================================================================
// Burn Rate — additional validation
// ============================================================================

describe('validateSloForm — burn rate validation', () => {
  it('rejects missing shortWindow', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '',
          longWindow: '1h',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].shortWindow']).toBeDefined();
    expect(errors['burnRates[0].shortWindow']).toContain('required');
  });

  it('rejects missing longWindow', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].longWindow']).toBeDefined();
    expect(errors['burnRates[0].longWindow']).toContain('required');
  });

  it('rejects short >= long window', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '1h',
          longWindow: '30m',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].shortWindow']).toBeDefined();
    expect(errors['burnRates[0].shortWindow']).toContain('shorter');
  });

  it('rejects multiplier <= 0', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 0,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].burnRateMultiplier']).toBeDefined();
    expect(errors['burnRates[0].burnRateMultiplier']).toContain('> 0');
  });

  it('rejects multiplier > 1000', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 1001,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].burnRateMultiplier']).toBeDefined();
    expect(errors['burnRates[0].burnRateMultiplier']).toContain('1000');
  });

  it('rejects missing forDuration', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '',
        },
      ],
    });
    const errors = validateSloForm(input);
    expect(errors['burnRates[0].forDuration']).toBeDefined();
    expect(errors['burnRates[0].forDuration']).toContain('required');
  });
});

describe('validateSloFormFull — burn rate warnings', () => {
  it('warns for non-standard longWindow', () => {
    const input = makeValidInput({
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '45m',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const { warnings } = validateSloFormFull(input);
    expect(warnings['burnRates[0].longWindow']).toBeDefined();
    expect(warnings['burnRates[0].longWindow']).toContain('recording rule');
  });

  it('warns when computed threshold > 1.0 (never fires)', () => {
    const input = makeValidInput({
      target: 0.9, // error budget = 0.1
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 14.4, // 14.4 * 0.1 = 1.44 > 1.0
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    });
    const { warnings } = validateSloFormFull(input);
    expect(warnings['burnRates[0].burnRateMultiplier']).toBeDefined();
    expect(warnings['burnRates[0].burnRateMultiplier']).toContain('never fire');
  });

  it('warns when burnRates is empty (no MWMBR alerts)', () => {
    const input = makeValidInput({ burnRates: [] });
    const { warnings } = validateSloFormFull(input);
    expect(warnings.burnRates).toBeDefined();
    expect(warnings.burnRates).toContain('No burn rate');
  });
});
