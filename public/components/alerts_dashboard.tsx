/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Dashboard — visualization-first view of alert history
 * with summary stats, charts, and drill-down table.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  EuiPopover,
  EuiContextMenuPanel,
  EuiContextMenuItem,
} from '@opensearch-project/oui';
import { TablePagination } from './table_pagination';
import { UnifiedAlert, UnifiedAlertSeverity, UnifiedAlertState, Datasource } from '../../core';
import { filterAlerts } from '../../core/filter';
import { EchartsRender } from './echarts_render';

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
// Custom Pagination — replaces OUI's broken <a href="#"> pagination buttons
// ============================================================================

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

function formatDuration(startTime: string | number): string {
  const start = typeof startTime === 'number' ? startTime : new Date(startTime).getTime();
  const ms = Date.now() - start;
  if (ms < 60000) return '<1m';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ' + (Math.floor(ms / 60000) % 60) + 'm';
  return Math.floor(ms / 86400000) + 'd ' + (Math.floor(ms / 3600000) % 24) + 'h';
}

const DATASOURCE_DISPLAY_NAMES: Record<string, string> = {
  opensearch: 'OpenSearch',
  prometheus: 'Prometheus',
};

/** Internal label keys to hide from the filter panel */
const INTERNAL_LABEL_KEYS = new Set([
  'monitor_id',
  'datasource_id',
  '_workspace',
  'monitor_type',
  'monitor_kind',
  'trigger_id',
  'trigger_name',
]);

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
// Severity Donut Chart (ECharts)
// ============================================================================

const SeverityDonut: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const order: UnifiedAlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

  const spec = useMemo(() => {
    const counts = countBy(alerts, (a) => a.severity);
    const total = alerts.length;
    if (total === 0) return null;
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie' as const,
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          data: order
            .filter((s) => (counts[s] || 0) > 0)
            .map((s) => ({
              value: counts[s] || 0,
              name: s,
              itemStyle: { color: SEVERITY_COLORS[s] },
            })),
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' as const } },
        },
      ],
      graphic: [
        {
          type: 'text' as const,
          left: 'center',
          top: '40%',
          style: {
            text: total.toString(),
            fontSize: 24,
            fontWeight: 'bold' as const,
            fill: '#343741',
            textAlign: 'center' as const,
          },
        },
        {
          type: 'text' as const,
          left: 'center',
          top: '52%',
          style: {
            text: 'alerts',
            fontSize: 11,
            fill: '#98A2B3',
            textAlign: 'center' as const,
          },
        },
      ],
    };
  }, [alerts]);

  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued" textAlign="center">
        No alerts
      </EuiText>
    );

  return <EchartsRender spec={spec!} height={180} />;
};

// ============================================================================
// Alert Timeline — stacked bar chart by time buckets (ECharts)
// ============================================================================

const AlertTimeline: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    if (alerts.length === 0) return null;

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

    const timeLabels = buckets.map((b) => b.label);
    const severities: Array<{ key: string; color: string }> = [
      { key: 'critical', color: SEVERITY_COLORS.critical },
      { key: 'high', color: SEVERITY_COLORS.high },
      { key: 'medium', color: SEVERITY_COLORS.medium },
      { key: 'low', color: SEVERITY_COLORS.low },
      { key: 'info', color: SEVERITY_COLORS.info },
    ];

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { fontSize: 10 },
      },
      grid: { top: 10, right: 15, bottom: 36, left: 40 },
      xAxis: {
        type: 'category' as const,
        data: timeLabels,
        axisLabel: { fontSize: 9, color: '#98A2B3', interval: 1 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#EDF0F5' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9, color: '#98A2B3' },
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        minInterval: 1,
      },
      series: severities.map((s) => ({
        name: s.key,
        type: 'bar' as const,
        stack: 'severity',
        data: buckets.map((b) => (b as Record<string, number>)[s.key]),
        itemStyle: { color: s.color },
        barMaxWidth: 32,
      })),
    };
  }, [alerts]);

  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No timeline data
      </EuiText>
    );

  return <EchartsRender spec={spec!} height={160} />;
};

// ============================================================================
// State Breakdown — horizontal stacked bar (ECharts)
// ============================================================================

const StateBreakdown: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const counts = countBy(alerts, (a) => a.state);
  const order: UnifiedAlertState[] = ['active', 'pending', 'acknowledged', 'resolved', 'error'];

  const spec = useMemo(() => {
    const presentStates = order.filter((s) => (counts[s] || 0) > 0);
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { fontSize: 11 },
      },
      grid: { top: 0, right: 0, bottom: 30, left: 0 },
      xAxis: {
        type: 'value' as const,
        show: false,
      },
      yAxis: {
        type: 'category' as const,
        data: [''],
        show: false,
      },
      series: presentStates.map((s) => ({
        name: s,
        type: 'bar' as const,
        stack: 'state',
        data: [counts[s] || 0],
        itemStyle: { color: STATE_COLORS[s], borderRadius: 0 },
        barWidth: 14,
      })),
    };
  }, [alerts, counts]);

  if (alerts.length === 0)
    return (
      <div>
        <div style={{ height: 14, background: '#EDF0F5', borderRadius: 4 }} />
      </div>
    );

  return <EchartsRender spec={spec} height={60} />;
};

// ============================================================================
// Alerts by Service mini-table
// ============================================================================

/** Group alerts by datasource type (opensearch vs prometheus). */
const AlertsByDatasource: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const groups = countBy(alerts, (a) => a.datasourceType || 'unknown');
    const sorted = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (sorted.length === 0) return null;
    const names = [...sorted]
      .map(
        ([name]) => DATASOURCE_DISPLAY_NAMES[name] || name.charAt(0).toUpperCase() + name.slice(1)
      )
      .reverse();
    const values = [...sorted].map(([, count]) => count).reverse();
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      grid: { top: 4, right: 40, bottom: 4, left: 90 },
      xAxis: {
        type: 'value' as const,
        show: false,
      },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 11,
          color: '#343741',
          width: 80,
          overflow: 'truncate' as const,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          data: values,
          itemStyle: { color: '#006BB4', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: '#343741',
          },
        },
      ],
    };
  }, [alerts]);

  if (!spec)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
};

/** Group alerts by monitor name (extracted from alert name before " — "). */
const AlertsByMonitor: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const groups = countBy(alerts, (a) => {
      const dashIdx = a.name.indexOf(' — ');
      return dashIdx > 0 ? a.name.substring(0, dashIdx) : a.name;
    });
    const sorted = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (sorted.length === 0) return null;
    const names = [...sorted].map(([name]) => name).reverse();
    const values = [...sorted].map(([, count]) => count).reverse();
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      grid: { top: 4, right: 40, bottom: 4, left: 130 },
      xAxis: {
        type: 'value' as const,
        show: false,
      },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 11,
          color: '#343741',
          width: 120,
          overflow: 'truncate' as const,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          data: values,
          itemStyle: { color: '#006BB4', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: '#343741',
          },
        },
      ],
    };
  }, [alerts]);

  if (!spec)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
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

  // If the chart is entirely "unknown", show a helpful info message instead
  const allUnknown = sorted.length === 1 && sorted[0][0] === 'unknown';
  if (allUnknown) {
    return (
      <EuiText size="s" color="subdued" style={{ fontStyle: 'italic', padding: '8px 0' }}>
        Add <code>{groupKey}</code> labels to your alerts for grouping.
      </EuiText>
    );
  }

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

  // EuiBasicTable does NOT slice items internally — we must pass the correct page slice.
  const paginatedAlerts = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, pageIndex, pageSize]);

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
      width: '140px',
      sortable: true,
      render: (state: string) => (
        <EuiHealth color={STATE_HEALTH[state] || 'subdued'}>{state}</EuiHealth>
      ),
    },
    {
      field: 'datasourceType',
      name: 'Source',
      width: '130px',
      render: (t: string) => {
        const displayName =
          t === 'opensearch' ? 'OpenSearch' : t === 'prometheus' ? 'Prometheus' : t;
        return <EuiText size="xs">{displayName}</EuiText>;
      },
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
      width: '120px',
      sortable: true,
      render: (ts: string) => {
        if (!ts) return <EuiText size="xs">---</EuiText>;
        const abs = new Date(ts).toLocaleString();
        return (
          <EuiToolTip content={abs}>
            <span style={{ fontSize: 12 }}>{formatDuration(ts)} ago</span>
          </EuiToolTip>
        );
      },
    },
    {
      field: 'startTime',
      name: 'Duration',
      width: '90px',
      render: (ts: string) => <EuiText size="xs">{ts ? formatDuration(ts) : '—'}</EuiText>,
    },
    {
      name: 'Actions',
      width: '150px',
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
          {alert.state === 'active' && alert.datasourceType !== 'prometheus' && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconType="check"
                size="xs"
                color="primary"
                onClick={() => onAcknowledge(alert.id)}
              >
                Ack
              </EuiButtonEmpty>
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
            style={{ overflow: 'auto', paddingRight: '4px' }}
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
                    {labelKeys
                      .filter((key) => !INTERNAL_LABEL_KEYS.has(key))
                      .map((key) =>
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
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSeverityFilter('all');
                      setStateFilter('all');
                      setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    cursor: 'pointer',
                    boxShadow:
                      severityFilter === 'all' &&
                      stateFilter === 'all' &&
                      filters.severity.length === 0 &&
                      filters.state.length === 0
                        ? 'inset 0 0 0 2px #006BB4'
                        : 'none',
                    backgroundColor:
                      severityFilter === 'all' &&
                      stateFilter === 'all' &&
                      filters.severity.length === 0 &&
                      filters.state.length === 0
                        ? '#E6F0FF'
                        : undefined,
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
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSeverityFilter('all');
                      setStateFilter(stateFilter === 'active' ? 'all' : 'active');
                      setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    cursor: 'pointer',
                    boxShadow: stateFilter === 'active' ? 'inset 0 0 0 2px #BD271E' : 'none',
                    backgroundColor: stateFilter === 'active' ? '#E6F0FF' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={activeCount}
                    description="Active"
                    titleColor="danger"
                    titleSize="m"
                  />
                  {stateFilter === 'active' && (
                    <EuiText size="xs" color="subdued">
                      <em>Filtered</em>
                    </EuiText>
                  )}
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
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setStateFilter('all');
                      setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical');
                      setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    cursor: 'pointer',
                    boxShadow: severityFilter === 'critical' ? 'inset 0 0 0 2px #BD271E' : 'none',
                    backgroundColor: severityFilter === 'critical' ? '#E6F0FF' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={severityCounts['critical'] || 0}
                    description="Critical"
                    titleColor="danger"
                    titleSize="m"
                  />
                  {severityFilter === 'critical' && (
                    <EuiText size="xs" color="subdued">
                      <em>Filtered</em>
                    </EuiText>
                  )}
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
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setStateFilter('all');
                      setSeverityFilter(severityFilter === 'high' ? 'all' : 'high');
                      setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    cursor: 'pointer',
                    boxShadow: severityFilter === 'high' ? 'inset 0 0 0 2px #F5A700' : 'none',
                    backgroundColor: severityFilter === 'high' ? '#E6F0FF' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <EuiStat
                    title={severityCounts['high'] || 0}
                    description="High"
                    titleColor="default"
                    titleSize="m"
                  />
                  {severityFilter === 'high' && (
                    <EuiText size="xs" color="subdued">
                      <em>Filtered</em>
                    </EuiText>
                  )}
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
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setStateFilter('all');
                      setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium');
                      setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    cursor: 'pointer',
                    boxShadow: severityFilter === 'medium' ? 'inset 0 0 0 2px #006BB4' : 'none',
                    backgroundColor: severityFilter === 'medium' ? '#E6F0FF' : undefined,
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
                  {severityFilter === 'medium' && (
                    <EuiText size="xs" color="subdued">
                      <em>Filtered</em>
                    </EuiText>
                  )}
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {/* ---- Visualization Row ---- */}
            <EuiFlexGroup gutterSize="m" responsive={true}>
              <EuiFlexItem grow={3}>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h4>Alert Timeline (24h)</h4>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <AlertTimeline alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h4>By Severity</h4>
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
                    <h4>By State</h4>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <StateBreakdown alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h4>By Source</h4>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <AlertsByDatasource alerts={filteredAlerts} />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xxs">
                    <h4>By Monitor</h4>
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
                <h2>All Alerts</h2>
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
                sorting={{
                  sort: { field: sortField as any, direction: sortDirection },
                }}
                onChange={({ sort }: any) => {
                  if (sort) onTableSort(sort);
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
              {filteredAlerts.length > 0 && (
                <>
                  <EuiSpacer size="m" />
                  <TablePagination
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    totalItemCount={filteredAlerts.length}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onChangePage={setPageIndex}
                    onChangePageSize={setPageSize}
                  />
                </>
              )}
            </EuiPanel>
          </EuiResizablePanel>
        </>
      )}
    </EuiResizableContainer>
  );
};
