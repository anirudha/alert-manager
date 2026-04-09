/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLI Section — extracted from create_slo_wizard.tsx.
 *
 * Section 1 of the Create SLO wizard: configures the Service Level Indicator
 * (SLI) including metric, SLI type, calculation method, source type,
 * service/operation/dependency labels, and good events filter.
 *
 * Uses `usePrometheusMetadata` hook for autocomplete with cascading logic.
 * Falls back to plain EuiFieldText when metadata APIs are unavailable.
 * Wrapped in React.memo for memoized rendering.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import {
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiSelect,
  EuiRadioGroup,
  EuiCallOut,
  EuiLoadingSpinner,
  EuiText,
} from '@opensearch-project/oui';
import type { EuiComboBoxOptionOption } from '@opensearch-project/oui';
import type { SliType, SliCalcMethod, SliSourceType } from '../../common/slo_types';
import type { SloTemplate } from '../../common/slo_templates';
import { detectMetricType } from '../../common/slo_templates';
import type { AlarmsApiClient } from '../services/alarms_client';
import { usePrometheusMetadata } from '../hooks/use_prometheus_metadata';
import {
  MetricComboBox,
  MetricTypeBadge,
  LabelValueComboBox,
  GoodEventsFilterCombo,
} from './sli_combo_boxes';
import { SloTemplateSelector } from './slo_template_selector';

// ---- Exported types + reducer (consumed by CreateSloWizard) ----------------

export interface SliFormState {
  sliType: SliType;
  calcMethod: SliCalcMethod;
  sourceType: SliSourceType;
  metric: string;
  service: string;
  serviceLabelName: string;
  operation: string;
  operationLabelName: string;
  goodEventsFilter: string;
  latencyThreshold: string;
  dependency: string;
  dependencyLabelName: string;
  periodLength: string;
}

export type SliFormAction =
  | { type: 'SET_FIELD'; field: keyof SliFormState; value: string }
  | { type: 'APPLY_TEMPLATE'; template: SloTemplate }
  | { type: 'SET_SLI_TYPE'; value: SliType }
  | { type: 'SET_SOURCE_TYPE'; value: SliSourceType };

export const initialSliState: SliFormState = {
  sliType: 'availability',
  calcMethod: 'good_requests',
  sourceType: 'service_operation',
  metric: 'http_requests_total',
  service: '',
  serviceLabelName: 'service',
  operation: '',
  operationLabelName: 'endpoint',
  goodEventsFilter: 'status_code!~"5.."',
  latencyThreshold: '0.5',
  dependency: '',
  dependencyLabelName: 'peer_service',
  periodLength: '1m',
};

export function sliFormReducer(state: SliFormState, action: SliFormAction): SliFormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'APPLY_TEMPLATE': {
      const t = action.template;
      return {
        ...state,
        metric: t.metricPattern,
        sliType: t.sliType,
        calcMethod: t.calcMethod,
        serviceLabelName: t.serviceLabelName,
        operationLabelName: t.operationLabelName,
        goodEventsFilter: t.goodEventsFilter ?? '',
        latencyThreshold:
          t.latencyThreshold !== undefined ? String(t.latencyThreshold) : state.latencyThreshold,
      };
    }
    case 'SET_SLI_TYPE':
      return { ...state, sliType: action.value };
    case 'SET_SOURCE_TYPE':
      return { ...state, sourceType: action.value };
  }
}

// ---- Constants -------------------------------------------------------------

const SLI_TYPE_OPTS = [
  { value: 'availability', text: 'Availability' },
  { value: 'latency_p99', text: 'Latency (p99)' },
  { value: 'latency_p90', text: 'Latency (p90)' },
  { value: 'latency_p50', text: 'Latency (p50)' },
];
const CALC_OPTS = [
  { value: 'good_requests', text: 'Number of good requests' },
  { value: 'good_periods', text: 'Number of good periods' },
];
const SRC_RADIOS = [
  { id: 'service_operation', label: 'Service operation' },
  { id: 'service_dependency', label: 'Service dependency' },
];
const PERIOD_OPTS = [
  { value: '1m', text: '1 minute' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
];

// ---- Props -----------------------------------------------------------------

export interface SliSectionProps {
  datasourceId: string;
  apiClient: Pick<
    AlarmsApiClient,
    'getMetricNames' | 'getLabelNames' | 'getLabelValues' | 'getMetricMetadata'
  >;
  sliState: SliFormState;
  dispatch: React.Dispatch<SliFormAction>;
  hasSubmitted: boolean;
  errors: Record<string, string>;
}

// ---- Component -------------------------------------------------------------

const SliSectionInner: React.FC<SliSectionProps> = ({
  datasourceId,
  apiClient,
  sliState: s,
  dispatch,
  hasSubmitted,
  errors,
}) => {
  const isLatency = s.sliType.startsWith('latency_');
  const md = usePrometheusMetadata({ datasourceId, apiClient, selectedMetric: s.metric });
  const useFallback = md.error;

  const detectedType = useMemo(() => {
    if (!s.metric) return undefined;
    const meta = md.metricMetadata.find((m) => m.metric === s.metric);
    return detectMetricType(s.metric, meta);
  }, [s.metric, md.metricMetadata]);

  // Fetch label values when label names change
  // fetchLabelValues identity changes when selectedMetric changes, but s.metric already
  // tracks that — including fetchLabelValues in deps would cause duplicate fetches on template apply.
  useEffect(() => {
    if (s.serviceLabelName && s.metric) md.fetchLabelValues(s.serviceLabelName);
  }, [s.serviceLabelName, s.metric]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.operationLabelName && s.metric) md.fetchLabelValues(s.operationLabelName);
  }, [s.operationLabelName, s.metric]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.sourceType === 'service_dependency' && s.dependencyLabelName && s.metric)
      md.fetchLabelValues(s.dependencyLabelName);
  }, [s.dependencyLabelName, s.metric, s.sourceType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Template tracking
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const modifiedRef = React.useRef<Set<string>>(new Set());

  const onTemplate = useCallback(
    (t: SloTemplate) => {
      md.applyTemplate();
      dispatch({ type: 'APPLY_TEMPLATE', template: t });
      setTemplateId(t.id);
      modifiedRef.current.clear();
    },
    [dispatch, md.applyTemplate]
  );

  const labelOpts = useMemo(() => {
    if (md.labelNames.length === 0) return null;
    return [{ value: '', text: 'Select...' }, ...md.labelNames.map((n) => ({ value: n, text: n }))];
  }, [md.labelNames]);

  const set = useCallback(
    (f: keyof SliFormState, v: string) => {
      modifiedRef.current.add(f);
      dispatch({ type: 'SET_FIELD', field: f, value: v });
    },
    [dispatch]
  );

  // Helper: render label value field (combo or text)
  const valueField = (
    val: string,
    field: keyof SliFormState,
    label: string,
    ph: string,
    opts: EuiComboBoxOptionOption[] | undefined,
    loading: boolean,
    testSubj?: string
  ) =>
    useFallback ? (
      <EuiFieldText
        placeholder={ph}
        value={val}
        onChange={(e) => set(field, e.target.value)}
        aria-label={label}
      />
    ) : (
      <LabelValueComboBox
        selectedValue={val}
        onChange={(v) => set(field, v)}
        options={opts ?? []}
        isLoading={loading}
        placeholder={ph}
        isInvalid={hasSubmitted && !!errors[`sli.${field}`]}
        ariaLabel={label}
        testSubj={testSubj}
      />
    );

  return (
    <>
      <SloTemplateSelector
        selectedId={templateId}
        onSelect={onTemplate}
        userModifiedFields={modifiedRef.current}
      />
      <EuiSpacer size="m" />

      {useFallback && (
        <>
          <EuiCallOut
            title="Metric autocomplete unavailable"
            iconType="alert"
            size="s"
            color="warning"
          >
            <p>
              Could not reach the Prometheus metadata API. You can still type metric names, label
              names, and values manually in the fields below.
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiFormRow label="Source type">
        <EuiRadioGroup
          options={SRC_RADIOS}
          idSelected={s.sourceType}
          onChange={(id) => dispatch({ type: 'SET_SOURCE_TYPE', value: id as SliSourceType })}
          data-test-subj="alertManager-sliSection-sourceType"
        />
      </EuiFormRow>
      <EuiSpacer size="m" />

      <EuiFormRow
        label="Prometheus metric"
        helpText="The base metric name (e.g. http_requests_total)"
        isInvalid={hasSubmitted && !!errors['sli.metric']}
        error={hasSubmitted ? errors['sli.metric'] : undefined}
        append={<MetricTypeBadge metricType={detectedType?.type} />}
      >
        {useFallback ? (
          <EuiFieldText
            placeholder="http_requests_total"
            value={s.metric}
            onChange={(e) => set('metric', e.target.value)}
            aria-label="Prometheus metric name"
            data-test-subj="alertManager-sliSection-metricText"
          />
        ) : (
          <MetricComboBox
            selectedMetric={s.metric}
            onChange={(v) => set('metric', v)}
            options={md.metricOptions}
            isLoading={md.metricsLoading}
            onSearchChange={md.searchMetrics}
            metricType={detectedType?.type}
            isInvalid={hasSubmitted && !!errors['sli.metric']}
          />
        )}
      </EuiFormRow>

      {md.labelNamesLoading && (
        <EuiFlexGroup
          gutterSize="xs"
          alignItems="center"
          responsive={false}
          style={{ marginTop: 4 }}
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              Loading label options for <strong>{s.metric}</strong>...
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow label="Calculate">
            <EuiSelect
              options={CALC_OPTS}
              value={s.calcMethod}
              onChange={(e) => set('calcMethod', e.target.value)}
              aria-label="Calculation method"
              data-test-subj="alertManager-sliSection-calcMethod"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="SLI type">
            <EuiSelect
              options={SLI_TYPE_OPTS}
              value={s.sliType}
              onChange={(e) => dispatch({ type: 'SET_SLI_TYPE', value: e.target.value as SliType })}
              aria-label="SLI type"
              data-test-subj="alertManager-sliSection-sliType"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLatency && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut title="Latency SLI selected" iconType="iInCircle" size="s" color="primary">
            <p>
              Latency SLIs measure the proportion of requests served faster than the threshold
              below. The metric should be a histogram (ending in <code>_bucket</code>). The system
              computes the percentile from histogram buckets automatically.
            </p>
          </EuiCallOut>
        </>
      )}

      {s.calcMethod === 'good_periods' && (
        <>
          <EuiSpacer size="m" />
          <EuiFormRow label="Period length" helpText="Evaluation granularity for period-based SLIs">
            <EuiSelect
              options={PERIOD_OPTS}
              value={s.periodLength}
              onChange={(e) => set('periodLength', e.target.value)}
              aria-label="Period length"
              data-test-subj="alertManager-sliSection-periodLength"
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiCallOut title="Period-based SLI" iconType="iInCircle" size="s" color="primary">
            <p>
              Period-based SLIs require an additional recording rule to pre-compute per-period
              results.
            </p>
          </EuiCallOut>
        </>
      )}
      <EuiSpacer size="m" />

      {/* Service */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            label="Service"
            isInvalid={hasSubmitted && !!errors['sli.service']}
            error={hasSubmitted ? errors['sli.service'] : undefined}
          >
            {valueField(
              s.service,
              'service',
              'Service name',
              'Select or type, e.g. pet-clinic-frontend',
              md.labelValues[s.serviceLabelName],
              md.labelValuesLoading[s.serviceLabelName] ?? false,
              'alertManager-sliSection-serviceValueCombo'
            )}
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 160 }}>
          <EuiFormRow label="Label name">
            <EuiSelect
              options={labelOpts ?? [{ value: s.serviceLabelName, text: s.serviceLabelName }]}
              value={s.serviceLabelName}
              onChange={(e) => set('serviceLabelName', e.target.value)}
              aria-label="Service label name"
              data-test-subj="alertManager-sliSection-serviceLabelName"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Operation */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            label="Operation"
            isInvalid={hasSubmitted && !!errors['sli.operation']}
            error={hasSubmitted ? errors['sli.operation'] : undefined}
          >
            {valueField(
              s.operation,
              'operation',
              'Operation name',
              'Select or type, e.g. POST /api/owners',
              md.labelValues[s.operationLabelName],
              md.labelValuesLoading[s.operationLabelName] ?? false,
              'alertManager-sliSection-operationValueCombo'
            )}
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 160 }}>
          <EuiFormRow label="Label name">
            <EuiSelect
              options={labelOpts ?? [{ value: s.operationLabelName, text: s.operationLabelName }]}
              value={s.operationLabelName}
              onChange={(e) => set('operationLabelName', e.target.value)}
              aria-label="Operation label name"
              data-test-subj="alertManager-sliSection-operationLabelName"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Dependency */}
      {s.sourceType === 'service_dependency' && (
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiFormRow label="Dependency">
              {valueField(
                s.dependency,
                'dependency',
                'Dependency name',
                'Select or type, e.g. payment-api',
                md.labelValues[s.dependencyLabelName],
                md.labelValuesLoading[s.dependencyLabelName] ?? false,
                'alertManager-sliSection-dependencyValueCombo'
              )}
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ width: 160 }}>
            <EuiFormRow label="Label name">
              <EuiSelect
                options={
                  labelOpts ?? [{ value: s.dependencyLabelName, text: s.dependencyLabelName }]
                }
                value={s.dependencyLabelName}
                onChange={(e) => set('dependencyLabelName', e.target.value)}
                aria-label="Dependency label name"
                data-test-subj="alertManager-sliSection-dependencyLabelName"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      <EuiSpacer size="m" />

      {/* Good events filter or latency threshold */}
      {!isLatency ? (
        <EuiFormRow
          label="Good events filter"
          helpText='Label matcher to identify successful requests (e.g. status_code!~"5..")'
        >
          {useFallback ? (
            <EuiFieldText
              value={s.goodEventsFilter}
              onChange={(e) => set('goodEventsFilter', e.target.value)}
              aria-label="Good events filter"
              data-test-subj="alertManager-sliSection-goodEventsFilterText"
            />
          ) : (
            <GoodEventsFilterCombo
              value={s.goodEventsFilter}
              onChange={(v) => set('goodEventsFilter', v)}
            />
          )}
        </EuiFormRow>
      ) : (
        <EuiFormRow
          label="Latency threshold (seconds)"
          helpText="Requests exceeding this latency are counted as errors"
          isInvalid={hasSubmitted && !!errors['sli.latencyThreshold']}
          error={hasSubmitted ? errors['sli.latencyThreshold'] : undefined}
        >
          <EuiFieldNumber
            placeholder="0.5"
            value={s.latencyThreshold}
            onChange={(e) => set('latencyThreshold', e.target.value)}
            step={0.01}
            min={0}
            aria-label="Latency threshold in seconds"
            data-test-subj="alertManager-sliSection-latencyThreshold"
          />
        </EuiFormRow>
      )}
    </>
  );
};

export const SliSection = React.memo(SliSectionInner);
