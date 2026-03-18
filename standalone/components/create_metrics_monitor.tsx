/**
 * Create Metrics Monitor — flyout form based on the Prometheus alert spec.
 * Sections: Monitor Details, Query (PromQL + datasource + metric browser),
 * Trigger Condition, Evaluation Settings, Labels, Annotations,
 * Matched Notification Actions, Rule Preview (YAML), and a sticky footer.
 */
import React, { useState, useCallback, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiTextArea,
  EuiSelect,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiHorizontalRule,
  EuiCallOut,
  EuiSwitch,
  EuiToolTip,
  EuiPopover,
  EuiIcon,
  EuiBetaBadge,
} from '@opensearch-project/oui';
import { PromQLEditor } from './promql_editor';
import { MetricBrowser } from './metric_browser';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

// ============================================================================
// Types
// ============================================================================

interface LabelEntry {
  key: string;
  value: string;
  isDynamic: boolean;
}

interface AnnotationEntry {
  key: string;
  value: string;
}

interface ActionState {
  id: string;
  name: string;
}

export interface MetricsMonitorFormState {
  monitorName: string;
  description: string;
  query: string;
  datasourceId: string;
  // Trigger condition
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  thresholdValue: number;
  forDuration: string;
  // Evaluation settings
  evalInterval: string;
  pendingPeriod: string;
  firingPeriod: string;
  // Labels & annotations
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
  // Actions
  actions: ActionState[];
}

export interface CreateMetricsMonitorProps {
  onCancel: () => void;
  onSave: (form: MetricsMonitorFormState) => void;
}

// ============================================================================
// Constants
// ============================================================================

const OPERATOR_OPTIONS = [
  { value: '>', text: '> (greater than)' },
  { value: '>=', text: '>= (greater or equal)' },
  { value: '<', text: '< (less than)' },
  { value: '<=', text: '<= (less or equal)' },
  { value: '==', text: '== (equal)' },
  { value: '!=', text: '!= (not equal)' },
];

const FOR_DURATION_OPTIONS = [
  { value: '1m', text: '1 minute' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

const EVAL_INTERVAL_OPTIONS = [
  { value: '30s', text: '30 seconds' },
  { value: '1m', text: '1 minute' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

const MOCK_DATASOURCES = [
  { id: 'prom-1', name: 'Prometheus (production)' },
  { id: 'prom-2', name: 'Prometheus (staging)' },
];

const MOCK_SAMPLE_QUERIES = [
  { label: 'High CPU usage', query: 'rate(node_cpu_seconds_total{mode!="idle"}[5m]) > 0.8' },
  { label: 'High memory usage', query: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9' },
  { label: 'High error rate', query: 'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05' },
  { label: 'Disk almost full', query: '(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) > 0.85' },
];

const DEFAULT_PROMQL = 'rate(http_requests_total{status=~"5.."}[5m])';

// Mock preview data — line chart
const PREVIEW_TIMESTAMPS = [
  '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00',
];
const PREVIEW_VALUES = [0.02, 0.03, 0.01, 0.06, 0.04, 0.07, 0.05, 0.08];

// ============================================================================
// Chart helpers
// ============================================================================

function buildPreviewChartOption(): any {
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: PREVIEW_VALUES,
      smooth: true,
      itemStyle: { color: '#006BB4' },
      areaStyle: { color: 'rgba(0,107,180,0.1)' },
    }],
  };
}

function buildThresholdChartOption(thresholdValue: number): any {
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: PREVIEW_VALUES,
      smooth: true,
      itemStyle: { color: '#006BB4' },
      areaStyle: { color: 'rgba(0,107,180,0.1)' },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#BD271E', width: 2 },
        data: [{ yAxis: thresholdValue }],
        label: { formatter: `Threshold: ${thresholdValue}`, position: 'insideEndTop' },
      },
    }],
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/** Section 1: Monitor Details */
const MonitorDetailsSection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion
    id="prom-monitor-details"
    buttonContent={<strong>Monitor details</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFormRow label="Monitor name" fullWidth isInvalid={!form.monitorName.trim()} error={!form.monitorName.trim() ? 'Required' : undefined}>
      <EuiFieldText
        placeholder="Enter a monitor name"
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        aria-label="Monitor name"
      />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={<span>Description <span style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}>— optional</span></span>}
      fullWidth
    >
      <EuiTextArea
        placeholder="Describe this monitor"
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={2}
        fullWidth
        compressed
        aria-label="Monitor description"
      />
    </EuiFormRow>
  </EuiAccordion>
);

/** Section 2: Query — PromQL editor with datasource picker, query library, metric browser */
const QuerySection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
}> = ({ form, onUpdate, showPreview, onRunPreview }) => {
  const [showMetricBrowser, setShowMetricBrowser] = useState(false);
  const [showQueryLibrary, setShowQueryLibrary] = useState(false);
  const [showDatasourcePicker, setShowDatasourcePicker] = useState(false);

  const selectedDs = MOCK_DATASOURCES.find((d) => d.id === form.datasourceId) || MOCK_DATASOURCES[0];

  const handleMetricSelect = (metricName: string) => {
    const newQuery = form.query
      ? form.query + (form.query.endsWith(' ') ? '' : ' ') + metricName
      : metricName;
    onUpdate({ query: newQuery });
    setShowMetricBrowser(false);
  };

  const handleQueryLibrarySelect = (query: string) => {
    onUpdate({ query });
    setShowQueryLibrary(false);
  };

  return (
    <EuiAccordion
      id="prom-query-section"
      buttonContent={<strong>Query</strong>}
      initialIsOpen
      paddingSize="m"
      extraAction={
        <EuiButton size="s" onClick={onRunPreview} aria-label="Run preview">
          Run preview
        </EuiButton>
      }
    >
      {/* Toolbar: language badge, datasource, query library, metric browser */}
      <EuiPanel paddingSize="s" hasBorder style={{ borderRadius: 4 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiBetaBadge label="PromQL" tooltipContent="Prometheus Query Language" size="s" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  iconType="database"
                  iconSide="left"
                  onClick={() => setShowDatasourcePicker(!showDatasourcePicker)}
                  aria-label="Pick data source"
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>{selectedDs.name}</EuiFlexItem>
                    <EuiFlexItem grow={false}><EuiIcon type="arrowDown" size="s" /></EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showDatasourcePicker}
              closePopover={() => setShowDatasourcePicker(false)}
              panelPaddingSize="s"
            >
              {MOCK_DATASOURCES.map((ds) => (
                <EuiButtonEmpty
                  key={ds.id}
                  size="xs"
                  onClick={() => { onUpdate({ datasourceId: ds.id }); setShowDatasourcePicker(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  {ds.name}
                </EuiButtonEmpty>
              ))}
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  iconType="starEmpty"
                  iconSide="left"
                  onClick={() => setShowQueryLibrary(!showQueryLibrary)}
                  aria-label="Query library"
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>Query library</EuiFlexItem>
                    <EuiFlexItem grow={false}><EuiIcon type="arrowDown" size="s" /></EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showQueryLibrary}
              closePopover={() => setShowQueryLibrary(false)}
              panelPaddingSize="s"
            >
              {MOCK_SAMPLE_QUERIES.map((sq, i) => (
                <EuiButtonEmpty
                  key={i}
                  size="xs"
                  onClick={() => handleQueryLibrarySelect(sq.query)}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  {sq.label}
                </EuiButtonEmpty>
              ))}
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  onClick={() => setShowMetricBrowser(!showMetricBrowser)}
                  aria-label="Metric browser"
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>Metric browser</EuiFlexItem>
                    <EuiFlexItem grow={false}><EuiIcon type="arrowDown" size="s" /></EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showMetricBrowser}
              closePopover={() => setShowMetricBrowser(false)}
              panelPaddingSize="s"
              style={{ width: 600 }}
            >
              <div style={{ width: 560, maxHeight: 400, overflow: 'auto' }}>
                <MetricBrowser onSelectMetric={handleMetricSelect} currentQuery={form.query} />
              </div>
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        {/* PromQL editor */}
        <div style={{ position: 'relative' }}>
          <PromQLEditor
            value={form.query}
            onChange={(v) => onUpdate({ query: v })}
            height={56}
            showLineNumbers
            hideToolbar
          />
          <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, display: 'flex', gap: 2 }}>
            <EuiToolTip content="Copy query">
              <EuiButtonIcon
                iconType="copy"
                size="s"
                color="subdued"
                onClick={() => navigator.clipboard.writeText(form.query)}
                aria-label="Copy query"
              />
            </EuiToolTip>
            <EuiToolTip content="Expand editor">
              <EuiButtonIcon
                iconType="expand"
                size="s"
                color="subdued"
                onClick={() => {}}
                aria-label="Expand editor"
              />
            </EuiToolTip>
          </div>
        </div>
      </EuiPanel>

      {/* Preview Results */}
      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion
            id="prom-preview-results"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}><strong>Results ({PREVIEW_VALUES.length})</strong></EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen
            paddingSize="s"
          >
            <EuiText size="xs" color="subdued">http_requests_total</EuiText>
            <EuiSpacer size="s" />
            <ReactEChartsCore
              echarts={echarts}
              option={buildPreviewChartOption()}
              style={{ height: 200, width: '100%' }}
              notMerge
              lazyUpdate
            />
          </EuiAccordion>
        </>
      )}
    </EuiAccordion>
  );
};

/** Section 3: Trigger Condition */
const TriggerConditionSection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion
    id="prom-trigger-condition"
    buttonContent={<strong>Trigger condition</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFlexGroup gutterSize="s" wrap>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Operator" display="rowCompressed">
          <EuiSelect
            options={OPERATOR_OPTIONS}
            value={form.operator}
            onChange={(e) => onUpdate({ operator: e.target.value as MetricsMonitorFormState['operator'] })}
            compressed
            aria-label="Threshold operator"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 100 }}>
        <EuiFormRow label="Value" display="rowCompressed">
          <EuiFieldNumber
            value={form.thresholdValue}
            onChange={(e) => onUpdate({ thresholdValue: parseFloat(e.target.value) || 0 })}
            compressed
            aria-label="Threshold value"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="For duration" display="rowCompressed">
          <EuiSelect
            options={FOR_DURATION_OPTIONS}
            value={form.forDuration}
            onChange={(e) => onUpdate({ forDuration: e.target.value })}
            compressed
            aria-label="For duration"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>

    <EuiSpacer size="s" />

    {/* Condition summary callout */}
    <EuiCallOut size="s" color="primary" iconType="iInCircle">
      <EuiText size="xs">
        Alert fires when: <code>{form.query || '<query>'} {form.operator} {form.thresholdValue}</code> for {form.forDuration}
      </EuiText>
    </EuiCallOut>

    <EuiSpacer size="m" />

    {/* Threshold visualization */}
    <EuiText size="xs"><strong>Results</strong></EuiText>
    <EuiText size="xs" color="subdued">http_requests_total</EuiText>
    <EuiSpacer size="xs" />
    <ReactEChartsCore
      echarts={echarts}
      option={buildThresholdChartOption(form.thresholdValue)}
      style={{ height: 200, width: '100%' }}
      notMerge
      lazyUpdate
    />
  </EuiAccordion>
);

/** Section 4: Evaluation Settings */
const EvaluationSettingsSection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion
    id="prom-evaluation-settings"
    buttonContent={<strong>Evaluation settings</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFlexGroup gutterSize="s" wrap>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Eval interval" helpText="How often evaluated" display="rowCompressed">
          <EuiSelect
            options={EVAL_INTERVAL_OPTIONS}
            value={form.evalInterval}
            onChange={(e) => onUpdate({ evalInterval: e.target.value })}
            compressed
            aria-label="Evaluation interval"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Pending period" helpText="Before firing" display="rowCompressed">
          <EuiSelect
            options={EVAL_INTERVAL_OPTIONS}
            value={form.pendingPeriod}
            onChange={(e) => onUpdate({ pendingPeriod: e.target.value })}
            compressed
            aria-label="Pending period"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Firing period" helpText="Min firing time" display="rowCompressed">
          <EuiSelect
            options={EVAL_INTERVAL_OPTIONS}
            value={form.firingPeriod}
            onChange={(e) => onUpdate({ firingPeriod: e.target.value })}
            compressed
            aria-label="Firing period"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiAccordion>
);

/** Section 5: Labels */
const LabelsSection: React.FC<{
  labels: LabelEntry[];
  onUpdate: (labels: LabelEntry[]) => void;
}> = ({ labels, onUpdate }) => {
  const addLabel = () => onUpdate([...labels, { key: '', value: '', isDynamic: false }]);
  const removeLabel = (i: number) => onUpdate(labels.filter((_, idx) => idx !== i));
  const updateLabel = (i: number, patch: Partial<LabelEntry>) => {
    const next = [...labels];
    next[i] = { ...next[i], ...patch };
    onUpdate(next);
  };

  return (
    <EuiAccordion
      id="prom-labels"
      buttonContent={<strong>Labels</strong>}
      initialIsOpen
      paddingSize="m"
    >
      <EuiText size="xs" color="subdued">Categorize and route alerts</EuiText>
      <EuiSpacer size="s" />
      {labels.map((label, i) => (
        <EuiFlexGroup key={i} gutterSize="s" alignItems="center" responsive={false} style={{ marginBottom: 4 }}>
          <EuiFlexItem grow={2}>
            <EuiFieldText
              placeholder="e.g. severity, team, service"
              value={label.key}
              onChange={(e) => updateLabel(i, { key: e.target.value })}
              compressed
              aria-label={`Label key ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiFieldText
              placeholder={label.isDynamic ? '{{ $value }}' : 'Value'}
              value={label.value}
              onChange={(e) => updateLabel(i, { value: e.target.value })}
              compressed
              aria-label={`Label value ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={label.isDynamic ? 'Dynamic (Go template)' : 'Static value'}>
              <EuiSwitch
                label=""
                checked={label.isDynamic}
                onChange={(e) => updateLabel(i, { isDynamic: e.target.checked })}
                compressed
                aria-label={`Toggle dynamic for label ${i + 1}`}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              color="danger"
              size="s"
              onClick={() => removeLabel(i)}
              aria-label={`Delete label ${label.key || i + 1}`}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiSpacer size="xs" />
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addLabel}>
        Add label
      </EuiButtonEmpty>
    </EuiAccordion>
  );
};

/** Section 6: Annotations */
const AnnotationsSection: React.FC<{
  annotations: AnnotationEntry[];
  onUpdate: (annotations: AnnotationEntry[]) => void;
}> = ({ annotations, onUpdate }) => {
  const addAnnotation = () => onUpdate([...annotations, { key: '', value: '' }]);
  const removeAnnotation = (i: number) => onUpdate(annotations.filter((_, idx) => idx !== i));
  const updateAnnotation = (i: number, patch: Partial<AnnotationEntry>) => {
    const next = [...annotations];
    next[i] = { ...next[i], ...patch };
    onUpdate(next);
  };

  return (
    <EuiAccordion
      id="prom-annotations"
      buttonContent={
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}><strong>Annotations</strong></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiBadge color="hollow">Optional</EuiBadge></EuiFlexItem>
        </EuiFlexGroup>
      }
      initialIsOpen
      paddingSize="m"
    >
      {annotations.map((ann, i) => (
        <EuiFlexGroup key={i} gutterSize="s" alignItems="center" responsive={false} style={{ marginBottom: 4 }}>
          <EuiFlexItem grow={2}>
            <EuiFieldText
              placeholder="e.g. summary, description, runbook_url"
              value={ann.key}
              onChange={(e) => updateAnnotation(i, { key: e.target.value })}
              compressed
              aria-label={`Annotation key ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={4}>
            <EuiFieldText
              placeholder="Supports Go template syntax"
              value={ann.value}
              onChange={(e) => updateAnnotation(i, { value: e.target.value })}
              compressed
              aria-label={`Annotation value ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              color="danger"
              size="s"
              onClick={() => removeAnnotation(i)}
              aria-label={`Delete annotation ${ann.key || i + 1}`}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiSpacer size="xs" />
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>
        Add annotation
      </EuiButtonEmpty>
    </EuiAccordion>
  );
};

/** Section 7: Matched Notification Actions */
const ActionsSection: React.FC<{
  actions: ActionState[];
  onDeleteAction: (id: string) => void;
  onAddAction: () => void;
}> = ({ actions, onDeleteAction, onAddAction }) => (
  <section aria-label="Matched notification actions">
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs"><h3>Matched notification actions ({actions.length})</h3></EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {actions.map((action, idx) => (
      <React.Fragment key={action.id}>
        {idx > 0 && <EuiSpacer size="xs" />}
        <EuiPanel paddingSize="s" hasBorder>
          <EuiAccordion
            id={`action-${action.id}`}
            buttonContent={<span>{idx + 1}. {action.name}</span>}
            paddingSize="s"
            extraAction={
              <EuiButtonEmpty
                size="xs"
                color="danger"
                onClick={() => onDeleteAction(action.id)}
                aria-label={`Delete action ${action.name}`}
              >
                Delete
              </EuiButtonEmpty>
            }
          >
            <EuiText size="xs" color="subdued">
              Action configuration — destination, message template, throttling, etc.
            </EuiText>
          </EuiAccordion>
        </EuiPanel>
      </React.Fragment>
    ))}
    <EuiSpacer size="s" />
    <EuiButtonEmpty
      size="s"
      iconType="plusInCircle"
      onClick={onAddAction}
      aria-label="Add another action"
    >
      Add another action
    </EuiButtonEmpty>
  </section>
);

/** Section 8: Rule Preview (YAML) */
const RulePreviewSection: React.FC<{
  form: MetricsMonitorFormState;
}> = ({ form }) => {
  const yaml = useMemo(() => {
    const labels = form.labels.filter((l) => l.key && l.value);
    const annotations = form.annotations.filter((a) => a.key && a.value);
    let out = `- alert: ${form.monitorName || '<monitor-name>'}\n`;
    out += `  expr: ${form.query || '<promql-expression>'} ${form.operator} ${form.thresholdValue}\n`;
    out += `  for: ${form.forDuration}\n`;
    if (labels.length > 0) {
      out += `  labels:\n`;
      for (const l of labels) {
        out += `    ${l.key}: ${l.isDynamic ? l.value : `"${l.value}"`}\n`;
      }
    }
    if (annotations.length > 0) {
      out += `  annotations:\n`;
      for (const a of annotations) {
        out += `    ${a.key}: "${a.value}"\n`;
      }
    }
    return out;
  }, [form]);

  return (
    <EuiAccordion
      id="prom-rule-preview"
      buttonContent={<strong>Rule Preview (YAML)</strong>}
      initialIsOpen={false}
      paddingSize="m"
    >
      <EuiPanel paddingSize="s" color="subdued">
        <div style={{ display: 'flex', fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', monospace", fontSize: 12, lineHeight: '20px' }}>
          <div
            aria-hidden="true"
            style={{
              width: 32, minWidth: 32, textAlign: 'right', paddingRight: 8,
              color: '#98A2B3', userSelect: 'none', borderRight: '1px solid #D3DAE6',
              marginRight: 8,
            }}
          >
            {yaml.trimEnd().split('\n').map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, flex: 1 }}>
            {yaml}
          </pre>
        </div>
      </EuiPanel>
    </EuiAccordion>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const CreateMetricsMonitor: React.FC<CreateMetricsMonitorProps> = ({ onCancel, onSave }) => {
  const [form, setForm] = useState<MetricsMonitorFormState>({
    monitorName: '',
    description: '',
    query: DEFAULT_PROMQL,
    datasourceId: MOCK_DATASOURCES[0].id,
    operator: '>',
    thresholdValue: 0,
    forDuration: '5m',
    evalInterval: '1m',
    pendingPeriod: '5m',
    firingPeriod: '5m',
    labels: [{ key: 'severity', value: 'critical', isDynamic: false }],
    annotations: [
      { key: 'summary', value: '', isDynamic: false } as AnnotationEntry,
      { key: 'description', value: '', isDynamic: false } as AnnotationEntry,
    ],
    actions: [
      { id: `action-${Date.now()}-0`, name: 'slack_message' },
      { id: `action-${Date.now()}-1`, name: 'pager-duty_message' },
    ],
  });
  const [showPreview, setShowPreview] = useState(false);

  const updateForm = useCallback((patch: Partial<MetricsMonitorFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const deleteAction = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((a) => a.id !== id),
    }));
  }, []);

  const addAction = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      actions: [...prev.actions, { id: `action-${Date.now()}`, name: `action_${prev.actions.length + 1}` }],
    }));
  }, []);

  const handleRunPreview = useCallback(() => {
    setShowPreview(true);
  }, []);

  const isValid = form.monitorName.trim() !== '' && form.query.trim() !== '';

  return (
    <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="createMetricsMonitorTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m"><h2 id="createMetricsMonitorTitle">Create Monitor</h2></EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color="accent">Prometheus</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">PromQL-based alerting rule</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Section 1: Monitor Details */}
        <MonitorDetailsSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />

        {/* Section 2: Query */}
        <QuerySection
          form={form}
          onUpdate={updateForm}
          showPreview={showPreview}
          onRunPreview={handleRunPreview}
        />
        <EuiHorizontalRule margin="l" />

        {/* Section 3: Trigger Condition */}
        <TriggerConditionSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />

        {/* Section 4: Evaluation Settings */}
        <EvaluationSettingsSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />

        {/* Section 5: Labels */}
        <LabelsSection
          labels={form.labels}
          onUpdate={(labels) => updateForm({ labels })}
        />
        <EuiHorizontalRule margin="l" />

        {/* Section 6: Annotations */}
        <AnnotationsSection
          annotations={form.annotations}
          onUpdate={(annotations) => updateForm({ annotations })}
        />
        <EuiHorizontalRule margin="l" />

        {/* Section 7: Matched Notification Actions */}
        <ActionsSection
          actions={form.actions}
          onDeleteAction={deleteAction}
          onAddAction={addAction}
        />
        <EuiHorizontalRule margin="l" />

        {/* Section 8: Rule Preview (YAML) */}
        <RulePreviewSection form={form} />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onCancel}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={() => onSave(form)} isDisabled={!isValid}>
              Create
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
