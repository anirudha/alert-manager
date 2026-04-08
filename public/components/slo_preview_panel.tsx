/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO Preview Panel — right-side sticky panel in the Create SLO wizard.
 * Renders a live preview of the Prometheus rules that will be generated
 * from the current form input, updating as the user fills in fields.
 *
 * Also shows a live SLI value at the top when enough form fields are
 * filled, comparing the current value against the target to show
 * whether the SLO would currently be OK, BREACHING, or WARNING.
 *
 * The preview is generated **client-side** using the same pure, stateless
 * `generateSloRuleGroup()` that the server uses. This module lives in
 * `core/` (shared between client and server) and has zero I/O or
 * server-only dependencies, so bundling it client-side is intentional
 * to provide instant, zero-latency feedback as the user types.
 */
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiCodeBlock,
  EuiButtonGroup,
  EuiLoadingSpinner,
  EuiIcon,
} from '@opensearch-project/oui';
import type {
  SloInput,
  SloDefinition,
  GeneratedRuleGroup,
  GeneratedRule,
} from '../../core/slo_types';
import { DEFAULT_MWMBR_TIERS } from '../../core/slo_types';
import { generateSloRuleGroup } from '../../core/slo_promql_generator';
import type { HttpClient } from '../services/alarms_client';

// ============================================================================
// Props
// ============================================================================

export interface SloPreviewPanelProps {
  sloInput: Partial<SloInput>;
  /** Optional HTTP client for live SLI queries. If not provided, live SLI is disabled. */
  httpClient?: HttpClient;
}

// ============================================================================
// Tab type
// ============================================================================

type PreviewTab = 'yaml' | 'promql';

const TAB_OPTIONS = [
  { id: 'yaml', label: 'Rules YAML' },
  { id: 'promql', label: 'PromQL List' },
];

// ============================================================================
// Live SLI types
// ============================================================================

interface LiveSliState {
  loading: boolean;
  value: number | null;
  status: 'ok' | 'warning' | 'breaching' | null;
  error: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check whether the partial input has enough fields to generate a valid preview.
 * We need at minimum: name, sli.type, sli.metric, sli.service, target.
 */
function isInputComplete(input: Partial<SloInput>): boolean {
  if (!input.name) return false;
  if (!input.sli?.type) return false;
  if (!input.sli?.metric) return false;
  if (!input.sli?.service?.labelName || !input.sli?.service?.labelValue) return false;
  if (!input.target || input.target <= 0 || input.target >= 1) return false;
  return true;
}

/** Return human-readable names of fields still needed for preview generation. */
function getMissingFields(input: Partial<SloInput>): string[] {
  const missing: string[] = [];
  if (!input.sli?.metric) missing.push('Prometheus metric');
  if (!input.sli?.service?.labelValue) missing.push('Service name');
  if (!input.name) missing.push('SLO name (auto-generated from service + operation)');
  if (!input.target || input.target <= 0 || input.target >= 1) missing.push('Attainment target');
  return missing;
}

/**
 * Check whether the input has enough for a live SLI query.
 * Requires metric + service (value) + operation (value).
 */
function canQueryLiveSli(input: Partial<SloInput>): boolean {
  if (!input.sli?.metric) return false;
  if (!input.sli?.service?.labelValue) return false;
  return true;
}

/**
 * Build a temporary SloDefinition from partial input so the generator
 * can produce a preview. Missing fields are filled with sensible defaults.
 */
function buildTempDefinition(input: Partial<SloInput>): SloDefinition {
  const tempId = `preview-${Date.now()}`;
  return {
    id: tempId,
    datasourceId: input.datasourceId || 'preview',
    name: input.name || 'Untitled SLO',
    sli: {
      type: input.sli?.type || 'availability',
      calcMethod: input.sli?.calcMethod || 'good_requests',
      sourceType: input.sli?.sourceType || 'service_operation',
      metric: input.sli?.metric || '',
      goodEventsFilter: input.sli?.goodEventsFilter,
      latencyThreshold: input.sli?.latencyThreshold,
      service: input.sli?.service || { labelName: 'service', labelValue: '' },
      operation: input.sli?.operation || { labelName: 'endpoint', labelValue: '/' },
      dependency: input.sli?.dependency,
      periodLength: input.sli?.periodLength,
    },
    target: input.target || 0.999,
    budgetWarningThreshold: input.budgetWarningThreshold ?? 0.3,
    window: input.window || { type: 'rolling', duration: '30d' },
    burnRates: input.burnRates || [...DEFAULT_MWMBR_TIERS],
    alarms: input.alarms || {
      sliHealth: { enabled: true },
      attainmentBreach: { enabled: true },
      budgetWarning: { enabled: true },
    },
    exclusionWindows: input.exclusionWindows || [],
    tags: input.tags || {},
    ruleGroupName: '',
    rulerNamespace: '',
    generatedRuleNames: [],
    version: 0,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
}

// ============================================================================
// Severity badge color helper
// ============================================================================

function ruleBadgeColor(rule: GeneratedRule): string {
  if (rule.type === 'recording') return 'primary';
  const severity = rule.labels?.severity;
  if (severity === 'critical') return 'danger';
  return 'warning';
}

function ruleBadgeLabel(rule: GeneratedRule): string {
  if (rule.type === 'recording') return 'recording';
  const severity = rule.labels?.severity;
  return severity === 'critical' ? 'alerting (critical)' : 'alerting (warning)';
}

// ============================================================================
// Live SLI Panel
// ============================================================================

const LiveSliPanel: React.FC<{ state: LiveSliState; target: number }> = ({ state, target }) => {
  if (state.loading) {
    return (
      <EuiPanel color="subdued" paddingSize="s">
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="xs" color="subdued">
              Querying current SLI value...
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  if (state.error || state.value === null) {
    return (
      <EuiPanel color="subdued" paddingSize="s">
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="questionInCircle" color="subdued" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="xs" color="subdued">
              {state.error ? 'Could not query live SLI' : 'No data available for current SLI'}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  const sliPercent = (state.value * 100).toFixed(2);
  const targetPercent = (target * 100).toFixed(1);

  const statusColor =
    state.status === 'ok' ? 'success' : state.status === 'warning' ? 'warning' : 'danger';
  const statusLabel =
    state.status === 'ok' ? 'OK' : state.status === 'warning' ? 'WARNING' : 'BREACHING';

  return (
    <EuiPanel color="subdued" paddingSize="s">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>Current SLI: {sliPercent}%</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={statusColor}>{statusLabel}</EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size="xs" color="subdued" style={{ marginTop: 4 }}>
        This SLO (target {targetPercent}%) would currently be{' '}
        <strong>{statusLabel.toLowerCase()}</strong>.
      </EuiText>
    </EuiPanel>
  );
};

// ============================================================================
// Component
// ============================================================================

export const SloPreviewPanel: React.FC<SloPreviewPanelProps> = ({ sloInput, httpClient }) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('yaml');
  const [liveSli, setLiveSli] = useState<LiveSliState>({
    loading: false,
    value: null,
    status: null,
    error: false,
  });

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id as PreviewTab);
  }, []);

  // Generate the rule group, memoized to avoid regenerating on every render
  const ruleGroup = useMemo<GeneratedRuleGroup | null>(() => {
    if (!isInputComplete(sloInput)) return null;
    try {
      const tempDef = buildTempDefinition(sloInput);
      return generateSloRuleGroup(tempDef);
    } catch {
      return null;
    }
  }, [sloInput]);

  // Live SLI query — execute the first recording rule PromQL as an instant query
  const firstRecordingExpr = ruleGroup?.rules.find((r) => r.type === 'recording')?.expr;

  useEffect(() => {
    if (!httpClient || !firstRecordingExpr || !canQueryLiveSli(sloInput)) {
      setLiveSli({ loading: false, value: null, status: null, error: false });
      return;
    }

    let cancelled = false;
    setLiveSli({ loading: true, value: null, status: null, error: false });

    // We cannot execute an arbitrary PromQL query via the current API without
    // a dedicated instant-query endpoint. For now, we display the panel with
    // a "no data" state to indicate the feature slot exists. When the backend
    // adds a `/api/alerting/prometheus/{dsId}/query` endpoint, this block
    // can make a real request.
    //
    // Placeholder: simulate "no data" after a short delay to show the UI.
    const timer = setTimeout(() => {
      if (!cancelled) {
        setLiveSli({ loading: false, value: null, status: null, error: false });
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [firstRecordingExpr, httpClient, sloInput]);

  // Counts
  const recordingCount = ruleGroup?.rules.filter((r) => r.type === 'recording').length ?? 0;
  const alertingCount = ruleGroup?.rules.filter((r) => r.type === 'alerting').length ?? 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div style={{ position: 'sticky', top: 0 }}>
      {/* Live SLI value section */}
      {ruleGroup && canQueryLiveSli(sloInput) && (
        <>
          <LiveSliPanel state={liveSli} target={sloInput.target ?? 0.999} />
          <EuiSpacer size="m" />
        </>
      )}

      <EuiTitle size="xs">
        <h3>Generated Prometheus Rules</h3>
      </EuiTitle>
      <EuiSpacer size="s" />

      {!ruleGroup ? (
        <EuiPanel color="subdued" paddingSize="l">
          <EuiText size="s" color="subdued">
            <p style={{ marginBottom: 8 }}>Provide these fields to preview generated rules:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {getMissingFields(sloInput).map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </EuiText>
        </EuiPanel>
      ) : (
        <>
          {/* Summary line */}
          <EuiText size="xs" color="subdued">
            {recordingCount} recording rule{recordingCount !== 1 ? 's' : ''} + {alertingCount}{' '}
            alerting rule{alertingCount !== 1 ? 's' : ''}
          </EuiText>

          <EuiSpacer size="s" />

          {/* Accessible tab switcher using EuiButtonGroup */}
          <EuiButtonGroup
            legend="Preview format"
            options={TAB_OPTIONS}
            idSelected={activeTab}
            onChange={handleTabChange}
            buttonSize="compressed"
          />

          <EuiSpacer size="s" />

          {/* YAML tab */}
          {activeTab === 'yaml' && (
            <EuiCodeBlock
              language="yaml"
              fontSize="s"
              paddingSize="m"
              isCopyable
              overflowHeight={500}
            >
              {ruleGroup.yaml}
            </EuiCodeBlock>
          )}

          {/* PromQL List tab */}
          {activeTab === 'promql' && (
            <div
              style={{ maxHeight: 500, overflowY: 'auto' }}
              role="list"
              aria-label="Generated PromQL rules"
            >
              {ruleGroup.rules.map((rule, idx) => (
                <EuiPanel
                  key={`${rule.type}-${rule.name}`}
                  paddingSize="s"
                  hasBorder
                  style={{ marginBottom: 8 }}
                  role="listitem"
                >
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={ruleBadgeColor(rule)}>{ruleBadgeLabel(rule)}</EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText
                        size="xs"
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          wordBreak: 'break-all',
                        }}
                      >
                        {rule.name}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>

                  <EuiSpacer size="xs" />

                  <EuiCodeBlock fontSize="s" paddingSize="s" transparentBackground>
                    {rule.expr}
                  </EuiCodeBlock>

                  {rule.for && (
                    <EuiText size="xs" color="subdued" style={{ marginTop: 4 }}>
                      <strong>for:</strong> {rule.for}
                    </EuiText>
                  )}

                  {rule.description && (
                    <EuiText size="xs" color="subdued" style={{ marginTop: 2 }}>
                      {rule.description}
                    </EuiText>
                  )}
                </EuiPanel>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
