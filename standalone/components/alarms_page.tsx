/**
 * Alert Manager UI — uses unified views + backend-native drill-down.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  EuiBasicTable,
  EuiHealth,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiSpacer,
  EuiEmptyPrompt,
  EuiBadge,
  EuiTab,
  EuiTabs,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiFieldSearch,
  EuiSuperDatePicker,
  EuiResizableContainer,
  EuiButtonIcon,
  EuiText,
} from '@opensearch-project/oui';
import { Datasource, UnifiedAlert, UnifiedRule, MonitorStatus } from '../../core';
import { MonitorsTable } from './monitors_table';
import { MonitorsFiltersPanel, FilterState, emptyFilters, SavedSearch } from './monitors_filters_panel';
import { AlertsFiltersPanel, AlertFilterState, emptyAlertFilters } from './alerts_filters_panel';
import { CreateMonitor } from './create_monitor';
import { AiMonitorWizard, AlertTemplate } from './ai_monitor_wizard';
import { AlertDetailFlyout } from './alert_detail_flyout';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};

const STATE_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
};

export interface HttpClient {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: any): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
}

export class AlarmsApiClient {
  constructor(private readonly http: HttpClient) {}

  async listDatasources(): Promise<Datasource[]> {
    const res = await this.http.get<{ datasources: Datasource[] }>('/api/datasources');
    return res.datasources;
  }

  async listAlerts(): Promise<UnifiedAlert[]> {
    const res = await this.http.get<{ alerts: UnifiedAlert[] }>('/api/alerts');
    return res.alerts;
  }

  async listRules(): Promise<UnifiedRule[]> {
    const res = await this.http.get<{ rules: UnifiedRule[] }>('/api/rules');
    return res.rules;
  }
}

interface AlarmsPageProps {
  apiClient: AlarmsApiClient;
}

type TabId = 'alerts' | 'rules' | 'datasources';

export const AlarmsPage: React.FC<AlarmsPageProps> = ({ apiClient }) => {
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [rules, setRules] = useState<UnifiedRule[]>([]);
  const [deletedRuleIds, setDeletedRuleIds] = useState<Set<string>>(new Set());
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateMonitor, setShowCreateMonitor] = useState(false);
  const [showAiWizard, setShowAiWizard] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlert | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [alertSearchQuery, setAlertSearchQuery] = useState('');
  const [alertFilters, setAlertFilters] = useState<AlertFilterState>(emptyAlertFilters());
  const [timeRange, setTimeRange] = useState({ start: 'now-15m', end: 'now' });
  const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(false);
  const [isAlertFilterPanelCollapsed, setIsAlertFilterPanelCollapsed] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const dsNameMap = new Map(datasources.map(d => [d.id, d.name]));

  // Filtered rules excluding in-memory deleted ones
  const visibleRules = rules.filter(r => !deletedRuleIds.has(r.id));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, d] = await Promise.all([
        apiClient.listAlerts(),
        apiClient.listRules(),
        apiClient.listDatasources(),
      ]);
      setAlerts(a);
      setRules(r);
      setDatasources(d);
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Alert columns ---
  const alertColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      render: (name: string, alert: UnifiedAlert) => (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setSelectedAlert(alert);
          }}
          style={{ textDecoration: 'none' }}
        >
          {name}
        </a>
      ),
    },
    {
      field: 'state', name: 'State',
      render: (state: string) => <EuiHealth color={STATE_COLORS[state] || 'subdued'}>{state}</EuiHealth>,
    },
    {
      field: 'severity', name: 'Severity',
      render: (s: string) => <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>,
    },
    {
      field: 'datasourceType', name: 'Backend',
      render: (t: string) => <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>,
    },
    {
      field: 'datasourceId', name: 'Datasource',
      render: (id: string) => dsNameMap.get(id) || id,
    },
    { field: 'message', name: 'Message', truncateText: true },
    {
      field: 'startTime', name: 'Started',
      render: (ts: string) => ts ? new Date(ts).toLocaleString() : '-',
    },
  ];

  // --- Rule columns ---
  const ruleColumns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'enabled', name: 'Status',
      render: (e: boolean) => <EuiBadge color={e ? 'success' : 'default'}>{e ? 'Enabled' : 'Disabled'}</EuiBadge>,
    },
    {
      field: 'severity', name: 'Severity',
      render: (s: string) => <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>,
    },
    {
      field: 'datasourceType', name: 'Backend',
      render: (t: string) => <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>,
    },
    {
      field: 'datasourceId', name: 'Datasource',
      render: (id: string) => dsNameMap.get(id) || id,
    },
    { field: 'query', name: 'Query', truncateText: true },
    { field: 'group', name: 'Group', render: (g: string) => g || '-' },
  ];

  // --- Datasource columns ---
  const datasourceColumns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'type', name: 'Type',
      render: (t: string) => <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>,
    },
    { field: 'url', name: 'URL', truncateText: true },
    {
      field: 'enabled', name: 'Status',
      render: (e: boolean) => <EuiBadge color={e ? 'success' : 'default'}>{e ? 'Enabled' : 'Disabled'}</EuiBadge>,
    },
  ];

  const handleDeleteRules = (ids: string[]) => {
    setDeletedRuleIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleSilenceRule = (id: string) => {
    setRules(prev => prev.map(r => {
      if (r.id === id) {
        const newStatus = r.status === 'muted' ? 'active' : 'muted';
        return { ...r, status: newStatus as any };
      }
      return r;
    }));
  };

  const handleCloneRule = (monitor: UnifiedRule) => {
    const clone: UnifiedRule = {
      ...monitor,
      id: `clone-${Date.now()}`,
      name: `${monitor.name} (Copy)`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      createdBy: 'current-user',
    };
    setRules(prev => [clone, ...prev]);
  };

  const handleCreateMonitor = (formState: any) => {
    const now = new Date().toISOString();
    const labelsObj: Record<string, string> = {};
    for (const l of formState.labels) {
      if (l.key && l.value) labelsObj[l.key] = l.value;
    }
    const annotationsObj: Record<string, string> = {};
    for (const a of formState.annotations) {
      if (a.key && a.value) annotationsObj[a.key] = a.value;
    }
    const newRule: UnifiedRule = {
      id: `new-${Date.now()}`,
      datasourceId: 'ds-2',
      datasourceType: 'prometheus',
      name: formState.name,
      enabled: formState.enabled,
      severity: formState.severity,
      query: formState.query,
      condition: `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`,
      labels: labelsObj,
      annotations: annotationsObj,
      monitorType: 'metric',
      status: formState.enabled ? 'active' : 'disabled',
      healthStatus: 'healthy',
      createdBy: 'current-user',
      createdAt: now,
      lastModified: now,
      notificationDestinations: [],
      description: annotationsObj.description || '',
      aiSummary: 'Newly created monitor. No historical data available yet.',
      evaluationInterval: formState.evaluationInterval,
      pendingPeriod: formState.pendingPeriod,
      firingPeriod: formState.firingPeriod,
      threshold: { operator: formState.threshold.operator, value: formState.threshold.value, unit: formState.threshold.unit },
      alertHistory: [],
      conditionPreviewData: [],
      notificationRouting: [],
      suppressionRules: [],
      raw: {} as any,
    };
    setRules(prev => [newRule, ...prev]);
    setShowCreateMonitor(false);
  };

  const handleAiCreateMonitors = (templates: AlertTemplate[]) => {
    const now = new Date().toISOString();
    const newRules: UnifiedRule[] = templates.map((t, i) => ({
      id: `ai-${Date.now()}-${i}`,
      datasourceId: 'ds-2',
      datasourceType: 'prometheus' as const,
      name: t.name,
      enabled: true,
      severity: t.severity,
      query: t.query,
      condition: t.condition,
      labels: t.labels,
      annotations: t.annotations,
      monitorType: 'metric' as const,
      status: 'active' as const,
      healthStatus: 'healthy' as const,
      createdBy: 'ai-wizard',
      createdAt: now,
      lastModified: now,
      notificationDestinations: [],
      description: t.description,
      aiSummary: `Auto-generated by AI Monitor wizard. ${t.description}`,
      evaluationInterval: t.evaluationInterval,
      pendingPeriod: t.forDuration,
      firingPeriod: t.forDuration,
      threshold: undefined,
      alertHistory: [],
      conditionPreviewData: [],
      notificationRouting: [],
      suppressionRules: [],
      raw: {} as any,
    }));
    setRules(prev => [...newRules, ...prev]);
    setShowAiWizard(false);
  };

  const tabs = [
    { id: 'alerts' as TabId, name: `Alerts (${alerts.length})` },
    { id: 'rules' as TabId, name: `Rules (${visibleRules.length})` },
    { id: 'datasources' as TabId, name: `Datasources (${datasources.length})` },
  ];

  const saveCurrentSearch = () => {
    const name = prompt('Name this search:');
    if (!name) return;
    setSavedSearches(prev => [...prev, {
      id: `ss-${Date.now()}`, name, query: searchQuery, filters: { ...filters },
    }]);
  };

  const loadSavedSearch = (ss: SavedSearch) => {
    setSearchQuery(ss.query);
    setFilters(ss.filters);
  };

  const deleteSavedSearch = (id: string) => {
    setSavedSearches(prev => prev.filter(s => s.id !== id));
  };

  // Filter alerts by search query, time range, and filters
  const filteredAlerts = React.useMemo(() => {
    let result = alerts;
    
    // Filter by search query
    if (alertSearchQuery) {
      const query = alertSearchQuery.toLowerCase();
      result = result.filter(alert => 
        alert.name.toLowerCase().includes(query) ||
        alert.message?.toLowerCase().includes(query) ||
        alert.state.toLowerCase().includes(query) ||
        alert.severity.toLowerCase().includes(query)
      );
    }
    
    // Filter by state
    if (alertFilters.state.length > 0) {
      result = result.filter(alert => alertFilters.state.includes(alert.state));
    }
    
    // Filter by severity
    if (alertFilters.severity.length > 0) {
      result = result.filter(alert => alertFilters.severity.includes(alert.severity));
    }
    
    // Filter by datasource type
    if (alertFilters.datasourceType.length > 0) {
      result = result.filter(alert => alertFilters.datasourceType.includes(alert.datasourceType));
    }
    
    // Filter by datasource ID
    if (alertFilters.datasourceId.length > 0) {
      result = result.filter(alert => alertFilters.datasourceId.includes(alert.datasourceId));
    }
    
    // Filter by labels
    for (const [key, values] of Object.entries(alertFilters.labels)) {
      if (values.length > 0) {
        result = result.filter(alert => {
          const labelVal = alert.labels[key];
          return labelVal && values.includes(labelVal);
        });
      }
    }
    
    return result;
  }, [alerts, alertSearchQuery, alertFilters]);

  // Group alerts based on groupBy selection
  const groupedAlerts = React.useMemo(() => {
    if (alertFilters.groupBy === 'none') {
      return null;
    }

    const groups = new Map<string, UnifiedAlert[]>();
    
    filteredAlerts.forEach(alert => {
      let groupKey: string;
      if (alertFilters.groupBy === 'datasource') {
        groupKey = alert.datasourceId;
      } else if (alertFilters.groupBy === 'state') {
        groupKey = alert.state;
      } else {
        groupKey = 'ungrouped';
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(alert);
    });

    return groups;
  }, [filteredAlerts, alertFilters.groupBy]);

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const renderTable = () => {
    if (activeTab === 'alerts') {
      return (
        <EuiResizableContainer style={{ height: 'calc(100vh - 250px)' }}>
          {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => {
            return (
              <>
                <EuiResizablePanel
                  id="alert-filters-panel"
                  initialSize={20}
                  minSize="200px"
                  mode={['collapsible', { position: 'top' }]}
                  onToggleCollapsed={() => setIsAlertFilterPanelCollapsed(!isAlertFilterPanelCollapsed)}
                  paddingSize="none"
                  style={{ overflow: 'hidden', paddingRight: '4px' }}
                >
                  <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <EuiButtonIcon
                      iconType={isAlertFilterPanelCollapsed ? 'menuRight' : 'menuLeft'}
                      onClick={() => togglePanel?.('alert-filters-panel', { direction: 'left' })}
                      aria-label={isAlertFilterPanelCollapsed ? 'Expand filters' : 'Collapse filters'}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 10,
                      }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <AlertsFiltersPanel
                        alerts={alerts}
                        filters={alertFilters}
                        onFiltersChange={setAlertFilters}
                        datasources={datasources}
                      />
                    </div>
                  </div>
                </EuiResizablePanel>

                <EuiResizableButton />

                <EuiResizablePanel
                  initialSize={80}
                  minSize="400px"
                  mode="main"
                  paddingSize="none"
                  style={{ paddingLeft: '4px' }}
                >
                  <EuiPanel paddingSize="m" hasBorder style={{ height: '100%', overflow: 'auto' }}>
                    <EuiFlexGroup gutterSize="m" alignItems="center">
                      <EuiFlexItem>
                        <EuiFieldSearch
                          placeholder="Search alerts by name, message, state, or severity..."
                          value={alertSearchQuery}
                          onChange={(e) => setAlertSearchQuery(e.target.value)}
                          isClearable
                          fullWidth
                          aria-label="Search alerts"
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false} style={{ minWidth: 400 }}>
                        <EuiSuperDatePicker
                          start={timeRange.start}
                          end={timeRange.end}
                          onTimeChange={({ start, end }) => setTimeRange({ start, end })}
                          showUpdateButton={false}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="m" />
                    {!loading && filteredAlerts.length === 0 ? (
                      <EuiEmptyPrompt 
                        title={<h2>{alerts.length === 0 ? 'No Active Alerts' : 'No Matching Alerts'}</h2>} 
                        body={<p>{alerts.length === 0 ? 'All systems operating normally.' : 'Try adjusting your search or filters.'}</p>} 
                      />
                    ) : groupedAlerts ? (
                      <EuiBasicTable
                        items={Array.from(groupedAlerts.entries()).map(([groupKey, groupAlerts]) => {
                          // Calculate state breakdown
                          const stateBreakdown = groupAlerts.reduce((acc, alert) => {
                            acc[alert.state] = (acc[alert.state] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>);
                          
                          // Calculate severity breakdown
                          const severityBreakdown = groupAlerts.reduce((acc, alert) => {
                            acc[alert.severity] = (acc[alert.severity] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>);
                          
                          return {
                            id: groupKey,
                            groupKey,
                            count: groupAlerts.length,
                            alerts: groupAlerts,
                            stateBreakdown,
                            severityBreakdown,
                          };
                        })}
                        columns={[
                          {
                            align: 'left' as const,
                            width: '40px',
                            isExpander: true,
                            name: '',
                            render: (item: any) => (
                              <EuiButtonIcon
                                onClick={() => toggleGroupExpansion(item.id)}
                                aria-label={expandedGroupIds.has(item.id) ? 'Collapse' : 'Expand'}
                                iconType={expandedGroupIds.has(item.id) ? 'arrowDown' : 'arrowRight'}
                              />
                            ),
                          },
                          {
                            field: 'groupKey',
                            name: alertFilters.groupBy === 'datasource' ? 'Data Source' : 'State',
                            width: '30%',
                            render: (groupKey: string, item: any) => {
                              const displayName = alertFilters.groupBy === 'datasource' 
                                ? (dsNameMap.get(groupKey) || groupKey)
                                : groupKey;
                              
                              return (
                                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                                  <EuiFlexItem grow={false}>
                                    {alertFilters.groupBy === 'state' ? (
                                      <EuiHealth color={STATE_COLORS[groupKey] || 'subdued'}>{displayName}</EuiHealth>
                                    ) : (
                                      <EuiText size="s"><strong>{displayName}</strong></EuiText>
                                    )}
                                  </EuiFlexItem>
                                  <EuiFlexItem grow={false}>
                                    <EuiText size="s" color="subdued">({item.count})</EuiText>
                                  </EuiFlexItem>
                                </EuiFlexGroup>
                              );
                            },
                          },
                          {
                            field: 'stateBreakdown',
                            name: 'State',
                            render: (stateBreakdown: Record<string, number>) => (
                              <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                                {Object.entries(stateBreakdown)
                                  .sort(([a], [b]) => a.localeCompare(b))
                                  .map(([state, count]) => (
                                    <EuiFlexItem grow={false} key={state}>
                                      <EuiBadge color={STATE_COLORS[state] || 'default'}>
                                        {count} {state}
                                      </EuiBadge>
                                    </EuiFlexItem>
                                  ))}
                              </EuiFlexGroup>
                            ),
                          },
                          {
                            field: 'severityBreakdown',
                            name: 'Severity',
                            render: (severityBreakdown: Record<string, number>) => (
                              <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                                {Object.entries(severityBreakdown)
                                  .sort(([a], [b]) => a.localeCompare(b))
                                  .map(([severity, count]) => (
                                    <EuiFlexItem grow={false} key={severity}>
                                      <EuiBadge color={SEVERITY_COLORS[severity] || 'default'}>
                                        {count} {severity}
                                      </EuiBadge>
                                    </EuiFlexItem>
                                  ))}
                              </EuiFlexGroup>
                            ),
                          },
                        ]}
                        itemId="id"
                        itemIdToExpandedRowMap={Object.fromEntries(
                          Array.from(expandedGroupIds).map(groupId => [
                            groupId,
                            <div style={{ padding: '16px' }}>
                              <EuiBasicTable
                                items={groupedAlerts.get(groupId) || []}
                                columns={alertColumns}
                                loading={false}
                              />
                            </div>,
                          ])
                        )}
                        loading={loading}
                      />
                    ) : (
                      <EuiBasicTable items={filteredAlerts} columns={alertColumns} loading={loading} />
                    )}
                  </EuiPanel>
                </EuiResizablePanel>
              </>
            );
          }}
        </EuiResizableContainer>
      );
    }
    if (activeTab === 'rules') {
      return (
        <EuiResizableContainer style={{ height: 'calc(100vh - 250px)' }}>
          {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => {
            return (
              <>
                <EuiResizablePanel
                  id="filters-panel"
                  initialSize={20}
                  minSize="200px"
                  mode={['collapsible', { position: 'top' }]}
                  onToggleCollapsed={() => setIsFilterPanelCollapsed(!isFilterPanelCollapsed)}
                  paddingSize="none"
                  style={{ overflow: 'hidden', paddingRight: '4px' }}
                >
                  <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <EuiButtonIcon
                      iconType={isFilterPanelCollapsed ? 'menuRight' : 'menuLeft'}
                      onClick={() => togglePanel?.('filters-panel', { direction: 'left' })}
                      aria-label={isFilterPanelCollapsed ? 'Expand filters' : 'Collapse filters'}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 10,
                      }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <MonitorsFiltersPanel
                        rules={rules}
                        filters={filters}
                        onFiltersChange={setFilters}
                        searchQuery={searchQuery}
                        savedSearches={savedSearches}
                        onSaveSearch={saveCurrentSearch}
                        onLoadSearch={loadSavedSearch}
                        onDeleteSearch={deleteSavedSearch}
                        datasources={datasources}
                      />
                    </div>
                  </div>
                </EuiResizablePanel>

                <EuiResizableButton />

                <EuiResizablePanel
                  initialSize={80}
                  minSize="400px"
                  mode="main"
                  paddingSize="none"
                  style={{ paddingLeft: '4px' }}
                >
                  <EuiPanel paddingSize="m" hasBorder style={{ height: '100%', overflow: 'auto' }}>
                    <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiButton iconType="sparkleFilled" size="s" color="secondary" onClick={() => setShowAiWizard(true)}>
                          Generate monitors
                        </EuiButton>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButton fill iconType="plusInCircle" size="s" onClick={() => setShowCreateMonitor(true)}>
                          Create Monitor
                        </EuiButton>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="m" />
                    <MonitorsTable
                      rules={visibleRules}
                      datasources={datasources}
                      loading={loading}
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      filters={filters}
                      onDelete={handleDeleteRules}
                      onSilence={handleSilenceRule}
                      onClone={handleCloneRule}
                    />
                  </EuiPanel>
                </EuiResizablePanel>
              </>
            );
          }}
        </EuiResizableContainer>
      );
    }
    if (!loading && datasources.length === 0) return (
      <EuiPanel paddingSize="m" hasBorder>
        <EuiEmptyPrompt title={<h2>No Datasources</h2>} body={<p>Add a datasource to get started.</p>} />
      </EuiPanel>
    );
    return (
      <EuiPanel paddingSize="m" hasBorder>
        <EuiBasicTable items={datasources} columns={datasourceColumns} loading={loading} />
      </EuiPanel>
    );
  };

  return (
    <EuiPage>
      <EuiPageBody component="main">
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l"><h1>Alert Manager</h1></EuiTitle>
          </EuiPageHeaderSection>
        </EuiPageHeader>
        <EuiSpacer size="m" />
        <EuiTabs>
          {tabs.map(t => (
            <EuiTab key={t.id} isSelected={activeTab === t.id} onClick={() => setActiveTab(t.id)}>{t.name}</EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer />
        {renderTable()}
        {showCreateMonitor && (
          <CreateMonitor onSave={handleCreateMonitor} onCancel={() => setShowCreateMonitor(false)} />
        )}
        {showAiWizard && (
          <AiMonitorWizard onClose={() => setShowAiWizard(false)} onCreateMonitors={handleAiCreateMonitors} />
        )}
        {selectedAlert && (
          <AlertDetailFlyout alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};
