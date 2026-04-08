/* Copyright OpenSearch Contributors, SPDX-License-Identifier: Apache-2.0 */

/**
 * SLO Listing -- follows the same EuiResizableContainer + EuiBasicTable
 * pattern used by MonitorsTable (Rules tab) and AlertsDashboard (Alerts tab).
 *
 * Structural alignment with Rules tab:
 *  - Full-height EuiResizableContainer with filter + main panels
 *  - Filter panel: EuiPanel hasBorder, "Filters" header, collapsible facet
 *    groups with chevrons, EuiCheckbox compressed, count badges
 *  - Main panel: EuiPanel hasBorder wrapping Create button, search bar,
 *    stat cards, count row, and table
 *  - Single-line name column with truncation (operation in detail flyout)
 *  - Matching TablePagination from shared pattern
 *
 * ECharts visualizations follow the AlertsDashboard pattern:
 *  - Error Budget Burndown (full-width horizontal bar)
 *  - SLO Status Donut (matches SeverityDonut)
 *  - By SLI Type bar chart (matches AlertsByDatasource)
 *  - By Service bar chart (matches AlertsByMonitor)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiBadge,
  EuiBasicTable,
  EuiText,
  EuiButtonIcon,
  EuiToolTip,
  EuiFieldSearch,
  EuiEmptyPrompt,
  EuiButton,
  EuiCheckbox,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiPopover,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiHealth,
  EuiIcon,
  EuiResizableContainer,
  EuiButtonEmpty,
  EuiStat,
  EuiTitle,
} from '@elastic/eui';
import { TablePagination } from './table_pagination';
import {
  SLO_STATUS_COLORS,
  SLI_TYPE_LABELS,
  formatPercentage,
  formatErrorBudget,
  errorBudgetColor,
  attainmentColor,
  PAGINATION_BUTTON_STYLE,
  PAGINATION_BUTTON_HOVER_CLASS,
  PAGINATION_CSS,
} from './shared_constants';
import type {
  SloSummary,
  SloDefinition,
  SloStatus,
  SliType,
  SloLiveStatus,
  GeneratedRule,
} from '../../core/slo_types';
import { CreateSloWizard } from './create_slo_wizard';
import { SloDetailFlyout } from './slo_detail_flyout';
import { EchartsRender } from './echarts_render';

// ============================================================================
// Types
// ============================================================================

/** Minimal API surface SLO components need from AlarmsApiClient. */
export interface SloApiClient {
  listSlos: () => Promise<{
    results: SloSummary[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }>;
  getSlo: (id: string) => Promise<SloDefinition>;
  createSlo: (data: any) => Promise<SloDefinition>;
  deleteSlo: (id: string) => Promise<{ deleted: boolean; generatedRuleNames: string[] }>;
}

interface SloListingProps {
  apiClient: SloApiClient;
}

interface SloApiResponse {
  results: SloSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Table CSS (injected once, not per render)
// ============================================================================

const SLO_TABLE_CSS = `
  .slo-table-wrapper .euiTable { table-layout: auto; min-width: 100%; }
  .slo-table-wrapper .euiTableCellContent { white-space: nowrap; }
`;

// ============================================================================
// Color constants (from shared_constants.ts — explicit hex values for charts)
// ============================================================================

const CHART_COLORS = {
  breached: '#BD271E',
  warning: '#F5A700',
  ok: '#017D73',
  noData: '#98A2B3',
  primary: '#006BB4',
  textDark: '#343741',
  textLight: '#69707D',
  textSubdued: '#98A2B3',
  gridLine: '#EDF0F5',
} as const;

// ============================================================================
// Status display map (mirrors STATUS_COLORS / HEALTH_COLORS in monitors_table)
// ============================================================================

const STATUS_HEALTH_COLORS: Record<string, string> = {
  breached: 'danger',
  warning: 'warning',
  ok: 'success',
  no_data: 'subdued',
};

const STATUS_STAT_TITLE_COLORS: Record<string, string> = {
  breached: 'danger',
  warning: 'default',
  ok: 'default',
  no_data: 'subdued',
};

// ============================================================================
// Custom Pagination (same pattern as monitors_table / alerts_dashboard)
// ============================================================================

// ============================================================================
// ExpandedRuleRow -- fetches full SLO and renders generated rules
// ============================================================================

const ExpandedRuleRow: React.FC<{ sloId: string; apiClient: SloApiClient }> = ({
  sloId,
  apiClient,
}) => {
  const [rules, setRules] = useState<GeneratedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.getSlo(sloId);
        if (cancelled) return;
        const { generateSloRuleGroup } = await import('../../core/slo_promql_generator');
        const ruleGroup = generateSloRuleGroup(data as any);
        setRules(ruleGroup.rules);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rules');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sloId, apiClient]);

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', background: '#FAFBFD' }}>
        <EuiLoadingSpinner size="s" /> Loading rules...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px 16px', background: '#FAFBFD' }}>
        <EuiText size="xs" color="danger">
          {error}
        </EuiText>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div style={{ padding: '12px 16px', background: '#FAFBFD' }}>
        <EuiText size="xs" color="subdued">
          No generated rules found.
        </EuiText>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 16px 12px', background: '#FAFBFD' }}>
      <EuiText size="xs">
        <strong>Generated Rules ({rules.length})</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #D3DAE6' }}>
              <th
                style={{
                  padding: '4px 8px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#69707D',
                  width: 80,
                }}
              >
                Type
              </th>
              <th
                style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#69707D' }}
              >
                Rule Name
              </th>
              <th
                style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#69707D' }}
              >
                Description
              </th>
              <th
                style={{
                  padding: '4px 8px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#69707D',
                  width: 60,
                }}
              >
                Health
              </th>
              <th
                style={{
                  padding: '4px 8px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#69707D',
                  width: 50,
                }}
              >
                For
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, idx) => (
              <tr key={`${rule.type}-${rule.name}`} style={{ borderBottom: '1px solid #EDF0F5' }}>
                <td style={{ padding: '4px 8px' }}>
                  <EuiBadge
                    color={
                      rule.type === 'alerting'
                        ? rule.labels?.severity === 'critical'
                          ? 'danger'
                          : 'warning'
                        : 'hollow'
                    }
                  >
                    {rule.type}
                  </EuiBadge>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <EuiToolTip content={rule.name}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'default' }}>
                      {rule.name}
                    </span>
                  </EuiToolTip>
                </td>
                <td style={{ padding: '4px 8px', color: '#69707D' }}>{rule.description}</td>
                <td style={{ padding: '4px 8px' }}>
                  <EuiHealth color="success">ok</EuiHealth>
                </td>
                <td style={{ padding: '4px 8px', color: '#69707D' }}>{rule.for || '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// Error Budget Burndown — horizontal bar chart (full width, THE key SLO chart)
// ============================================================================

const ErrorBudgetBurndown: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
  const spec = useMemo(() => {
    if (slos.length === 0) return null;

    // Sort by error budget ascending so the most critical are at the top visually
    const sorted = [...slos]
      .filter((s) => s.status && s.status.status !== 'no_data')
      .sort((a, b) => a.status.errorBudgetRemaining - b.status.errorBudgetRemaining);

    // Limit to top 15 SLOs for readability
    const display = sorted.slice(0, 15);
    if (display.length === 0) return null;

    // Reversed so top item in chart = most critical (ECharts y-axis bottom->top)
    const names = display.map((s) => s.name).reverse();
    const values = display.map((s) => Math.round(s.status.errorBudgetRemaining * 100)).reverse();

    const barColors = display
      .map((s) => {
        const budget = s.status.errorBudgetRemaining;
        if (budget <= 0) return CHART_COLORS.breached;
        if (budget < 0.3) return CHART_COLORS.warning;
        return CHART_COLORS.ok;
      })
      .reverse();

    // Auto-scale x-axis: pad 15% beyond the data range, always include 0% and warning line
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 30); // at least show warning threshold
    const range = maxVal - minVal || 100;
    const xMin = Math.min(minVal - range * 0.15, -10);
    const xMax = Math.min(Math.max(maxVal + range * 0.2, 40), 110); // cap at 110

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const sloData = display[display.length - 1 - (p.dataIndex ?? 0)];
          const target = sloData ? `${(sloData.target * 100).toFixed(2)}%` : '';
          return `<b>${p.name}</b><br/>Error Budget Remaining: <b>${p.value}%</b>${target ? `<br/>Target: ${target}` : ''}`;
        },
      },
      grid: {
        top: 8,
        right: 50,
        bottom: 25,
        left: 180,
      },
      xAxis: {
        type: 'value' as const,
        min: Math.round(xMin),
        max: Math.round(xMax),
        axisLabel: {
          fontSize: 10,
          color: CHART_COLORS.textLight,
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: CHART_COLORS.gridLine, type: 'dashed' as const } },
        axisLine: { lineStyle: { color: CHART_COLORS.gridLine } },
      },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 11,
          color: CHART_COLORS.textDark,
          width: 170,
          overflow: 'truncate' as const,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: barColors[i],
              borderRadius: [0, 3, 3, 0],
            },
          })),
          barMaxWidth: 18,
          barMinWidth: 8,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: CHART_COLORS.textDark,
            formatter: '{c}%',
          },
        },
        // Reference lines (invisible series)
        {
          type: 'bar' as const,
          data: [] as number[],
          markLine: {
            silent: true,
            symbol: 'none' as const,
            data: [
              {
                xAxis: 0,
                lineStyle: { color: CHART_COLORS.breached, width: 2, type: 'dashed' as const },
                label: { show: false },
              },
              ...(xMax >= 30
                ? [
                    {
                      xAxis: 30,
                      lineStyle: { color: CHART_COLORS.warning, width: 1, type: 'dashed' as const },
                      label: { show: false },
                    },
                  ]
                : []),
            ],
          },
        },
      ],
    };
  }, [slos]);

  if (!spec) {
    return (
      <EuiText size="s" color="subdued" textAlign="center">
        No error budget data available
      </EuiText>
    );
  }

  const barCount = slos.filter((s) => s.status && s.status.status !== 'no_data').length;
  const displayCount = Math.min(barCount, 15);
  return <EchartsRender spec={spec} height={Math.max(120, displayCount * 32 + 50)} />;
};

// ============================================================================
// SLO Status Donut — pie/donut chart (matches SeverityDonut pattern)
// ============================================================================

const SloStatusDonut: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
  const spec = useMemo(() => {
    const total = slos.length;
    if (total === 0) return null;

    const counts: Record<string, number> = { breached: 0, warning: 0, ok: 0, no_data: 0 };
    for (const s of slos) {
      counts[s.status.status] = (counts[s.status.status] || 0) + 1;
    }

    const statusOrder: Array<{ key: string; label: string; color: string }> = [
      { key: 'breached', label: 'Breached', color: CHART_COLORS.breached },
      { key: 'warning', label: 'Warning', color: CHART_COLORS.warning },
      { key: 'ok', label: 'Ok', color: CHART_COLORS.ok },
      { key: 'no_data', label: 'No data', color: CHART_COLORS.noData },
    ];

    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie' as const,
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          data: statusOrder
            .filter((s) => (counts[s.key] || 0) > 0)
            .map((s) => ({
              value: counts[s.key] || 0,
              name: s.label,
              itemStyle: { color: s.color },
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
            fill: CHART_COLORS.textDark,
            textAlign: 'center' as const,
          },
        },
        {
          type: 'text' as const,
          left: 'center',
          top: '52%',
          style: {
            text: 'SLOs',
            fontSize: 11,
            fill: CHART_COLORS.textSubdued,
            textAlign: 'center' as const,
          },
        },
      ],
    };
  }, [slos]);

  if (slos.length === 0) {
    return (
      <EuiText size="s" color="subdued" textAlign="center">
        No SLOs
      </EuiText>
    );
  }

  return <EchartsRender spec={spec!} height={180} />;
};

// ============================================================================
// SLOs by SLI Type — horizontal bar chart (matches AlertsByDatasource)
// ============================================================================

const SlosBySliType: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
  const spec = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const s of slos) {
      const label = SLI_TYPE_LABELS[s.sliType] || s.sliType;
      groups[label] = (groups[label] || 0) + 1;
    }
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
          color: CHART_COLORS.textDark,
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
          itemStyle: { color: CHART_COLORS.primary, borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: CHART_COLORS.textDark,
          },
        },
      ],
    };
  }, [slos]);

  if (!spec) {
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );
  }

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
};

// ============================================================================
// SLOs by Service — horizontal bar chart (matches AlertsByMonitor)
// ============================================================================

const SlosByService: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
  const spec = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const s of slos) {
      groups[s.serviceName] = (groups[s.serviceName] || 0) + 1;
    }
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
          color: CHART_COLORS.textDark,
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
          itemStyle: { color: CHART_COLORS.primary, borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: CHART_COLORS.textDark,
          },
        },
      ],
    };
  }, [slos]);

  if (!spec) {
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );
  }

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
};

// ============================================================================
// SloListing -- main component
// ============================================================================

const SloListing: React.FC<SloListingProps> = ({ apiClient }) => {
  // State
  const [slos, setSlos] = useState<SloSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<SloStatus[]>([]);
  const [selectedSliTypes, setSelectedSliTypes] = useState<SliType[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDatasources, setSelectedDatasources] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedSloId, setSelectedSloId] = useState<string | null>(null);
  const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(false);

  // Collapsible facet sections state (same pattern as monitors_table)
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());
  const toggleFacetCollapse = (id: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stat card filter
  const [statFilter, setStatFilter] = useState<string | null>(null);

  // Fetch SLOs
  const fetchSlos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp: SloApiResponse = await apiClient.listSlos();
      setSlos(resp.results || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load SLOs');
      setSlos([]);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchSlos();
  }, [fetchSlos]);

  // Derived filter values
  const allServices = useMemo(() => [...new Set(slos.map((s) => s.serviceName))].sort(), [slos]);
  const allSliTypes = useMemo(() => [...new Set(slos.map((s) => s.sliType))].sort(), [slos]);
  const allDatasources = useMemo(
    () => [...new Set(slos.map((s) => s.datasourceId))].sort(),
    [slos]
  );

  // Filter + search
  const filteredSlos = useMemo(() => {
    let result = slos;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.serviceName.toLowerCase().includes(q) ||
          s.operationName.toLowerCase().includes(q)
      );
    }
    if (selectedStatuses.length > 0) {
      result = result.filter((s) => selectedStatuses.includes(s.status.status));
    }
    if (selectedSliTypes.length > 0) {
      result = result.filter((s) => selectedSliTypes.includes(s.sliType));
    }
    if (selectedServices.length > 0) {
      result = result.filter((s) => selectedServices.includes(s.serviceName));
    }
    if (selectedDatasources.length > 0) {
      result = result.filter((s) => selectedDatasources.includes(s.datasourceId));
    }
    // Stat card filter
    if (statFilter && statFilter !== 'all') {
      result = result.filter((s) => s.status.status === statFilter);
    }
    return result;
  }, [
    slos,
    searchQuery,
    selectedStatuses,
    selectedSliTypes,
    selectedServices,
    selectedDatasources,
    statFilter,
  ]);

  // Pagination
  const paginatedSlos = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredSlos.slice(start, start + pageSize);
  }, [filteredSlos, pageIndex, pageSize]);

  // Status summary
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { breached: 0, warning: 0, ok: 0, no_data: 0 };
    for (const s of slos) counts[s.status.status] = (counts[s.status.status] || 0) + 1;
    return counts;
  }, [slos]);

  // Facet counts (for filters)
  const facetCounts = useMemo(() => {
    const sliType: Record<string, number> = {};
    const status: Record<string, number> = {};
    const service: Record<string, number> = {};
    const datasource: Record<string, number> = {};
    for (const s of slos) {
      sliType[s.sliType] = (sliType[s.sliType] || 0) + 1;
      status[s.status.status] = (status[s.status.status] || 0) + 1;
      service[s.serviceName] = (service[s.serviceName] || 0) + 1;
      datasource[s.datasourceId] = (datasource[s.datasourceId] || 0) + 1;
    }
    return { sliType, status, service, datasource };
  }, [slos]);

  // Active filter count
  const activeFilterCount =
    selectedStatuses.length +
    selectedSliTypes.length +
    selectedServices.length +
    selectedDatasources.length;

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedStatuses([]);
    setSelectedSliTypes([]);
    setSelectedServices([]);
    setSelectedDatasources([]);
    setStatFilter(null);
  };

  // Expanded row map
  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const slo of paginatedSlos) {
      if (expandedRowIds.has(slo.id)) {
        map[slo.id] = <ExpandedRuleRow sloId={slo.id} apiClient={apiClient} />;
      }
    }
    return map;
  }, [paginatedSlos, expandedRowIds, apiClient]);

  // Actions
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiClient.deleteSlo(id);
        fetchSlos();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete SLO';
        setError(message);
      }
    },
    [apiClient, fetchSlos]
  );

  // ---- Columns (matching Rules table pattern -- single-line names) ----
  const columns = useMemo(
    () => [
      {
        field: 'id',
        name: '',
        width: '28px',
        render: (_: string, slo: SloSummary) => (
          <EuiButtonIcon
            aria-label={expandedRowIds.has(slo.id) ? 'Collapse' : 'Expand'}
            iconType={expandedRowIds.has(slo.id) ? 'arrowDown' : 'arrowRight'}
            onClick={() => {
              const next = new Set(expandedRowIds);
              next.has(slo.id) ? next.delete(slo.id) : next.add(slo.id);
              setExpandedRowIds(next);
            }}
            size="s"
            color="text"
          />
        ),
      },
      {
        field: 'name',
        name: 'Name',
        sortable: true,
        truncateText: true,
        render: (name: string, slo: SloSummary) => (
          <span
            role="button"
            tabIndex={0}
            style={{
              fontWeight: 500,
              color: '#006BB4',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
            onClick={() => setSelectedSloId(slo.id)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedSloId(slo.id);
              }
            }}
            aria-label={`View details for ${name}`}
            title={name}
          >
            {name}
          </span>
        ),
      },
      {
        field: 'status',
        name: 'Status',
        sortable: true,
        width: '100px',
        render: (status: SloLiveStatus) => (
          <EuiHealth color={STATUS_HEALTH_COLORS[status.status] || 'subdued'}>
            {status.status}
          </EuiHealth>
        ),
      },
      {
        field: 'sliType',
        name: 'Type',
        sortable: true,
        width: '120px',
        render: (sliType: SliType) => (
          <EuiBadge color="hollow">{SLI_TYPE_LABELS[sliType] || sliType}</EuiBadge>
        ),
      },
      {
        field: 'status',
        name: 'Attainment',
        width: '90px',
        render: (status: SloLiveStatus, slo: SloSummary) => {
          if (!status || status.attainment === 0)
            return <span style={{ color: '#98A2B3' }}>{'\u2014'}</span>;
          const color = attainmentColor(status.attainment, slo.target);
          return (
            <span style={{ fontWeight: 600, color }}>{formatPercentage(status.attainment, 3)}</span>
          );
        },
      },
      {
        field: 'target',
        name: 'Goal',
        width: '60px',
        render: (target: number) => formatPercentage(target, 2),
      },
      {
        field: 'status',
        name: 'Budget',
        width: '130px',
        render: (status: SloLiveStatus) => {
          if (!status) return <span style={{ color: '#98A2B3' }}>{'\u2014'}</span>;
          const budget = status.errorBudgetRemaining;
          const color = errorBudgetColor(budget);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <div
                style={{
                  width: 50,
                  height: 6,
                  background: '#EDF0F5',
                  borderRadius: 3,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, budget * 100))}%`,
                    background: color,
                    borderRadius: 3,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>
                {formatErrorBudget(budget)}
              </span>
            </div>
          );
        },
      },
      {
        field: 'serviceName',
        name: 'Service',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'status',
        name: 'Rules',
        width: '120px',
        render: (status: SloLiveStatus) => {
          if (!status) return <span style={{ color: '#98A2B3' }}>{'\u2014'}</span>;
          const { ruleCount, firingCount } = status;
          if (firingCount > 0) {
            return (
              <EuiBadge color="danger">
                {ruleCount} rules &middot; {firingCount} firing
              </EuiBadge>
            );
          }
          return <EuiBadge color="success">{ruleCount} rules</EuiBadge>;
        },
      },
      {
        field: 'datasourceId',
        name: 'Backend',
        width: '90px',
        render: () => <EuiBadge color="accent">prometheus</EuiBadge>,
      },
    ],
    [expandedRowIds]
  );

  // ---- Filter panel facet group renderer (mirrors monitors_table exactly) ----
  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    displayMap?: Record<string, string>,
    colorMap?: Record<string, string>
  ) => {
    const isCollapsed = collapsedFacets.has(id);
    const activeCount = selected.length;
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
          {activeCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="primary">{activeCount}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        {!isCollapsed && (
          <div style={{ paddingLeft: 4 }}>
            {options.map((opt) => {
              const isActive = selected.includes(opt);
              const count = counts[opt] || 0;
              const displayLabel = displayMap?.[opt] || opt;
              const checkboxId = `${id}-${opt}`;

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
                    <span style={{ fontSize: '12px', lineHeight: '18px' }}>{displayLabel}</span>
                  </span>
                  <span style={{ fontSize: '12px', lineHeight: '18px', color: '#69707D' }}>
                    ({count})
                  </span>
                </span>
              );

              return (
                <div key={opt} style={{ marginBottom: 2 }}>
                  <EuiCheckbox
                    id={checkboxId}
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

  // ---- Render ----
  return (
    <>
      {/* Error callout */}
      {error && (
        <>
          <EuiCallOut title="Error loading SLOs" color="danger" iconType="alert">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Full-height resizable container (same pattern as Rules tab) */}
      <EuiResizableContainer style={{ height: 'calc(100vh - 180px)' }}>
        {(EuiResizablePanel, EuiResizableButton) => (
          <>
            {/* ---- Filter Panel ---- */}
            <EuiResizablePanel
              id="slo-filters-panel"
              initialSize={20}
              minSize="200px"
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

                  {/* Datasource filter (matches Rules tab pattern) */}
                  {renderFacetGroup(
                    'datasource',
                    'Datasource',
                    allDatasources,
                    selectedDatasources,
                    (v) => setSelectedDatasources(v),
                    facetCounts.datasource
                  )}

                  {renderFacetGroup(
                    'status',
                    'Status',
                    ['breached', 'warning', 'ok', 'no_data'],
                    selectedStatuses,
                    (v) => setSelectedStatuses(v as SloStatus[]),
                    facetCounts.status,
                    { breached: 'Breached', warning: 'Warning', ok: 'Ok', no_data: 'No data' },
                    STATUS_HEALTH_COLORS
                  )}

                  {renderFacetGroup(
                    'sliType',
                    'SLI Type',
                    allSliTypes,
                    selectedSliTypes,
                    (v) => setSelectedSliTypes(v as SliType[]),
                    facetCounts.sliType,
                    SLI_TYPE_LABELS
                  )}

                  {renderFacetGroup(
                    'service',
                    'Service',
                    allServices,
                    selectedServices,
                    (v) => setSelectedServices(v),
                    facetCounts.service
                  )}
                </div>
              </EuiPanel>
            </EuiResizablePanel>

            <EuiResizableButton />

            {/* ---- Main Panel ---- */}
            <EuiResizablePanel
              initialSize={80}
              minSize="400px"
              mode="main"
              paddingSize="none"
              style={{ paddingLeft: '4px', overflow: 'auto' }}
            >
              <EuiPanel paddingSize="s" hasBorder style={{ height: '100%', overflow: 'auto' }}>
                {/* Create SLO button (inside panel like Rules tab) */}
                <div>
                  <EuiFlexGroup
                    justifyContent="flexEnd"
                    responsive={false}
                    gutterSize="s"
                    style={{ marginBottom: 8 }}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        fill
                        iconType="plusInCircle"
                        size="s"
                        onClick={() => setShowCreateWizard(true)}
                      >
                        Create SLO
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>

                  {/* Status stat cards (inside the main panel, like Alerts tab) */}
                  {/* Helper: keyboard activation for stat card panels (WCAG 2.1 role="button") */}
                  <EuiFlexGroup gutterSize="m" responsive={true}>
                    {/* Total */}
                    <EuiFlexItem>
                      <EuiPanel
                        paddingSize="m"
                        hasBorder
                        onClick={() => {
                          setStatFilter(statFilter === 'all' ? null : 'all');
                          setSelectedStatuses([]);
                        }}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          boxShadow:
                            !statFilter || statFilter === 'all' ? 'inset 0 0 0 2px #006BB4' : 'none',
                          backgroundColor:
                            !statFilter || statFilter === 'all' ? '#E6F0FF' : undefined,
                          borderRadius: 6,
                        }}
                      >
                        <EuiStat title={slos.length} description="Total SLOs" titleSize="m" />
                      </EuiPanel>
                    </EuiFlexItem>
                    {/* Breached */}
                    <EuiFlexItem>
                      <EuiPanel
                        paddingSize="m"
                        hasBorder
                        onClick={() => {
                          setStatFilter(statFilter === 'breached' ? null : 'breached');
                          setSelectedStatuses([]);
                        }}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          boxShadow: statFilter === 'breached' ? 'inset 0 0 0 2px #BD271E' : 'none',
                          backgroundColor: statFilter === 'breached' ? '#E6F0FF' : undefined,
                          borderRadius: 6,
                        }}
                      >
                        <EuiStat
                          title={statusCounts.breached || 0}
                          description="Breached"
                          titleColor="danger"
                          titleSize="m"
                        />
                        {statFilter === 'breached' && (
                          <EuiText size="xs" color="subdued">
                            <em>Filtered</em>
                          </EuiText>
                        )}
                      </EuiPanel>
                    </EuiFlexItem>
                    {/* Warning */}
                    <EuiFlexItem>
                      <EuiPanel
                        paddingSize="m"
                        hasBorder
                        onClick={() => {
                          setStatFilter(statFilter === 'warning' ? null : 'warning');
                          setSelectedStatuses([]);
                        }}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          boxShadow: statFilter === 'warning' ? 'inset 0 0 0 2px #F5A700' : 'none',
                          backgroundColor: statFilter === 'warning' ? '#E6F0FF' : undefined,
                          borderRadius: 6,
                        }}
                      >
                        <EuiStat
                          title={statusCounts.warning || 0}
                          description="Warning"
                          titleSize="m"
                        />
                        {statFilter === 'warning' && (
                          <EuiText size="xs" color="subdued">
                            <em>Filtered</em>
                          </EuiText>
                        )}
                      </EuiPanel>
                    </EuiFlexItem>
                    {/* Ok */}
                    <EuiFlexItem>
                      <EuiPanel
                        paddingSize="m"
                        hasBorder
                        onClick={() => {
                          setStatFilter(statFilter === 'ok' ? null : 'ok');
                          setSelectedStatuses([]);
                        }}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          boxShadow: statFilter === 'ok' ? 'inset 0 0 0 2px #017D73' : 'none',
                          backgroundColor: statFilter === 'ok' ? '#E6F0FF' : undefined,
                          borderRadius: 6,
                        }}
                      >
                        <EuiStat title={statusCounts.ok || 0} description="Ok" titleSize="m" />
                        {statFilter === 'ok' && (
                          <EuiText size="xs" color="subdued">
                            <em>Filtered</em>
                          </EuiText>
                        )}
                      </EuiPanel>
                    </EuiFlexItem>
                    {/* No Data */}
                    <EuiFlexItem>
                      <EuiPanel
                        paddingSize="m"
                        hasBorder
                        onClick={() => {
                          setStatFilter(statFilter === 'no_data' ? null : 'no_data');
                          setSelectedStatuses([]);
                        }}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          boxShadow: statFilter === 'no_data' ? 'inset 0 0 0 2px #98A2B3' : 'none',
                          backgroundColor: statFilter === 'no_data' ? '#E6F0FF' : undefined,
                          borderRadius: 6,
                        }}
                      >
                        <EuiStat
                          title={statusCounts.no_data || 0}
                          description="No Data"
                          titleColor="subdued"
                          titleSize="m"
                        />
                        {statFilter === 'no_data' && (
                          <EuiText size="xs" color="subdued">
                            <em>Filtered</em>
                          </EuiText>
                        )}
                      </EuiPanel>
                    </EuiFlexItem>
                  </EuiFlexGroup>

                  <EuiSpacer size="m" />

                  {/* ================================================================ */}
                  {/* ECharts Visualizations (between stat cards and search bar)       */}
                  {/* ================================================================ */}

                  {slos.length > 0 && (
                    <>
                      {/* Row 1: Error Budget Burndown — full width */}
                      <EuiPanel hasBorder paddingSize="m">
                        <EuiFlexGroup
                          justifyContent="spaceBetween"
                          alignItems="center"
                          responsive={false}
                        >
                          <EuiFlexItem grow={false}>
                            <EuiTitle size="xs">
                              <h3>Error Budget Burndown</h3>
                            </EuiTitle>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                              <EuiFlexItem grow={false}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11,
                                    color: '#69707D',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 16,
                                      height: 2,
                                      background: '#BD271E',
                                      display: 'inline-block',
                                      borderTop: '1px dashed #BD271E',
                                    }}
                                  />{' '}
                                  Budget exhausted (0%)
                                </span>
                              </EuiFlexItem>
                              <EuiFlexItem grow={false}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11,
                                    color: '#69707D',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 16,
                                      height: 2,
                                      background: '#F5A700',
                                      display: 'inline-block',
                                      borderTop: '1px dashed #F5A700',
                                    }}
                                  />{' '}
                                  Warning threshold (30%)
                                </span>
                              </EuiFlexItem>
                            </EuiFlexGroup>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                        <EuiSpacer size="s" />
                        <ErrorBudgetBurndown slos={slos} />
                      </EuiPanel>

                      <EuiSpacer size="m" />

                      {/* Row 2: Three charts side by side */}
                      <EuiFlexGroup gutterSize="m" responsive={true}>
                        {/* Chart 1: SLO Status Donut */}
                        <EuiFlexItem>
                          <EuiPanel hasBorder paddingSize="m">
                            <EuiTitle size="xs">
                              <h3>SLO Status</h3>
                            </EuiTitle>
                            <EuiSpacer size="s" />
                            <SloStatusDonut slos={slos} />
                          </EuiPanel>
                        </EuiFlexItem>

                        {/* Chart 2: By SLI Type */}
                        <EuiFlexItem>
                          <EuiPanel hasBorder paddingSize="m">
                            <EuiTitle size="xs">
                              <h3>By SLI Type</h3>
                            </EuiTitle>
                            <EuiSpacer size="s" />
                            <SlosBySliType slos={slos} />
                          </EuiPanel>
                        </EuiFlexItem>

                        {/* Chart 3: By Service */}
                        <EuiFlexItem>
                          <EuiPanel hasBorder paddingSize="m">
                            <EuiTitle size="xs">
                              <h3>By Service</h3>
                            </EuiTitle>
                            <EuiSpacer size="s" />
                            <SlosByService slos={slos} />
                          </EuiPanel>
                        </EuiFlexItem>
                      </EuiFlexGroup>

                      <EuiSpacer size="m" />
                    </>
                  )}

                  {/* Search bar (inside the bordered panel) */}
                  <EuiFieldSearch
                    placeholder="Search SLOs by name, service, operation..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPageIndex(0);
                    }}
                    isClearable
                    fullWidth
                    aria-label="Search SLOs"
                  />
                </div>

                <EuiSpacer size="s" />

                {/* Count row (matches Rules tab position) */}
                <div>
                  <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <strong>{filteredSlos.length}</strong> SLOs
                        {activeFilterCount > 0 && (
                          <span>
                            {' '}
                            &middot; {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonIcon aria-label="Refresh" iconType="refresh" onClick={fetchSlos} />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </div>

                <EuiSpacer size="s" />

                {/* Table */}
                <div className="slo-table-wrapper">
                  <style>{SLO_TABLE_CSS}</style>
                  {loading ? (
                    <EuiEmptyPrompt
                      icon={<EuiLoadingSpinner size="xl" />}
                      title={<h3>Loading SLOs...</h3>}
                    />
                  ) : paginatedSlos.length === 0 ? (
                    <EuiEmptyPrompt
                      iconType="visGauge"
                      title={<h3>No SLOs found</h3>}
                      body={
                        <p>
                          {slos.length === 0
                            ? 'Create your first SLO to start tracking service reliability.'
                            : 'No SLOs match your current search and filters.'}
                        </p>
                      }
                      actions={
                        activeFilterCount > 0 || searchQuery ? (
                          <EuiButton
                            onClick={() => {
                              clearAllFilters();
                              setSearchQuery('');
                            }}
                          >
                            Clear filters
                          </EuiButton>
                        ) : (
                          <EuiButton fill onClick={() => setShowCreateWizard(true)}>
                            Create SLO
                          </EuiButton>
                        )
                      }
                    />
                  ) : (
                    <>
                      <EuiBasicTable
                        items={paginatedSlos}
                        itemId="id"
                        columns={columns}
                        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
                        isExpandable
                        hasActions
                      />
                      {filteredSlos.length > 0 && (
                        <>
                          <EuiSpacer size="m" />
                          <TablePagination
                            pageIndex={pageIndex}
                            pageSize={pageSize}
                            totalItemCount={filteredSlos.length}
                            pageSizeOptions={[10, 20, 50]}
                            onChangePage={setPageIndex}
                            onChangePageSize={(size) => {
                              setPageSize(size);
                              setPageIndex(0);
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              </EuiPanel>
            </EuiResizablePanel>
          </>
        )}
      </EuiResizableContainer>

      {/* Create SLO Wizard */}
      {showCreateWizard && (
        <CreateSloWizard
          datasourceId={slos[0]?.datasourceId || ''}
          onClose={() => setShowCreateWizard(false)}
          onCreated={fetchSlos}
          apiClient={apiClient}
        />
      )}

      {/* SLO Detail Flyout */}
      {selectedSloId && (
        <SloDetailFlyout
          slo={slos.find((s) => s.id === selectedSloId) || null}
          onClose={() => setSelectedSloId(null)}
          apiClient={apiClient}
          onDelete={(id) => {
            handleDelete(id);
            setSelectedSloId(null);
          }}
        />
      )}
    </>
  );
};

export default SloListing;
