/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create SLO Wizard — 5-section accordion form for defining Service Level Objectives.
 * Generates Prometheus recording + alerting rules following the MWMBR pattern.
 *
 * Uses the same generateSloRuleGroup() function client-side (for preview)
 * and server-side (for deployment) to ensure no divergence.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiSelect,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiCallOut,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiRadioGroup,
  EuiCheckbox,
} from '@opensearch-project/oui';
import type {
  SloInput,
  SliType,
  SliCalcMethod,
  SliSourceType,
  BurnRateConfig,
  SloAlarmConfig,
  ExclusionWindow,
} from '../../core/slo_types';
import { DEFAULT_MWMBR_TIERS } from '../../core/slo_types';
import { validateSloFormFull } from '../../core/slo_validators';
import { SloPreviewPanel } from './slo_preview_panel';

// ============================================================================
// Types
// ============================================================================

interface CreateSloWizardProps {
  datasourceId: string;
  onClose: () => void;
  onCreated: () => void;
  apiClient: { createSlo: (data: any) => Promise<unknown> };
}

// ============================================================================
// Constants
// ============================================================================

const SLI_TYPE_OPTIONS = [
  { value: 'availability', text: 'Availability' },
  { value: 'latency_p99', text: 'Latency (p99)' },
  { value: 'latency_p90', text: 'Latency (p90)' },
  { value: 'latency_p50', text: 'Latency (p50)' },
];

const CALC_METHOD_OPTIONS = [
  { value: 'good_requests', text: 'Number of good requests' },
  { value: 'good_periods', text: 'Number of good periods' },
];

const SOURCE_TYPE_RADIOS = [
  { id: 'service_operation', label: 'Service operation' },
  { id: 'service_dependency', label: 'Service dependency' },
];

const WINDOW_DURATION_OPTIONS = [
  { value: '1d', text: '1 day' },
  { value: '3d', text: '3 days' },
  { value: '7d', text: '7 days' },
  { value: '14d', text: '14 days' },
  { value: '30d', text: '30 days' },
];

// ============================================================================
// Sub-components — rendered inline, not separate files
// ============================================================================

/* --- Section 1: Set SLI --- */
const SliSection: React.FC<{
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
  hasSubmitted: boolean;
  errors: Record<string, string>;
  onChange: (field: string, value: string) => void;
}> = (props) => {
  const {
    sliType,
    calcMethod,
    sourceType,
    metric,
    service,
    serviceLabelName,
    operation,
    operationLabelName,
    goodEventsFilter,
    latencyThreshold,
    dependency,
    dependencyLabelName,
    periodLength,
    hasSubmitted,
    errors,
    onChange,
  } = props;
  const isLatency = sliType.startsWith('latency_');

  return (
    <>
      <EuiFormRow label="Source type">
        <EuiRadioGroup
          options={SOURCE_TYPE_RADIOS}
          idSelected={sourceType}
          onChange={(id) => onChange('sourceType', id)}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow
        label="Prometheus metric"
        helpText="The base metric name (e.g. http_requests_total)"
        isInvalid={hasSubmitted && !!errors['sli.metric']}
        error={hasSubmitted ? errors['sli.metric'] : undefined}
      >
        <EuiFieldText
          placeholder="http_requests_total"
          value={metric}
          onChange={(e) => onChange('metric', e.target.value)}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow label="Calculate">
            <EuiSelect
              options={CALC_METHOD_OPTIONS}
              value={calcMethod}
              onChange={(e) => onChange('calcMethod', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="SLI type">
            <EuiSelect
              options={SLI_TYPE_OPTIONS}
              value={sliType}
              onChange={(e) => onChange('sliType', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      {calcMethod === 'good_periods' && (
        <>
          <EuiSpacer size="m" />
          <EuiFormRow label="Period length" helpText="Evaluation granularity for period-based SLIs">
            <EuiSelect
              options={[
                { value: '1m', text: '1 minute' },
                { value: '5m', text: '5 minutes' },
                { value: '10m', text: '10 minutes' },
              ]}
              value={periodLength}
              onChange={(e) => onChange('periodLength', e.target.value)}
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiCallOut title="Period-based SLI" iconType="iInCircle" size="s" color="primary">
            <p>
              Period-based SLIs require a recording rule to pre-compute per-period results. This
              will create an additional recording rule.
            </p>
          </EuiCallOut>
        </>
      )}
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            label="Service"
            isInvalid={hasSubmitted && !!errors['sli.service']}
            error={hasSubmitted ? errors['sli.service'] : undefined}
          >
            <EuiFieldText
              placeholder="pet-clinic-frontend"
              value={service}
              onChange={(e) => onChange('service', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 160 }}>
          <EuiFormRow label="Label name">
            <EuiFieldText
              value={serviceLabelName}
              onChange={(e) => onChange('serviceLabelName', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            label="Operation"
            isInvalid={hasSubmitted && !!errors['sli.operation']}
            error={hasSubmitted ? errors['sli.operation'] : undefined}
          >
            <EuiFieldText
              placeholder="POST /api/customer/owners"
              value={operation}
              onChange={(e) => onChange('operation', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 160 }}>
          <EuiFormRow label="Label name">
            <EuiFieldText
              value={operationLabelName}
              onChange={(e) => onChange('operationLabelName', e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      {sourceType === 'service_dependency' && (
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiFormRow label="Dependency">
              <EuiFieldText
                placeholder="payment-api"
                value={dependency}
                onChange={(e) => onChange('dependency', e.target.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ width: 160 }}>
            <EuiFormRow label="Label name">
              <EuiFieldText
                value={dependencyLabelName}
                onChange={(e) => onChange('dependencyLabelName', e.target.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      <EuiSpacer size="m" />
      {!isLatency ? (
        <EuiFormRow
          label="Good events filter"
          helpText='Label matcher to identify successful requests (e.g. status_code!~"5..")'
        >
          <EuiFieldText
            value={goodEventsFilter}
            onChange={(e) => onChange('goodEventsFilter', e.target.value)}
          />
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
            value={latencyThreshold}
            onChange={(e) => onChange('latencyThreshold', e.target.value)}
            step={0.01}
            min={0}
          />
        </EuiFormRow>
      )}
    </>
  );
};

/* --- Section 4: Burn Rate & Alarms --- */
const BurnRateSection: React.FC<{
  burnRates: BurnRateConfig[];
  alarms: SloAlarmConfig;
  hasSubmitted: boolean;
  errors: Record<string, string>;
  onBurnRatesChange: (rates: BurnRateConfig[]) => void;
  onAlarmsChange: (alarms: SloAlarmConfig) => void;
}> = ({ burnRates, alarms, hasSubmitted, errors, onBurnRatesChange, onAlarmsChange }) => {
  const addBurnRate = () => {
    onBurnRatesChange([
      ...burnRates,
      {
        shortWindow: '5m',
        longWindow: '1h',
        burnRateMultiplier: 14.4,
        severity: 'critical',
        createAlarm: true,
        forDuration: '2m',
      },
    ]);
  };

  const removeBurnRate = (index: number) => {
    onBurnRatesChange(burnRates.filter((_, i) => i !== index));
  };

  const updateBurnRate = (
    index: number,
    field: keyof BurnRateConfig,
    value: string | number | boolean
  ) => {
    const updated = [...burnRates];
    updated[index] = { ...updated[index], [field]: value };
    onBurnRatesChange(updated);
  };

  const useRecommended = () => {
    onBurnRatesChange([...DEFAULT_MWMBR_TIERS]);
  };

  return (
    <>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>Burn rate tiers (MWMBR)</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size="s" onClick={useRecommended} iconType="sparkles">
            Use recommended (Google SRE)
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiCallOut
        title="Multi-window multi-burn-rate (MWMBR)"
        iconType="iInCircle"
        size="s"
        color="primary"
      >
        <p>
          Each tier uses paired short + long windows with AND condition. Both must exceed the
          threshold for the alert to fire, balancing fast detection against false positives.
        </p>
      </EuiCallOut>
      <EuiSpacer size="m" />

      {burnRates.map((tier, i) => (
        <EuiPanel
          key={`${tier.shortWindow}-${tier.longWindow}-${tier.burnRateMultiplier}`}
          paddingSize="s"
          style={{ marginBottom: 8 }}
        >
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false} style={{ width: 90 }}>
              <EuiFormRow
                label={i === 0 ? 'Short' : undefined}
                isInvalid={hasSubmitted && !!errors[`burnRates[${i}].shortWindow`]}
              >
                <EuiFieldText
                  compressed
                  value={tier.shortWindow}
                  onChange={(e) => updateBurnRate(i, 'shortWindow', e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ width: 90 }}>
              <EuiFormRow label={i === 0 ? 'Long' : undefined}>
                <EuiFieldText
                  compressed
                  value={tier.longWindow}
                  onChange={(e) => updateBurnRate(i, 'longWindow', e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ width: 80 }}>
              <EuiFormRow label={i === 0 ? 'Rate' : undefined}>
                <EuiFieldNumber
                  compressed
                  value={tier.burnRateMultiplier}
                  onChange={(e) =>
                    updateBurnRate(i, 'burnRateMultiplier', parseFloat(e.target.value) || 0)
                  }
                  min={0}
                  step={0.1}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ width: 100 }}>
              <EuiFormRow label={i === 0 ? 'Severity' : undefined}>
                <EuiSelect
                  compressed
                  options={[
                    { value: 'critical', text: 'Critical' },
                    { value: 'warning', text: 'Warning' },
                  ]}
                  value={tier.severity}
                  onChange={(e) => updateBurnRate(i, 'severity', e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ width: 80 }}>
              <EuiFormRow label={i === 0 ? 'For' : undefined}>
                <EuiFieldText
                  compressed
                  value={tier.forDuration}
                  onChange={(e) => updateBurnRate(i, 'forDuration', e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {i === 0 ? <EuiSpacer size="l" /> : null}
              <EuiButtonIcon
                iconType="trash"
                color="danger"
                onClick={() => removeBurnRate(i)}
                aria-label="Remove tier"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      ))}

      <EuiButtonEmpty size="s" onClick={addBurnRate} iconType="plusInCircle">
        Add burn rate tier
      </EuiButtonEmpty>

      <EuiSpacer size="l" />
      <EuiText size="s">
        <strong>SLO alarms</strong>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiCheckbox
        id="alarm-sli-health"
        label="SLI health alarm — fires when error ratio exceeds budget over 5m"
        checked={alarms.sliHealth.enabled}
        onChange={() =>
          onAlarmsChange({
            ...alarms,
            sliHealth: { ...alarms.sliHealth, enabled: !alarms.sliHealth.enabled },
          })
        }
      />
      <EuiSpacer size="s" />
      <EuiCheckbox
        id="alarm-attainment"
        label="SLO attainment breach alarm — fires when attainment drops below target"
        checked={alarms.attainmentBreach.enabled}
        onChange={() =>
          onAlarmsChange({
            ...alarms,
            attainmentBreach: {
              ...alarms.attainmentBreach,
              enabled: !alarms.attainmentBreach.enabled,
            },
          })
        }
      />
      <EuiSpacer size="s" />
      <EuiCheckbox
        id="alarm-budget-warning"
        label="Error budget warning alarm — fires when remaining budget drops below threshold"
        checked={alarms.budgetWarning.enabled}
        onChange={() =>
          onAlarmsChange({
            ...alarms,
            budgetWarning: { ...alarms.budgetWarning, enabled: !alarms.budgetWarning.enabled },
          })
        }
      />
    </>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const CreateSloWizard: React.FC<CreateSloWizardProps> = ({
  datasourceId,
  onClose,
  onCreated,
  apiClient,
}) => {
  // Form state
  const [sliType, setSliType] = useState<SliType>('availability');
  const [calcMethod, setCalcMethod] = useState<SliCalcMethod>('good_requests');
  const [sourceType, setSourceType] = useState<SliSourceType>('service_operation');
  const [metric, setMetric] = useState('http_requests_total');
  const [service, setService] = useState('');
  const [serviceLabelName, setServiceLabelName] = useState('service');
  const [operation, setOperation] = useState('');
  const [operationLabelName, setOperationLabelName] = useState('endpoint');
  const [goodEventsFilter, setGoodEventsFilter] = useState('status_code!~"5.."');
  const [latencyThreshold, setLatencyThreshold] = useState('0.5');
  const [dependency, setDependency] = useState('');
  const [dependencyLabelName, setDependencyLabelName] = useState('peer_service');
  const [periodLength, setPeriodLength] = useState('1m');

  const [target, setTarget] = useState('99.9');
  const [budgetWarningThreshold, setBudgetWarningThreshold] = useState('30');
  const [windowDuration, setWindowDuration] = useState('1d');
  const [exclusionWindows] = useState<ExclusionWindow[]>([]);

  const [sloName, setSloName] = useState('');
  const [autoName, setAutoName] = useState(true);

  const [burnRates, setBurnRates] = useState<BurnRateConfig[]>([...DEFAULT_MWMBR_TIERS]);
  const [alarms, setAlarms] = useState<SloAlarmConfig>({
    sliHealth: { enabled: true },
    attainmentBreach: { enabled: true },
    budgetWarning: { enabled: true },
  });

  const [tags, setTags] = useState<Array<{ key: string; value: string }>>([]);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-generate name from service + operation + SLI type
  const generatedName = useMemo(() => {
    const typeName =
      sliType === 'availability'
        ? 'Availability'
        : sliType === 'latency_p99'
          ? 'p99 Latency'
          : sliType === 'latency_p90'
            ? 'p90 Latency'
            : 'p50 Latency';
    const parts = [service, operation, typeName].filter(Boolean);
    return parts.length >= 2 ? parts.join(' — ') : '';
  }, [service, operation, sliType]);

  const effectiveName = autoName ? generatedName : sloName;

  // Build the SLO input for validation and preview
  const sloInput: Partial<SloInput> = useMemo(() => {
    const tagMap: Record<string, string> = {};
    for (const t of tags) {
      if (t.key.trim()) tagMap[t.key.trim()] = t.value.trim();
    }

    return {
      datasourceId,
      name: effectiveName,
      sli: {
        type: sliType,
        calcMethod,
        sourceType,
        metric: metric.trim(),
        goodEventsFilter: sliType === 'availability' ? goodEventsFilter : undefined,
        latencyThreshold:
          sliType !== 'availability' ? parseFloat(latencyThreshold) || undefined : undefined,
        service: { labelName: serviceLabelName, labelValue: service.trim() },
        operation: { labelName: operationLabelName, labelValue: operation.trim() },
        dependency:
          sourceType === 'service_dependency'
            ? { labelName: dependencyLabelName, labelValue: dependency.trim() }
            : undefined,
        periodLength: calcMethod === 'good_periods' ? periodLength : undefined,
      },
      target: parseFloat(target) / 100, // UI shows %, store as decimal
      budgetWarningThreshold: parseFloat(budgetWarningThreshold) / 100,
      window: { type: 'rolling' as const, duration: windowDuration },
      burnRates,
      alarms,
      exclusionWindows,
      tags: tagMap,
    };
  }, [
    datasourceId,
    effectiveName,
    sliType,
    calcMethod,
    sourceType,
    metric,
    service,
    serviceLabelName,
    operation,
    operationLabelName,
    goodEventsFilter,
    latencyThreshold,
    dependency,
    dependencyLabelName,
    periodLength,
    target,
    budgetWarningThreshold,
    windowDuration,
    burnRates,
    alarms,
    exclusionWindows,
    tags,
  ]);

  // Validation
  const { errors: validationErrors, warnings: validationWarnings } = useMemo(
    () => validateSloFormFull(sloInput as SloInput),
    [sloInput]
  );
  const isFormValid = Object.keys(validationErrors).length === 0;

  // Field change handler for SLI section
  const handleSliChange = useCallback((field: string, value: string) => {
    switch (field) {
      case 'sliType':
        setSliType(value as SliType);
        break;
      case 'calcMethod':
        setCalcMethod(value as SliCalcMethod);
        break;
      case 'sourceType':
        setSourceType(value as SliSourceType);
        break;
      case 'metric':
        setMetric(value);
        break;
      case 'service':
        setService(value);
        break;
      case 'serviceLabelName':
        setServiceLabelName(value);
        break;
      case 'operation':
        setOperation(value);
        break;
      case 'operationLabelName':
        setOperationLabelName(value);
        break;
      case 'goodEventsFilter':
        setGoodEventsFilter(value);
        break;
      case 'latencyThreshold':
        setLatencyThreshold(value);
        break;
      case 'dependency':
        setDependency(value);
        break;
      case 'dependencyLabelName':
        setDependencyLabelName(value);
        break;
      case 'periodLength':
        setPeriodLength(value);
        break;
    }
  }, []);

  // Submit
  const handleSubmit = useCallback(async () => {
    setHasSubmitted(true);
    if (!isFormValid) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient.createSlo(sloInput);
      onCreated();
      onClose();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create SLO');
    }
    setSubmitting(false);
  }, [isFormValid, sloInput, apiClient, onCreated, onClose]);

  // Tags helpers
  const addTag = () => setTags([...tags, { key: '', value: '' }]);
  const removeTag = (i: number) => setTags(tags.filter((_, idx) => idx !== i));
  const updateTag = (i: number, field: 'key' | 'value', val: string) => {
    const updated = [...tags];
    updated[i] = { ...updated[i], [field]: val };
    setTags(updated);
  };

  return (
    <EuiFlyout onClose={onClose} ownFocus size="l" aria-labelledby="createSloTitle" maxWidth={1100}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createSloTitle">Create Service Level Objective (SLO)</h2>
        </EuiTitle>
        <EuiText size="s" color="subdued">
          Define your SLO and the system will generate Prometheus recording and alerting rules
          automatically.
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiFlexGroup gutterSize="l">
          {/* Left: Form */}
          <EuiFlexItem grow={3}>
            {Object.keys(validationWarnings).length > 0 && (
              <>
                <EuiCallOut title="Validation warnings" color="warning" iconType="help" size="s">
                  {Object.entries(validationWarnings).map(([field, msg]) => (
                    <p key={field}>
                      <strong>{field}:</strong> {msg}
                    </p>
                  ))}
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}
            {submitError && (
              <>
                <EuiCallOut title="Error creating SLO" color="danger" iconType="alert">
                  <p>{submitError}</p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {/* Section 1: Set SLI */}
            <EuiAccordion
              id="slo-section-sli"
              buttonContent="Section 1 — Set Service Level Indicator (SLI)"
              initialIsOpen
              paddingSize="m"
            >
              <SliSection
                sliType={sliType}
                calcMethod={calcMethod}
                sourceType={sourceType}
                metric={metric}
                service={service}
                serviceLabelName={serviceLabelName}
                operation={operation}
                operationLabelName={operationLabelName}
                goodEventsFilter={goodEventsFilter}
                latencyThreshold={latencyThreshold}
                dependency={dependency}
                dependencyLabelName={dependencyLabelName}
                periodLength={periodLength}
                hasSubmitted={hasSubmitted}
                errors={validationErrors}
                onChange={handleSliChange}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Section 2: Set SLO */}
            <EuiAccordion
              id="slo-section-target"
              buttonContent="Section 2 — Set Service Level Objective (SLO)"
              initialIsOpen
              paddingSize="m"
            >
              <EuiFlexGroup gutterSize="m">
                <EuiFlexItem>
                  <EuiFormRow
                    label="Attainment goal (%)"
                    helpText="e.g. 99.9 for 99.9% availability"
                    isInvalid={hasSubmitted && !!validationErrors.target}
                    error={hasSubmitted ? validationErrors.target : undefined}
                  >
                    <EuiFieldNumber
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      min={90}
                      max={99.99}
                      step={0.01}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFormRow
                    label="Warn when error budget falls below (%)"
                    isInvalid={hasSubmitted && !!validationErrors.budgetWarningThreshold}
                  >
                    <EuiFieldNumber
                      value={budgetWarningThreshold}
                      onChange={(e) => setBudgetWarningThreshold(e.target.value)}
                      min={1}
                      max={99}
                      step={1}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="m" />
              <EuiFormRow label="Measurement window" helpText="Rolling window duration">
                <EuiSelect
                  options={WINDOW_DURATION_OPTIONS}
                  value={windowDuration}
                  onChange={(e) => setWindowDuration(e.target.value)}
                />
              </EuiFormRow>
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Section 3: Set Name */}
            <EuiAccordion
              id="slo-section-name"
              buttonContent="Section 3 — Set SLO Name"
              initialIsOpen
              paddingSize="m"
            >
              <EuiFormRow
                label="SLO name"
                isInvalid={hasSubmitted && !!validationErrors.name}
                error={hasSubmitted ? validationErrors.name : undefined}
              >
                <EuiFieldText
                  value={autoName ? generatedName : sloName}
                  onChange={(e) => {
                    setAutoName(false);
                    setSloName(e.target.value);
                  }}
                  placeholder="Auto-generated from service + operation"
                />
              </EuiFormRow>
              {!autoName && generatedName && (
                <EuiButtonEmpty size="xs" onClick={() => setAutoName(true)}>
                  Reset to auto-generated name
                </EuiButtonEmpty>
              )}
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                Rule group:{' '}
                <code>
                  slo:
                  {effectiveName
                    ? effectiveName
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .slice(0, 40)
                    : '...'}
                </code>
              </EuiText>
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Section 4: Burn Rate & Alarms */}
            <EuiAccordion
              id="slo-section-burnrate"
              buttonContent="Section 4 — Set Expected Burn Rate and Alarms"
              initialIsOpen
              paddingSize="m"
            >
              <BurnRateSection
                burnRates={burnRates}
                alarms={alarms}
                hasSubmitted={hasSubmitted}
                errors={validationErrors}
                onBurnRatesChange={setBurnRates}
                onAlarmsChange={setAlarms}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            {/* Section 5: Tags */}
            <EuiAccordion
              id="slo-section-tags"
              buttonContent="Section 5 — Add Tags (optional)"
              paddingSize="m"
            >
              {tags.map((tag, i) => (
                <EuiFlexGroup
                  key={i}
                  gutterSize="s"
                  alignItems="center"
                  style={{ marginBottom: 4 }}
                >
                  <EuiFlexItem>
                    <EuiFieldText
                      compressed
                      placeholder="Key"
                      value={tag.key}
                      onChange={(e) => updateTag(i, 'key', e.target.value)}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFieldText
                      compressed
                      placeholder="Value"
                      value={tag.value}
                      onChange={(e) => updateTag(i, 'value', e.target.value)}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonIcon
                      iconType="trash"
                      color="danger"
                      onClick={() => removeTag(i)}
                      aria-label="Remove tag"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              ))}
              <EuiButtonEmpty size="s" onClick={addTag} iconType="plusInCircle">
                Add tag
              </EuiButtonEmpty>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                Tags are added to all generated rule labels with a <code>tag_</code> prefix.
              </EuiText>
            </EuiAccordion>
          </EuiFlexItem>

          {/* Right: Preview Panel */}
          <EuiFlexItem grow={2}>
            <SloPreviewPanel sloInput={sloInput} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSubmit}
              isLoading={submitting}
              isDisabled={hasSubmitted && !isFormValid}
            >
              Create SLO
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
