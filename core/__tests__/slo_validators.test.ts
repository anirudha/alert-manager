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
});
