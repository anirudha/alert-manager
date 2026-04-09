/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FacetFilterPanel — reusable collapsible facet filter group component.
 * Used by SloListing, AlertsDashboard, and MonitorsTable.
 *
 * Renders a collapsible section with checkboxes for each option,
 * including count badges and optional color indicators.
 */
import React, { useState, useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiBadge,
  EuiCheckbox,
  EuiHealth,
} from '@opensearch-project/oui';

// ============================================================================
// Types
// ============================================================================

export interface FacetGroupConfig {
  id: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts: Record<string, number>;
  displayMap?: Record<string, string>;
  colorMap?: Record<string, string>;
}

export interface FacetFilterGroupProps extends FacetGroupConfig {
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

// ============================================================================
// FacetFilterGroup — a single collapsible facet section
// ============================================================================

export const FacetFilterGroup: React.FC<FacetFilterGroupProps> = ({
  id,
  label,
  options,
  selected,
  onChange,
  counts,
  displayMap,
  colorMap,
  isCollapsed,
  onToggleCollapse,
}) => {
  const activeCount = selected.length;

  return (
    <div key={id} style={{ marginBottom: 12 }} data-test-subj={`facetGroup-${id}`}>
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        responsive={false}
        style={{ cursor: 'pointer', marginBottom: 4 }}
        onClick={() => onToggleCollapse(id)}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse(id);
          }
        }}
      >
        <EuiFlexItem grow={false}>
          <EuiIcon type={isCollapsed ? 'arrowRight' : 'arrowDown'} size="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>{label}</strong>
          </EuiText>
        </EuiFlexItem>
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{activeCount}</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {!isCollapsed && (
        <div style={{ paddingLeft: 4 }}>
          {options.map((opt) => {
            const isActive = selected.includes(opt);
            const count = counts[opt] || 0;
            const displayLabel = displayMap?.[opt] || opt;
            const checkboxId = `${id}-${opt}`;

            const labelContent = (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  width: '100%',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                  {colorMap && (
                    <EuiHealth color={colorMap[opt] || 'subdued'} style={{ marginRight: 0 }} />
                  )}
                  <span style={{ fontSize: '12px', lineHeight: '18px' }}>{displayLabel}</span>
                </span>
                <span style={{ fontSize: '12px', lineHeight: '18px', color: '#69707D' }}>
                  ({count})
                </span>
              </span>
            );

            return (
              <div key={opt} style={{ marginBottom: 2 }}>
                <EuiCheckbox
                  id={checkboxId}
                  label={labelContent}
                  checked={isActive}
                  onChange={() => {
                    if (isActive) onChange(selected.filter((s) => s !== opt));
                    else onChange([...selected, opt]);
                  }}
                  compressed
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// useFacetCollapse — hook to manage collapsed state
// ============================================================================

export function useFacetCollapse() {
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());

  const toggleFacetCollapse = useCallback((id: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id: string) => collapsedFacets.has(id), [collapsedFacets]);

  return { collapsedFacets, toggleFacetCollapse, isCollapsed };
}
