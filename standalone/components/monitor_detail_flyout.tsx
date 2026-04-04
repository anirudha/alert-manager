/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Detail Flyout — comprehensive view of a single monitor's
 * configuration, behavior, and impact with quick actions.
 */
import React, { useState, useEffect, useMemo } from 'react';
import * as echarts from 'echarts';
import { EchartsRender } from './echarts_render';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiHealth,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiPanel,
  EuiDescriptionList,
  EuiBasicTable,
  EuiAccordion,
  EuiToolTip,
  EuiConfirmModal,
  EuiCodeBlock,
  EuiHorizontalRule,
  EuiIcon,
} from '@opensearch-project/oui';
import {
  UnifiedRule,
  UnifiedAlertSeverity,
  MonitorStatus,
  AlertHistoryEntry,
  NotificationRouting,
  SuppressionRule,
  OSMonitor,
  OSMonitorInput,
} from '../../core';

// ============================================================================
// Color maps
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  muted: 'default',
  disabled: 'subdued',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  failing: 'danger',
  no_data: 'subdued',
};
const STATE_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
};

// ============================================================================
// SVG Line Graph for condition preview
// ============================================================================

const ConditionPreviewGraph: React.FC<{
  data: Array<{ timestamp: number; value: number }>;
  threshold?: { operator: string; value: number; unit?: string };
}> = ({ data, threshold }) => {
  if (!data || data.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No preview data available
      </EuiText>
    );

  const spec = useMemo((): echarts.EChartsOption => {
    const timestamps = data.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const values = data.map((d) => d.value);

    const series: echarts.SeriesOption[] = [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#006BB4', width: 2 },
        itemStyle: { color: '#006BB4' },
        areaStyle: { color: 'rgba(0, 107, 180, 0.08)' },
      },
    ];

    // Threshold line as a markLine
    if (threshold) {
      (series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#BD271E', type: 'dashed', width: 1.5 },
        label: {
          formatter: `${threshold.value}${threshold.unit || ''}`,
          position: 'end',
          color: '#BD271E',
          fontSize: 10,
        },
        data: [{ yAxis: threshold.value }],
      };
    }

    return {
      grid: { left: 45, right: 15, top: 15, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValue: string; value: number }>)[0];
          return `${p.axisValue}<br/>${p.value.toFixed(2)}`;
        },
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
      },
      series,
    };
  }, [data, threshold]);

  return <EchartsRender spec={spec} height={180} />;
};

// ============================================================================
// Props
// ============================================================================

export interface MonitorDetailFlyoutProps {
  monitor: UnifiedRule;
  onClose: () => void;
  onSilence: (id: string) => void;
  onDelete: (id: string) => void;
  onClone: (monitor: UnifiedRule) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const MonitorDetailFlyout: React.FC<MonitorDetailFlyoutProps> = ({
  monitor,
  onClose,
  onSilence,
  onDelete,
  onClone,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [detail, setDetail] = useState<UnifiedRule | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // Fetch full detail from the API when flyout opens
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    const dsId = monitor.datasourceId;
    const ruleId = monitor.id;
    fetch(`/api/rules/${encodeURIComponent(dsId)}/${encodeURIComponent(ruleId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monitor.datasourceId, monitor.id]);

  // Use detail data when available, fall back to summary props
  const full = detail || monitor;
  const alertHistory = (full as UnifiedRule).alertHistory ?? [];
  const conditionPreviewData = (full as UnifiedRule).conditionPreviewData ?? [];
  const notificationRouting = (full as UnifiedRule).notificationRouting ?? [];
  const suppressionRules = (full as UnifiedRule).suppressionRules ?? [];
  const description = (full as UnifiedRule).description ?? '';
  const aiSummary = (full as UnifiedRule).aiSummary ?? 'No AI summary available.';
  const evaluationInterval = full.evaluationInterval ?? '—';
  const pendingPeriod = full.pendingPeriod ?? '—';

  const isJson = (s: string) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  };
  const queryDisplay = isJson(monitor.query)
    ? JSON.stringify(JSON.parse(monitor.query), null, 2)
    : monitor.query;
  const queryLang = monitor.datasourceType === 'prometheus' ? 'promql' : 'json';

  // Detect monitor kind from raw data for type-specific rendering
  const monitorKind = monitor.labels?.monitor_kind as string | undefined;
  const rawMonitor = (full as UnifiedRule).raw as OSMonitor | undefined;
  const rawInput: OSMonitorInput | undefined =
    rawMonitor && 'inputs' in rawMonitor ? rawMonitor.inputs?.[0] : undefined;

  // Alert history columns
  const historyColumns = [
    {
      field: 'timestamp',
      name: 'Time',
      width: '180px',
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      field: 'state',
      name: 'State',
      render: (s: string) => <EuiHealth color={STATE_COLORS[s] || 'subdued'}>{s}</EuiHealth>,
    },
    { field: 'value', name: 'Value', width: '80px' },
    { field: 'message', name: 'Message', truncateText: true },
  ];

  // Notification routing columns
  const routingColumns = [
    { field: 'channel', name: 'Channel', width: '100px' },
    { field: 'destination', name: 'Destination' },
    {
      field: 'severity',
      name: 'Severities',
      width: '160px',
      render: (sevs: UnifiedAlertSeverity[] | undefined) =>
        sevs
          ? sevs.map((s) => (
              <EuiBadge key={s} color={SEVERITY_COLORS[s]}>
                {s}
              </EuiBadge>
            ))
          : 'All',
    },
    { field: 'throttle', name: 'Throttle', width: '100px', render: (t: string) => t || '—' },
  ];

  return (
    <>
      <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="monitorDetailTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem>
              <EuiTitle size="m">
                <h2 id="monitorDetailTitle">{monitor.name}</h2>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={STATUS_COLORS[monitor.status]}>{monitor.status}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={SEVERITY_COLORS[monitor.severity]}>{monitor.severity}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth color={HEALTH_COLORS[monitor.healthStatus]}>
                    {monitor.healthStatus}
                  </EuiHealth>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {/* Quick actions */}
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Edit monitor (placeholder)">
                <EuiButtonEmpty size="s" iconType="pencil" isDisabled>
                  Edit
                </EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType={monitor.status === 'muted' ? 'bell' : 'bellSlash'}
                onClick={() => onSilence(monitor.id)}
              >
                {monitor.status === 'muted' ? 'Unmute' : 'Silence'}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType="copy" onClick={() => onClone(monitor)}>
                Clone
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="trash"
                color="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {/* Description */}
          <EuiText size="s">
            <p>{description}</p>
          </EuiText>
          <EuiSpacer size="m" />

          {/* AI Summary */}
          <EuiAccordion
            id="aiSummary"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="compute" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <strong>AI Summary</strong>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">Beta</EuiBadge>
                </EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen={true}
            paddingSize="m"
          >
            <EuiPanel color="subdued" paddingSize="m">
              <EuiText size="s">
                <p>{aiSummary}</p>
              </EuiText>
            </EuiPanel>
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Query Definition — type-aware rendering */}
          <EuiAccordion
            id="queryDef"
            buttonContent={
              <strong>
                {monitorKind === 'cluster_metrics'
                  ? 'Cluster API Configuration'
                  : monitorKind === 'doc'
                    ? 'Document-Level Queries'
                    : 'Query Definition'}
              </strong>
            }
            initialIsOpen={true}
            paddingSize="m"
          >
            {monitorKind === 'cluster_metrics' && rawInput && 'uri' in rawInput ? (
              <>
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    { title: 'API Type', description: rawInput.uri.api_type },
                    { title: 'Path', description: rawInput.uri.path || '—' },
                    { title: 'Path Params', description: rawInput.uri.path_params || '—' },
                    { title: 'URL', description: rawInput.uri.url || '—' },
                    {
                      title: 'Clusters',
                      description: rawInput.uri.clusters?.join(', ') || 'Local cluster',
                    },
                  ]}
                />
              </>
            ) : monitorKind === 'doc' && rawInput && 'doc_level_input' in rawInput ? (
              <>
                <EuiText size="s">
                  <strong>Target indices:</strong>{' '}
                  {rawInput.doc_level_input.indices?.join(', ') || '—'}
                </EuiText>
                {rawInput.doc_level_input.description && (
                  <EuiText size="xs" color="subdued">
                    {rawInput.doc_level_input.description}
                  </EuiText>
                )}
                <EuiSpacer size="s" />
                {(rawInput.doc_level_input.queries ?? []).map((q, idx) => (
                  <EuiPanel
                    key={q.id || idx}
                    paddingSize="s"
                    color="subdued"
                    style={{ marginBottom: 8 }}
                  >
                    <EuiText size="s">
                      <strong>{q.name}</strong>
                    </EuiText>
                    <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
                      {q.query}
                    </EuiCodeBlock>
                    {q.tags?.length > 0 && (
                      <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                        {q.tags.map((tag) => (
                          <EuiFlexItem grow={false} key={tag}>
                            <EuiBadge color="hollow">{tag}</EuiBadge>
                          </EuiFlexItem>
                        ))}
                      </EuiFlexGroup>
                    )}
                  </EuiPanel>
                ))}
              </>
            ) : (
              <>
                <EuiCodeBlock language={queryLang} fontSize="s" paddingSize="m" isCopyable>
                  {queryDisplay}
                </EuiCodeBlock>
                {monitorKind === 'bucket' && (
                  <EuiText size="xs" color="subdued">
                    <em>Bucket-level monitor — triggers evaluate per aggregation bucket</em>
                  </EuiText>
                )}
              </>
            )}
            {monitor.condition && (
              <>
                <EuiSpacer size="s" />
                <EuiText size="xs" color="subdued">
                  Condition: {monitor.condition}
                </EuiText>
              </>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Conditions & Thresholds */}
          <EuiAccordion
            id="conditions"
            buttonContent={<strong>Conditions &amp; Evaluation</strong>}
            initialIsOpen={true}
            paddingSize="m"
          >
            <EuiDescriptionList
              type="column"
              compressed
              listItems={[
                { title: 'Evaluation Interval', description: evaluationInterval },
                { title: 'Pending Period', description: pendingPeriod },
                ...(monitor.firingPeriod
                  ? [{ title: 'Firing Period', description: monitor.firingPeriod }]
                  : []),
                ...(monitor.lookbackPeriod
                  ? [{ title: 'Lookback Period', description: monitor.lookbackPeriod }]
                  : []),
                ...(monitor.threshold
                  ? [
                      {
                        title: 'Threshold',
                        description: `${monitor.threshold.operator} ${monitor.threshold.value}${monitor.threshold.unit || ''}`,
                      },
                    ]
                  : []),
              ]}
            />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Labels */}
          <EuiAccordion
            id="labels"
            buttonContent={<strong>Labels</strong>}
            initialIsOpen={true}
            paddingSize="m"
          >
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {Object.entries(monitor.labels).map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow">
                    {k}: {v}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
              {Object.keys(monitor.labels).length === 0 && (
                <EuiText size="s" color="subdued">
                  No labels
                </EuiText>
              )}
            </EuiFlexGroup>
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Condition Preview Graph */}
          <EuiAccordion
            id="preview"
            buttonContent={<strong>Condition Preview</strong>}
            initialIsOpen={true}
            paddingSize="m"
          >
            <ConditionPreviewGraph data={conditionPreviewData} threshold={monitor.threshold} />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Alert History */}
          <EuiAccordion
            id="alertHistory"
            buttonContent={<strong>Recent Alert History ({alertHistory.length})</strong>}
            initialIsOpen={false}
            paddingSize="m"
          >
            <EuiBasicTable items={alertHistory} columns={historyColumns} compressed />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Notification Routing */}
          <EuiAccordion
            id="routing"
            buttonContent={<strong>Notification Routing ({notificationRouting.length})</strong>}
            initialIsOpen={false}
            paddingSize="m"
          >
            {notificationRouting.length > 0 ? (
              <EuiBasicTable items={notificationRouting} columns={routingColumns} compressed />
            ) : (
              <EuiText size="s" color="subdued">
                No notification routing configured
              </EuiText>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Suppression Rules */}
          <EuiAccordion
            id="suppression"
            buttonContent={<strong>Suppression Rules ({suppressionRules.length})</strong>}
            initialIsOpen={false}
            paddingSize="m"
          >
            {suppressionRules.length > 0 ? (
              suppressionRules.map((sr) => (
                <EuiPanel
                  key={sr.id}
                  paddingSize="s"
                  color={sr.active ? 'plain' : 'subdued'}
                  style={{ marginBottom: 8 }}
                >
                  <EuiFlexGroup alignItems="center" responsive={false}>
                    <EuiFlexItem>
                      <EuiText size="s">
                        <strong>{sr.name}</strong>
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {sr.reason}
                      </EuiText>
                      {sr.schedule && <EuiText size="xs">Schedule: {sr.schedule}</EuiText>}
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={sr.active ? 'success' : 'default'}>
                        {sr.active ? 'Active' : 'Inactive'}
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              ))
            ) : (
              <EuiText size="s" color="subdued">
                No suppression rules applied
              </EuiText>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Creation / Modification History */}
          <EuiAccordion
            id="history"
            buttonContent={<strong>History</strong>}
            initialIsOpen={false}
            paddingSize="m"
          >
            <EuiDescriptionList
              type="column"
              compressed
              listItems={[
                { title: 'Created By', description: monitor.createdBy },
                { title: 'Created At', description: new Date(monitor.createdAt).toLocaleString() },
                {
                  title: 'Last Modified',
                  description: new Date(monitor.lastModified).toLocaleString(),
                },
                {
                  title: 'Last Triggered',
                  description: monitor.lastTriggered
                    ? new Date(monitor.lastTriggered).toLocaleString()
                    : 'Never',
                },
                { title: 'Backend', description: monitor.datasourceType },
                { title: 'Datasource ID', description: monitor.datasourceId },
              ]}
            />
          </EuiAccordion>
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={onClose}>Close</EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton fill onClick={() => onSilence(monitor.id)}>
                {monitor.status === 'muted' ? 'Unmute Monitor' : 'Silence Monitor'}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <EuiConfirmModal
          title={`Delete "${monitor.name}"?`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            onDelete(monitor.id);
            setShowDeleteConfirm(false);
            onClose();
          }}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
        >
          <p>
            This will remove the monitor from the current view. This action cannot be undone within
            this session.
          </p>
        </EuiConfirmModal>
      )}
    </>
  );
};
