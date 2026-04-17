/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO/SLI domain types for the Alert Manager plugin.
 *
 * A single SLO definition decomposes into 1+ recording rules and 2–5
 * alerting rules grouped in a Prometheus PromRuleGroup. The system
 * manages the full lifecycle: create, read, update, delete.
 *
 * Burn-rate alerting follows the Google SRE Workbook multi-window
 * multi-burn-rate (MWMBR) pattern with paired short + long windows.
 *
 * @see https://sre.google/workbook/alerting-on-slos/
 */

// ============================================================================
// Enumerations
// ============================================================================

/** Service Level Indicator type — determines the PromQL pattern. */
export type SliType = 'availability' | 'latency_p99' | 'latency_p90' | 'latency_p50';

/** Calculation method for the SLI. */
export type SliCalcMethod = 'good_requests' | 'good_periods';

/** SLO measurement window type. Only rolling is supported for Prometheus. */
export type SloWindowType = 'rolling';

/** Computed SLO health status. */
export type SloStatus = 'breached' | 'warning' | 'ok' | 'no_data';

/** Source type for the SLI (service operation vs service dependency). */
export type SliSourceType = 'service_operation' | 'service_dependency';

// ============================================================================
// SLI Definition
// ============================================================================

export interface SliDefinition {
  /** The SLI type (availability or latency quantile). */
  type: SliType;
  /** Calculation method. */
  calcMethod: SliCalcMethod;
  /** Source type — service operation or dependency. */
  sourceType: SliSourceType;
  /** Base Prometheus metric name (e.g. "http_requests_total"). */
  metric: string;
  /**
   * Good events label filter for availability SLIs.
   * Pre-populated as 'status_code!~"5.."' for HTTP metrics.
   */
  goodEventsFilter?: string;
  /**
   * Latency threshold for latency SLIs, **always in seconds** (matching
   * the Prometheus histogram `_bucket` `le` label convention).
   *
   * Examples: `0.5` for 500 ms, `1.0` for 1 s, `0.1` for 100 ms.
   *
   * Values greater than 60 are flagged with a validator warning because
   * they likely indicate a milliseconds-vs-seconds mistake.
   */
  latencyThreshold?: number;
  /** Service label matcher. */
  service: { labelName: string; labelValue: string };
  /** Operation/endpoint label matcher. */
  operation: { labelName: string; labelValue: string };
  /** Optional dependency label matcher (only for service_dependency source type). */
  dependency?: { labelName: string; labelValue: string };
  /** Period length for "good_periods" method (e.g. "1m"). */
  periodLength?: string;
}

// ============================================================================
// Burn Rate Configuration — MWMBR (Multi-Window Multi-Burn-Rate)
// ============================================================================

/**
 * A single burn rate tier with paired short + long windows.
 *
 * Google SRE Workbook (Chapter 5 — Alerting on SLOs) recommends these
 * default tiers. Tier names describe the *response type*, not a
 * Prometheus severity level:
 *
 *   - Page:    short=5m,  long=1h,  multiplier=14.4, severity=critical
 *   - Ticket:  short=30m, long=6h,  multiplier=6,    severity=critical
 *   - Log:     short=2h,  long=1d,  multiplier=3,    severity=warning  (optional)
 *   - Monitor: short=6h,  long=3d,  multiplier=1,    severity=warning  (optional)
 *
 * Time to exhaust the full error budget = `window / multiplier`.
 * For a **1-day** window: 14.4x ≈ 1.7 h, 6x = 4 h, 3x = 8 h, 1x = 24 h.
 * For a **30-day** window: 14.4x ≈ 50 h, 6x ≈ 5 d, 3x = 10 d, 1x = 30 d.
 *
 * The alert fires only when BOTH windows exceed the threshold (AND condition),
 * balancing fast detection against false positives.
 */
export interface BurnRateConfig {
  /** Short lookback window for fast detection (e.g. "5m"). */
  shortWindow: string;
  /** Long lookback window for sustained confirmation (e.g. "1h"). */
  longWindow: string;
  /**
   * Burn rate multiplier threshold.
   * For a 99.9% SLO (error budget = 0.001), a multiplier of 14.4
   * means errors are accumulating 14.4x faster than the budget allows.
   */
  burnRateMultiplier: number;
  /** Alert severity. */
  severity: 'critical' | 'warning';
  /** Whether to create an alerting rule for this tier. */
  createAlarm: boolean;
  /** Prometheus for: duration (e.g. "2m", "5m"). */
  forDuration: string;
  /** Optional notification channel for this burn rate alarm. */
  notificationChannel?: string;
}

// ============================================================================
// SLO Alarm Configuration
// ============================================================================

export interface SloAlarmConfig {
  /** SLI health alarm — fires when SLI drops below target over short window. */
  sliHealth: { enabled: boolean; notificationChannel?: string };
  /** Attainment breach — fires when SLO target is not met over the full window. */
  attainmentBreach: { enabled: boolean; notificationChannel?: string };
  /** Error budget warning — fires when remaining budget drops below threshold. */
  budgetWarning: { enabled: boolean; notificationChannel?: string };
}

// ============================================================================
// Exclusion Window
// ============================================================================

export interface ExclusionWindow {
  /** Unique name for this window. */
  name: string;
  /** CRON expression for recurring, or ISO datetime for one-time. */
  schedule: string;
  /** Duration of the exclusion (e.g. "1h", "2h"). */
  duration: string;
  /** Optional reason for the exclusion. */
  reason?: string;
}

// ============================================================================
// SLO Definition — Source of Truth
// ============================================================================

export interface SloDefinition {
  /** Unique SLO identifier. */
  id: string;
  /** Prometheus datasource ID (from datasource registry). */
  datasourceId: string;
  /** Human-readable name. */
  name: string;
  /** SLI configuration. */
  sli: SliDefinition;
  /**
   * Target attainment as a decimal.
   * e.g. 0.999 for 99.9%. NEVER stored as percentage.
   * Display conversion happens in the UI only.
   */
  target: number;
  /**
   * Error budget warning threshold as a decimal fraction of remaining budget.
   * e.g. 0.30 means "warn when budget is below 30%".
   */
  budgetWarningThreshold: number;
  /** Measurement window. */
  window: {
    type: SloWindowType;
    /** Duration string (e.g. "1d", "7d", "30d"). */
    duration: string;
  };
  /**
   * Burn rate configurations — multi-window multi-burn-rate (MWMBR).
   * Typically 2–4 tiers from critical to low urgency.
   */
  burnRates: BurnRateConfig[];
  /** SLO alarm toggles. */
  alarms: SloAlarmConfig;
  /** Exclusion windows (mapped to alertmanager silences). */
  exclusionWindows: ExclusionWindow[];
  /** User-defined tags (added to all generated rule labels with tag_ prefix). */
  tags: Record<string, string>;
  /** Generated Prometheus rule group name. */
  ruleGroupName: string;
  /** Ruler namespace where rules are deployed. */
  rulerNamespace: string;
  /** Names of all generated Prometheus rules (for reconciliation/cleanup). */
  generatedRuleNames: string[];
  /** Object version for optimistic concurrency. */
  version: number;
  /** Metadata. */
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// ============================================================================
// Computed SLO Status (read-time)
// ============================================================================

export interface SloLiveStatus {
  sloId: string;
  /**
   * Current SLI value:
   *  - For availability: ratio (e.g. 0.9997 for 99.97%)
   *  - For latency: seconds (e.g. 0.412 for 412 ms), matching Prometheus convention
   */
  currentValue: number;
  /** Current attainment over the window (0–1 decimal). */
  attainment: number;
  /**
   * Error budget remaining as a fraction (0–1).
   * Can go negative when the budget is exhausted.
   */
  errorBudgetRemaining: number;
  /** Computed status. */
  status: SloStatus;
  /** Number of generated rules. */
  ruleCount: number;
  /** Number of currently firing rules. */
  firingCount: number;
  /** Timestamp of computation. */
  computedAt: string;
}

// ============================================================================
// SLO Summary (listing-optimized projection)
// ============================================================================

export interface SloSummary {
  id: string;
  datasourceId: string;
  name: string;
  sliType: SliType;
  serviceName: string;
  operationName: string;
  target: number;
  window: { type: SloWindowType; duration: string };
  tags: Record<string, string>;
  /** Live status (populated via batch getStatuses). */
  status: SloLiveStatus;
}

// ============================================================================
// Generated Rule Group (output of PromQL generator)
// ============================================================================

export interface GeneratedRule {
  type: 'recording' | 'alerting';
  /** Rule name: recording rule name or alert name. */
  name: string;
  /** PromQL expression. */
  expr: string;
  /** Prometheus for: duration (alerting rules only). */
  for?: string;
  /** Labels applied to the rule. */
  labels: Record<string, string>;
  /** Annotations (alerting rules only). */
  annotations?: Record<string, string>;
  /** Human-readable description of what this rule does. */
  description: string;
}

export interface GeneratedRuleGroup {
  /** Rule group name for the Prometheus ruler. */
  groupName: string;
  /** Evaluation interval in seconds (e.g. 60). */
  interval: number;
  /** Parsed rule list for display in the UI. */
  rules: GeneratedRule[];
  /** YAML string ready to POST to the ruler API. */
  yaml: string;
}

// ============================================================================
// Default MWMBR Tiers (Google SRE Workbook Ch. 5)
// ============================================================================

/**
 * Default burn rate tiers following the multi-window multi-burn-rate
 * strategy from the Google SRE Workbook.
 *
 * These are the recommended defaults for the "Use recommended" button
 * in the Create SLO wizard.
 */
export const DEFAULT_MWMBR_TIERS: readonly BurnRateConfig[] = [
  {
    shortWindow: '5m',
    longWindow: '1h',
    burnRateMultiplier: 14.4,
    severity: 'critical',
    createAlarm: true,
    forDuration: '2m',
  },
  {
    shortWindow: '30m',
    longWindow: '6h',
    burnRateMultiplier: 6,
    // Severity rationale: Google SRE Workbook Chapter 5 labels this tier as
    // "Ticket" (response type), not a Prometheus severity level. A 6x burn rate
    // exhausts the error budget in window/6 (e.g. ~4 h for a 1d window,
    // ~5 d for a 30d window) — urgent enough to warrant `critical` so on-call
    // gets paged before the budget is gone. Operators who prefer a softer
    // response can downgrade this tier to `warning` in the UI.
    severity: 'critical',
    createAlarm: true,
    forDuration: '5m',
  },
  {
    shortWindow: '2h',
    longWindow: '1d',
    burnRateMultiplier: 3,
    severity: 'warning',
    createAlarm: true,
    forDuration: '10m',
  },
  {
    shortWindow: '6h',
    longWindow: '3d',
    burnRateMultiplier: 1,
    severity: 'warning',
    createAlarm: true,
    forDuration: '30m',
  },
];

// ============================================================================
// SLO Storage Interface
// ============================================================================

/**
 * Storage backend abstraction for SLO definitions.
 *
 * Implementations:
 *  - `InMemorySloStore` — transient bootstrap store, used until SavedObjectSloStore is ready
 *  - `SavedObjectSloStore` — persists to OpenSearch via OSD Saved Objects
 */
export interface ISloStore {
  /** Retrieve a single SLO by ID. Returns null if not found. */
  get(id: string): Promise<SloDefinition | null>;
  /** List all SLOs, optionally filtered by datasourceId. */
  list(datasourceId?: string): Promise<SloDefinition[]>;
  /** Create or update an SLO definition (upsert semantics). */
  save(slo: SloDefinition): Promise<void>;
  /** Delete an SLO by ID. Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;
}

// ============================================================================
// SLO Create/Update Input (API boundary)
// ============================================================================

/** Input for creating or updating an SLO (no id/version/timestamps). */
export type SloInput = Omit<
  SloDefinition,
  | 'id'
  | 'version'
  | 'createdAt'
  | 'createdBy'
  | 'updatedAt'
  | 'updatedBy'
  | 'ruleGroupName'
  | 'rulerNamespace'
  | 'generatedRuleNames'
>;

/** Partial input for updating an SLO. */
export type SloUpdateInput = Partial<SloInput>;

// ============================================================================
// SLO List Filters (API query params)
// ============================================================================

export interface SloListFilters {
  datasourceId?: string;
  status?: SloStatus[];
  sliType?: SliType[];
  service?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}
