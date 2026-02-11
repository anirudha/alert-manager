/**
 * Monitor Detail Flyout — comprehensive view of a single monitor's
 * configuration, behavior, and impact with quick actions.
 */
import React, { useState } from 'react';
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
} from '../../core';

// ============================================================================
// Color maps
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger', high: 'warning', medium: 'primary', low: 'subdued', info: 'default',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', muted: 'default', disabled: 'subdued',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success', failing: 'danger', no_data: 'subdued',
};
const STATE_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', acknowledged: 'primary', resolved: 'success', error: 'danger',
};

// ============================================================================
// SVG Line Graph for condition preview
// ============================================================================

const ConditionPreviewGraph: React.FC<{
  data: Array<{ timestamp: number; value: number }>;
  threshold?: { operator: string; value: number; unit?: string };
}> = ({ data, threshold }) => {
  if (!data || data.length === 0) return <EuiText size="s" color="subdued">No preview data available</EuiText>;

  const width = 520;
  const height = 160;
  const padding = { top: 20, right: 40, bottom: 30, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = data.map(d => d.value);
  const minVal = Math.min(...values, threshold?.value ?? Infinity) * 0.9;
  const maxVal = Math.max(...values, threshold?.value ?? -Infinity) * 1.1;
  const minTime = data[0].timestamp;
  const maxTime = data[data.length - 1].timestamp;

  const scaleX = (t: number) => padding.left + ((t - minTime) / (maxTime - minTime)) * chartW;
  const scaleY = (v: number) => padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(d.timestamp)} ${scaleY(d.value)}`).join(' ');
  const areaPath = linePath + ` L ${scaleX(data[data.length - 1].timestamp)} ${padding.top + chartH} L ${scaleX(data[0].timestamp)} ${padding.top + chartH} Z`;

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => minVal + (i / (yTicks - 1)) * (maxVal - minVal));

  return (
    <svg width={width} height={height} style={{ fontFamily: 'Inter, sans-serif', fontSize: 10 }}>
      {/* Grid lines */}
      {yTickValues.map((v, i) => (
        <g key={i}>
          <line x1={padding.left} y1={scaleY(v)} x2={width - padding.right} y2={scaleY(v)}
            stroke="#EDF0F5" strokeWidth={1} />
          <text x={padding.left - 5} y={scaleY(v) + 3} textAnchor="end" fill="#98A2B3">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {/* Area fill */}
      <path d={areaPath} fill="rgba(0, 107, 180, 0.08)" />
      {/* Data line */}
      <path d={linePath} fill="none" stroke="#006BB4" strokeWidth={2} />
      {/* Threshold line */}
      {threshold && (
        <g>
          <line x1={padding.left} y1={scaleY(threshold.value)} x2={width - padding.right} y2={scaleY(threshold.value)}
            stroke="#BD271E" strokeWidth={1.5} strokeDasharray="6,3" />
          <text x={width - padding.right + 3} y={scaleY(threshold.value) + 3} fill="#BD271E" fontSize={9}>
            {threshold.value}{threshold.unit || ''}
          </text>
        </g>
      )}
      {/* Data points */}
      {data.map((d, i) => (
        <circle key={i} cx={scaleX(d.timestamp)} cy={scaleY(d.value)} r={2} fill="#006BB4" />
      ))}
      {/* X-axis labels */}
      {[0, Math.floor(data.length / 2), data.length - 1].map(i => (
        <text key={i} x={scaleX(data[i].timestamp)} y={height - 5} textAnchor="middle" fill="#98A2B3" fontSize={9}>
          {new Date(data[i].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </text>
      ))}
    </svg>
  );
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
  monitor, onClose, onSilence, onDelete, onClone,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Safe defaults for optional detail fields that may be undefined on stale data
  const alertHistory = monitor.alertHistory ?? [];
  const conditionPreviewData = monitor.conditionPreviewData ?? [];
  const notificationRouting = monitor.notificationRouting ?? [];
  const suppressionRules = monitor.suppressionRules ?? [];
  const description = monitor.description ?? '';
  const aiSummary = monitor.aiSummary ?? 'No AI summary available.';
  const evaluationInterval = monitor.evaluationInterval ?? '—';
  const pendingPeriod = monitor.pendingPeriod ?? '—';

  const isJson = (s: string) => { try { JSON.parse(s); return true; } catch { return false; } };
  const queryDisplay = isJson(monitor.query) ? JSON.stringify(JSON.parse(monitor.query), null, 2) : monitor.query;
  const queryLang = monitor.datasourceType === 'prometheus' ? 'promql' : 'json';

  // Alert history columns
  const historyColumns = [
    {
      field: 'timestamp', name: 'Time', width: '180px',
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      field: 'state', name: 'State',
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
      field: 'severity', name: 'Severities', width: '160px',
      render: (sevs: UnifiedAlertSeverity[] | undefined) =>
        sevs ? sevs.map(s => <EuiBadge key={s} color={SEVERITY_COLORS[s]}>{s}</EuiBadge>) : 'All',
    },
    { field: 'throttle', name: 'Throttle', width: '100px', render: (t: string) => t || '—' },
  ];

  return (
    <>
      <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="monitorDetailTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem>
              <EuiTitle size="m"><h2 id="monitorDetailTitle">{monitor.name}</h2></EuiTitle>
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
                  <EuiHealth color={HEALTH_COLORS[monitor.healthStatus]}>{monitor.healthStatus}</EuiHealth>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {/* Quick actions */}
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Edit monitor (placeholder)">
                <EuiButtonEmpty size="s" iconType="pencil" isDisabled>Edit</EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType={monitor.status === 'muted' ? 'bell' : 'bellSlash'}
                onClick={() => onSilence(monitor.id)}>
                {monitor.status === 'muted' ? 'Unmute' : 'Silence'}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType="copy" onClick={() => onClone(monitor)}>Clone</EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType="trash" color="danger"
                onClick={() => setShowDeleteConfirm(true)}>Delete</EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {/* Description */}
          <EuiText size="s"><p>{description}</p></EuiText>
          <EuiSpacer size="m" />

          {/* AI Summary */}
          <EuiAccordion id="aiSummary" buttonContent={
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}><EuiIcon type="compute" /></EuiFlexItem>
              <EuiFlexItem grow={false}><strong>AI Summary</strong></EuiFlexItem>
              <EuiFlexItem grow={false}><EuiBadge color="hollow">Beta</EuiBadge></EuiFlexItem>
            </EuiFlexGroup>
          } initialIsOpen={true} paddingSize="m">
            <EuiPanel color="subdued" paddingSize="m">
              <EuiText size="s"><p>{aiSummary}</p></EuiText>
            </EuiPanel>
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Query Definition */}
          <EuiAccordion id="queryDef" buttonContent={<strong>Query Definition</strong>} initialIsOpen={true} paddingSize="m">
            <EuiCodeBlock language={queryLang} fontSize="s" paddingSize="m" isCopyable>
              {queryDisplay}
            </EuiCodeBlock>
            {monitor.condition && (
              <>
                <EuiSpacer size="s" />
                <EuiText size="xs" color="subdued">Condition: {monitor.condition}</EuiText>
              </>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Conditions & Thresholds */}
          <EuiAccordion id="conditions" buttonContent={<strong>Conditions &amp; Evaluation</strong>} initialIsOpen={true} paddingSize="m">
            <EuiDescriptionList
              type="column"
              compressed
              listItems={[
                { title: 'Evaluation Interval', description: evaluationInterval },
                { title: 'Pending Period', description: pendingPeriod },
                ...(monitor.firingPeriod ? [{ title: 'Firing Period', description: monitor.firingPeriod }] : []),
                ...(monitor.lookbackPeriod ? [{ title: 'Lookback Period', description: monitor.lookbackPeriod }] : []),
                ...(monitor.threshold ? [{
                  title: 'Threshold',
                  description: `${monitor.threshold.operator} ${monitor.threshold.value}${monitor.threshold.unit || ''}`,
                }] : []),
              ]}
            />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Labels */}
          <EuiAccordion id="labels" buttonContent={<strong>Labels</strong>} initialIsOpen={true} paddingSize="m">
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {Object.entries(monitor.labels).map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow">{k}: {v}</EuiBadge>
                </EuiFlexItem>
              ))}
              {Object.keys(monitor.labels).length === 0 && (
                <EuiText size="s" color="subdued">No labels</EuiText>
              )}
            </EuiFlexGroup>
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Condition Preview Graph */}
          <EuiAccordion id="preview" buttonContent={<strong>Condition Preview</strong>} initialIsOpen={true} paddingSize="m">
            <ConditionPreviewGraph data={conditionPreviewData} threshold={monitor.threshold} />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Alert History */}
          <EuiAccordion id="alertHistory" buttonContent={
            <strong>Recent Alert History ({alertHistory.length})</strong>
          } initialIsOpen={false} paddingSize="m">
            <EuiBasicTable
              items={alertHistory}
              columns={historyColumns}
              compressed
            />
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Notification Routing */}
          <EuiAccordion id="routing" buttonContent={
            <strong>Notification Routing ({notificationRouting.length})</strong>
          } initialIsOpen={false} paddingSize="m">
            {notificationRouting.length > 0 ? (
              <EuiBasicTable items={notificationRouting} columns={routingColumns} compressed />
            ) : (
              <EuiText size="s" color="subdued">No notification routing configured</EuiText>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Suppression Rules */}
          <EuiAccordion id="suppression" buttonContent={
            <strong>Suppression Rules ({suppressionRules.length})</strong>
          } initialIsOpen={false} paddingSize="m">
            {suppressionRules.length > 0 ? (
              suppressionRules.map(sr => (
                <EuiPanel key={sr.id} paddingSize="s" color={sr.active ? 'plain' : 'subdued'}
                  style={{ marginBottom: 8 }}>
                  <EuiFlexGroup alignItems="center" responsive={false}>
                    <EuiFlexItem>
                      <EuiText size="s"><strong>{sr.name}</strong></EuiText>
                      <EuiText size="xs" color="subdued">{sr.reason}</EuiText>
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
              <EuiText size="s" color="subdued">No suppression rules applied</EuiText>
            )}
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Creation / Modification History */}
          <EuiAccordion id="history" buttonContent={<strong>History</strong>} initialIsOpen={false} paddingSize="m">
            <EuiDescriptionList
              type="column"
              compressed
              listItems={[
                { title: 'Created By', description: monitor.createdBy },
                { title: 'Created At', description: new Date(monitor.createdAt).toLocaleString() },
                { title: 'Last Modified', description: new Date(monitor.lastModified).toLocaleString() },
                { title: 'Last Triggered', description: monitor.lastTriggered ? new Date(monitor.lastTriggered).toLocaleString() : 'Never' },
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
          onConfirm={() => { onDelete(monitor.id); setShowDeleteConfirm(false); onClose(); }}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
        >
          <p>This will remove the monitor from the current view. This action cannot be undone within this session.</p>
        </EuiConfirmModal>
      )}
    </>
  );
};
