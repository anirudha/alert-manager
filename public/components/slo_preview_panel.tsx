/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO Preview Panel — right-side sticky panel in the Create SLO wizard.
 * Renders a live preview of the Prometheus rules that will be generated
 * from the current form input, updating as the user fills in fields.
 *
 * The preview is generated **client-side** using the same pure, stateless
 * `generateSloRuleGroup()` that the server uses. This module lives in
 * `core/` (shared between client and server) and has zero I/O or
 * server-only dependencies, so bundling it client-side is intentional
 * to provide instant, zero-latency feedback as the user types.
 */
import React, { useMemo, useState, useCallback } from 'react';
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
} from '@opensearch-project/oui';
import type {
  SloInput,
  SloDefinition,
  GeneratedRuleGroup,
  GeneratedRule,
} from '../../core/slo_types';
import { DEFAULT_MWMBR_TIERS } from '../../core/slo_types';
import { generateSloRuleGroup } from '../../core/slo_promql_generator';

// ============================================================================
// Props
// ============================================================================

export interface SloPreviewPanelProps {
  sloInput: Partial<SloInput>;
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
// Component
// ============================================================================

export const SloPreviewPanel: React.FC<SloPreviewPanelProps> = ({ sloInput }) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('yaml');

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
  }, [
    sloInput.name,
    sloInput.sli?.type,
    sloInput.sli?.metric,
    sloInput.sli?.service?.labelName,
    sloInput.sli?.service?.labelValue,
    sloInput.sli?.operation?.labelName,
    sloInput.sli?.operation?.labelValue,
    sloInput.sli?.goodEventsFilter,
    sloInput.sli?.latencyThreshold,
    sloInput.target,
    sloInput.budgetWarningThreshold,
    sloInput.window?.duration,
    sloInput.burnRates,
    sloInput.alarms?.sliHealth?.enabled,
    sloInput.alarms?.attainmentBreach?.enabled,
    sloInput.alarms?.budgetWarning?.enabled,
  ]);

  // Counts
  const recordingCount = ruleGroup?.rules.filter((r) => r.type === 'recording').length ?? 0;
  const alertingCount = ruleGroup?.rules.filter((r) => r.type === 'alerting').length ?? 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div style={{ position: 'sticky', top: 0 }}>
      <EuiTitle size="xs">
        <h3>Generated Prometheus Rules</h3>
      </EuiTitle>
      <EuiSpacer size="s" />

      {!ruleGroup ? (
        <EuiPanel color="subdued" paddingSize="l" style={{ textAlign: 'center' }}>
          <EuiText size="s" color="subdued">
            Fill in the SLI configuration to preview generated rules
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

                  <pre
                    style={{
                      margin: 0,
                      padding: 8,
                      background: '#F5F7FA',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {rule.expr}
                  </pre>

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
