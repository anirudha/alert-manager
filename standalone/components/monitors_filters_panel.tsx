/**
 * Filters Panel for Monitors — extracted for reusability
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
  EuiButtonIcon,
  EuiCheckbox,
} from '@opensearch-project/oui';
import {
  UnifiedRule,
  UnifiedAlertSeverity,
  MonitorType,
  MonitorStatus,
  MonitorHealthStatus,
} from '../../core';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger', high: 'warning', medium: 'primary', low: 'subdued', info: 'default',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', muted: 'default', disabled: 'subdued',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success', failing: 'danger', no_data: 'subdued',
};
const TYPE_LABELS: Record<string, string> = {
  metric: 'Metric', log: 'Log', apm: 'APM', composite: 'Composite',
  infrastructure: 'Infrastructure', synthetics: 'Synthetics',
};

export interface FilterState {
  status: MonitorStatus[];
  severity: UnifiedAlertSeverity[];
  monitorType: MonitorType[];
  healthStatus: MonitorHealthStatus[];
  labels: Record<string, string[]>;
  createdBy: string[];
  destinations: string[];
  backend: string[];
}

export const emptyFilters = (): FilterState => ({
  status: [], severity: [], monitorType: [], healthStatus: [],
  labels: {}, createdBy: [], destinations: [], backend: [],
});

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: FilterState;
}

interface MonitorsFiltersPanelProps {
  rules: UnifiedRule[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string;
  savedSearches: SavedSearch[];
  onSaveSearch: () => void;
  onLoadSearch: (search: SavedSearch) => void;
  onDeleteSearch: (id: string) => void;
}

function collectUniqueValues(rules: UnifiedRule[], field: (r: UnifiedRule) => string | string[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const val = field(r);
    if (Array.isArray(val)) val.forEach(v => set.add(v));
    else if (val) set.add(val);
  }
  return Array.from(set).sort();
}

function collectLabelKeys(rules: UnifiedRule[]): string[] {
  const keys = new Set<string>();
  for (const r of rules) {
    for (const k of Object.keys(r.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function collectLabelValues(rules: UnifiedRule[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const v = r.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

export const MonitorsFiltersPanel: React.FC<MonitorsFiltersPanelProps> = ({
  rules,
  filters,
  onFiltersChange,
  searchQuery,
  savedSearches,
  onSaveSearch,
  onLoadSearch,
  onDeleteSearch,
}) => {
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());

  const labelKeys = React.useMemo(() => collectLabelKeys(rules), [rules]);
  const uniqueStatuses = React.useMemo(() => collectUniqueValues(rules, r => r.status), [rules]);
  const uniqueSeverities = React.useMemo(() => collectUniqueValues(rules, r => r.severity), [rules]);
  const uniqueTypes = React.useMemo(() => collectUniqueValues(rules, r => r.monitorType), [rules]);
  const uniqueHealth = React.useMemo(() => collectUniqueValues(rules, r => r.healthStatus), [rules]);
  const uniqueCreators = React.useMemo(() => collectUniqueValues(rules, r => r.createdBy), [rules]);
  const uniqueBackends = React.useMemo(() => collectUniqueValues(rules, r => r.datasourceType), [rules]);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    count += filters.status.length;
    count += filters.severity.length;
    count += filters.monitorType.length;
    count += filters.healthStatus.length;
    count += filters.createdBy.length;
    count += filters.backend.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Facet counts
  const facetCounts = React.useMemo(() => {
    const counts: Record<string, Record<string, number>> = {
      status: {}, severity: {}, monitorType: {}, healthStatus: {}, backend: {}, createdBy: {},
    };
    for (const r of rules) {
      counts.status[r.status] = (counts.status[r.status] || 0) + 1;
      counts.severity[r.severity] = (counts.severity[r.severity] || 0) + 1;
      counts.monitorType[r.monitorType] = (counts.monitorType[r.monitorType] || 0) + 1;
      counts.healthStatus[r.healthStatus] = (counts.healthStatus[r.healthStatus] || 0) + 1;
      counts.backend[r.datasourceType] = (counts.backend[r.datasourceType] || 0) + 1;
      counts.createdBy[r.createdBy] = (counts.createdBy[r.createdBy] || 0) + 1;
    }
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const r of rules) {
        const v = r.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [rules, labelKeys]);

  const toggleFacetCollapse = (id: string) => {
    setCollapsedFacets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    onFiltersChange({
      ...filters,
      labels: { ...filters.labels, [key]: values },
    });
  };

  const clearAllFilters = () => {
    onFiltersChange(emptyFilters());
  };

  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    displayMap?: Record<string, string>,
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
              const displayLabel = displayMap?.[opt] || opt;
              const checkboxId = `${id}-${opt}`;
              
              const labelContent = (
                <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                  {colorMap && (
                    <EuiFlexItem grow={false}>
                      <EuiHealth color={colorMap[opt] || 'subdued'} />
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem>
                    <EuiText size="s">{displayLabel}</EuiText>
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

      {renderFacetGroup('status', 'Status', uniqueStatuses, filters.status,
        (v) => updateFilter('status', v as MonitorStatus[]), facetCounts.counts.status, undefined, STATUS_COLORS)}
      {renderFacetGroup('severity', 'Severity', uniqueSeverities, filters.severity,
        (v) => updateFilter('severity', v as UnifiedAlertSeverity[]), facetCounts.counts.severity, undefined, SEVERITY_COLORS)}
      {renderFacetGroup('monitorType', 'Type', uniqueTypes, filters.monitorType,
        (v) => updateFilter('monitorType', v as MonitorType[]), facetCounts.counts.monitorType, TYPE_LABELS)}
      {renderFacetGroup('healthStatus', 'Health', uniqueHealth, filters.healthStatus,
        (v) => updateFilter('healthStatus', v as MonitorHealthStatus[]), facetCounts.counts.healthStatus, undefined, HEALTH_COLORS)}
      {renderFacetGroup('backend', 'Backend', uniqueBackends, filters.backend,
        (v) => updateFilter('backend', v), facetCounts.counts.backend)}
      {renderFacetGroup('createdBy', 'Created By', uniqueCreators, filters.createdBy,
        (v) => updateFilter('createdBy', v), facetCounts.counts.createdBy)}

      {labelKeys.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}><strong>Labels</strong></EuiText>
          {labelKeys.map(key => renderFacetGroup(
            `label:${key}`, key, collectLabelValues(rules, key),
            filters.labels[key] || [],
            (v) => updateLabelFilter(key, v),
            facetCounts.labelCounts[key] || {},
          ))}
        </>
      )}

      <EuiSpacer size="m" />
      <EuiText size="xs"><strong>Saved Searches</strong></EuiText>
      <EuiSpacer size="xs" />
      {savedSearches.length === 0 ? (
        <EuiText size="xs" color="subdued">None yet</EuiText>
      ) : (
        savedSearches.map(ss => (
          <EuiFlexGroup key={ss.id} gutterSize="xs" alignItems="center" responsive={false} style={{ marginBottom: 2 }}>
            <EuiFlexItem>
              <EuiText size="xs">
                <span
                  role="button" tabIndex={0} style={{ cursor: 'pointer', color: '#006BB4' }}
                  onClick={() => onLoadSearch(ss)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onLoadSearch(ss); }}
                >
                  {ss.name}
                </span>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon iconType="cross" size="s" aria-label={`Delete ${ss.name}`}
                onClick={() => onDeleteSearch(ss.id)} color="text" />
            </EuiFlexItem>
          </EuiFlexGroup>
        ))
      )}
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={onSaveSearch}
        disabled={!searchQuery && activeFilterCount === 0} flush="left">
        Save current
      </EuiButtonEmpty>
    </EuiPanel>
  );
};
