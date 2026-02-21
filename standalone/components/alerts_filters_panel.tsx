/**
 * Filters Panel for Alerts
 */
import React, { useState } from 'react';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonEmpty,
  EuiSpacer,
  EuiHealth,
  EuiBadge,
  EuiCheckbox,
  EuiButtonGroup,
} from '@opensearch-project/oui';
import { UnifiedAlert } from '../../core';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger', high: 'warning', medium: 'primary', low: 'subdued', info: 'default',
};
const STATE_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', acknowledged: 'primary', resolved: 'success', error: 'danger',
};

export interface AlertFilterState {
  state: string[];
  severity: string[];
  datasourceType: string[];
  labels: Record<string, string[]>;
  groupBy: 'none' | 'datasource' | 'state';
}

export const emptyAlertFilters = (): AlertFilterState => ({
  state: [], severity: [], datasourceType: [], labels: {}, groupBy: 'none',
});

interface AlertsFiltersPanelProps {
  alerts: UnifiedAlert[];
  filters: AlertFilterState;
  onFiltersChange: (filters: AlertFilterState) => void;
}

function collectUniqueValues(alerts: UnifiedAlert[], field: (a: UnifiedAlert) => string): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const val = field(a);
    if (val) set.add(val);
  }
  return Array.from(set).sort();
}

function collectLabelKeys(alerts: UnifiedAlert[]): string[] {
  const keys = new Set<string>();
  for (const a of alerts) {
    for (const k of Object.keys(a.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function collectLabelValues(alerts: UnifiedAlert[], key: string): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const v = a.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

export const AlertsFiltersPanel: React.FC<AlertsFiltersPanelProps> = ({
  alerts,
  filters,
  onFiltersChange,
}) => {
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());

  const groupByOptions = [
    { id: 'none', label: 'None' },
    { id: 'datasource', label: 'Data Source' },
  ];

  const labelKeys = React.useMemo(() => collectLabelKeys(alerts), [alerts]);
  const uniqueStates = React.useMemo(() => collectUniqueValues(alerts, a => a.state), [alerts]);
  const uniqueSeverities = React.useMemo(() => collectUniqueValues(alerts, a => a.severity), [alerts]);
  const uniqueBackends = React.useMemo(() => collectUniqueValues(alerts, a => a.datasourceType), [alerts]);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    count += filters.state.length;
    count += filters.severity.length;
    count += filters.datasourceType.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Facet counts
  const facetCounts = React.useMemo(() => {
    const counts: Record<string, Record<string, number>> = {
      state: {}, severity: {}, datasourceType: {},
    };
    for (const a of alerts) {
      counts.state[a.state] = (counts.state[a.state] || 0) + 1;
      counts.severity[a.severity] = (counts.severity[a.severity] || 0) + 1;
      counts.datasourceType[a.datasourceType] = (counts.datasourceType[a.datasourceType] || 0) + 1;
    }
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const a of alerts) {
        const v = a.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [alerts, labelKeys]);

  const toggleFacetCollapse = (id: string) => {
    setCollapsedFacets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateFilter = <K extends keyof AlertFilterState>(key: K, value: AlertFilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    onFiltersChange({
      ...filters,
      labels: { ...filters.labels, [key]: values },
    });
  };

  const clearAllFilters = () => {
    onFiltersChange(emptyAlertFilters());
  };

  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    colorMap?: Record<string, string>,
  ) => {
    const isCollapsed = collapsedFacets.has(id);
    const activeCount = selected.length;
    return (
      <div key={id} style={{ marginBottom: 16 }}>
        <EuiFlexGroup
          gutterSize="xs" alignItems="center" responsive={false}
          style={{ cursor: 'pointer', marginBottom: 8 }}
          onClick={() => toggleFacetCollapse(id)}
        >
          <EuiFlexItem grow={false}>
            <EuiBadge iconType={isCollapsed ? 'arrowRight' : 'arrowDown'} color="hollow" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s"><strong>{label}</strong></EuiText>
          </EuiFlexItem>
          {activeCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="primary">{activeCount}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        {!isCollapsed && (
          <div style={{ paddingLeft: 8 }}>
            {options.map(opt => {
              const isActive = selected.includes(opt);
              const count = counts[opt] || 0;
              const checkboxId = `${id}-${opt}`;
              
              const labelContent = (
                <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                  {colorMap && (
                    <EuiFlexItem grow={false}>
                      <EuiHealth color={colorMap[opt] || 'subdued'} />
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem>
                    <EuiText size="s">{opt}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">({count})</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              );
              
              return (
                <div key={opt} style={{ marginBottom: 4 }}>
                  <EuiCheckbox
                    id={checkboxId}
                    label={labelContent}
                    checked={isActive}
                    onChange={() => {
                      if (isActive) onChange(selected.filter(s => s !== opt));
                      else onChange([...selected, opt]);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <EuiPanel paddingSize="m" hasBorder style={{ height: '100%', overflow: 'auto' }}>
      {/* Group By Section */}
      <EuiText size="s"><strong>Group by</strong></EuiText>
      <EuiSpacer size="s" />
      <EuiButtonGroup
        legend="Group alerts by"
        options={groupByOptions}
        idSelected={filters.groupBy}
        onChange={(id) => updateFilter('groupBy', id as 'none' | 'datasource' | 'state')}
        buttonSize="compressed"
        isFullWidth
      />
      <EuiSpacer size="m" />

      {/* Filters Section */}
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiText size="s"><strong>Filters</strong></EuiText>
        </EuiFlexItem>
        {activeFilterCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={clearAllFilters} flush="right">
              Clear ({activeFilterCount})
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      {renderFacetGroup('state', 'State', uniqueStates, filters.state,
        (v) => updateFilter('state', v), facetCounts.counts.state, STATE_COLORS)}
      {renderFacetGroup('severity', 'Severity', uniqueSeverities, filters.severity,
        (v) => updateFilter('severity', v), facetCounts.counts.severity, SEVERITY_COLORS)}
      {renderFacetGroup('datasourceType', 'Backend', uniqueBackends, filters.datasourceType,
        (v) => updateFilter('datasourceType', v), facetCounts.counts.datasourceType)}

      {labelKeys.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}><strong>Labels</strong></EuiText>
          {labelKeys.map(key => renderFacetGroup(
            `label:${key}`, key, collectLabelValues(alerts, key),
            filters.labels[key] || [],
            (v) => updateLabelFilter(key, v),
            facetCounts.labelCounts[key] || {},
          ))}
        </>
      )}
    </EuiPanel>
  );
};
