/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation for SLO form inputs.
 *
 * Returns an error map (field → message). Empty map means valid.
 * Follows the same pattern as core/validators.ts (validateMonitorForm).
 *
 * Additionally returns a warnings map for non-blocking advisories
 * (e.g. latency threshold unit check, non-standard burn-rate windows).
 */

import type { SloInput, BurnRateConfig, SliType, SliCalcMethod, SliSourceType } from './slo_types';
import { parseDurationToMs, RECORDING_WINDOWS } from './slo_promql_generator';

/** Valid Prometheus metric name pattern (allows colons for recording rules). */
const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/** Valid Prometheus label name pattern (no colons, unlike metric names). */
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Characters that must not appear in PromQL label values (prevents injection). */
const UNSAFE_LABEL_VALUE_RE = /["\\\n{}()]/;

/** Valid SLI type values (runtime check at the API boundary). */
const VALID_SLI_TYPES: readonly SliType[] = [
  'availability',
  'latency_p99',
  'latency_p90',
  'latency_p50',
];
const VALID_CALC_METHODS: readonly SliCalcMethod[] = ['good_requests', 'good_periods'];
const VALID_SOURCE_TYPES: readonly SliSourceType[] = ['service_operation', 'service_dependency'];

/** Result of SLO form validation. */
export interface SloValidationResult {
  /** Hard errors that prevent saving. */
  errors: Record<string, string>;
  /** Non-blocking warnings (displayed in UI but don't prevent saving). */
  warnings: Record<string, string>;
}

/**
 * Validate an SLO form input.
 *
 * @returns Record of field → error message. Empty means valid.
 */
export function validateSloForm(input: Partial<SloInput>): Record<string, string> {
  return validateSloFormFull(input).errors;
}

/**
 * Full validation returning both errors and warnings.
 *
 * Warnings are non-blocking advisories displayed in the UI.
 * Examples:
 *  - `latencyThreshold > 60` — likely a ms-vs-seconds mistake
 *  - Burn-rate window not in RECORDING_WINDOWS — alert will reference
 *    a non-existent recording rule
 */
export function validateSloFormFull(input: Partial<SloInput>): SloValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  // Name
  if (!input.name || !input.name.trim()) {
    errors.name = 'SLO name is required';
  } else if (input.name.length > 128) {
    errors.name = 'SLO name must be 128 characters or fewer';
  }

  // Datasource
  if (!input.datasourceId) {
    errors.datasourceId = 'Datasource is required';
  }

  // Target (decimal 0.9 – 0.9999)
  if (input.target === undefined || input.target === null) {
    errors.target = 'Target is required';
  } else if (input.target < 0.9 || input.target > 0.9999) {
    errors.target = 'Target must be between 90% and 99.99% (0.9 – 0.9999)';
  }

  // Budget warning threshold (0.01 – 0.99)
  if (input.budgetWarningThreshold === undefined || input.budgetWarningThreshold === null) {
    errors.budgetWarningThreshold = 'Budget warning threshold is required';
  } else if (input.budgetWarningThreshold < 0.01 || input.budgetWarningThreshold > 0.99) {
    errors.budgetWarningThreshold = 'Budget warning must be between 1% and 99%';
  }

  // Window
  if (!input.window?.duration) {
    errors['window.duration'] = 'Window duration is required';
  } else {
    const ms = parseDurationToMs(input.window.duration);
    if (ms < parseDurationToMs('1d')) {
      errors['window.duration'] = 'Minimum window duration is 1 day';
    } else if (ms > parseDurationToMs('30d')) {
      errors['window.duration'] = 'Maximum window duration is 30 days';
    }
  }

  // Window type
  if (input.window && input.window.type && input.window.type !== 'rolling') {
    errors['window.type'] = 'Only rolling windows are supported';
  }

  // SLI type enum validation (runtime boundary check)
  if (input.sli?.type && !(VALID_SLI_TYPES as readonly string[]).includes(input.sli.type)) {
    errors['sli.type'] = `Invalid SLI type "${
      input.sli.type
    }". Must be one of: ${VALID_SLI_TYPES.join(', ')}`;
  }

  // SLI calcMethod enum validation
  if (
    input.sli?.calcMethod &&
    !(VALID_CALC_METHODS as readonly string[]).includes(input.sli.calcMethod)
  ) {
    errors['sli.calcMethod'] = `Invalid calc method "${
      input.sli.calcMethod
    }". Must be one of: ${VALID_CALC_METHODS.join(', ')}`;
  }

  // SLI sourceType enum validation
  if (
    input.sli?.sourceType &&
    !(VALID_SOURCE_TYPES as readonly string[]).includes(input.sli.sourceType)
  ) {
    errors['sli.sourceType'] = `Invalid source type "${
      input.sli.sourceType
    }". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`;
  }

  // SLI metric
  if (!input.sli?.metric) {
    errors['sli.metric'] = 'Prometheus metric name is required';
  } else if (!METRIC_NAME_RE.test(input.sli.metric)) {
    errors['sli.metric'] = 'Invalid Prometheus metric name';
  }

  // SLI service
  if (!input.sli?.service?.labelValue) {
    errors['sli.service'] = 'Service is required';
  }
  if (input.sli?.service?.labelName && !LABEL_NAME_RE.test(input.sli.service.labelName)) {
    errors['sli.service.labelName'] =
      'Invalid Prometheus label name (must match [a-zA-Z_][a-zA-Z0-9_]*)';
  }
  if (input.sli?.service?.labelValue && UNSAFE_LABEL_VALUE_RE.test(input.sli.service.labelValue)) {
    errors['sli.service.labelValue'] =
      'Label value must not contain double quotes, backslashes, or newlines';
  }

  // SLI operation
  if (!input.sli?.operation?.labelValue) {
    errors['sli.operation'] = 'Operation is required';
  }
  if (input.sli?.operation?.labelName && !LABEL_NAME_RE.test(input.sli.operation.labelName)) {
    errors['sli.operation.labelName'] =
      'Invalid Prometheus label name (must match [a-zA-Z_][a-zA-Z0-9_]*)';
  }
  if (
    input.sli?.operation?.labelValue &&
    UNSAFE_LABEL_VALUE_RE.test(input.sli.operation.labelValue)
  ) {
    errors['sli.operation.labelValue'] =
      'Label value must not contain double quotes, backslashes, or newlines';
  }

  // SLI dependency (when present)
  if (input.sli?.dependency?.labelName && !LABEL_NAME_RE.test(input.sli.dependency.labelName)) {
    errors['sli.dependency.labelName'] =
      'Invalid Prometheus label name (must match [a-zA-Z_][a-zA-Z0-9_]*)';
  }
  if (
    input.sli?.dependency?.labelValue &&
    UNSAFE_LABEL_VALUE_RE.test(input.sli.dependency.labelValue)
  ) {
    errors['sli.dependency.labelValue'] =
      'Label value must not contain double quotes, backslashes, or newlines';
  }

  // Good events filter — prevent PromQL injection.
  // The filter is interpolated raw into PromQL selectors via buildGoodLabelMatchers().
  // Allow standard label matcher syntax (label_name op "value") but reject
  // characters that could break out of the selector context.
  if (input.sli?.goodEventsFilter && /[{}()\n\\]/.test(input.sli.goodEventsFilter)) {
    errors['sli.goodEventsFilter'] =
      'Good events filter must not contain curly braces, parentheses, backslashes, or newlines';
  }

  // Latency threshold (for latency SLIs)
  if (
    input.sli?.type &&
    input.sli.type !== 'availability' &&
    (input.sli.latencyThreshold === undefined || input.sli.latencyThreshold <= 0)
  ) {
    errors['sli.latencyThreshold'] = 'Latency threshold must be greater than 0';
  }

  // Warn if latency threshold looks like milliseconds instead of seconds
  if (
    input.sli?.type &&
    input.sli.type !== 'availability' &&
    input.sli.latencyThreshold !== undefined &&
    input.sli.latencyThreshold >= 60
  ) {
    warnings['sli.latencyThreshold'] =
      'Latency threshold is in seconds (Prometheus convention). ' +
      `A value of ${input.sli.latencyThreshold} seems high — did you mean ${
        input.sli.latencyThreshold / 1000
      }s (${input.sli.latencyThreshold}ms)?`;
  }

  // Alarms (required to avoid runtime TypeError in the generator)
  if (!input.alarms) {
    errors.alarms = 'Alarm configuration is required';
  }

  // Tags (required — generator iterates Object.entries(slo.tags))
  if (
    input.tags !== undefined &&
    (typeof input.tags !== 'object' || input.tags === null || Array.isArray(input.tags))
  ) {
    errors.tags = 'Tags must be a plain object';
  }

  // Burn rates — MWMBR validation
  if (!input.burnRates || input.burnRates.length === 0) {
    warnings.burnRates = 'No burn rate tiers configured — no MWMBR alerts will be generated';
  }
  if (input.burnRates && input.burnRates.length > 0) {
    const errorBudget = input.target !== undefined ? 1 - input.target : undefined;
    for (let i = 0; i < input.burnRates.length; i++) {
      const result = validateBurnRate(input.burnRates[i], i, errorBudget);
      Object.assign(errors, result.errors);
      Object.assign(warnings, result.warnings);
    }
  }

  // Exclusion windows (max 10)
  if (input.exclusionWindows && input.exclusionWindows.length > 10) {
    errors.exclusionWindows = 'Maximum 10 exclusion windows allowed';
  }

  return { errors, warnings };
}

/**
 * Validate a single burn rate tier.
 */
function validateBurnRate(
  tier: BurnRateConfig,
  index: number,
  errorBudget?: number
): { errors: Record<string, string>; warnings: Record<string, string> } {
  const prefix = `burnRates[${index}]`;
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  // Short window
  const shortMs = parseDurationToMs(tier.shortWindow);
  if (!tier.shortWindow || shortMs === 0) {
    errors[`${prefix}.shortWindow`] = 'Short window is required';
  }

  // Long window
  const longMs = parseDurationToMs(tier.longWindow);
  if (!tier.longWindow || longMs === 0) {
    errors[`${prefix}.longWindow`] = 'Long window is required';
  }

  // Short must be < long
  if (shortMs > 0 && longMs > 0 && shortMs >= longMs) {
    errors[`${prefix}.shortWindow`] = 'Short window must be shorter than long window';
  }

  // Warn if burn-rate windows don't match a pre-existing recording rule.
  // Non-standard windows will cause the alert to reference a recording rule
  // that doesn't exist, which means the alert will never fire.
  if (tier.shortWindow && shortMs > 0 && !RECORDING_WINDOWS.includes(tier.shortWindow)) {
    warnings[`${prefix}.shortWindow`] =
      `Short window "${tier.shortWindow}" does not match a recording rule window ` +
      `(${RECORDING_WINDOWS.join(
        ', '
      )}). The generated alert will reference a non-existent recording rule.`;
  }
  if (tier.longWindow && longMs > 0 && !RECORDING_WINDOWS.includes(tier.longWindow)) {
    warnings[`${prefix}.longWindow`] =
      `Long window "${tier.longWindow}" does not match a recording rule window ` +
      `(${RECORDING_WINDOWS.join(
        ', '
      )}). The generated alert will reference a non-existent recording rule.`;
  }

  // Burn rate multiplier
  if (!tier.burnRateMultiplier || tier.burnRateMultiplier <= 0) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be > 0';
  } else if (tier.burnRateMultiplier > 1000) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be ≤ 1000';
  }

  // Warn if the computed threshold exceeds 1.0 (alert can never fire)
  if (
    tier.burnRateMultiplier &&
    tier.burnRateMultiplier > 0 &&
    errorBudget !== undefined &&
    errorBudget > 0 &&
    tier.burnRateMultiplier * errorBudget > 1.0
  ) {
    const threshold = (tier.burnRateMultiplier * errorBudget).toFixed(4);
    warnings[`${prefix}.burnRateMultiplier`] =
      `Burn rate ${tier.burnRateMultiplier}x with the current target produces a threshold of ${threshold} ` +
      `(> 1.0). Since the error ratio is bounded to [0, 1], this alert will never fire.`;
  }

  // for duration
  if (!tier.forDuration || parseDurationToMs(tier.forDuration) === 0) {
    errors[`${prefix}.forDuration`] = 'For duration is required';
  }

  return { errors, warnings };
}

/**
 * Check if an SLO form input is valid.
 * Only checks errors — warnings do not block validation.
 */
export function isSloFormValid(input: Partial<SloInput>): boolean {
  return Object.keys(validateSloForm(input)).length === 0;
}
