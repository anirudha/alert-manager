/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared color maps, formatting utilities, and style constants
 * used across alert-manager standalone components.
 *
 * Centralising these here avoids drift between components that
 * previously each defined their own (slightly different) copies.
 */
import React from 'react';

// ============================================================================
// Severity
// ============================================================================

/**
 * Maps UnifiedAlertSeverity values to OUI semantic badge color names.
 * Usage: <EuiBadge color={SEVERITY_COLORS[severity]}>{severity}</EuiBadge>
 */
export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};

// ============================================================================
// Alert state
// ============================================================================

/**
 * Maps UnifiedAlertState values to OUI semantic Health / badge color names.
 * Usage: <EuiHealth color={STATE_COLORS[state]}>{state}</EuiHealth>
 */
export const STATE_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  silenced: 'default',
  resolved: 'success',
  error: 'danger',
};

// ============================================================================
// Monitor status
// ============================================================================

/**
 * Maps MonitorStatus values to OUI semantic badge color names.
 */
export const STATUS_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  muted: 'default',
  disabled: 'subdued',
};

// ============================================================================
// Monitor health
// ============================================================================

/**
 * Maps MonitorHealthStatus values to OUI semantic Health color names.
 */
export const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  failing: 'danger',
  no_data: 'subdued',
};

// ============================================================================
// Monitor type display labels
// ============================================================================

/**
 * Human-readable labels for every MonitorType value, including
 * `cluster_metrics` which was missing in some component-local copies.
 */
export const TYPE_LABELS: Record<string, string> = {
  metric: 'Metric',
  log: 'Log',
  apm: 'APM',
  composite: 'Composite',
  infrastructure: 'Infrastructure',
  cluster_metrics: 'Cluster Metrics',
  synthetics: 'Synthetics',
};

// ============================================================================
// Formatting utilities
// ============================================================================

/**
 * Converts an ISO-8601 timestamp to a compact relative string such as
 * "5m ago", "2h ago", or "3d ago".  Returns "—" for falsy / unparseable input.
 */
export function formatRelativeTime(isoString: string): string {
  if (!isoString) return '—';

  const now = Date.now();
  const then = new Date(isoString).getTime();

  if (Number.isNaN(then)) return '—';

  const diffMs = now - then;

  // Future timestamps — show "just now" rather than negative durations.
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Returns a user-friendly display name for a DatasourceType value.
 *   "opensearch" → "OpenSearch"
 *   "prometheus" → "Prometheus"
 * Falls back to the raw string with a capitalised first letter for unknown types.
 */
export function formatDatasourceType(type: string): string {
  switch (type) {
    case 'opensearch':
      return 'OpenSearch';
    case 'prometheus':
      return 'Prometheus';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// ============================================================================
// Pagination button styles  (m10 — hover / focus-visible feedback)
// ============================================================================

/**
 * Inline style factory for page-number buttons inside TablePagination.
 * Provides the base look; combine with `PAGINATION_BUTTON_HOVER_CLASS`
 * and `PAGINATION_CSS` for interactive states.
 */
export const PAGINATION_BUTTON_STYLE = (isActive: boolean): React.CSSProperties => ({
  minWidth: 32,
  height: 32,
  border: 'none',
  borderRadius: 4,
  background: isActive ? '#006BB4' : 'transparent',
  color: isActive ? '#fff' : '#006BB4',
  fontWeight: isActive ? 700 : 400,
  cursor: isActive ? 'default' : 'pointer',
  fontSize: 14,
});

/**
 * CSS class name to attach to every page-number <button> so that the
 * hover/focus rules in PAGINATION_CSS can target them.
 */
export const PAGINATION_BUTTON_HOVER_CLASS = 'alert-mgr-page-btn';

/**
 * Inject once (via a <style> tag or equivalent) to enable hover and
 * focus-visible feedback on pagination page-number buttons.
 */
export const PAGINATION_CSS = `
  .alert-mgr-page-btn:not(:disabled):hover {
    background-color: #E6F0FF;
    border-radius: 4px;
  }
  .alert-mgr-page-btn:focus-visible {
    outline: 2px solid #006BB4;
    outline-offset: 2px;
    border-radius: 4px;
  }
`;
