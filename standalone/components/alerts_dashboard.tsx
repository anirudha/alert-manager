/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Dashboard — visualization-first view of alert history
 * with summary stats, charts, and drill-down table.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiStat,
  EuiSpacer,
  EuiHealth,
  EuiBadge,
  EuiBasicTable,
  EuiText,
  EuiTitle,
  EuiButtonIcon,
  EuiToolTip,
  EuiFieldSearch,
  EuiEmptyPrompt,
  EuiButtonEmpty,
  EuiResizableContainer,
  EuiIcon,
  EuiCheckbox,
} from '@opensearch-project/oui';
import { UnifiedAlert, UnifiedAlertSeverity, UnifiedAlertState, Datasource } from '../../core';
import { filterAlerts } from '../../core/filter';

// ============================================================================
// Color maps
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#BD271E',
  high: '#F5A700',
  medium: '#006BB4',
  low: '#98A2B3',
  info: '#D3DAE6',
};
const SEVERITY_BADGE: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};
const STATE_COLORS: Record<string, string> = {
  active: '#BD271E',
  pending: '#F5A700',
  acknowledged: '#006BB4',
  resolved: '#017D73',
  error: '#BD271E',
};
const STATE_HEALTH: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
};

// ============================================================================
// Helpers
// ============================================================================

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// ============================================================================
// Alert Filter State
// ============================================================================

interface AlertFilterState {
  severity: string[];
  state: string[];
  backend: string[];
  labels: Record<string, string[]>;
}

const emptyAlertFilters = (): AlertFilterState => ({
  severity: [],
  state: [],
  backend: [],
  labels: {},
});

function collectAlertUniqueValues(
  alerts: UnifiedAlert[],
  field: (a: UnifiedAlert) => string
): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const val = field(a);
    if (val) set.add(val);
  }
  return Array.from(set).sort();
}

function collectAlertLabelKeys(alerts: UnifiedAlert[]): string[] {
  const keys = new Set<string>();
  for (const a of alerts) {
    for (const k of Object.keys(a.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function collectAlertLabelValues(alerts: UnifiedAlert[], key: string): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const v = a.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

function matchesAlertFilters(alert: UnifiedAlert, filters: AlertFilterState): boolean {
  if (filters.severity.length > 0 && !filters.severity.includes(alert.severity)) return false;
  if (filters.state.length > 0 && !filters.state.includes(alert.state)) return false;
  if (filters.backend.length > 0 && !filters.backend.includes(alert.datasourceType)) return false;
  for (const [key, values] of Object.entries(filters.labels)) {
    if (values.length > 0) {
      const alertVal = alert.labels[key];
      if (!alertVal || !values.includes(alertVal)) return false;
    }
  }
  return true;
}

// ============================================================================
// SVG Severity Donut Chart
// ============================================================================

const SeverityDonut: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const counts = countBy(alerts, (a) => a.severity);
  const order: UnifiedAlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const total = alerts.length;
  if (total === 0)
    return (
      <EuiText size="s" color="subdued" textAlign="center">
        No alerts
      </EuiText>
    );

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 58;
  const innerR = 38;
  let cumAngle = -Math.PI / 2;

  const arcs = order
    .filter((s) => (counts[s] || 0) > 0)
    .map((s) => {
      const count = counts[s] || 0;
      const angle = (count / total) * 2 * Math.PI;
      const startAngle = cumAngle;
      cumAngle += angle;
      const endAngle = cumAngle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1o = cx + outerR * Math.cos(startAngle);
      const y1o = cy + outerR * Math.sin(startAngle);
      const x2o = cx + outerR * Math.cos(endAngle);
      const y2o = cy + outerR * Math.sin(endAngle);
      const x1i = cx + innerR * Math.cos(endAngle);
      const y1i = cy + innerR * Math.sin(endAngle);
      const x2i = cx + innerR * Math.cos(startAngle);
      const y2i = cy + innerR * Math.sin(startAngle);
      const d = [
        `M ${x1o} ${y1o}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
        `L ${x1i} ${y1i}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
        'Z',
      ].join(' ');
      return { severity: s, d, count };
    });

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        {arcs.map((a) => (
          <path key={a.severity} d={a.d} fill={SEVERITY_COLORS[a.severity]} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="bold" fill="#343741">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#98A2B3">
          alerts
        </text>
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginTop: 4,
          flexWrap: 'wrap',
        }}
      >
        {order
          .filter((s) => (counts[s] || 0) > 0)
          .map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[s],
                  display: 'inline-block',
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{s}</span>
              <span style={{ fontWeight: 600 }}>{counts[s]}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

// ============================================================================
// SVG Alert Timeline (horizontal bar chart by time buckets)
// ============================================================================

const AlertTimeline: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No timeline data
      </EuiText>
    );

  const width = 520;
  const height = 140;
  const pad = { top: 15, right: 15, bottom: 28, left: 40 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // Bucket alerts into 12 time buckets over the last 24 hours
  const now = Date.now();
  const bucketCount = 12;
  const bucketDuration = (24 * 60 * 60 * 1000) / bucketCount; // 2 hours each
  const buckets: Array<{
    label: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  }> = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = now - (bucketCount - i) * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const label = new Date(bucketStart).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const inBucket = alerts.filter((a) => {
      const t = new Date(a.startTime).getTime();
      return t >= bucketStart && t < bucketEnd;
    });
    buckets.push({
      label,
      critical: inBucket.filter((a) => a.severity === 'critical').length,
      high: inBucket.filter((a) => a.severity === 'high').length,
      medium: inBucket.filter((a) => a.severity === 'medium').length,
      low: inBucket.filter((a) => a.severity === 'low').length,
      info: inBucket.filter((a) => a.severity === 'info').length,
    });
  }

  const maxCount = Math.max(
    1,
    ...buckets.map((b) => b.critical + b.high + b.medium + b.low + b.info)
  );
  const barW = chartW / bucketCount - 4;

  return (
    <svg width={width} height={height} style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = pad.top + chartH * (1 - pct);
        return (
          <g key={i}>
            <line
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              stroke="#EDF0F5"
              strokeWidth={1}
            />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fill="#98A2B3" fontSize={9}>
              {Math.round(maxCount * pct)}
            </text>
          </g>
        );
      })}
      {/* Stacked bars */}
      {buckets.map((b, i) => {
        const x = pad.left + i * (chartW / bucketCount) + 2;
        const sevs: Array<{ key: string; count: number; color: string }> = [
          { key: 'critical', count: b.critical, color: SEVERITY_COLORS.critical },
          { key: 'high', count: b.high, color: SEVERITY_COLORS.high },
          { key: 'medium', count: b.medium, color: SEVERITY_COLORS.medium },
          { key: 'low', count: b.low, color: SEVERITY_COLORS.low },
          { key: 'info', count: b.info, color: SEVERITY_COLORS.info },
        ];
        let yOffset = pad.top + chartH;
        return (
          <g key={i}>
            {sevs.map((s) => {
              if (s.count === 0) return null;
              const barH = (s.count / maxCount) * chartH;
              yOffset -= barH;
              return (
                <rect
                  key={s.key}
                  x={x}
                  y={yOffset}
                  width={barW}
                  height={barH}
                  fill={s.color}
                  rx={1}
                  opacity={0.85}
                />
              );
            })}
            {/* X label */}
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fill="#98A2B3" fontSize={8}>
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ============================================================================
// SVG State Breakdown (horizontal bar)
// ============================================================================

const StateBreakdown: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const counts = countBy(alerts, (a) => a.state);
  const order: UnifiedAlertState[] = ['active', 'pending', 'acknowledged', 'resolved', 'error'];
  const total = alerts.length || 1;
  const barWidth = 260;
  const barHeight = 14;

  let xOffset = 0;
  const segments = order
    .filter((s) => (counts[s] || 0) > 0)
    .map((s) => {
      const w = ((counts[s] || 0) / total) * barWidth;
      const seg = { state: s, x: xOffset, w, count: counts[s] || 0 };
      xOffset += w;
      return seg;
    });

  return (
    <div>
      <svg width={barWidth} height={barHeight} style={{ borderRadius: 4, overflow: 'hidden' }}>
        {segments.map((s) => (
          <rect
            key={s.state}
            x={s.x}
            y={0}
            width={s.w}
            height={barHeight}
            fill={STATE_COLORS[s.state]}
          />
        ))}
        {alerts.length === 0 && (
          <rect x={0} y={0} width={barWidth} height={barHeight} fill="#EDF0F5" />
        )}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {order
          .filter((s) => (counts[s] || 0) > 0)
          .map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: STATE_COLORS[s],
                  display: 'inline-block',
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{s}</span>
              <span style={{ fontWeight: 600 }}>{counts[s]}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

// ============================================================================
// Alerts by Service mini-table
// ============================================================================

/** Group alerts by datasource type (opensearch vs prometheus). */
const AlertsByDatasource: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const groups = countBy(alerts, (a) => a.datasourceType || 'unknown');
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (sorted.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );
  const maxCount = sorted[0][1];
  return (
    <div style={{ fontSize: 12 }}>
      {sorted.map(([name, count]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              color: '#343741',
            }}
          >
            {name}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: '#EDF0F5',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(count / maxCount) * 100}%`,
                height: '100%',
                background: '#006BB4',
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' as const }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
};

/** Group alerts by monitor name (extracted from alert name before " — "). */
const AlertsByMonitor: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const groups = countBy(alerts, (a) => {
    const dashIdx = a.name.indexOf(' — ');
    return dashIdx > 0 ? a.name.substring(0, dashIdx) : a.name;
  });
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (sorted.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );
  const maxCount = sorted[0][1];
  return (
    <div style={{ fontSize: 12 }}>
      {sorted.map(([name, count]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              color: '#343741',
            }}
            title={name}
          >
            {name}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: '#EDF0F5',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(count / maxCount) * 100}%`,
                height: '100%',
                background: '#006BB4',
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' as const }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
};

const AlertsByGroup: React.FC<{ alerts: UnifiedAlert[]; groupKey: string }> = ({
  alerts,
  groupKey,
}) => {
  const groups = countBy(alerts, (a) => a.labels[groupKey] || 'unknown');
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (sorted.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const maxCount = sorted[0][1];

  return (
    <div style={{ fontSize: 12 }}>
      {sorted.map(([name, count]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              color: '#343741',
            }}
          >
            {name}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: '#EDF0F5',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(count / maxCount) * 100}%`,
                height: '100%',
                background: '#006BB4',
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' as const }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// AI Briefing — contextual narrative about system state
// ============================================================================

// ============================================================================
// Main Dashboard Component
// ============================================================================

export interface AlertsDashboardProps {
  alerts: UnifiedAlert[];
  datasources: Datasource[];
  loading: boolean;
  onViewDetail: (alert: UnifiedAlert) => void;
  onAcknowledge: (alertId: string) => void;
  onSilence: (alertId: string) => void;
  /** Workspace-scoped entries for Prometheus datasources */
  workspaceOptions: Datasource[];
  loadingWorkspaces: boolean;
  /** Currently selected datasource IDs */
  selectedDsIds: string[];
  /** Callback when datasource selection changes */
  onDatasourceChange: (ids: string[]) => void;
}

export const AlertsDashboard: React.FC<AlertsDashboardProps> = ({
  alerts,
  datasources,
  loading,
  onViewDetail,
  onAcknowledge,
  onSilence,
  workspaceOptions,
  loadingWorkspaces,
  selectedDsIds,
  onDatasourceChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('startTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<AlertFilterState>(emptyAlertFilters());
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());
  const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(false);

  const dsNameMap = useMemo(() => new Map(datasources.map((d) => [d.id, d.name])), [datasources]);

  // Build selectable datasource entries for the filter facet
  const datasourceEntries = useMemo(() => {
    const entries: Array<{ id: string; label: string }> = [];
    // Non-prometheus datasources
    for (const ds of datasources) {
      if (ds.type !== 'prometheus') {
        entries.push({ id: ds.id, label: ds.name });
      }
    }
    // Prometheus workspace-scoped entries
    for (const ws of workspaceOptions) {
      const parent = datasources.find((d) => d.id === ws.parentDatasourceId);
      const label = parent ? `${parent.name} / ${ws.workspaceName || ws.name}` : ws.name;
      entries.push({ id: ws.id, label });
    }
    // Fallback: prometheus datasources with no workspaces
    if (workspaceOptions.length === 0 && !loadingWorkspaces) {
      for (const ds of datasources) {
        if (ds.type === 'prometheus') {
          entries.push({ id: ds.id, label: ds.name });
        }
      }
    }
    return entries;
  }, [datasources, workspaceOptions, loadingWorkspaces]);

  // Unique values for facets
  const uniqueSeverities = useMemo(
    () => collectAlertUniqueValues(alerts, (a) => a.severity),
    [alerts]
  );
  const uniqueStates = useMemo(() => collectAlertUniqueValues(alerts, (a) => a.state), [alerts]);
  const uniqueBackends = useMemo(
    () => collectAlertUniqueValues(alerts, (a) => a.datasourceType),
    [alerts]
  );
  const labelKeys = useMemo(() => collectAlertLabelKeys(alerts), [alerts]);

  // Facet counts (against search-matched but not filter-matched alerts)
  const facetCounts = useMemo(() => {
    const searchMatched = alerts.filter((a) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.message || '').toLowerCase().includes(q) ||
        Object.values(a.labels).some((v) => v.toLowerCase().includes(q))
      );
    });
    const counts: Record<string, Record<string, number>> = {
      severity: {},
      state: {},
      backend: {},
    };
    for (const a of searchMatched) {
      counts.severity[a.severity] = (counts.severity[a.severity] || 0) + 1;
      counts.state[a.state] = (counts.state[a.state] || 0) + 1;
      counts.backend[a.datasourceType] = (counts.backend[a.datasourceType] || 0) + 1;
    }
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const a of searchMatched) {
        const v = a.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [alerts, searchQuery, labelKeys]);

  const activeFilterCount = useMemo(() => {
    let count = filters.severity.length + filters.state.length + filters.backend.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Filtered + sorted alerts for the table
  const filteredAlerts = useMemo(() => {
    // Combine stat-card filters with panel filters
    let sevArr: string[] | undefined;
    if (filters.severity.length > 0) {
      sevArr = filters.severity;
    } else if (severityFilter === 'medium') {
      sevArr = ['medium', 'low', 'info'];
    } else if (severityFilter !== 'all') {
      sevArr = [severityFilter];
    }

    let stateArr: string[] | undefined;
    if (filters.state.length > 0) {
      stateArr = filters.state;
    } else if (stateFilter !== 'all') {
      stateArr = [stateFilter];
    }

    let result = filterAlerts(alerts, {
      severity: sevArr,
      state: stateArr,
      labels: Object.keys(filters.labels).length > 0 ? filters.labels : undefined,
      search: searchQuery || undefined,
    });

    // Apply backend filter separately (not in core filterAlerts)
    if (filters.backend.length > 0) {
      result = result.filter((a) => filters.backend.includes(a.datasourceType));
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'startTime')
        cmp = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'severity') {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        cmp = (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [alerts, searchQuery, severityFilter, stateFilter, filters, sortField, sortDirection]);

  // Severity counts for stat cards — derived from filtered set
  const severityCounts = useMemo(
    () => countBy(filteredAlerts, (a) => a.severity),
    [filteredAlerts]
  );
  const activeCount = useMemo(
    () => filteredAlerts.filter((a) => a.state === 'active').length,
    [filteredAlerts]
  );
  const isFiltered =
    activeFilterCount > 0 ||
    searchQuery !== '' ||
    severityFilter !== 'all' ||
    stateFilter !== 'all';

  // Reset to first page when filters change
  useEffect(() => {
    setPageIndex(0);
  }, [filteredAlerts.length]);

  const paginatedAlerts = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, pageIndex, pageSize]);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      totalItemCount: filteredAlerts.length,
      pageSizeOptions: [10, 20, 50, 100],
    }),
    [pageIndex, pageSize, filteredAlerts.length]
  );

  const onTableSort = (col: { field: string; direction: 'asc' | 'desc' }) => {
    setSortField(col.field);
    setSortDirection(col.direction);
  };

  const clearAllFilters = () => {
    setFilters(emptyAlertFilters());
    setSeverityFilter('all');
    setStateFilter('all');
    setSearchQuery('');
  };

  const updateFilter = <K extends keyof AlertFilterState>(key: K, value: AlertFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (key === 'severity') setSeverityFilter('all');
    if (key === 'state') setStateFilter('all');
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    setFilters((prev) => ({ ...prev, labels: { ...prev.labels, [key]: values } }));
  };

  const toggleFacetCollapse = (id: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    colorMap?: Record<string, string>
  ) => {
    const isCollapsed = collapsedFacets.has(id);
    const numActive = selected.length;
    return (
      <div key={id} style={{ marginBottom: 12 }}>
        <EuiFlexGroup
          gutterSize="xs"
          alignItems="center"
          responsive={false}
          style={{ cursor: 'pointer', marginBottom: 4 }}
          onClick={() => toggleFacetCollapse(id)}
        >
          <EuiFlexItem grow={false}>
            <EuiIcon type={isCollapsed ? 'arrowRight' : 'arrowDown'} size="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="xs">
              <strong>{label}</strong>
            </EuiText>
          </EuiFlexItem>
          {numActive > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="primary">{numActive}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        {!isCollapsed && (
          <div style={{ paddingLeft: 4 }}>
            {options.map((opt) => {
              const isActive = selected.includes(opt);
              const count = counts[opt] || 0;
              const labelContent = (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    width: '100%',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                    {colorMap && (
                      <EuiHealth color={colorMap[opt] || 'subdued'} style={{ marginRight: 0 }} />
                    )}
                    <span
                      style={{
                        fontSize: '12px',
                        lineHeight: '18px',
                        textTransform: 'capitalize' as const,
                      }}
                    >
                      {opt}
                    </span>
                  </span>
                  <span style={{ fontSize: '12px', lineHeight: '18px', color: '#69707D' }}>
                    ({count})
                  </span>
                </span>
              );
              return (
                <div key={opt} style={{ marginBottom: 2 }}>
                  <EuiCheckbox
                    id={`alert-${id}-${opt}`}
                    label={labelContent}
                    checked={isActive}
                    onChange={() => {
                      if (isActive) onChange(selected.filter((s) => s !== opt));
                      else onChange([...selected, opt]);
                    }}
                    compressed
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Table columns
  const columns = [
    {
      field: 'severity',
      name: 'Sev',
      width: '60px',
      sortable: true,
      render: (s: string) => (
        <EuiToolTip content={s}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: SEVERITY_COLORS[s],
              display: 'inline-block',
            }}
          />
        </EuiToolTip>
      ),
    },
    {
      field: 'name',
      name: 'Alert',
      sortable: true,
      truncateText: true,
      render: (name: string, alert: UnifiedAlert) => (
        <EuiButtonEmpty
          size="xs"
          flush="left"
          onClick={() => onViewDetail(alert)}
          style={{ fontWeight: 500 }}
        >
          {name}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'state',
      name: 'State',
      width: '120px',
      sortable: true,
      render: (state: string) => (
        <EuiHealth color={STATE_HEALTH[state] || 'subdued'}>{state}</EuiHealth>
      ),
    },
    {
      field: 'datasourceType',
      name: 'Source',
      width: '100px',
      render: (t: string) => (
        <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>
      ),
    },
    {
      field: 'message',
      name: 'Message',
      truncateText: true,
      render: (msg: string) => (
        <EuiText size="xs" color="subdued">
          {msg || '—'}
        </EuiText>
      ),
    },
    {
      field: 'startTime',
      name: 'Started',
      width: '150px',
      sortable: true,
      render: (ts: string) => (
        <EuiText size="xs">{ts ? new Date(ts).toLocaleString() : '—'}</EuiText>
      ),
    },
    {
      name: 'Actions',
      width: '120px',
      render: (alert: UnifiedAlert) => (
        <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiToolTip content="View details">
              <EuiButtonIcon
                iconType="inspect"
                aria-label="View"
                size="s"
                onClick={() => onViewDetail(alert)}
              />
            </EuiToolTip>
          </EuiFlexItem>
          {alert.state === 'active' && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Acknowledge">
                <EuiButtonIcon
                  iconType="check"
                  aria-label="Acknowledge"
                  size="s"
                  color="primary"
                  onClick={() => onAcknowledge(alert.id)}
                />
              </EuiToolTip>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Silence">
              <EuiButtonIcon
                iconType="bellSlash"
                aria-label="Silence"
                size="s"
                onClick={() => onSilence(alert.id)}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  if (!loading && alerts.length === 0) {
    return (
      <div>
        <EuiEmptyPrompt
          title={<h2>No Active Alerts</h2>}
          body={<p>All systems operating normally.</p>}
          iconType="checkInCircleFilled"
          iconColor="success"
        />
      </div>
    );
  }

  return (
    <EuiResizableContainer style={{ height: 'calc(100vh - 180px)' }}>
      {(EuiResizablePanel, EuiResizableButton) => (
        <>
          <EuiResizablePanel
            id="alerts-filters-panel"
            initialSize={15}
            minSize="180px"
            mode={['collapsible', { position: 'top' }]}
            onToggleCollapsed={() => setIsFilterPanelCollapsed(!isFilterPanelCollapsed)}
            paddingSize="none"
            style={{ overflow: 'hidden', paddingRight: '4px' }}
          >
            <EuiPanel
              paddingSize="s"
              hasBorder
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ flex: 1, overflow: 'auto' }}>
                <EuiFlexGroup
                  gutterSize="xs"
                  alignItems="center"
                  responsive={false}
                  justifyContent="spaceBetween"
                >
                  <EuiFlexItem>
                    <EuiText size="xs">
                      <strong>Filters</strong>
                    </EuiText>
                  </EuiFlexItem>
                  {activeFilterCount > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty size="xs" onClick={clearAllFilters} flush="right">
                        Clear ({activeFilterCount})
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                <EuiSpacer size="s" />

                {/* Datasource filter */}
                {renderFacetGroup(
                  'datasource',
                  'Datasource',
                  datasourceEntries.map((e) => e.label),
                  selectedDsIds
                    .map((id) => datasourceEntries.find((e) => e.id === id)?.label || '')
                    .filter(Boolean),
                  (labels) => {
                    const ids = labels
                      .map((l) => datasourceEntries.find((e) => e.label === l)?.id)
                      .filter(Boolean) as string[];
                    onDatasourceChange(ids);
                  },
                  countBy(
                    datasourceEntries.filter(
                      (e) => selectedDsIds.includes(e.id) || selectedDsIds.length === 0
                    ),
                    (e) => e.label
                  )
                )}

                {renderFacetGroup(
                  'severity',
                  'Severity',
                  uniqueSeverities,
                  filters.severity,
                  (v) => updateFilter('severity', v),
                  facetCounts.counts.severity,
                  SEVERITY_COLORS
                )}
                {renderFacetGroup(
                  'state',
                  'State',
                  uniqueStates,
                  filters.state,
                  (v) => updateFilter('state', v),
                  facetCounts.counts.state,
                  STATE_COLORS
                )}
                {renderFacetGroup(
                  'backend',
                  'Backend',
                  uniqueBackends,
                  filters.backend,
                  (v) => updateFilter('backend', v),
                  facetCounts.counts.backend
                )}

                {labelKeys.length > 0 && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
                      <strong>Labels</strong>
                    </EuiText>
                    {labelKeys.map((key) =>
                      renderFacetGroup(
                        `label:${key}`,
                        key,
                        collectAlertLabelValues(alerts, key),
                        filters.labels[key] || [],
                        (v) => updateLabelFilter(key, v),
                        facetCounts.labelCounts[key] || {}
                      )
                    )}
                  </>
                )}
              </div>
            </EuiPanel>
          </EuiResizablePanel>

          <EuiResizableButton />

          <EuiResizablePanel
            initialSize={85}
            minSize="400px"
            mode="main"
            paddingSize="none"
            style={{ paddingLeft: '4px', overflow: 'auto' }}
          >
            {/* ---- Summary Stat Cards ---- */}
            <EuiFlexGroup gutterSize="m" responsive={true}>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  hasBorder
                  onClick={() => {
                    setSeverityFilter('all');
                    setStateFilter('all');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    outline:
                      severityFilter === 'all' &&
                      stateFilter === 'all' &&
                      filters.severity.length === 0 &&
                      filters.state.length === 0
                        ? '2px solid #006BB4'
                        : 'none',
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={filteredAlerts.length}
                    description={isFiltered ? `of ${alerts.length} Total Alerts` : 'Total Alerts'}
                    titleSize="m"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  hasBorder
                  onClick={() => {
                    setSeverityFilter('all');
                    setStateFilter(stateFilter === 'active' ? 'all' : 'active');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    outline: stateFilter === 'active' ? '2px solid #BD271E' : 'none',
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={activeCount}
                    description="Active"
                    titleColor="danger"
                    titleSize="m"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  hasBorder
                  onClick={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    outline: severityFilter === 'critical' ? '2px solid #BD271E' : 'none',
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={severityCounts['critical'] || 0}
                    description="Critical"
                    titleColor="danger"
                    titleSize="m"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  hasBorder
                  onClick={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'high' ? 'all' : 'high');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    outline: severityFilter === 'high' ? '2px solid #F5A700' : 'none',
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={severityCounts['high'] || 0}
                    description="High"
                    titleColor="default"
                    titleSize="m"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  hasBorder
                  onClick={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    outline: severityFilter === 'medium' ? '2px solid #006BB4' : 'none',
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={
                      (severityCounts['medium'] || 0) +
                      (severityCounts['low'] || 0) +
                      (severityCounts['info'] || 0)
                    }
                    description="Medium / Low"
                    titleSize="m"
                  />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {/* ---- Visualization Row ---- */}
            <EuiFlexGroup gutterSize="m" responsive={true}>
              <EuiFlexItem grow={3}>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h3>Alert Timeline (24h)</h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <AlertTimeline alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h3>By Severity</h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <SeverityDonut alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {/* ---- State + Service Row ---- */}
            <EuiFlexGroup gutterSize="m" responsive={true}>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h3>By State</h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <StateBreakdown alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h3>By Source</h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <AlertsByDatasource alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h3>By Monitor</h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <AlertsByMonitor alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="l" />

            {/* ---- Search + Table ---- */}
            <EuiPanel paddingSize="m" hasBorder>
              <EuiTitle size="xs">
                <h3>All Alerts</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiFieldSearch
                placeholder="Search alerts by name, message, or label..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                isClearable
                fullWidth
                aria-label="Search alerts"
              />
              <EuiSpacer size="s" />
              <EuiText size="s">
                <strong>{filteredAlerts.length}</strong> alerts
                {activeFilterCount > 0 && (
                  <span>
                    {' '}
                    · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                  </span>
                )}
              </EuiText>
              <EuiSpacer size="s" />
              <EuiBasicTable
                items={paginatedAlerts}
                columns={columns}
                loading={loading}
                pagination={pagination}
                sorting={{
                  sort: { field: sortField as any, direction: sortDirection },
                }}
                onChange={({ sort, page }: any) => {
                  if (sort) onTableSort(sort);
                  if (page) {
                    setPageIndex(page.index);
                    setPageSize(page.size);
                  }
                }}
                noItemsMessage={
                  searchQuery ||
                  activeFilterCount > 0 ||
                  severityFilter !== 'all' ||
                  stateFilter !== 'all'
                    ? 'No alerts match your filters'
                    : 'No alerts'
                }
              />
            </EuiPanel>
          </EuiResizablePanel>
        </>
      )}
    </EuiResizableContainer>
  );
};
