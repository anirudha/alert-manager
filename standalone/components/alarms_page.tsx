/**
 * Alert Manager UI — uses unified views + backend-native drill-down.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFilterGroup,
  EuiFilterButton,
  EuiPopover,
  EuiSelectable,
  EuiButtonIcon,
  EuiButtonGroup,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiDescriptionList,
  EuiText,
  EuiCallOut,
  EuiPanel,
  EuiLink,
  EuiButton,
} from '@opensearch-project/oui';
import { Datasource, UnifiedAlert, UnifiedRule } from '../../core';

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
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [backendFilter, setBackendFilter] = useState<string[]>([]);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isSeverityPopoverOpen, setIsSeverityPopoverOpen] = useState(false);
  const [isBackendPopoverOpen, setIsBackendPopoverOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlert | null>(null);

  const groupByEnabled = viewMode === 'grouped';

  const dsNameMap = new Map(datasources.map(d => [d.id, d.name]));

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

  // Filter rules based on search and filters
  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          rule.name.toLowerCase().includes(query) ||
          rule.query?.toLowerCase().includes(query) ||
          rule.group?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter.length > 0) {
        const status = rule.enabled ? 'enabled' : 'disabled';
        if (!statusFilter.includes(status)) return false;
      }

      // Severity filter
      if (severityFilter.length > 0) {
        if (!severityFilter.includes(rule.severity)) return false;
      }

      // Backend filter
      if (backendFilter.length > 0) {
        if (!backendFilter.includes(rule.datasourceType)) return false;
      }

      return true;
    });
  }, [rules, searchQuery, statusFilter, severityFilter, backendFilter]);

  // Get unique values for filters
  const statusOptions = useMemo(() => [
    { label: 'Enabled', checked: statusFilter.includes('enabled') ? 'on' : undefined },
    { label: 'Disabled', checked: statusFilter.includes('disabled') ? 'on' : undefined },
  ], [statusFilter]);

  const severityOptions = useMemo(() => {
    const severities = Array.from(new Set(rules.map(r => r.severity)));
    return severities.map(s => ({
      label: s.charAt(0).toUpperCase() + s.slice(1),
      checked: severityFilter.includes(s) ? 'on' : undefined,
    }));
  }, [rules, severityFilter]);

  const backendOptions = useMemo(() => {
    const backends = Array.from(new Set(rules.map(r => r.datasourceType)));
    return backends.map(b => ({
      label: b.charAt(0).toUpperCase() + b.slice(1),
      checked: backendFilter.includes(b) ? 'on' : undefined,
    }));
  }, [rules, backendFilter]);

  const handleStatusFilterChange = (options: any[]) => {
    const selected = options.filter(o => o.checked === 'on').map(o => o.label.toLowerCase());
    setStatusFilter(selected);
  };

  const handleSeverityFilterChange = (options: any[]) => {
    const selected = options.filter(o => o.checked === 'on').map(o => o.label.toLowerCase());
    setSeverityFilter(selected);
  };

  const handleBackendFilterChange = (options: any[]) => {
    const selected = options.filter(o => o.checked === 'on').map(o => o.label.toLowerCase());
    setBackendFilter(selected);
  };

  const activeFilterCount = statusFilter.length + severityFilter.length + backendFilter.length;

  // Group rules by group name
  const groupedRules = useMemo(() => {
    const groups = new Map<string, UnifiedRule[]>();
    
    filteredRules.forEach(rule => {
      const groupName = rule.group || 'Ungrouped';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(rule);
    });

    return Array.from(groups.entries()).map(([groupName, rules]) => {
      const enabledCount = rules.filter(r => r.enabled).length;
      const disabledCount = rules.length - enabledCount;
      
      return {
        groupName,
        rules,
        ruleCount: rules.length,
        enabledCount,
        disabledCount,
      };
    });
  }, [filteredRules]);

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };


  // --- Alert columns ---
  const alertColumns = [
    { 
      field: 'name', 
      name: 'Name', 
      sortable: true,
      render: (name: string, alert: UnifiedAlert) => (
        <EuiLink onClick={() => setSelectedAlert(alert)} color="primary">
          {name}
        </EuiLink>
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
    {
      name: 'Actions',
      render: (alert: UnifiedAlert) => (
        <EuiButtonIcon
          iconType="eye"
          aria-label="View alert details"
          onClick={() => setSelectedAlert(alert)}
        />
      ),
    },
  ];

  // --- Rule columns ---
  const ruleColumns = [
    { field: 'name', name: 'Name', sortable: true, width: '30%' },
    {
      field: 'enabled', name: 'Status',
      render: (e: boolean) => (
        <EuiHealth color={e ? 'success' : 'subdued'}>
          {e ? 'Enabled' : 'Disabled'}
        </EuiHealth>
      ),
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

  // --- Nested rule columns (without group column) ---
  const nestedRuleColumns = [
    { field: 'name', name: 'Name', sortable: true, width: '30%' },
    {
      field: 'enabled', name: 'Status',
      render: (e: boolean) => (
        <EuiHealth color={e ? 'success' : 'subdued'}>
          {e ? 'Enabled' : 'Disabled'}
        </EuiHealth>
      ),
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
  ];

  // --- Group columns (for grouped view) ---
  const groupColumns = [
    {
      field: 'groupName',
      name: 'Group',
      render: (groupName: string) => (
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              onClick={() => toggleGroup(groupName)}
              iconType={expandedGroups.has(groupName) ? 'arrowDown' : 'arrowRight'}
              aria-label={expandedGroups.has(groupName) ? 'Collapse group' : 'Expand group'}
              color="text"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <strong>{groupName}</strong>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: 'ruleCount',
      name: 'Rules',
      render: (count: number, item: any) => (
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          {item.enabledCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="success">{item.enabledCount} enabled</EuiBadge>
            </EuiFlexItem>
          )}
          {item.disabledCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="default">{item.disabledCount} disabled</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
  ];

  const itemIdToExpandedRowMap: Record<string, React.ReactNode> = {};
  
  if (groupByEnabled) {
    groupedRules.forEach(({ groupName, rules: groupRules }) => {
      if (expandedGroups.has(groupName)) {
        itemIdToExpandedRowMap[groupName] = (
          <div style={{ padding: '16px' }}>
            <EuiBasicTable
              items={groupRules}
              columns={nestedRuleColumns}
              tableLayout="fixed"
            />
          </div>
        );
      }
    });
  }

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

  const tabs = [
    { id: 'alerts' as TabId, name: `Alerts (${alerts.length})` },
    { id: 'rules' as TabId, name: `Rules (${rules.length})` },
    { id: 'datasources' as TabId, name: `Datasources (${datasources.length})` },
  ];

  const renderTable = () => {
    if (activeTab === 'alerts') {
      if (!loading && alerts.length === 0) return <EuiEmptyPrompt title={<h2>No Active Alerts</h2>} body={<p>All systems operating normally.</p>} />;
      return <EuiBasicTable items={alerts} columns={alertColumns} loading={loading} />;
    }
    if (activeTab === 'rules') {
      if (!loading && rules.length === 0) return <EuiEmptyPrompt title={<h2>No Rules</h2>} body={<p>No alerting rules configured.</p>} />;
      if (!loading && filteredRules.length === 0 && (searchQuery || activeFilterCount > 0)) {
        return <EuiEmptyPrompt title={<h2>No Matching Rules</h2>} body={<p>Try adjusting your search or filters.</p>} />;
      }

      // Grouped view
      if (groupByEnabled) {
        return (
          <EuiBasicTable
            items={groupedRules}
            columns={groupColumns}
            loading={loading}
            itemId="groupName"
            itemIdToExpandedRowMap={itemIdToExpandedRowMap}
            isExpandable={true}
          />
        );
      }

      // Standard flat view
      return <EuiBasicTable items={filteredRules} columns={ruleColumns} loading={loading} />;
    }
    if (!loading && datasources.length === 0) return <EuiEmptyPrompt title={<h2>No Datasources</h2>} body={<p>Add a datasource to get started.</p>} />;
    return <EuiBasicTable items={datasources} columns={datasourceColumns} loading={loading} />;
  };

  const renderSearchAndFilters = () => {
    if (activeTab !== 'rules') return null;

    const viewModeButtons = [
      {
        id: 'list',
        label: 'List all rules',
      },
      {
        id: 'grouped',
        label: 'By rule groups',
      },
    ];

    return (
      <>
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              legend="View mode"
              options={viewModeButtons}
              idSelected={viewMode}
              onChange={(id) => setViewMode(id as 'list' | 'grouped')}
              buttonSize="compressed"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={true}>
            <EuiFieldSearch
              placeholder="Search rules by name, query, or group..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              isClearable
              fullWidth
              aria-label="Search rules"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup>
              <EuiPopover
                button={
                  <EuiFilterButton
                    iconType="arrowDown"
                    onClick={() => setIsStatusPopoverOpen(!isStatusPopoverOpen)}
                    isSelected={isStatusPopoverOpen}
                    numFilters={statusFilter.length}
                    hasActiveFilters={statusFilter.length > 0}
                    numActiveFilters={statusFilter.length}
                  >
                    Status
                  </EuiFilterButton>
                }
                isOpen={isStatusPopoverOpen}
                closePopover={() => setIsStatusPopoverOpen(false)}
                panelPaddingSize="none"
              >
                <EuiSelectable
                  options={statusOptions}
                  onChange={handleStatusFilterChange}
                  aria-label="Filter by status"
                >
                  {(list) => <div style={{ width: 200 }}>{list}</div>}
                </EuiSelectable>
              </EuiPopover>

              <EuiPopover
                button={
                  <EuiFilterButton
                    iconType="arrowDown"
                    onClick={() => setIsSeverityPopoverOpen(!isSeverityPopoverOpen)}
                    isSelected={isSeverityPopoverOpen}
                    numFilters={severityFilter.length}
                    hasActiveFilters={severityFilter.length > 0}
                    numActiveFilters={severityFilter.length}
                  >
                    Severity
                  </EuiFilterButton>
                }
                isOpen={isSeverityPopoverOpen}
                closePopover={() => setIsSeverityPopoverOpen(false)}
                panelPaddingSize="none"
              >
                <EuiSelectable
                  options={severityOptions}
                  onChange={handleSeverityFilterChange}
                  aria-label="Filter by severity"
                >
                  {(list) => <div style={{ width: 200 }}>{list}</div>}
                </EuiSelectable>
              </EuiPopover>

              <EuiPopover
                button={
                  <EuiFilterButton
                    iconType="arrowDown"
                    onClick={() => setIsBackendPopoverOpen(!isBackendPopoverOpen)}
                    isSelected={isBackendPopoverOpen}
                    numFilters={backendFilter.length}
                    hasActiveFilters={backendFilter.length > 0}
                    numActiveFilters={backendFilter.length}
                  >
                    Backend
                  </EuiFilterButton>
                }
                isOpen={isBackendPopoverOpen}
                closePopover={() => setIsBackendPopoverOpen(false)}
                panelPaddingSize="none"
              >
                <EuiSelectable
                  options={backendOptions}
                  onChange={handleBackendFilterChange}
                  aria-label="Filter by backend"
                >
                  {(list) => <div style={{ width: 200 }}>{list}</div>}
                </EuiSelectable>
              </EuiPopover>
            </EuiFilterGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
      </>
    );
  };

  return (
    <EuiPage restrictWidth="1200px">
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
        {renderSearchAndFilters()}
        {renderTable()}
      </EuiPageBody>

      {selectedAlert && (
        <EuiFlyout onClose={() => setSelectedAlert(null)} size="m" aria-labelledby="alert-details-title">
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="m">
                  <h2 id="alert-details-title">{selectedAlert.name}</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[selectedAlert.severity] || 'default'}>
                  {selectedAlert.severity}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="l" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Start time:</strong> {selectedAlert.startTime ? new Date(selectedAlert.startTime).toLocaleTimeString() : '-'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Decrease rate:</strong> <span style={{ color: '#F5A700' }}>4.87%</span>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Baseline:</strong> 0.8%
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Threshold:</strong> 1.2%
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {/* Summary Section */}
            <section>
              <EuiTitle size="s">
                <h3>Summary</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <p>
                  Your {selectedAlert.datasourceType} service is experiencing increased error rates that coincide with database billing-service-python memory usage reaching 85% on three pods. Historical data shows this pattern typically leads to service degradation within 20 minutes.
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <p>
                  <strong>Likely root cause:</strong> High CPU/memory usage triggers resource limits
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              
              {/* Metric Chart */}
              <EuiPanel hasBorder paddingSize="m">
                <div style={{ position: 'relative', height: '180px' }}>
                  <svg width="100%" height="100%" viewBox="0 0 600 160" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="40" x2="600" y2="40" stroke="#D3DAE6" strokeWidth="1" strokeDasharray="4" />
                    <line x1="0" y1="80" x2="600" y2="80" stroke="#D3DAE6" strokeWidth="1" strokeDasharray="4" />
                    <line x1="0" y1="120" x2="600" y2="120" stroke="#D3DAE6" strokeWidth="1" strokeDasharray="4" />
                    
                    {/* Metric line */}
                    <polyline
                      points="0,100 50,95 100,90 150,85 200,95 250,100 300,90 350,85 400,95 450,90 500,85 550,95 600,90"
                      fill="none"
                      stroke="#006BB4"
                      strokeWidth="2"
                    />
                    
                    {/* Spike area */}
                    <polyline
                      points="400,95 420,80 440,60 460,45 480,50 500,55 520,60"
                      fill="none"
                      stroke="#006BB4"
                      strokeWidth="2"
                    />
                    
                    {/* Labels */}
                    <text x="5" y="15" fill="#69707D" fontSize="11">2.280</text>
                    <text x="5" y="85" fill="#69707D" fontSize="11">2.203</text>
                    <text x="5" y="155" fill="#69707D" fontSize="11">2.126</text>
                    <text x="5" y="165" fill="#69707D" fontSize="10">Oct 31 20:41</text>
                    <text x="550" y="165" fill="#69707D" fontSize="10">Oct 3 23:41</text>
                  </svg>
                  <EuiText size="xs" color="subdued" style={{ marginTop: '4px' }}>
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <div style={{ width: '12px', height: '12px', backgroundColor: '#006BB4', borderRadius: '2px' }} />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        pod_memory_utilization
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiText>
                </div>
              </EuiPanel>
            </section>

            <EuiSpacer size="l" />

            {/* Impact Section */}
            <section>
              <EuiTitle size="s">
                <h3>Impact</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiPanel hasBorder paddingSize="m" style={{ backgroundColor: '#FEF6F6' }}>
                <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                  {/* Service 1 */}
                  <EuiFlexItem grow={false}>
                    <div style={{ 
                      border: '2px solid #BD271E', 
                      borderRadius: '8px', 
                      padding: '12px 16px',
                      backgroundColor: '#FFFFFF',
                      minWidth: '160px'
                    }}>
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '50%', 
                            backgroundColor: '#FEF6F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <span style={{ fontSize: '16px' }}>⚠️</span>
                          </div>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>PetClinicMonitor</strong>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </div>
                  </EuiFlexItem>

                  {/* Arrow */}
                  <EuiFlexItem grow={false}>
                    <span style={{ fontSize: '20px', color: '#BD271E' }}>→</span>
                  </EuiFlexItem>

                  {/* Service 2 */}
                  <EuiFlexItem grow={false}>
                    <div style={{ 
                      border: '2px solid #BD271E', 
                      borderRadius: '8px', 
                      padding: '12px 16px',
                      backgroundColor: '#FFFFFF',
                      minWidth: '160px'
                    }}>
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '50%', 
                            backgroundColor: '#FEF6F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <span style={{ fontSize: '16px' }}>⚠️</span>
                          </div>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>payment-gateway</strong>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </div>
                  </EuiFlexItem>

                  {/* Arrow */}
                  <EuiFlexItem grow={false}>
                    <span style={{ fontSize: '20px', color: '#BD271E' }}>→</span>
                  </EuiFlexItem>

                  {/* Service 3 */}
                  <EuiFlexItem grow={false}>
                    <div style={{ 
                      border: '2px solid #BD271E', 
                      borderRadius: '8px', 
                      padding: '12px 16px',
                      backgroundColor: '#FFFFFF',
                      minWidth: '160px'
                    }}>
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '50%', 
                            backgroundColor: '#FEF6F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <span style={{ fontSize: '16px' }}>⚠️</span>
                          </div>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>billing-service-python</strong>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </div>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            </section>

            <EuiSpacer size="l" />

            {/* Recommendation Section */}
            <section>
              <EuiTitle size="s">
                <h3>Recommendation</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <p>
                  Consider adding composite index on (user_id, transaction_date) for performance improvement.
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType="wrench"
                    aria-label="Make changes"
                    display="base"
                    size="s"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued">
                    Make changes in Kiro
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </section>

            <EuiSpacer size="l" />

            {/* Dive Deeper Section */}
            <section>
              <EuiTitle size="s">
                <h3>Dive deeper</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <p>
                  70% of execution time spent in database operations, with the payment_transactions query as the primary bottleneck.
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType="inspect"
                    aria-label="Look into traces"
                    display="base"
                    size="s"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued">
                    Look into traces from payments-db
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="l" />
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="discoverApp"
                    size="s"
                    color="primary"
                    fill={false}
                  >
                    Dive deeper
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="search"
                    size="s"
                    color="primary"
                    fill={false}
                  >
                    Start investigation
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiButtonIcon
                        iconType="thumbsUp"
                        aria-label="Helpful"
                        color="text"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonIcon
                        iconType="thumbsDown"
                        aria-label="Not helpful"
                        color="text"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonIcon
                        iconType="cross"
                        aria-label="Dismiss"
                        color="text"
                        onClick={() => setSelectedAlert(null)}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </section>
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </EuiPage>
  );
};
