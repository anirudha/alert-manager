/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Combo box components for the SLI section of the Create SLO wizard.
 *
 * Three exported components:
 *  - MetricComboBox: Prometheus metric name picker with type badge
 *  - LabelValueComboBox: Label value picker (service, operation, dependency)
 *  - GoodEventsFilterCombo: Good events filter preset picker
 *
 * All components use EuiComboBox with `singleSelection={{ asPlainText: true }}`
 * and support `onCreateOption` for manual entry of values not in the dropdown.
 */
import React, { useCallback } from 'react';
import { EuiComboBox, EuiBadge } from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { GOOD_EVENTS_FILTER_PRESETS } from '../../common/slo_templates';
import type { InferredMetricType } from '../../common/slo_templates';

interface FilterOptionValue {
  value: string;
}

// ============================================================================
// MetricComboBox
// ============================================================================

export interface MetricComboBoxProps {
  selectedMetric: string;
  onChange: (metric: string) => void;
  options: EuiComboBoxOptionOption[];
  isLoading: boolean;
  onSearchChange: (query: string) => void;
  metricType?: InferredMetricType;
  isInvalid?: boolean;
  error?: string;
}

/**
 * Prometheus metric name picker with autocomplete.
 *
 * Renders an EuiComboBox in single-selection mode with:
 *  - `onSearchChange` for debounced metric name search
 *  - `onCreateOption` for typing a custom metric name
 *  - Optional metric type badge shown via the `append` prop on the parent EuiFormRow
 */
export const MetricComboBox: React.FC<MetricComboBoxProps> = ({
  selectedMetric,
  onChange,
  options,
  isLoading,
  onSearchChange,
  isInvalid,
}) => {
  const selectedOptions = selectedMetric ? [{ label: selectedMetric }] : [];

  const handleChange = useCallback(
    (selected: EuiComboBoxOptionOption[]) => {
      onChange(selected.length > 0 ? selected[0].label : '');
    },
    [onChange]
  );

  const handleCreate = useCallback(
    (value: string) => {
      onChange(value.trim());
    },
    [onChange]
  );

  return (
    <EuiComboBox
      singleSelection={{ asPlainText: true }}
      placeholder="Type to search metrics (2+ chars)"
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      onSearchChange={onSearchChange}
      isLoading={isLoading}
      noSuggestions={!isLoading && options.length === 0 && !selectedMetric}
      isInvalid={isInvalid}
      aria-label="Prometheus metric name"
      fullWidth
      data-test-subj="alertManager-sliSection-metricCombo"
    />
  );
};

/**
 * Metric type badge for use as `append` on EuiFormRow.
 * Shows counter/histogram/gauge/summary or nothing for unknown.
 */
export const MetricTypeBadge: React.FC<{ metricType?: InferredMetricType }> = ({ metricType }) => {
  if (!metricType || metricType === 'unknown') return null;

  const colorMap: Record<string, string> = {
    counter: 'primary',
    histogram: 'accent',
    gauge: 'warning',
    summary: 'default',
  };

  return <EuiBadge color={colorMap[metricType] ?? 'default'}>{metricType}</EuiBadge>;
};

// ============================================================================
// LabelValueComboBox
// ============================================================================

export interface LabelValueComboBoxProps {
  selectedValue: string;
  onChange: (value: string) => void;
  options: EuiComboBoxOptionOption[];
  isLoading: boolean;
  placeholder: string;
  isInvalid?: boolean;
  error?: string;
  ariaLabel: string;
  testSubj?: string;
}

/**
 * Label value picker for service, operation, and dependency fields.
 *
 * Renders an EuiComboBox in single-selection mode with `onCreateOption`
 * so users can type custom values not present in the suggestions.
 */
export const LabelValueComboBox: React.FC<LabelValueComboBoxProps> = ({
  selectedValue,
  onChange,
  options,
  isLoading,
  placeholder,
  isInvalid,
  ariaLabel,
  testSubj,
}) => {
  const selectedOptions = selectedValue ? [{ label: selectedValue }] : [];

  const handleChange = useCallback(
    (selected: EuiComboBoxOptionOption[]) => {
      onChange(selected.length > 0 ? selected[0].label : '');
    },
    [onChange]
  );

  const handleCreate = useCallback(
    (value: string) => {
      onChange(value.trim());
    },
    [onChange]
  );

  return (
    <EuiComboBox
      singleSelection={{ asPlainText: true }}
      placeholder={placeholder}
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      isLoading={isLoading}
      noSuggestions={!isLoading && options.length === 0}
      isInvalid={isInvalid}
      aria-label={ariaLabel}
      fullWidth
      data-test-subj={testSubj || 'alertManager-sliSection-labelValueCombo'}
    />
  );
};

// ============================================================================
// GoodEventsFilterCombo
// ============================================================================

export interface GoodEventsFilterComboProps {
  value: string;
  onChange: (value: string) => void;
}

const FILTER_OPTIONS: EuiComboBoxOptionOption<FilterOptionValue>[] = GOOD_EVENTS_FILTER_PRESETS.map(
  (p) => ({
    label: `${p.label} — ${p.value}`,
    // Store the actual PromQL value in a data attribute for retrieval
    value: { value: p.value },
  })
);

/**
 * Good events filter preset picker for availability SLIs.
 *
 * Renders an EuiComboBox with preset options from GOOD_EVENTS_FILTER_PRESETS.
 * Users can also type custom PromQL label matchers via `onCreateOption`.
 */
export const GoodEventsFilterCombo: React.FC<GoodEventsFilterComboProps> = ({
  value,
  onChange,
}) => {
  // Find matching preset option, or show custom value
  const selectedOptions: EuiComboBoxOptionOption[] = value ? [{ label: value }] : [];

  const handleChange = useCallback(
    (selected: EuiComboBoxOptionOption[]) => {
      if (selected.length === 0) {
        onChange('');
        return;
      }
      // If the selection has a preset value object, use the PromQL value
      const opt = selected[0];
      const presetValue = (opt as EuiComboBoxOptionOption<FilterOptionValue>).value?.value;
      onChange(presetValue !== undefined ? presetValue : opt.label);
    },
    [onChange]
  );

  const handleCreate = useCallback(
    (inputValue: string) => {
      onChange(inputValue.trim());
    },
    [onChange]
  );

  return (
    <EuiComboBox
      singleSelection={{ asPlainText: true }}
      placeholder="Select a preset or type a custom PromQL matcher"
      options={FILTER_OPTIONS}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      aria-label="Good events filter"
      fullWidth
      data-test-subj="alertManager-sliSection-goodEventsFilterCombo"
    />
  );
};
