/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure PromQL generator for SLO definitions.
 *
 * Converts an SloDefinition into a PromRuleGroup containing:
 *   - Intermediate recording rules at multiple window granularities
 *     (avoids expensive rate() over large windows at eval time)
 *   - Multi-window multi-burn-rate (MWMBR) alerting rules
 *   - SLI health, attainment breach, and error budget warning alerts
 *
 * This module is stateless — zero I/O, zero side effects.
 * The same function is used server-side (for deployment) and
 * client-side (for the preview panel) to ensure no divergence.
 *
 * @see https://sre.google/workbook/alerting-on-slos/
 */

import type { SloDefinition, GeneratedRuleGroup, GeneratedRule } from './slo_types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Windows at which we pre-compute recording rules.
 * Ordered from shortest to longest. The burn-rate alerts
 * and attainment alerts reference these instead of computing
 * rate() over large windows at query time.
 *
 * Exported so that `slo_validators` can warn when a user-supplied
 * burn-rate window does not match a pre-existing recording rule.
 */
export const RECORDING_WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d'];

/** Default evaluation interval for the generated rule group (seconds). */
const DEFAULT_INTERVAL = 60;

// ============================================================================
// Name Helpers
// ============================================================================

/**
 * Sanitize a string for use in Prometheus metric/rule names.
 * Prometheus names must match [a-zA-Z_:][a-zA-Z0-9_:]*.
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

/**
 * Short hash of the SLO ID for collision-safe rule names.
 * Uses a simple FNV-1a-like hash, returns 8 hex chars.
 */
export function shortHash(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// Label Matcher Builder
// ============================================================================

function buildLabelMatchers(slo: SloDefinition): string {
  const matchers: string[] = [];
  matchers.push(`${slo.sli.service.labelName}="${slo.sli.service.labelValue}"`);
  matchers.push(`${slo.sli.operation.labelName}="${slo.sli.operation.labelValue}"`);
  if (slo.sli.sourceType === 'service_dependency' && slo.sli.dependency) {
    matchers.push(`${slo.sli.dependency.labelName}="${slo.sli.dependency.labelValue}"`);
  }
  return matchers.join(', ');
}

function buildGoodLabelMatchers(slo: SloDefinition): string {
  const base = buildLabelMatchers(slo);
  if (slo.sli.goodEventsFilter) {
    return `${base}, ${slo.sli.goodEventsFilter}`;
  }
  return base;
}

// ============================================================================
// Common Labels
// ============================================================================

function buildCommonLabels(slo: SloDefinition): Record<string, string> {
  const labels: Record<string, string> = {
    slo_id: slo.id,
    slo_name: slo.name,
  };
  // Add user tags with tag_ prefix
  for (const [key, value] of Object.entries(slo.tags)) {
    labels[`tag_${key}`] = value;
  }
  return labels;
}

// ============================================================================
// Recording Rule Generators
// ============================================================================

/**
 * Format an interval in seconds as a Prometheus duration string.
 * e.g. 60 → "1m", 120 → "2m", 3600 → "1h".
 */
function formatIntervalDuration(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/**
 * Generate intermediate recording rules at multiple window granularities.
 *
 * For availability SLIs, records the error ratio:
 *   1 - (good_rate / total_rate)
 *
 * For latency SLIs, records the quantile value:
 *   histogram_quantile(Q, sum(rate(metric_bucket[window])) by (le))
 *
 * These pre-computed values are referenced by the alerting rules,
 * avoiding expensive rate() calls over large windows at query time.
 */
function generateRecordingRules(slo: SloDefinition): GeneratedRule[] {
  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const baseLabels = buildCommonLabels(slo);
  const totalMatchers = buildLabelMatchers(slo);
  const rules: GeneratedRule[] = [];

  if (slo.sli.type === 'availability') {
    const goodMatchers = buildGoodLabelMatchers(slo);

    for (const window of RECORDING_WINDOWS) {
      const recordName = `slo:sli_error:ratio_rate_${window}:${sanitized}_${hash}`;
      const expr =
        `1 - (\n` +
        `  sum(rate(${slo.sli.metric}{${goodMatchers}}[${window}]))\n` +
        `  /\n` +
        `  sum(rate(${slo.sli.metric}{${totalMatchers}}[${window}]))\n` +
        `)`;

      rules.push({
        type: 'recording',
        name: recordName,
        expr,
        labels: { ...baseLabels, window },
        description: `Pre-computed error ratio over ${window} window`,
      });
    }
  } else {
    // Latency SLI — histogram_quantile at each window
    const quantile = getQuantile(slo.sli.type);
    const bucketMetric = slo.sli.metric.replace(/_total$/, '_bucket').replace(/_count$/, '_bucket');
    // Ensure metric name ends with _bucket for histogram
    const metric = bucketMetric.endsWith('_bucket') ? bucketMetric : `${bucketMetric}_bucket`;

    for (const window of RECORDING_WINDOWS) {
      const recordName = `slo:sli_latency:${slo.sli.type}:${window}:${sanitized}_${hash}`;
      const expr =
        `histogram_quantile(${quantile},\n` +
        `  sum(rate(${metric}{${totalMatchers}}[${window}])) by (le)\n` +
        `)`;

      rules.push({
        type: 'recording',
        name: recordName,
        expr,
        labels: { ...baseLabels, window },
        description: `Pre-computed ${slo.sli.type} latency over ${window} window`,
      });
    }

    // Also generate error ratio recording rules for latency (threshold-based)
    // "error" = requests exceeding the latency threshold
    if (slo.sli.latencyThreshold !== undefined) {
      const leValue = slo.sli.latencyThreshold.toString();
      for (const window of RECORDING_WINDOWS) {
        const recordName = `slo:sli_error:ratio_rate_${window}:${sanitized}_${hash}`;
        const expr =
          `1 - (\n` +
          `  sum(rate(${metric}{${totalMatchers}, le="${leValue}"}[${window}]))\n` +
          `  /\n` +
          `  sum(rate(${metric}{${totalMatchers}, le="+Inf"}[${window}]))\n` +
          `)`;

        rules.push({
          type: 'recording',
          name: recordName,
          expr,
          labels: { ...baseLabels, window },
          description: `Pre-computed latency error ratio (>${leValue}s) over ${window} window`,
        });
      }
    }
  }

  return rules;
}

/**
 * For period-based SLIs, generate an additional boolean recording rule.
 */
function generatePeriodRecordingRule(slo: SloDefinition): GeneratedRule | null {
  if (slo.sli.calcMethod !== 'good_periods') return null;

  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const period = slo.sli.periodLength || '1m';
  const totalMatchers = buildLabelMatchers(slo);
  const goodMatchers = buildGoodLabelMatchers(slo);

  let expr: string;
  if (slo.sli.type === 'availability') {
    expr =
      `(\n` +
      `  sum(rate(${slo.sli.metric}{${goodMatchers}}[${period}]))\n` +
      `  /\n` +
      `  sum(rate(${slo.sli.metric}{${totalMatchers}}[${period}]))\n` +
      `) >= ${slo.target}`;
  } else {
    const quantile = getQuantile(slo.sli.type);
    const metric = ensureBucketMetric(slo.sli.metric);
    expr =
      `histogram_quantile(${quantile},\n` +
      `  sum(rate(${metric}{${totalMatchers}}[${period}])) by (le)\n` +
      `) <= ${slo.sli.latencyThreshold || 0}`;
  }

  return {
    type: 'recording',
    name: `slo:good_period:${sanitized}_${hash}`,
    expr,
    labels: { ...buildCommonLabels(slo), period },
    description: `Boolean recording rule: was this ${period} period "good"?`,
  };
}

// ============================================================================
// Alerting Rule Generators
// ============================================================================

/**
 * Generate MWMBR burn-rate alerting rules.
 *
 * Each burn rate tier produces one alerting rule with an AND condition
 * across the short and long windows:
 *
 *   error_ratio_short > (multiplier * error_budget)
 *   AND
 *   error_ratio_long > (multiplier * error_budget)
 */
function generateBurnRateAlerts(slo: SloDefinition): GeneratedRule[] {
  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const errorBudget = 1 - slo.target; // e.g. 0.001 for 99.9%
  const baseLabels = buildCommonLabels(slo);
  const rules: GeneratedRule[] = [];

  for (let i = 0; i < slo.burnRates.length; i++) {
    const tier = slo.burnRates[i];
    if (!tier.createAlarm) continue;

    const threshold = parseFloat((tier.burnRateMultiplier * errorBudget).toPrecision(6));
    const shortRecord = `slo:sli_error:ratio_rate_${tier.shortWindow}:${sanitized}_${hash}`;
    const longRecord = `slo:sli_error:ratio_rate_${tier.longWindow}:${sanitized}_${hash}`;

    const tierLabel =
      i === 0
        ? 'Page'
        : i === 1
          ? 'Ticket'
          : i === 2
            ? 'Log'
            : i === 3
              ? 'Monitor'
              : `Tier${i + 1}`;
    const alertName = `SLO_BurnRate_${tierLabel}_${sanitized}_${hash}`;

    const expr =
      `${shortRecord}{slo_id="${slo.id}"} > ${threshold}\n` +
      `and\n` +
      `${longRecord}{slo_id="${slo.id}"} > ${threshold}`;

    rules.push({
      type: 'alerting',
      name: alertName,
      expr,
      for: tier.forDuration,
      labels: {
        ...baseLabels,
        severity: tier.severity,
        alarm_type: 'burn_rate',
        burn_rate_multiplier: String(tier.burnRateMultiplier),
        burn_rate_short_window: tier.shortWindow,
        burn_rate_long_window: tier.longWindow,
      },
      annotations: {
        summary: `SLO burn rate ${tier.severity} — ${tier.burnRateMultiplier}x budget consumption (${tier.shortWindow}/${tier.longWindow})`,
        description:
          `Error budget for ${slo.name} is being consumed at ${tier.burnRateMultiplier}x the allowed rate. ` +
          `Short window (${tier.shortWindow}) and long window (${tier.longWindow}) both exceed threshold.`,
      },
      description: `Burn rate alert: ${tier.burnRateMultiplier}x rate, ${tier.shortWindow}/${tier.longWindow} windows, ${tier.severity}`,
    });
  }

  return rules;
}

/**
 * SLI Health alert — fires when the SLI drops below target over a 5m window.
 * Uses for: 5m to avoid noise from normal short-term variance.
 */
function generateSliHealthAlert(slo: SloDefinition): GeneratedRule | null {
  if (!slo.alarms.sliHealth.enabled) return null;

  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const recordName = `slo:sli_error:ratio_rate_5m:${sanitized}_${hash}`;
  const errorBudget = 1 - slo.target;

  // SLI health fires when the current error ratio exceeds the total error budget
  // (i.e., the current 5m window is "bad")
  const expr = `${recordName}{slo_id="${slo.id}"} > ${errorBudget}`;

  return {
    type: 'alerting',
    name: `SLO_SLIHealth_${sanitized}_${hash}`,
    expr,
    for: '5m',
    labels: {
      ...buildCommonLabels(slo),
      severity: 'warning',
      alarm_type: 'sli_health',
    },
    annotations: {
      summary: `SLI health degraded — error ratio exceeds error budget for ${slo.name}`,
      description: `The current error ratio for ${
        slo.name
      } exceeds the error budget (burn rate > 1x) over the last 5 minutes. Target: ${formatTarget(
        slo.target
      )}.`,
    },
    description: `SLI health alert — fires when error ratio exceeds budget (for: 5m)`,
  };
}

/**
 * Attainment breach alert — fires when SLO target is not met over the full window.
 * References the pre-computed recording rule for the SLO window duration.
 */
function generateAttainmentAlert(slo: SloDefinition): GeneratedRule | null {
  if (!slo.alarms.attainmentBreach.enabled) return null;

  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const windowDuration = slo.window.duration;
  const errorBudget = 1 - slo.target;

  // Find the closest recording rule window that covers the SLO window
  const recordWindow = findClosestWindow(windowDuration);
  const isApproximated = recordWindow !== windowDuration;
  const recordName = `slo:sli_error:ratio_rate_${recordWindow}:${sanitized}_${hash}`;

  const expr = `${recordName}{slo_id="${slo.id}"} > ${errorBudget}`;

  const labels: Record<string, string> = {
    ...buildCommonLabels(slo),
    severity: 'critical',
    alarm_type: 'attainment',
    slo_target: String(slo.target),
  };
  if (isApproximated) {
    labels.slo_window_approximated = 'true';
  }

  return {
    type: 'alerting',
    name: `SLO_Attainment_${sanitized}_${hash}`,
    expr,
    for: '5m',
    labels,
    annotations: {
      summary: `SLO attainment breached — below ${formatTarget(
        slo.target
      )} over ${windowDuration} window`,
      description: `The ${windowDuration} rolling attainment for ${
        slo.name
      } has fallen below the ${formatTarget(slo.target)} target.`,
    },
    description: `Attainment breach alert — fires when SLO target not met over ${windowDuration} window`,
  };
}

/**
 * Error budget warning alert — fires when remaining budget drops below threshold.
 */
function generateBudgetWarningAlert(slo: SloDefinition): GeneratedRule | null {
  if (!slo.alarms.budgetWarning.enabled) return null;

  const hash = shortHash(slo.id);
  const sanitized = sanitizeName(slo.name);
  const windowDuration = slo.window.duration;
  const errorBudget = 1 - slo.target;

  const recordWindow = findClosestWindow(windowDuration);
  const isApproximated = recordWindow !== windowDuration;
  const recordName = `slo:sli_error:ratio_rate_${recordWindow}:${sanitized}_${hash}`;

  // Budget remaining = 1 - (error_ratio / error_budget)
  // Alert when budget remaining < budgetWarningThreshold
  const expr =
    `1 - (\n` +
    `  ${recordName}{slo_id="${slo.id}"}\n` +
    `  / ${errorBudget}\n` +
    `) < ${slo.budgetWarningThreshold}`;

  const pct = Math.round(slo.budgetWarningThreshold * 100);

  const labels: Record<string, string> = {
    ...buildCommonLabels(slo),
    severity: 'warning',
    alarm_type: 'error_budget_warning',
    budget_threshold: String(slo.budgetWarningThreshold),
  };
  if (isApproximated) {
    labels.slo_window_approximated = 'true';
  }

  return {
    type: 'alerting',
    name: `SLO_Warning_${sanitized}_${hash}`,
    expr,
    for: '15m',
    labels,
    annotations: {
      summary: `SLO warning — less than ${pct}% error budget remaining for ${slo.name}`,
      description: `The error budget for ${slo.name} is running low. Less than ${pct}% remains in the current ${windowDuration} window.`,
    },
    description: `Error budget warning — fires when remaining budget < ${pct}%`,
  };
}

// ============================================================================
// YAML Serializer
// ============================================================================

function rulesToYaml(groupName: string, interval: number, rules: GeneratedRule[]): string {
  const lines: string[] = [];
  lines.push(`name: ${groupName}`);
  lines.push(`interval: ${formatIntervalDuration(interval)}`);
  lines.push('rules:');

  for (const rule of rules) {
    lines.push('');
    if (rule.type === 'recording') {
      lines.push(`  - record: ${rule.name}`);
    } else {
      lines.push(`  - alert: ${rule.name}`);
    }
    lines.push(`    expr: |`);
    for (const exprLine of rule.expr.split('\n')) {
      lines.push(`      ${exprLine}`);
    }
    if (rule.for) {
      lines.push(`    for: ${rule.for}`);
    }
    if (rule.labels && Object.keys(rule.labels).length > 0) {
      lines.push('    labels:');
      for (const [k, v] of Object.entries(rule.labels)) {
        lines.push(`      ${k}: "${escapeYamlString(v)}"`);
      }
    }
    if (rule.annotations && Object.keys(rule.annotations).length > 0) {
      lines.push('    annotations:');
      for (const [k, v] of Object.entries(rule.annotations)) {
        lines.push(`      ${k}: "${escapeYamlString(v)}"`);
      }
    }
  }

  return lines.join('\n');
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ============================================================================
// Utility Helpers
// ============================================================================

function getQuantile(sliType: string): string {
  switch (sliType) {
    case 'latency_p99':
      return '0.99';
    case 'latency_p90':
      return '0.90';
    case 'latency_p50':
      return '0.50';
    default:
      return '0.99';
  }
}

function ensureBucketMetric(metric: string): string {
  const base = metric
    .replace(/_total$/, '')
    .replace(/_count$/, '')
    .replace(/_bucket$/, '');
  return `${base}_bucket`;
}

function formatTarget(target: number): string {
  return `${(target * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/**
 * Find the closest recording rule window that is >= the SLO window duration.
 * If the SLO window exceeds all recording windows, return the largest
 * available window (currently `3d`).
 *
 * **Approximation note:** For SLO windows larger than `3d` (e.g. `7d`, `30d`),
 * the returned window is shorter than the actual SLO window. This is a
 * deliberate approximation — a 3-day error ratio that already exceeds the
 * budget is a reasonable proxy for the full window. Alerts generated from an
 * approximated window receive an `slo_window_approximated: "true"` label so
 * operators can identify them.
 *
 * @param windowDuration - Prometheus duration string (e.g. "7d", "30d")
 * @returns The closest recording window from {@link RECORDING_WINDOWS}
 */
function findClosestWindow(windowDuration: string): string {
  const durationMs = parseDurationToMs(windowDuration);
  for (const w of RECORDING_WINDOWS) {
    if (parseDurationToMs(w) >= durationMs) return w;
  }
  return RECORDING_WINDOWS[RECORDING_WINDOWS.length - 1];
}

/** Parse a Prometheus duration string (e.g. "5m", "1h", "3d") to milliseconds. */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return val * 1000;
    case 'm':
      return val * 60_000;
    case 'h':
      return val * 3_600_000;
    case 'd':
      return val * 86_400_000;
    case 'w':
      return val * 604_800_000;
    default:
      return 0;
  }
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate a complete Prometheus rule group for an SLO definition.
 *
 * The output includes:
 *   1. Intermediate recording rules at multiple window granularities
 *   2. Optional period-based boolean recording rule
 *   3. MWMBR burn-rate alerting rules
 *   4. SLI health alerting rule
 *   5. Attainment breach alerting rule
 *   6. Error budget warning alerting rule
 *
 * @param slo - The SLO definition to generate rules for
 * @returns Generated rule group with YAML and parsed rules
 */
export function generateSloRuleGroup(slo: SloDefinition): GeneratedRuleGroup {
  const rules: GeneratedRule[] = [];

  // 1. Intermediate recording rules
  rules.push(...generateRecordingRules(slo));

  // 2. Period-based boolean recording rule (if applicable)
  const periodRule = generatePeriodRecordingRule(slo);
  if (periodRule) rules.push(periodRule);

  // 3. MWMBR burn-rate alerts
  rules.push(...generateBurnRateAlerts(slo));

  // 4. SLI health alert
  const sliHealthAlert = generateSliHealthAlert(slo);
  if (sliHealthAlert) rules.push(sliHealthAlert);

  // 5. Attainment breach alert
  const attainmentAlert = generateAttainmentAlert(slo);
  if (attainmentAlert) rules.push(attainmentAlert);

  // 6. Error budget warning alert
  const budgetWarningAlert = generateBudgetWarningAlert(slo);
  if (budgetWarningAlert) rules.push(budgetWarningAlert);

  const groupName = slo.ruleGroupName || `slo:${sanitizeName(slo.name)}_${shortHash(slo.id)}`;
  const yaml = rulesToYaml(groupName, DEFAULT_INTERVAL, rules);

  return {
    groupName,
    interval: DEFAULT_INTERVAL,
    rules,
    yaml,
  };
}
