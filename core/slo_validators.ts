/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation for SLO form inputs.
 *
 * Returns an error map (field → message). Empty map means valid.
 * Follows the same pattern as core/validators.ts (validateMonitorForm).
 */

import type { SloInput, BurnRateConfig } from './slo_types';
import { parseDurationToMs } from './slo_promql_generator';

/** Valid Prometheus metric name pattern. */
const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/**
 * Validate an SLO form input.
 *
 * @returns Record of field → error message. Empty means valid.
 */
export function validateSloForm(input: Partial<SloInput>): Record<string, string> {
  const errors: Record<string, string> = {};

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

  // SLI operation
  if (!input.sli?.operation?.labelValue) {
    errors['sli.operation'] = 'Operation is required';
  }

  // Latency threshold (for latency SLIs)
  if (
    input.sli?.type &&
    input.sli.type !== 'availability' &&
    (input.sli.latencyThreshold === undefined || input.sli.latencyThreshold <= 0)
  ) {
    errors['sli.latencyThreshold'] = 'Latency threshold must be greater than 0';
  }

  // Burn rates — MWMBR validation
  if (input.burnRates && input.burnRates.length > 0) {
    for (let i = 0; i < input.burnRates.length; i++) {
      const errs = validateBurnRate(input.burnRates[i], i);
      Object.assign(errors, errs);
    }
  }

  // Exclusion windows (max 10)
  if (input.exclusionWindows && input.exclusionWindows.length > 10) {
    errors.exclusionWindows = 'Maximum 10 exclusion windows allowed';
  }

  return errors;
}

/**
 * Validate a single burn rate tier.
 */
function validateBurnRate(tier: BurnRateConfig, index: number): Record<string, string> {
  const prefix = `burnRates[${index}]`;
  const errors: Record<string, string> = {};

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

  // Burn rate multiplier
  if (!tier.burnRateMultiplier || tier.burnRateMultiplier <= 0) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be > 0';
  } else if (tier.burnRateMultiplier > 1000) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be ≤ 1000';
  }

  // for duration
  if (!tier.forDuration || parseDurationToMs(tier.forDuration) === 0) {
    errors[`${prefix}.forDuration`] = 'For duration is required';
  }

  return errors;
}

/**
 * Check if an SLO form input is valid.
 */
export function isSloFormValid(input: Partial<SloInput>): boolean {
  return Object.keys(validateSloForm(input)).length === 0;
}
