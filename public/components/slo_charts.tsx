/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO Charts — ECharts visualizations extracted from SloListing.
 *
 * Includes:
 *  - ErrorBudgetBurndown: horizontal bar chart of error budget remaining
 *  - SloStatusDonut: pie/donut chart of SLO status distribution
 *  - SlosBySliType: horizontal bar chart grouping SLOs by SLI type
 *  - SlosByService: horizontal bar chart grouping SLOs by service name
 */
import React, { useMemo } from 'react';
import { EuiText } from '@opensearch-project/oui';
import { EchartsRender } from './echarts_render';
import { SLI_TYPE_LABELS, escapeHtml } from './shared_constants';
import type { SloSummary } from '../../common/slo_types';

// ============================================================================
// Color constants
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
// ErrorBudgetBurndown — horizontal bar chart (full width, THE key SLO chart)
// ============================================================================

export const ErrorBudgetBurndown: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
  const spec = useMemo(() => {
    if (slos.length === 0) return null;

    const sorted = [...slos]
      .filter((s) => s.status && s.status.status !== 'no_data')
      .sort((a, b) => a.status.errorBudgetRemaining - b.status.errorBudgetRemaining);

    const display = sorted.slice(0, 15);
    if (display.length === 0) return null;

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

    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 30);
    const range = maxVal - minVal || 100;
    const xMin = Math.min(minVal - range * 0.15, -10);
    const xMax = Math.min(Math.max(maxVal + range * 0.2, 40), 110);

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (
          params:
            | { name: string; value: number; dataIndex: number }
            | Array<{ name: string; value: number; dataIndex: number }>
        ) => {
          const p = Array.isArray(params) ? params[0] : params;
          const sloData = display[display.length - 1 - (p.dataIndex ?? 0)];
          const target = sloData ? `${(sloData.target * 100).toFixed(2)}%` : '';
          return `<b>${escapeHtml(p.name)}</b><br/>Error Budget Remaining: <b>${p.value}%</b>${
            target ? `<br/>Target: ${target}` : ''
          }`;
        },
      },
      grid: { top: 8, right: 50, bottom: 25, left: 180 },
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
                      lineStyle: {
                        color: CHART_COLORS.warning,
                        width: 1,
                        type: 'dashed' as const,
                      },
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
// SloStatusDonut — pie/donut chart (matches SeverityDonut pattern)
// ============================================================================

export const SloStatusDonut: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
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
// SlosBySliType — horizontal bar chart (matches AlertsByDatasource)
// ============================================================================

export const SlosBySliType: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
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
      xAxis: { type: 'value' as const, show: false },
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
// SlosByService — horizontal bar chart (matches AlertsByMonitor)
// ============================================================================

export const SlosByService: React.FC<{ slos: SloSummary[] }> = ({ slos }) => {
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
      xAxis: { type: 'value' as const, show: false },
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
