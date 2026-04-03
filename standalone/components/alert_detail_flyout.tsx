/**
 * Alert Detail Flyout — tabbed drill-down view for a single alert
 * with signal chart, history, configuration, and related resources.
 */
import React, { useState, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, CustomChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiHealth,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiPanel,
  EuiDescriptionList,
  EuiBasicTable,
  EuiAccordion,
  EuiCodeBlock,
  EuiIcon,
  EuiCallOut,
  EuiLink,
  EuiTab,
  EuiTabs,
  EuiEmptyPrompt,
} from '@opensearch-project/oui';
import {
  UnifiedAlert,
  UnifiedRule,
  Datasource,
  AlertHistoryEntry,
  NotificationRouting,
  SuppressionRule,
} from '../../core';

echarts.use([LineChart, CustomChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

// ============================================================================
// Color maps
// ============================================================================

const STATE_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', acknowledged: 'primary', resolved: 'success', error: 'danger',
};

const TIMELINE_COLORS: Record<string, string> = {
  active: '#BD271E',
  pending: '#F5A700',
  acknowledged: '#006BB4',
  resolved: '#017D73',
  error: '#BD271E',
};

// ============================================================================
// Props
// ============================================================================

export interface AlertDetailFlyoutProps {
  alert: UnifiedAlert;
  datasources: Datasource[];
  rules: UnifiedRule[];
  allAlerts: UnifiedAlert[];
  onClose: () => void;
  onAcknowledge: (alertId: string) => void;
  onSilence: (alertId: string) => void;
  onViewAlert?: (alert: UnifiedAlert) => void;
}

type TabId = 'overview' | 'history' | 'configuration' | 'related';

// ============================================================================
// Component
// ============================================================================

export const AlertDetailFlyout: React.FC<AlertDetailFlyoutProps> = ({
  alert, datasources, rules, allAlerts, onClose, onAcknowledge, onSilence, onViewAlert,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [timeRange, setTimeRange] = useState('6h');
  const [historyTimeRange, setHistoryTimeRange] = useState('6h');
  const [isMuted, setIsMuted] = useState(false);

  const dsName = datasources.find(d => d.id === alert.datasourceId)?.name || alert.datasourceId;
  const ds = datasources.find(d => d.id === alert.datasourceId);
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};

  // Find associated rule/monitor
  const associatedRule = useMemo(() => {
    return rules.find(r => r.name === alert.name || r.id === alert.id) || null;
  }, [rules, alert]);

  // Correlated alerts: same labels (service/team) but different alert
  const correlatedAlerts = useMemo(() => {
    const svc = alert.labels?.service;
    const team = alert.labels?.team;
    if (!svc && !team) return [];
    return allAlerts.filter(a => {
      if (a.id === alert.id) return false;
      if (svc && a.labels?.service === svc) return true;
      if (team && a.labels?.team === team) return true;
      return false;
    }).slice(0, 5);
  }, [allAlerts, alert]);

  // Threshold from rule or annotations
  const threshold = associatedRule?.threshold;
  const thresholdValue = threshold?.value ?? parseFloat(annotations.threshold || '5');
  const thresholdUnit = threshold?.unit || annotations.threshold_unit || '%';
  const thresholdOperator = threshold?.operator || '>';

  const duration = getAlertDuration(alert.startTime);
  const startFormatted = alert.startTime
    ? new Date(alert.startTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    : '—';

  const handleMuteToggle = () => {
    if (isMuted) {
      setIsMuted(false);
    } else {
      onSilence(alert.id);
      setIsMuted(true);
    }
  };

  // ---- Signal chart data (mock) ----
  const chartData = useMemo(() => {
    return generateMockSignalData(timeRange, thresholdValue);
  }, [timeRange, thresholdValue]);

  // ---- Tabs ----
  const tabs: Array<{ id: TabId; name: string }> = [
    { id: 'overview', name: 'Overview' },
    { id: 'history', name: 'History' },
    { id: 'configuration', name: 'Configuration' },
    { id: 'related', name: 'Related resources' },
  ];

  const timeRangeOptions = [
    { id: '1h', label: '1h' },
    { id: '3h', label: '3h' },
    { id: '6h', label: '6h' },
    { id: '1d', label: '1d' },
  ];

  // ---- Chart option ----
  const chartOption = useMemo(() => {
    const breachingData = chartData.map(d => (d.value > thresholdValue ? d.value : null));
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          if (!p) return '';
          const time = new Date(p.axisValue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `${time}<br/>Value: ${p.value?.toFixed(1)}${thresholdUnit}`;
        },
      },
      grid: { top: 20, right: 60, bottom: 30, left: 50 },
      xAxis: {
        type: 'category',
        data: chartData.map(d => d.timestamp),
        axisLabel: {
          formatter: (v: number) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          interval: Math.floor(chartData.length / 5),
        },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: `{value}${thresholdUnit}` },
      },
      series: [
        {
          name: 'Value',
          type: 'line',
          data: chartData.map(d => d.value),
          smooth: true,
          lineStyle: { color: '#006BB4', width: 2 },
          areaStyle: { color: 'rgba(0, 107, 180, 0.1)' },
          itemStyle: { color: '#006BB4' },
          symbol: 'none',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#BD271E', type: 'dashed', width: 1.5 },
            data: [{ yAxis: thresholdValue, label: { formatter: 'THRESHOLD', position: 'end', color: '#BD271E', fontSize: 10 } }],
          },
        },
        {
          name: 'Breaching',
          type: 'line',
          data: breachingData,
          smooth: true,
          lineStyle: { width: 0 },
          areaStyle: { color: 'rgba(189, 39, 30, 0.12)' },
          itemStyle: { color: 'transparent' },
          symbol: 'none',
          connectNulls: false,
        },
      ],
    };
  }, [chartData, thresholdValue, thresholdUnit]);

  // ---- History data (from rule or mock) ----
  const historyEntries: AlertHistoryEntry[] = associatedRule?.alertHistory?.length
    ? associatedRule.alertHistory
    : generateMockHistory(alert);

  // ---- Timeline chart option ----
  const timelineChartOption = useMemo(() => {
    return buildTimelineChartOption(historyEntries, historyTimeRange);
  }, [historyEntries, historyTimeRange]);

  // ---- Notification routing (from rule) ----
  const routingEntries: NotificationRouting[] = associatedRule?.notificationRouting || [];

  // ---- Suppression rules (from rule) ----
  const suppressionEntries: SuppressionRule[] = associatedRule?.suppressionRules || [];

  // ---- Current value (mock) ----
  const currentValue = chartData.length > 0 ? chartData[chartData.length - 1].value.toFixed(1) : '—';
  const metricLabel = annotations.metric || alert.labels?.alertname || alert.name;
  const conditionPeriods = associatedRule?.firingPeriod || '5 min';
  const actionDest = associatedRule?.notificationDestinations?.[0] || annotations.notification || '—';

  // ---- Summary & Recommendation (from annotations or generated) ----
  const summary = annotations.summary || associatedRule?.aiSummary || generateMockSummary(alert, metricLabel, thresholdValue, thresholdUnit);
  const recommendationRaw = annotations.recommendation;
  const recommendation: string[] = recommendationRaw
    ? recommendationRaw.split('\n').filter(Boolean)
    : generateMockRecommendation(alert, metricLabel);

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="alertDetailTitle">
      {/* ---- Header with tabs ---- */}
      <EuiFlyoutHeader hasBorder style={{ paddingBottom: 0 }}>
        <EuiTitle size="m"><h2 id="alertDetailTitle">{alert.name}</h2></EuiTitle>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiHealth color={STATE_COLORS[alert.state] || 'subdued'}>
                  In alarm since {startFormatted} ({duration})
                </EuiHealth>
              </EuiFlexItem>
              {Object.entries(labels).slice(0, 4).map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow">{k}: {v}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  iconType="check"
                  onClick={() => onAcknowledge(alert.id)}
                  isDisabled={alert.state === 'acknowledged'}
                >
                  Acknowledge
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  iconType="bellSlash"
                  onClick={handleMuteToggle}
                >
                  {isMuted ? 'Unmute' : 'Mute'}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {/* Tabs in the header — condensed, flush with border */}
        <EuiTabs size="s" style={{ marginBottom: '-1px' }}>
          {tabs.map(t => (
            <EuiTab key={t.id} isSelected={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
              {t.name}
            </EuiTab>
          ))}
        </EuiTabs>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* ---- Overview Tab (default) ---- */}
        {activeTab === 'overview' && (
          <>
            {/* Quick stats */}
            <EuiFlexGroup gutterSize="m" responsive={true}>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
                  <EuiText size="m"><strong>{currentValue}{thresholdUnit}</strong></EuiText>
                  <EuiText size="xs" color="subdued">error rate</EuiText>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
                  <EuiText size="m"><strong>{thresholdOperator} {thresholdValue}{thresholdUnit}</strong></EuiText>
                  <EuiText size="xs" color="subdued">for {conditionPeriods}</EuiText>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
                  <EuiText size="m"><strong>3 of 3 periods</strong></EuiText>
                  <EuiText size="xs" color="subdued">breaching</EuiText>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
                  <EuiText size="m"><strong>{actionDest}</strong></EuiText>
                  <EuiText size="xs" color="subdued">notification target</EuiText>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {/* Metric Chart */}
            <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
              <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs"><strong>Metric: {metricLabel}</strong></EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonGroup
                    legend="Time range"
                    options={timeRangeOptions}
                    idSelected={timeRange}
                    onChange={(id) => setTimeRange(id)}
                    buttonSize="compressed"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <ReactEChartsCore
                echarts={echarts}
                option={chartOption}
                style={{ height: 260, width: '100%' }}
                notMerge
              />
              <EuiSpacer size="s" />
              <EuiCallOut
                title={`Alarm triggered at ${startFormatted} — ${metricLabel} crossed ${thresholdValue}${thresholdUnit} threshold`}
                color="warning"
                iconType="alert"
                size="s"
              />
            </EuiPanel>

            <EuiSpacer size="m" />

            {/* Summary */}
            <EuiText size="s"><strong>Summary</strong></EuiText>
            <EuiSpacer size="s" />
            <EuiText size="s">{summary}</EuiText>

            <EuiSpacer size="m" />

            {/* Recommendation */}
            <EuiText size="s"><strong>Recommendation</strong></EuiText>
            <EuiSpacer size="s" />
            <EuiText size="s">
              <ul>
                {recommendation.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </EuiText>

            <EuiSpacer size="m" />

            {/* Related alerts */}
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s"><strong>Related alerts</strong></EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" flush="right">View all &gt;</EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            {correlatedAlerts.length > 0 ? (
              <EuiBasicTable
                items={correlatedAlerts}
                columns={[
                  {
                    field: 'state', name: '', width: '30px',
                    render: (state: string) => <EuiHealth color={STATE_COLORS[state] || 'subdued'} />,
                  },
                  {
                    field: 'name', name: 'Name',
                    render: (name: string, a: UnifiedAlert) => (
                      <EuiLink onClick={() => onViewAlert?.(a)}>{name}</EuiLink>
                    ),
                  },
                  {
                    field: 'state', name: 'State', width: '100px',
                    render: (state: string) => (
                      <EuiBadge color={state === 'active' ? 'danger' : 'success'}>
                        {state === 'active' ? 'In alarm' : 'OK'}
                      </EuiBadge>
                    ),
                  },
                  {
                    field: 'startTime', name: 'Time', width: '100px',
                    render: (ts: string, a: UnifiedAlert) =>
                      a.state === 'active' && ts
                        ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—',
                  },
                  {
                    field: 'message', name: 'Detail',
                    render: (msg: string) => <EuiText size="xs" color="subdued">{msg || '—'}</EuiText>,
                  },
                ]}
              />
            ) : (
              <EuiText size="s" color="subdued">No related alerts found</EuiText>
            )}
          </>
        )}

        {/* ---- History Tab ---- */}
        {activeTab === 'history' && (
          <>
            {/* Timeline visualization */}
            <EuiPanel paddingSize="m" hasBorder hasShadow={false}>
              <EuiFlexGroup alignItems="center" justifyContent="flexEnd" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButtonGroup
                    legend="History time range"
                    options={timeRangeOptions}
                    idSelected={historyTimeRange}
                    onChange={(id) => setHistoryTimeRange(id)}
                    buttonSize="compressed"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <ReactEChartsCore
                echarts={echarts}
                option={timelineChartOption}
                style={{ height: 100, width: '100%' }}
                notMerge
              />
            </EuiPanel>

            <EuiSpacer size="m" />

            {/* State history table */}
            {historyEntries.length > 0 ? (
              <EuiBasicTable
                items={historyEntries}
                columns={[
                  {
                    field: 'timestamp', name: 'Timestamp', width: '200px',
                    render: (ts: string) => new Date(ts).toLocaleString(),
                  },
                  {
                    field: 'state', name: 'State', width: '120px',
                    render: (state: string) => <EuiHealth color={STATE_COLORS[state] || 'subdued'}>{state}</EuiHealth>,
                  },
                  {
                    field: 'value', name: 'Value', width: '100px',
                    render: (v: string) => v || '—',
                  },
                  {
                    field: 'message', name: 'Message',
                    render: (msg: string) => msg || '—',
                  },
                ]}
              />
            ) : (
              <EuiEmptyPrompt title={<h3>No history available</h3>} titleSize="xs" />
            )}
          </>
        )}

        {/* ---- Configuration Tab ---- */}
        {activeTab === 'configuration' && (
          <>
            {/* Query Definition */}
            <EuiAccordion id="configQuery" buttonContent={<strong>Query Definition</strong>} initialIsOpen paddingSize="m">
              <EuiCodeBlock language={alert.datasourceType === 'opensearch' ? 'json' : 'text'} fontSize="s" paddingSize="m" isCopyable>
                {associatedRule?.query || annotations.query || JSON.stringify(alert.raw, null, 2)}
              </EuiCodeBlock>
              {associatedRule?.condition && (
                <>
                  <EuiSpacer size="s" />
                  <EuiText size="xs" color="subdued">{associatedRule.condition}</EuiText>
                </>
              )}
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Conditions & Evaluation */}
            <EuiAccordion id="configConditions" buttonContent={<strong>Conditions &amp; Evaluation</strong>} initialIsOpen paddingSize="m">
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: 'Evaluation Interval', description: associatedRule?.evaluationInterval || '1 minutes' },
                  { title: 'Pending Period', description: associatedRule?.pendingPeriod || '5 minutes' },
                  { title: 'Firing Period', description: associatedRule?.firingPeriod || '5 minutes' },
                  { title: 'Lookback Period', description: associatedRule?.lookbackPeriod || '15 minutes' },
                  { title: 'Threshold', description: `${thresholdOperator} ${thresholdValue}${thresholdUnit}` },
                ]}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Labels */}
            <EuiAccordion id="configLabels" buttonContent={<strong>Labels</strong>} initialIsOpen paddingSize="m">
              {Object.keys(labels).length > 0 ? (
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  {Object.entries(labels).map(([k, v]) => (
                    <EuiFlexItem grow={false} key={k}>
                      <EuiBadge color="hollow">{k}: {v}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ) : (
                <EuiText size="s" color="subdued">No labels</EuiText>
              )}
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Notification Routing */}
            <EuiAccordion id="configRouting" buttonContent={<strong>Notification Routing</strong>} initialIsOpen={false} paddingSize="m">
              {routingEntries.length > 0 ? (
                <EuiBasicTable
                  items={routingEntries}
                  columns={[
                    { field: 'channel', name: 'Channel', width: '100px' },
                    { field: 'destination', name: 'Destination' },
                    {
                      field: 'severity', name: 'Severities', width: '200px',
                      render: (sevs: string | string[] | undefined) => Array.isArray(sevs) && sevs.length
                        ? sevs.map(s => <EuiBadge key={s} color="hollow">{s}</EuiBadge>)
                        : '—',
                    },
                    { field: 'throttle', name: 'Throttle', width: '100px', render: (t: string) => t || '—' },
                  ]}
                />
              ) : (
                <EuiText size="s" color="subdued">No notification routing configured</EuiText>
              )}
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Suppression Rules */}
            <EuiAccordion id="configSuppression" buttonContent={<strong>Suppression Rules</strong>} initialIsOpen={false} paddingSize="m">
              {suppressionEntries.length > 0 ? (
                suppressionEntries.map((rule, i) => (
                  <EuiPanel key={i} paddingSize="s" hasBorder hasShadow={false} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                      <EuiFlexItem>
                        <EuiText size="s"><strong>{rule.name}</strong></EuiText>
                        <EuiText size="xs" color="subdued">{rule.reason}</EuiText>
                        {rule.schedule && <EuiText size="xs" color="subdued">Schedule: {rule.schedule}</EuiText>}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiBadge color={rule.active ? 'success' : 'default'}>
                          {rule.active ? 'Active' : 'Inactive'}
                        </EuiBadge>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiPanel>
                ))
              ) : (
                <EuiText size="s" color="subdued">No suppression rules</EuiText>
              )}
            </EuiAccordion>
          </>
        )}

        {/* ---- Related Resources Tab ---- */}
        {activeTab === 'related' && (
          <>
            {(associatedRule || ds || annotations.runbook_url || annotations.dashboard_url) ? (
              <>
                {associatedRule && (
                  <EuiPanel paddingSize="m" hasBorder hasShadow={false} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}><EuiIcon type="bell" /></EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s"><strong>Associated Monitor</strong></EuiText>
                        <EuiText size="xs" color="subdued">{associatedRule.name}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiPanel>
                )}
                {ds && (
                  <EuiPanel paddingSize="m" hasBorder hasShadow={false} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}><EuiIcon type="database" /></EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s"><strong>Datasource</strong></EuiText>
                        <EuiText size="xs" color="subdued">{dsName} · {ds.type} · {ds.id}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiPanel>
                )}
                {annotations.runbook_url && (
                  <EuiPanel paddingSize="m" hasBorder hasShadow={false} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}><EuiIcon type="document" /></EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s"><strong>Runbook</strong></EuiText>
                        <EuiLink href={annotations.runbook_url} target="_blank" external>{annotations.runbook_url}</EuiLink>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiPanel>
                )}
                {annotations.dashboard_url && (
                  <EuiPanel paddingSize="m" hasBorder hasShadow={false} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}><EuiIcon type="dashboardApp" /></EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s"><strong>Dashboard</strong></EuiText>
                        <EuiLink href={annotations.dashboard_url} target="_blank" external>{annotations.dashboard_url}</EuiLink>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiPanel>
                )}
              </>
            ) : (
              <EuiEmptyPrompt title={<h3>No related resources found</h3>} titleSize="xs" />
            )}
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

// ============================================================================
// Helpers
// ============================================================================

function getAlertDuration(startTime: string): string {
  if (!startTime) return '—';
  const ms = Date.now() - new Date(startTime).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function generateMockSignalData(range: string, threshold: number): Array<{ timestamp: number; value: number }> {
  const now = Date.now();
  const rangeMs: Record<string, number> = { '1h': 3600000, '3h': 10800000, '6h': 21600000, '1d': 86400000 };
  const totalMs = rangeMs[range] || 21600000;
  const points = 60;
  const step = totalMs / points;
  const data: Array<{ timestamp: number; value: number }> = [];
  for (let i = 0; i <= points; i++) {
    const t = now - totalMs + i * step;
    const base = threshold * 0.6;
    const noise = (Math.sin(i * 0.3) + Math.random() * 0.5) * threshold * 0.3;
    const ramp = i > points * 0.65 ? (i - points * 0.65) / (points * 0.35) * threshold * 0.8 : 0;
    data.push({ timestamp: t, value: Math.max(0, base + noise + ramp) });
  }
  return data;
}

function generateMockHistory(alert: UnifiedAlert): AlertHistoryEntry[] {
  if (!alert.startTime) return [];
  const start = new Date(alert.startTime).getTime();
  return [
    { timestamp: new Date(start).toISOString(), state: 'active', value: '12.4%', message: 'Threshold breached — error rate exceeded 5%' },
    { timestamp: new Date(start - 300000).toISOString(), state: 'pending', value: '5.2%', message: 'Condition met, entering pending state' },
    { timestamp: new Date(start - 600000).toISOString(), state: 'resolved', value: '3.1%', message: 'Previous alert resolved' },
    { timestamp: new Date(start - 3600000).toISOString(), state: 'active', value: '8.7%', message: 'Threshold breached — error rate exceeded 5%' },
    { timestamp: new Date(start - 7200000).toISOString(), state: 'resolved', value: '2.0%', message: 'Alert resolved — value returned below threshold' },
  ] as AlertHistoryEntry[];
}

function generateMockSummary(alert: UnifiedAlert, metricLabel: string, thresholdValue: number, thresholdUnit: string): string {
  return `The alert "${alert.name}" triggered because ${metricLabel} exceeded the configured threshold of ${thresholdValue}${thresholdUnit}. ` +
    `The metric has been breaching consistently over the evaluation window, indicating a sustained issue rather than a transient spike. ` +
    `This may be caused by increased error rates in upstream dependencies or a recent deployment affecting service health.`;
}

function generateMockRecommendation(alert: UnifiedAlert, metricLabel: string): string[] {
  return [
    `Check recent deployments to the affected service for regressions.`,
    `Review upstream dependency health and latency metrics.`,
    `Inspect application logs for error patterns correlated with the ${metricLabel} increase.`,
    `Consider scaling the service if the issue is load-related.`,
    `If this is a known issue, acknowledge the alert and update the runbook.`,
  ];
}

function buildTimelineChartOption(historyEntries: AlertHistoryEntry[], timeRange: string) {
  const rangeMs: Record<string, number> = { '1h': 3600000, '3h': 10800000, '6h': 21600000, '1d': 86400000 };
  const totalMs = rangeMs[timeRange] || 21600000;
  const now = Date.now();
  const start = now - totalMs;

  // Build segments from history entries (sorted oldest first)
  const sorted = [...historyEntries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const segments: Array<{ start: number; end: number; state: string }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const ts = new Date(sorted[i].timestamp).getTime();
    const endTs = i < sorted.length - 1 ? new Date(sorted[i + 1].timestamp).getTime() : now;
    if (endTs >= start) {
      segments.push({
        start: Math.max(ts, start),
        end: endTs,
        state: sorted[i].state,
      });
    }
  }

  // If no segments in range, show a single segment with the latest known state
  if (segments.length === 0 && sorted.length > 0) {
    segments.push({ start, end: now, state: sorted[sorted.length - 1].state });
  }

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        if (!d) return '';
        const from = new Date(d.value[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const to = new Date(d.value[1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${d.name}<br/>${from} — ${to}`;
      },
    },
    grid: { top: 10, right: 20, bottom: 30, left: 50, height: 40 },
    xAxis: {
      type: 'time',
      min: start,
      max: now,
      axisLabel: {
        formatter: (v: number) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    },
    yAxis: {
      type: 'category',
      data: ['State'],
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'custom',
      renderItem: (params: any, api: any) => {
        const categoryIndex = api.value(2);
        const startVal = api.coord([api.value(0), categoryIndex]);
        const endVal = api.coord([api.value(1), categoryIndex]);
        const height = api.size([0, 1])[1] * 0.6;
        return {
          type: 'rect',
          shape: {
            x: startVal[0],
            y: startVal[1] - height / 2,
            width: endVal[0] - startVal[0],
            height,
          },
          style: api.style(),
        };
      },
      encode: { x: [0, 1], y: 2 },
      data: segments.map(seg => ({
        value: [seg.start, seg.end, 0],
        name: seg.state,
        itemStyle: { color: TIMELINE_COLORS[seg.state] || '#999' },
      })),
    }],
  };
}
