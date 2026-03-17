/**
 * Create Metrics Monitor — flyout form following the Prometheus alerting rule spec.
 * Sections: Monitor Details, PromQL Query (with Metric Browser), Alert Condition,
 * Evaluation Settings, Labels, Annotations, Actions, Rule Preview (YAML), and a sticky footer.
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
  EuiCallOut,
  EuiTabs,
  EuiTab,
  EuiToolTip,
} from '@opensearch-project/oui';
import { PromQLEditor } from './promql_editor';
import { MetricBrowser } from './metric_browser';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

// ============================================================================
// Types
// ============================================================================

interface ThresholdCondition {
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
  unit: string;
  forDuration: string;
}

interface LabelEntry {
  key: string;
  value: string;
  isDynamic?: boolean;
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
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  firingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
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

const DURATION_OPTIONS = [
  { value: '1m', text: '1 minute' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

const INTERVAL_OPTIONS = [
  { value: '30s', text: '30 seconds' },
  { value: '1m', text: '1 minute' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

const COMMON_LABEL_KEYS = ['severity', 'team', 'service', 'environment', 'region', 'component'];

// Mock preview data
const PREVIEW_TIMESTAMPS = [
  '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00',
];
const PREVIEW_VALUES = [12, 35, 28, 45, 62, 48, 55, 40];

// ============================================================================
// Chart helpers
// ============================================================================

function buildPreviewChartOption(metricName: string): any {
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
  <EuiAccordion id="metrics-monitor-details" buttonContent={<strong>Monitor Details</strong>} initialIsOpen paddingSize="m">
    <EuiFormRow label="Monitor name" fullWidth>
      <EuiFieldText
        placeholder="Enter a monitor name"
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        aria-label="Monitor name"
      />
    </EuiFormRow>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={<span>Description <EuiText size="xs" color="subdued" component="span">(optional)</EuiText></span>}
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

/** Section 2: PromQL Query */
const QuerySection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
}> = ({ form, onUpdate, showPreview, onRunPreview }) => {
  const [queryTab, setQueryTab] = useState<'editor' | 'browser'>('editor');

  const handleMetricSelect = (metricName: string) => {
    if (!form.query) {
      onUpdate({ query: metricName });
    } else {
      onUpdate({ query: form.query + (form.query.endsWith(' ') ? '' : ' ') + metricName });
    }
    setQueryTab('editor');
  };

  const metricName = useMemo(() => {
    const match = form.query.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    return match ? match[1] : 'metric';
  }, [form.query]);

  return (
    <EuiAccordion
      id="metrics-query"
      buttonContent={<strong>PromQL Query</strong>}
      extraAction={
        <EuiButton size="s" onClick={onRunPreview} aria-label="Run preview">
          Run preview
        </EuiButton>
      }
      initialIsOpen
      paddingSize="m"
    >
      <EuiTabs size="s">
        <EuiTab isSelected={queryTab === 'editor'} onClick={() => setQueryTab('editor')}>Query Editor</EuiTab>
        <EuiTab isSelected={queryTab === 'browser'} onClick={() => setQueryTab('browser')}>Metric Browser</EuiTab>
      </EuiTabs>
      <EuiSpacer size="s" />
      {queryTab === 'editor' ? (
        <PromQLEditor value={form.query} onChange={(v) => onUpdate({ query: v })} height={80} />
      ) : (
        <MetricBrowser onSelectMetric={handleMetricSelect} currentQuery={form.query} />
      )}

      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion
            id="metrics-preview-results"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}><strong>Results ({PREVIEW_VALUES.length})</strong></EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen
            paddingSize="s"
          >
            <EuiText size="xs" color="subdued">{metricName}</EuiText>
            <EuiSpacer size="s" />
            <ReactEChartsCore
              echarts={echarts}
              option={buildPreviewChartOption(metricName)}
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

/** Section 3: Alert Condition */
const AlertConditionSection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
  showPreview: boolean;
}> = ({ form, onUpdate, showPreview }) => {
  const updateThreshold = <K extends keyof ThresholdCondition>(key: K, value: ThresholdCondition[K]) => {
    onUpdate({ threshold: { ...form.threshold, [key]: value } });
  };

  const metricName = useMemo(() => {
    const match = form.query.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    return match ? match[1] : 'metric';
  }, [form.query]);

  return (
    <EuiAccordion id="metrics-alert-condition" buttonContent={<strong>Alert Condition</strong>} initialIsOpen paddingSize="m">
      <EuiFlexGroup gutterSize="s" wrap>
        <EuiFlexItem style={{ minWidth: 160 }}>
          <EuiFormRow label="Operator" display="rowCompressed">
            <EuiSelect
              options={OPERATOR_OPTIONS}
              value={form.threshold.operator}
              onChange={(e) => updateThreshold('operator', e.target.value as ThresholdCondition['operator'])}
              compressed
              aria-label="Threshold operator"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 100 }}>
          <EuiFormRow label="Value" display="rowCompressed">
            <EuiFieldNumber
              value={form.threshold.value}
              onChange={(e) => updateThreshold('value', parseFloat(e.target.value) || 0)}
              compressed
              aria-label="Threshold value"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 60 }}>
          <EuiFormRow label="Unit" display="rowCompressed">
            <EuiFieldText
              value={form.threshold.unit}
              onChange={(e) => updateThreshold('unit', e.target.value)}
              placeholder="%"
              compressed
              aria-label="Threshold unit"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 160 }}>
          <EuiFormRow label="For Duration" display="rowCompressed">
            <EuiSelect
              options={DURATION_OPTIONS}
              value={form.threshold.forDuration}
              onChange={(e) => updateThreshold('forDuration', e.target.value)}
              compressed
              aria-label="For duration"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />
      <EuiCallOut size="s" color="primary" iconType="iInCircle">
        <EuiText size="xs">
          Alert fires when: <code>{form.query || '<query>'} {form.threshold.operator} {form.threshold.value}{form.threshold.unit}</code> for {form.threshold.forDuration}
        </EuiText>
      </EuiCallOut>

      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiText size="xs"><strong>Results</strong></EuiText>
          <EuiText size="xs" color="subdued">{metricName}</EuiText>
          <EuiSpacer size="xs" />
          <ReactEChartsCore
            echarts={echarts}
            option={buildThresholdChartOption(form.threshold.value)}
            style={{ height: 200, width: '100%' }}
            notMerge
            lazyUpdate
          />
        </>
      )}
    </EuiAccordion>
  );
};

/** Section 4: Evaluation Settings */
const EvaluationSettingsSection: React.FC<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion id="metrics-eval-settings" buttonContent={<strong>Evaluation Settings</strong>} initialIsOpen paddingSize="m">
    <EuiFlexGroup gutterSize="s" wrap>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Eval Interval" helpText="How often evaluated" display="rowCompressed">
          <EuiSelect
            options={INTERVAL_OPTIONS}
            value={form.evaluationInterval}
            onChange={(e) => onUpdate({ evaluationInterval: e.target.value })}
            compressed
            aria-label="Evaluation interval"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Pending Period" helpText="Before firing" display="rowCompressed">
          <EuiSelect
            options={DURATION_OPTIONS}
            value={form.pendingPeriod}
            onChange={(e) => onUpdate({ pendingPeriod: e.target.value })}
            compressed
            aria-label="Pending period"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiFormRow label="Firing Period" helpText="Min firing time" display="rowCompressed">
          <EuiSelect
            options={DURATION_OPTIONS}
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
  onChange: (labels: LabelEntry[]) => void;
}> = ({ labels, onChange }) => {
  const addLabel = () => onChange([...labels, { key: '', value: '' }]);
  const removeLabel = (i: number) => onChange(labels.filter((_, idx) => idx !== i));
  const updateLabel = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...labels];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };
  const toggleDynamic = (i: number) => {
    const next = [...labels];
    next[i] = { ...next[i], isDynamic: !next[i].isDynamic };
    onChange(next);
  };

  return (
    <EuiAccordion id="metrics-labels" buttonContent={<strong>Labels</strong>} initialIsOpen paddingSize="m">
      <EuiText size="xs" color="subdued">Categorize and route alerts</EuiText>
      <EuiSpacer size="s" />
      {labels.map((label, i) => (
        <EuiFlexGroup key={i} gutterSize="s" alignItems="center" responsive={false} style={{ marginBottom: 4 }}>
          <EuiFlexItem grow={2}>
            <EuiFieldText
              placeholder="Key"
              value={label.key}
              onChange={(e) => updateLabel(i, 'key', e.target.value)}
              compressed
              aria-label={`Label key ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}><EuiText size="s">=</EuiText></EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiFieldText
              placeholder={label.isDynamic ? '{{ $value }}' : 'Value'}
              value={label.value}
              onChange={(e) => updateLabel(i, 'value', e.target.value)}
              compressed
              aria-label={`Label value ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={label.isDynamic ? 'Dynamic (template)' : 'Static value'}>
              <EuiButtonIcon
                iconType={label.isDynamic ? 'bolt' : 'tag'}
                aria-label="Toggle dynamic"
                onClick={() => toggleDynamic(i)}
                color={label.isDynamic ? 'primary' : 'text'}
                size="s"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon iconType="trash" aria-label="Remove label" onClick={() => removeLabel(i)} color="danger" size="s" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiFlexGroup gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addLabel}>Add label</EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" responsive={false}>
            {COMMON_LABEL_KEYS.filter(k => !labels.some(l => l.key === k)).slice(0, 4).map(k => (
              <EuiFlexItem grow={false} key={k}>
                <EuiBadge
                  color="hollow"
                  onClick={() => onChange([...labels, { key: k, value: '' }])}
                  onClickAriaLabel={`Add ${k} label`}
                >
                  + {k}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiAccordion>
  );
};

/** Section 6: Annotations */
const AnnotationsSection: React.FC<{
  annotations: AnnotationEntry[];
  onChange: (annotations: AnnotationEntry[]) => void;
}> = ({ annotations, onChange }) => {
  const addAnnotation = () => onChange([...annotations, { key: '', value: '' }]);
  const removeAnnotation = (i: number) => onChange(annotations.filter((_, idx) => idx !== i));
  const updateAnnotation = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...annotations];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <EuiAccordion
      id="metrics-annotations"
      buttonContent={
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
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
              placeholder="Key (e.g. summary)"
              value={ann.key}
              onChange={(e) => updateAnnotation(i, 'key', e.target.value)}
              compressed
              aria-label={`Annotation key ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}><EuiText size="s">=</EuiText></EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiFieldText
              placeholder="Value"
              value={ann.value}
              onChange={(e) => updateAnnotation(i, 'value', e.target.value)}
              compressed
              aria-label={`Annotation value ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon iconType="trash" aria-label="Remove annotation" onClick={() => removeAnnotation(i)} color="danger" size="s" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>Add annotation</EuiButtonEmpty>
    </EuiAccordion>
  );
};

/** Section 7: Actions */
const ActionsSection: React.FC<{
  actions: ActionState[];
  onDeleteAction: (id: string) => void;
  onAddAction: () => void;
}> = ({ actions, onDeleteAction, onAddAction }) => (
  <section>
    <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
      <EuiFlexItem grow={false}><EuiTitle size="xs"><h3>Actions ({actions.length})</h3></EuiTitle></EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {actions.map((action, i) => (
      <EuiAccordion
        key={action.id}
        id={`metrics-action-${action.id}`}
        buttonContent={<span>{i + 1}. {action.name}</span>}
        extraAction={
          <EuiButtonEmpty size="xs" color="danger" onClick={() => onDeleteAction(action.id)} aria-label={`Delete ${action.name}`}>
            Delete
          </EuiButtonEmpty>
        }
        paddingSize="s"
      >
        <EuiText size="xs" color="subdued">Action configuration placeholder</EuiText>
      </EuiAccordion>
    ))}
    <EuiSpacer size="s" />
    <EuiButtonEmpty size="s" iconType="plusInCircle" onClick={onAddAction}>
      Add another action
    </EuiButtonEmpty>
  </section>
);

/** Section 8: Rule Preview (YAML) */
const RulePreviewSection: React.FC<{
  form: MetricsMonitorFormState;
}> = ({ form }) => {
  const yaml = useMemo(() => {
    const labels = form.labels.filter(l => l.key && l.value);
    const annotations = form.annotations.filter(a => a.key && a.value);
    let out = `- alert: ${form.monitorName || '<monitor-name>'}\n`;
    out += `  expr: ${form.query || '<promql-expression>'} ${form.threshold.operator} ${form.threshold.value}\n`;
    out += `  for: ${form.threshold.forDuration}\n`;
    if (labels.length > 0) {
      out += `  labels:\n`;
      for (const l of labels) out += `    ${l.key}: ${l.isDynamic ? l.value : `"${l.value}"`}\n`;
    }
    if (annotations.length > 0) {
      out += `  annotations:\n`;
      for (const a of annotations) out += `    ${a.key}: "${a.value}"\n`;
    }
    return out;
  }, [form]);

  return (
    <EuiAccordion
      id="metrics-rule-preview"
      buttonContent={<strong>Rule Preview (YAML)</strong>}
      initialIsOpen={false}
      paddingSize="m"
    >
      <EuiPanel color="subdued" paddingSize="s">
        <pre style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>{yaml}</pre>
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
    query: '',
    threshold: { operator: '>', value: 0, unit: '%', forDuration: '5m' },
    evaluationInterval: '1m',
    pendingPeriod: '5m',
    firingPeriod: '5m',
    labels: [{ key: 'severity', value: 'critical' }],
    annotations: [
      { key: 'summary', value: '' },
      { key: 'description', value: '' },
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
    setForm((prev) => ({ ...prev, actions: prev.actions.filter((a) => a.id !== id) }));
  }, []);

  const addAction = useCallback(() => {
    const name = `action_${form.actions.length + 1}`;
    setForm((prev) => ({ ...prev, actions: [...prev.actions, { id: `action-${Date.now()}`, name }] }));
  }, [form.actions.length]);

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
            <EuiBadge color="accent">Metrics</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">PromQL-based alerting rule</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <MonitorDetailsSection form={form} onUpdate={updateForm} />
        <EuiSpacer size="l" />
        <QuerySection form={form} onUpdate={updateForm} showPreview={showPreview} onRunPreview={handleRunPreview} />
        <EuiSpacer size="l" />
        <AlertConditionSection form={form} onUpdate={updateForm} showPreview={showPreview} />
        <EuiSpacer size="l" />
        <EvaluationSettingsSection form={form} onUpdate={updateForm} />
        <EuiSpacer size="l" />
        <LabelsSection labels={form.labels} onChange={(labels) => updateForm({ labels })} />
        <EuiSpacer size="l" />
        <AnnotationsSection annotations={form.annotations} onChange={(annotations) => updateForm({ annotations })} />
        <EuiSpacer size="l" />
        <ActionsSection actions={form.actions} onDeleteAction={deleteAction} onAddAction={addAction} />
        <EuiSpacer size="l" />
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
