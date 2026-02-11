/**
 * Create Metric Monitor — flyout workflow for creating a PromQL-based monitor
 * with query editor, conditions, evaluation settings, labels, and annotations.
 */
import React, { useState, useMemo } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiSelect,
  EuiTextArea,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiSwitch,
  EuiToolTip,
  EuiCallOut,
  EuiTabs,
  EuiTab,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
} from '@opensearch-project/oui';
import { PromQLEditor, validatePromQL } from './promql_editor';
import { MetricBrowser } from './metric_browser';
import { UnifiedAlertSeverity } from '../../core';

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

interface MonitorFormState {
  name: string;
  query: string;
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  firingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
  severity: UnifiedAlertSeverity;
  enabled: boolean;
}

const DEFAULT_FORM: MonitorFormState = {
  name: '',
  query: '',
  threshold: { operator: '>', value: 80, unit: '%', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  firingPeriod: '10m',
  labels: [
    { key: 'severity', value: 'warning', isDynamic: true },
  ],
  annotations: [
    { key: 'summary', value: '' },
    { key: 'description', value: '' },
    { key: 'runbook_url', value: '' },
    { key: 'dashboard_url', value: '' },
  ],
  severity: 'medium',
  enabled: true,
};

const INTERVAL_OPTIONS = [
  { value: '15s', text: '15 seconds' }, { value: '30s', text: '30 seconds' },
  { value: '1m', text: '1 minute' }, { value: '2m', text: '2 minutes' },
  { value: '5m', text: '5 minutes' }, { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' }, { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

const DURATION_OPTIONS = [
  { value: '0s', text: 'Immediately (0s)' },
  { value: '30s', text: '30 seconds' }, { value: '1m', text: '1 minute' },
  { value: '2m', text: '2 minutes' }, { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' }, { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' }, { value: '1h', text: '1 hour' },
];

const OPERATOR_OPTIONS = [
  { value: '>', text: '> (greater than)' }, { value: '>=', text: '>= (greater or equal)' },
  { value: '<', text: '< (less than)' }, { value: '<=', text: '<= (less or equal)' },
  { value: '==', text: '== (equal)' }, { value: '!=', text: '!= (not equal)' },
];

const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' }, { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium (Warning)' }, { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

const COMMON_LABEL_KEYS = ['service', 'team', 'environment', 'region', 'application', 'tier', 'component'];

// ============================================================================
// Sub-components
// ============================================================================

const LabelEditor: React.FC<{
  labels: LabelEntry[];
  onChange: (labels: LabelEntry[]) => void;
  context?: { service?: string; team?: string };
}> = ({ labels, onChange, context }) => {
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

  const autoPopulate = () => {
    const next = [...labels];
    if (context?.service && !labels.some(l => l.key === 'service')) {
      next.push({ key: 'service', value: context.service });
    }
    if (context?.team && !labels.some(l => l.key === 'team')) {
      next.push({ key: 'team', value: context.team });
    }
    onChange(next);
  };

  return (
    <div>
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
              placeholder={label.isDynamic ? '{{ $labels.severity }}' : 'Value'}
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
        {context && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" iconType="importAction" onClick={autoPopulate}>
              Auto-populate from context
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
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
    </div>
  );
};

const AnnotationEditor: React.FC<{
  annotations: AnnotationEntry[];
  onChange: (annotations: AnnotationEntry[]) => void;
}> = ({ annotations, onChange }) => {
  const updateAnnotation = (i: number, val: string) => {
    const next = [...annotations];
    next[i] = { ...next[i], value: val };
    onChange(next);
  };
  const addAnnotation = () => onChange([...annotations, { key: '', value: '' }]);
  const removeAnnotation = (i: number) => onChange(annotations.filter((_, idx) => idx !== i));
  const updateKey = (i: number, key: string) => {
    const next = [...annotations];
    next[i] = { ...next[i], key };
    onChange(next);
  };

  const placeholders: Record<string, string> = {
    summary: 'Brief alert summary, e.g. "CPU usage above 80% on {{ $labels.instance }}"',
    description: 'Detailed description of what this alert means and potential impact',
    runbook_url: 'https://wiki.example.com/runbooks/...',
    dashboard_url: 'https://grafana.example.com/d/...',
  };

  return (
    <div>
      {annotations.map((ann, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
            <EuiFlexItem grow={2}>
              <EuiFieldText
                placeholder="Key"
                value={ann.key}
                onChange={(e) => updateKey(i, e.target.value)}
                compressed
                aria-label={`Annotation key ${i + 1}`}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              {ann.key === 'description' || ann.key === 'summary' ? (
                <EuiTextArea
                  placeholder={placeholders[ann.key] || 'Value'}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  rows={2}
                  aria-label={`Annotation value ${i + 1}`}
                />
              ) : (
                <EuiFieldText
                  placeholder={placeholders[ann.key] || 'Value'}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  aria-label={`Annotation value ${i + 1}`}
                />
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon iconType="trash" aria-label="Remove annotation" onClick={() => removeAnnotation(i)} color="danger" size="s" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
      ))}
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>Add annotation</EuiButtonEmpty>
    </div>
  );
};

// ============================================================================
// Main Component — Flyout
// ============================================================================

export interface CreateMonitorProps {
  onSave: (monitor: MonitorFormState) => void;
  onCancel: () => void;
  context?: { service?: string; team?: string };
}

type QueryTabId = 'editor' | 'browser';

export const CreateMonitor: React.FC<CreateMonitorProps> = ({ onSave, onCancel, context }) => {
  const [form, setForm] = useState<MonitorFormState>({ ...DEFAULT_FORM });
  const [queryTab, setQueryTab] = useState<QueryTabId>('editor');

  const update = <K extends keyof MonitorFormState>(key: K, value: MonitorFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateThreshold = <K extends keyof ThresholdCondition>(key: K, value: ThresholdCondition[K]) => {
    setForm(prev => ({ ...prev, threshold: { ...prev.threshold, [key]: value } }));
  };

  const queryErrors = useMemo(() => validatePromQL(form.query), [form.query]);
  const hasErrors = queryErrors.some(e => e.severity === 'error');
  const isValid = form.name.trim() !== '' && form.query.trim() !== '' && !hasErrors;

  const handleMetricSelect = (metricName: string) => {
    if (!form.query) {
      update('query', metricName);
    } else {
      update('query', form.query + (form.query.endsWith(' ') ? '' : ' ') + metricName);
    }
    setQueryTab('editor');
  };

  const handleSave = () => {
    if (!isValid) return;
    onSave(form);
  };

  const previewYaml = useMemo(() => {
    const labels = form.labels.filter(l => l.key && l.value);
    const annotations = form.annotations.filter(a => a.key && a.value);
    let yaml = `- alert: ${form.name || '<monitor-name>'}\n`;
    yaml += `  expr: ${form.query || '<promql-expression>'} ${form.threshold.operator} ${form.threshold.value}\n`;
    yaml += `  for: ${form.threshold.forDuration}\n`;
    if (labels.length > 0) {
      yaml += `  labels:\n`;
      for (const l of labels) yaml += `    ${l.key}: ${l.isDynamic ? l.value : `"${l.value}"`}\n`;
    }
    if (annotations.length > 0) {
      yaml += `  annotations:\n`;
      for (const a of annotations) yaml += `    ${a.key}: "${a.value}"\n`;
    }
    return yaml;
  }, [form]);

  return (
    <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="createMonitorFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m"><h2 id="createMonitorFlyoutTitle">Create Metric Monitor</h2></EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Monitor Name */}
        <EuiFormRow label="Monitor Name" fullWidth isInvalid={form.name.trim() === ''} error={form.name.trim() === '' ? 'Name is required' : undefined}>
          <EuiFieldText
            placeholder="e.g. HighCpuUsage, PaymentErrorRate"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            fullWidth
            aria-label="Monitor name"
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        {/* Query Definition */}
        <EuiPanel paddingSize="m" color="subdued">
          <EuiTitle size="xs"><h3>Query Definition</h3></EuiTitle>
          <EuiSpacer size="s" />
          <EuiTabs size="s">
            <EuiTab isSelected={queryTab === 'editor'} onClick={() => setQueryTab('editor')}>Query Editor</EuiTab>
            <EuiTab isSelected={queryTab === 'browser'} onClick={() => setQueryTab('browser')}>Metric Browser</EuiTab>
          </EuiTabs>
          <EuiSpacer size="s" />
          {queryTab === 'editor' ? (
            <PromQLEditor value={form.query} onChange={(v) => update('query', v)} height={80} />
          ) : (
            <MetricBrowser onSelectMetric={handleMetricSelect} currentQuery={form.query} />
          )}
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Threshold Condition */}
        <EuiPanel paddingSize="m" color="subdued">
          <EuiTitle size="xs"><h3>Alert Condition</h3></EuiTitle>
          <EuiText size="xs" color="subdued">Define when this monitor should fire an alert</EuiText>
          <EuiSpacer size="s" />
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
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Evaluation Settings */}
        <EuiPanel paddingSize="m" color="subdued">
          <EuiTitle size="xs"><h3>Evaluation Settings</h3></EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s" wrap>
            <EuiFlexItem style={{ minWidth: 160 }}>
              <EuiFormRow label="Eval Interval" helpText="How often evaluated" display="rowCompressed">
                <EuiSelect
                  options={INTERVAL_OPTIONS}
                  value={form.evaluationInterval}
                  onChange={(e) => update('evaluationInterval', e.target.value)}
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
                  onChange={(e) => update('pendingPeriod', e.target.value)}
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
                  onChange={(e) => update('firingPeriod', e.target.value)}
                  compressed
                  aria-label="Firing period"
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Severity + Enabled */}
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={3}>
            <EuiFormRow label="Severity" display="rowCompressed">
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={form.severity}
                onChange={(e) => update('severity', e.target.value as UnifiedAlertSeverity)}
                compressed
                aria-label="Severity"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiFormRow label="Enabled" display="rowCompressed">
              <EuiSwitch
                label=""
                checked={form.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Labels */}
        <EuiPanel paddingSize="m" color="subdued">
          <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
            <EuiFlexItem><EuiTitle size="xs"><h3>Labels</h3></EuiTitle></EuiFlexItem>
            <EuiFlexItem grow={false}><EuiText size="xs" color="subdued">Categorize and route alerts</EuiText></EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <LabelEditor labels={form.labels} onChange={(l) => update('labels', l)} context={context} />
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Annotations */}
        <EuiPanel paddingSize="m" color="subdued">
          <EuiAccordion id="annotations" buttonContent={
            <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
              <EuiFlexItem grow={false}><strong>Annotations</strong></EuiFlexItem>
              <EuiFlexItem grow={false}><EuiBadge color="hollow">Optional</EuiBadge></EuiFlexItem>
            </EuiFlexGroup>
          } initialIsOpen={true} paddingSize="none">
            <EuiSpacer size="s" />
            <AnnotationEditor annotations={form.annotations} onChange={(a) => update('annotations', a)} />
          </EuiAccordion>
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Preview */}
        <EuiAccordion id="preview" buttonContent={
          <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
            <EuiFlexItem grow={false}><strong>Rule Preview (YAML)</strong></EuiFlexItem>
          </EuiFlexGroup>
        } initialIsOpen={false} paddingSize="m">
          <EuiPanel color="subdued" paddingSize="s">
            <pre style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
              {previewYaml}
            </pre>
          </EuiPanel>
        </EuiAccordion>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onCancel}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={handleSave} isDisabled={!isValid}>Save Monitor</EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton fill onClick={handleSave} isDisabled={!isValid}>Save &amp; Enable</EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
