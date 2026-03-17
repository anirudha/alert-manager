/**
 * Create Logs Monitor — flyout form based on the Logs alert spec.
 * Sections: Monitor Details, Query (PPL / Query Editor), Schedule,
 * Triggers (with threshold visualization), Actions, and a sticky footer.
 */
import React, { useState, useCallback } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
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
  EuiIcon,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiCheckbox,
  EuiBasicTable,
  EuiHorizontalRule,
  EuiPopover,
  EuiListGroup,
  EuiListGroupItem,
} from '@opensearch-project/oui';

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

// ============================================================================
// Types
// ============================================================================

interface TriggerState {
  id: string;
  name: string;
  severityLevel: string;
  type: string;
  conditionOperator: string;
  conditionValue: number;
  visualMode: 'visual' | 'per_value';
  suppressEnabled: boolean;
  suppressExpiry: number;
  suppressExpiryUnit: string;
}

interface ActionState {
  id: string;
  name: string;
}

export interface LogsMonitorFormState {
  monitorName: string;
  description: string;
  selectedDatasource: string;
  query: string;
  frequencyType: string;
  runEveryValue: number;
  runEveryUnit: string;
  triggers: TriggerState[];
  actions: ActionState[];
}

export interface CreateLogsMonitorProps {
  onCancel: () => void;
  onSave: (form: LogsMonitorFormState) => void;
}

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' },
  { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium' },
  { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'extraction_query_response', text: 'Extraction query response' },
  { value: 'document_count', text: 'Document count' },
];

const CONDITION_OPERATOR_OPTIONS = [
  { value: 'is_greater_than', text: 'is greater than' },
  { value: 'is_less_than', text: 'is less than' },
  { value: 'is_equal_to', text: 'is equal to' },
  { value: 'is_not_equal_to', text: 'is not equal to' },
  { value: 'is_greater_or_equal', text: 'is greater than or equal' },
  { value: 'is_less_or_equal', text: 'is less than or equal' },
];

const FREQUENCY_OPTIONS = [
  { value: 'by_interval', text: 'By interval' },
  { value: 'daily', text: 'Daily' },
  { value: 'weekly', text: 'Weekly' },
  { value: 'monthly', text: 'Monthly' },
  { value: 'custom_cron', text: 'Custom cron expression' },
];

const TIME_UNIT_OPTIONS = [
  { value: 'minute(s)', text: 'minute(s)' },
  { value: 'hour(s)', text: 'hour(s)' },
  { value: 'day(s)', text: 'day(s)' },
];

const DEFAULT_PPL_QUERY = `source = logs-* | where @timestamp > NOW() - INTERVAL 5 MINUTE
| stats count() as EVENTS_LAST_HOUR_v2 by span(@timestamp, 1h)`;

function createDefaultTrigger(index: number): TriggerState {
  return {
    id: `trigger-${Date.now()}-${index}`,
    name: `Trigger ${index + 1}`,
    severityLevel: 'critical',
    type: 'extraction_query_response',
    conditionOperator: 'is_greater_than',
    conditionValue: 900,
    visualMode: 'visual',
    suppressEnabled: false,
    suppressExpiry: 24,
    suppressExpiryUnit: 'hour(s)',
  };
}

// Mock preview data
const PREVIEW_TIMESTAMPS = [
  '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00',
  '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
];
const PREVIEW_VALUES = [3, 5, 2, 7, 4, 8, 6, 9, 3, 5, 7, 4, 6, 8];

const MOCK_TABLE_ROWS = Array.from({ length: 6 }, (_, i) => ({
  date: `Nov 15, 2025 @ 25:59:0${i}.883`,
  eventType: 'login',
  status: 'false',
}));

// ============================================================================
// Chart helpers
// ============================================================================

function buildPreviewChartOption(): any {
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
    yAxis: { type: 'value', min: 0, max: 10 },
    series: [{ type: 'bar', data: PREVIEW_VALUES, itemStyle: { color: '#006BB4' } }],
  };
}

function buildTriggerChartOption(thresholdValue: number): any {
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
    yAxis: { type: 'value', min: 0, max: 10 },
    series: [{
      type: 'bar',
      data: PREVIEW_VALUES,
      itemStyle: { color: '#006BB4' },
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
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-details"
    buttonContent={<strong>Monitor Details</strong>}
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
    <EuiFormRow label={<span>Description <span style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}>— optional</span></span>} fullWidth>
      <EuiTextArea
        placeholder="Describe this monitor"
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={3}
        fullWidth
        compressed
        aria-label="Monitor description"
      />
    </EuiFormRow>
  </EuiAccordion>
);

/** Section 2: Query */
const QuerySection: React.FC<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
}> = ({ form, onUpdate, showPreview, onRunPreview }) => {
  const [showDsPicker, setShowDsPicker] = useState(false);
  const datasourceOptions = ['OpenSearch', 'OpenSearch-logs', 'OpenSearch-metrics'];

  const lineCount = form.query.split('\n').length;

  return (
    <EuiAccordion
      id="logs-query-section"
      buttonContent={<strong>Query</strong>}
      initialIsOpen
      paddingSize="m"
      extraAction={
        <EuiButton size="s" onClick={onRunPreview} aria-label="Run preview">
          Run preview
        </EuiButton>
      }
    >
      {/* Single container wrapping top bar + code editor */}
      <EuiPanel paddingSize="none" hasBorder style={{ borderRadius: 4, overflow: 'hidden' }}>
        {/* Top bar: PPL badge, datasource picker, query library */}
        <EuiFlexGroup
          gutterSize="s"
          alignItems="center"
          responsive={false}
          style={{ padding: '6px 8px', borderBottom: '1px solid #D3DAE6' }}
        >
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">PPL</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  onClick={() => setShowDsPicker(!showDsPicker)}
                  aria-label="Select data source"
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}><EuiIcon type="database" size="s" /></EuiFlexItem>
                    <EuiFlexItem grow={false}>{form.selectedDatasource}</EuiFlexItem>
                    <EuiFlexItem grow={false}><EuiIcon type="arrowDown" size="s" /></EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showDsPicker}
              closePopover={() => setShowDsPicker(false)}
              panelPaddingSize="none"
              anchorPosition="downLeft"
            >
              <EuiListGroup flush style={{ width: 200 }}>
                {datasourceOptions.map((ds) => (
                  <EuiListGroupItem
                    key={ds}
                    label={ds}
                    onClick={() => {
                      onUpdate({ selectedDatasource: ds });
                      setShowDsPicker(false);
                    }}
                    isActive={form.selectedDatasource === ds}
                    aria-label={`Select ${ds} data source`}
                  />
                ))}
              </EuiListGroup>
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" aria-label="Query library">
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}><EuiIcon type="addBookmark" size="s" /></EuiFlexItem>
                <EuiFlexItem grow={false}>Query library</EuiFlexItem>
                <EuiFlexItem grow={false}><EuiIcon type="arrowDown" size="s" /></EuiFlexItem>
              </EuiFlexGroup>
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        {/* Code editor with line numbers */}
        <div style={{ display: 'flex', position: 'relative' }}>
          {/* Line number gutter */}
          <div
            aria-hidden="true"
            style={{
              padding: '8px 0',
              minWidth: 36,
              textAlign: 'right',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: '20px',
              color: '#98A2B3',
              backgroundColor: '#F5F7FA',
              borderRight: '1px solid #D3DAE6',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} style={{ paddingRight: 8 }}>{i + 1}</div>
            ))}
          </div>
          {/* Textarea */}
          <textarea
            value={form.query}
            onChange={(e) => onUpdate({ query: e.target.value })}
            rows={Math.max(2, lineCount)}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: '20px',
              padding: '8px 12px',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              backgroundColor: 'transparent',
            }}
            aria-label="PPL query editor"
          />
          <EuiButtonIcon
            iconType="expand"
            size="s"
            aria-label="Expand editor"
            style={{ position: 'absolute', top: 4, right: 4 }}
            onClick={() => {}}
          />
        </div>
      </EuiPanel>

      {/* Preview Results */}
      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion
            id="logs-preview-results"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}><strong>Results (34)</strong></EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen
            paddingSize="s"
          >
            <EuiText size="xs" color="subdued">EVENTS_LAST_HOUR_v2</EuiText>
            <EuiSpacer size="s" />
            <ReactEChartsCore
              echarts={echarts}
              option={buildPreviewChartOption()}
              style={{ height: 200, width: '100%' }}
              notMerge
              lazyUpdate
            />
            <EuiSpacer size="s" />
            <EuiBasicTable
              items={MOCK_TABLE_ROWS}
              columns={[
                { field: 'date', name: 'Date' },
                { field: 'eventType', name: 'Event type' },
                { field: 'status', name: 'Status' },
              ]}
              tableLayout="auto"
            />
          </EuiAccordion>
        </>
      )}
    </EuiAccordion>
  );
};

/** Section 3: Schedule */
const ScheduleSection: React.FC<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}> = ({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-schedule-section"
    buttonContent={<strong>Schedule</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFlexGroup gutterSize="m">
      <EuiFlexItem>
        <EuiFormRow label="Frequency" display="rowCompressed">
          <EuiSelect
            options={FREQUENCY_OPTIONS}
            value={form.frequencyType}
            onChange={(e) => onUpdate({ frequencyType: e.target.value })}
            compressed
            aria-label="Frequency"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow label="Run every" display="rowCompressed">
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem>
              <EuiFieldNumber
                value={form.runEveryValue}
                onChange={(e) => onUpdate({ runEveryValue: parseInt(e.target.value, 10) || 1 })}
                min={1}
                compressed
                aria-label="Run every value"
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiSelect
                options={TIME_UNIT_OPTIONS}
                value={form.runEveryUnit}
                onChange={(e) => onUpdate({ runEveryUnit: e.target.value })}
                compressed
                aria-label="Run every unit"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiAccordion>
);

/** Single Trigger sub-section */
const TriggerItem: React.FC<{
  trigger: TriggerState;
  index: number;
  onUpdate: (id: string, patch: Partial<TriggerState>) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}> = ({ trigger, index, onUpdate, onDelete, canDelete }) => (
  <EuiAccordion
    id={`trigger-${trigger.id}`}
    buttonContent={<strong>{trigger.name || `Trigger ${index + 1}`}</strong>}
    initialIsOpen
    paddingSize="m"
    extraAction={
      canDelete ? (
        <EuiButtonEmpty
          size="xs"
          color="danger"
          onClick={() => onDelete(trigger.id)}
          aria-label={`Delete ${trigger.name}`}
        >
          Delete
        </EuiButtonEmpty>
      ) : undefined
    }
  >
    <EuiFormRow label="Trigger name" fullWidth>
      <EuiFieldText
        value={trigger.name}
        onChange={(e) => onUpdate(trigger.id, { name: e.target.value })}
        fullWidth
        compressed
        aria-label="Trigger name"
      />
    </EuiFormRow>
    <EuiSpacer size="s" />

    <EuiFlexGroup gutterSize="m">
      <EuiFlexItem>
        <EuiFormRow label="Severity level" display="rowCompressed">
          <EuiSelect
            options={SEVERITY_OPTIONS}
            value={trigger.severityLevel}
            onChange={(e) => onUpdate(trigger.id, { severityLevel: e.target.value })}
            compressed
            aria-label="Severity level"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow label="Type" display="rowCompressed">
          <EuiSelect
            options={TRIGGER_TYPE_OPTIONS}
            value={trigger.type}
            onChange={(e) => onUpdate(trigger.id, { type: e.target.value })}
            compressed
            aria-label="Trigger type"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />

    {/* Trigger condition */}
    <EuiFormRow label="Trigger condition">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem>
          <EuiSelect
            options={CONDITION_OPERATOR_OPTIONS}
            value={trigger.conditionOperator}
            onChange={(e) => onUpdate(trigger.id, { conditionOperator: e.target.value })}
            compressed
            aria-label="Condition operator"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 100 }}>
          <EuiFieldNumber
            value={trigger.conditionValue}
            onChange={(e) => onUpdate(trigger.id, { conditionValue: parseFloat(e.target.value) || 0 })}
            compressed
            aria-label="Condition value"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
    <EuiSpacer size="m" />

    {/* Threshold visualization */}
    <EuiPanel paddingSize="s" color="subdued">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}><EuiText size="xs"><strong>Trigger</strong></EuiText></EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={trigger.visualMode === 'visual' ? 'primary' : 'hollow'}
            onClick={() => onUpdate(trigger.id, { visualMode: 'visual' })}
            onClickAriaLabel="Visual mode"
          >
            Visual
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={trigger.visualMode === 'per_value' ? 'primary' : 'hollow'}
            onClick={() => onUpdate(trigger.id, { visualMode: 'per_value' })}
            onClickAriaLabel="Per-value threshold mode"
          >
            Per-value threshold
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="xs"><strong>Results</strong></EuiText>
      <EuiText size="xs" color="subdued">EVENTS_LAST_HOUR_v2</EuiText>
      <EuiSpacer size="xs" />
      <ReactEChartsCore
        echarts={echarts}
        option={buildTriggerChartOption(trigger.conditionValue)}
        style={{ height: 180, width: '100%' }}
        notMerge
        lazyUpdate
      />
    </EuiPanel>
    <EuiSpacer size="m" />

    {/* Suppress */}
    <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiCheckbox
          id={`suppress-${trigger.id}`}
          label="Suppress"
          checked={trigger.suppressEnabled}
          onChange={(e) => onUpdate(trigger.id, { suppressEnabled: e.target.checked })}
        />
      </EuiFlexItem>
      {trigger.suppressEnabled && (
        <>
          <EuiFlexItem grow={false}>
            <EuiFormRow label="Expires" display="rowCompressed">
              <EuiFlexGroup gutterSize="xs" responsive={false}>
                <EuiFlexItem style={{ minWidth: 60 }}>
                  <EuiFieldNumber
                    value={trigger.suppressExpiry}
                    onChange={(e) => onUpdate(trigger.id, { suppressExpiry: parseInt(e.target.value, 10) || 1 })}
                    min={1}
                    compressed
                    aria-label="Suppress expiry value"
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiSelect
                    options={TIME_UNIT_OPTIONS}
                    value={trigger.suppressExpiryUnit}
                    onChange={(e) => onUpdate(trigger.id, { suppressExpiryUnit: e.target.value })}
                    compressed
                    aria-label="Suppress expiry unit"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFormRow>
          </EuiFlexItem>
        </>
      )}
    </EuiFlexGroup>
  </EuiAccordion>
);

/** Section 4: Triggers */
const TriggersSection: React.FC<{
  triggers: TriggerState[];
  onUpdateTrigger: (id: string, patch: Partial<TriggerState>) => void;
  onDeleteTrigger: (id: string) => void;
  onAddTrigger: () => void;
}> = ({ triggers, onUpdateTrigger, onDeleteTrigger, onAddTrigger }) => (
  <section aria-label="Triggers">
    <EuiTitle size="xs"><h3>Triggers ({triggers.length})</h3></EuiTitle>
    <EuiSpacer size="s" />
    {triggers.map((trigger, idx) => (
      <React.Fragment key={trigger.id}>
        {idx > 0 && <EuiSpacer size="m" />}
        <EuiPanel paddingSize="s" hasBorder>
          <TriggerItem
            trigger={trigger}
            index={idx}
            onUpdate={onUpdateTrigger}
            onDelete={onDeleteTrigger}
            canDelete={triggers.length > 1}
          />
        </EuiPanel>
      </React.Fragment>
    ))}
    <EuiSpacer size="s" />
    <EuiButtonEmpty
      size="s"
      iconType="plusInCircle"
      onClick={onAddTrigger}
      aria-label="Add another trigger"
    >
      Add another trigger
    </EuiButtonEmpty>
  </section>
);

/** Section 5: Actions */
const ActionsSection: React.FC<{
  actions: ActionState[];
  onDeleteAction: (id: string) => void;
  onAddAction: () => void;
}> = ({ actions, onDeleteAction, onAddAction }) => (
  <section aria-label="Notification actions">
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs"><h3>Notification actions ({actions.length})</h3></EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {actions.map((action, idx) => (
      <React.Fragment key={action.id}>
        {idx > 0 && <EuiSpacer size="xs" />}
        <EuiPanel paddingSize="s" hasBorder>
          <EuiAccordion
            id={`action-${action.id}`}
            buttonContent={<span>{action.name}</span>}
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
              Action configuration placeholder — destination, message template, etc.
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

// ============================================================================
// Main Component
// ============================================================================

export const CreateLogsMonitor: React.FC<CreateLogsMonitorProps> = ({ onCancel, onSave }) => {
  const [form, setForm] = useState<LogsMonitorFormState>({
    monitorName: '',
    description: '',
    selectedDatasource: 'OpenSearch',
    query: DEFAULT_PPL_QUERY,
    frequencyType: 'by_interval',
    runEveryValue: 1,
    runEveryUnit: 'minute(s)',
    triggers: [createDefaultTrigger(0)],
    actions: [
      { id: `action-${Date.now()}-0`, name: 'slack_message' },
      { id: `action-${Date.now()}-1`, name: 'pager-duty_message' },
    ],
  });
  const [showPreview, setShowPreview] = useState(false);

  const updateForm = useCallback((patch: Partial<LogsMonitorFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTrigger = useCallback((id: string, patch: Partial<TriggerState>) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const deleteTrigger = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.filter((t) => t.id !== id),
    }));
  }, []);

  const addTrigger = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      triggers: [...prev.triggers, createDefaultTrigger(prev.triggers.length)],
    }));
  }, []);

  const deleteAction = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((a) => a.id !== id),
    }));
  }, []);

  const addAction = useCallback(() => {
    const name = `action_${form.actions.length + 1}`;
    setForm((prev) => ({
      ...prev,
      actions: [...prev.actions, { id: `action-${Date.now()}`, name }],
    }));
  }, [form.actions.length]);

  const handleRunPreview = useCallback(() => {
    setShowPreview(true);
  }, []);

  const isValid = form.monitorName.trim() !== '' && form.query.trim() !== '';

  return (
    <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="createLogsMonitorTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m"><h2 id="createLogsMonitorTitle">Create Monitor</h2></EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">Logs</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">Log-based alerting monitor</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <MonitorDetailsSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <QuerySection
          form={form}
          onUpdate={updateForm}
          showPreview={showPreview}
          onRunPreview={handleRunPreview}
        />
        <EuiHorizontalRule margin="l" />
        <ScheduleSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <TriggersSection
          triggers={form.triggers}
          onUpdateTrigger={updateTrigger}
          onDeleteTrigger={deleteTrigger}
          onAddTrigger={addTrigger}
        />
        <EuiHorizontalRule margin="l" />
        <ActionsSection
          actions={form.actions}
          onDeleteAction={deleteAction}
          onAddAction={addAction}
        />
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
