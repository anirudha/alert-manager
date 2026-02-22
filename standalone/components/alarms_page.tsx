/**
 * Alert Manager UI — single-datasource selection with server-side pagination.
 * Prometheus datasources are decomposed into selectable workspaces.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  EuiBasicTable,
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
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiPanel,
  EuiIcon,
  EuiComboBox,
  EuiLoadingSpinner,
  EuiCallOut,
} from '@opensearch-project/oui';
import {
  Datasource,
  UnifiedAlert,
  UnifiedRule,
  PaginatedResponse,
} from '../../core';
import { MonitorsTable } from './monitors_table';
import { CreateMonitor, MonitorFormState } from './create_monitor';
import { AlertsDashboard } from './alerts_dashboard';
import { AlertDetailFlyout } from './alert_detail_flyout';
import { NotificationRoutingPanel } from './notification_routing_panel';
import { SuppressionRulesPanel } from './suppression_rules_panel';

// ============================================================================
// HTTP Client & API
// ============================================================================

export interface HttpClient {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: any): Promise<T>;
  put<T = any>(path: string, body?: any): Promise<T>;
  patch<T = any>(path: string, body?: any): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
}

export class AlarmsApiClient {
  constructor(private readonly http: HttpClient) {}

  async listDatasources(): Promise<Datasource[]> {
    const res = await this.http.get<{ datasources: Datasource[] }>('/api/datasources');
    return res.datasources;
  }

  async listWorkspaces(dsId: string): Promise<Datasource[]> {
    const res = await this.http.get<{ workspaces: Datasource[] }>(`/api/datasources/${dsId}/workspaces`);
    return res.workspaces;
  }

  async listAlertsPaginated(dsIds: string[], page: number, pageSize: number): Promise<PaginatedResponse<UnifiedAlert>> {
    const params = new URLSearchParams();
    if (dsIds.length > 0) params.set('dsIds', dsIds.join(','));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<PaginatedResponse<UnifiedAlert>>(`/api/paginated/alerts?${params.toString()}`);
  }

  async listRulesPaginated(dsIds: string[], page: number, pageSize: number): Promise<PaginatedResponse<UnifiedRule>> {
    const params = new URLSearchParams();
    if (dsIds.length > 0) params.set('dsIds', dsIds.join(','));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<PaginatedResponse<UnifiedRule>>(`/api/paginated/rules?${params.toString()}`);
  }

  // Monitor CRUD
  async createMonitor(data: any): Promise<any> {
    return this.http.post('/api/monitors', data);
  }
  async updateMonitor(id: string, data: any): Promise<any> {
    return this.http.put(`/api/monitors/${id}`, data);
  }
  async deleteMonitor(id: string): Promise<any> {
    return this.http.delete(`/api/monitors/${id}`);
  }
  async importMonitors(json: any[]): Promise<any> {
    return this.http.post('/api/monitors/import', json);
  }
  async exportMonitors(): Promise<any> {
    return this.http.get('/api/monitors/export');
  }

  // Routing rules
  async listRoutingRules(): Promise<any> {
    return this.http.get('/api/routing-rules');
  }
  async createRoutingRule(data: any): Promise<any> {
    return this.http.post('/api/routing-rules', data);
  }
  async updateRoutingRule(id: string, data: any): Promise<any> {
    return this.http.put(`/api/routing-rules/${id}`, data);
  }
  async deleteRoutingRule(id: string): Promise<any> {
    return this.http.delete(`/api/routing-rules/${id}`);
  }

  // Suppression rules
  async listSuppressionRules(): Promise<any> {
    return this.http.get('/api/suppression-rules');
  }
  async createSuppressionRule(data: any): Promise<any> {
    return this.http.post('/api/suppression-rules', data);
  }
  async updateSuppressionRule(id: string, data: any): Promise<any> {
    return this.http.put(`/api/suppression-rules/${id}`, data);
  }
  async deleteSuppressionRule(id: string): Promise<any> {
    return this.http.delete(`/api/suppression-rules/${id}`);
  }

  // Alert actions
  async acknowledgeAlert(id: string): Promise<any> {
    return this.http.post(`/api/alerts/${id}/acknowledge`);
  }
  async silenceAlert(id: string, duration?: string): Promise<any> {
    return this.http.post(`/api/alerts/${id}/silence`, { duration: duration || '1h' });
  }
}

// ============================================================================
// Datasource Selector Component
// ============================================================================

const DatasourceSelector: React.FC<{
  datasources: Datasource[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading: boolean;
  workspaceOptions: Datasource[];
  loadingWorkspaces: boolean;
}> = ({ datasources, selectedIds, onSelectionChange, loading, workspaceOptions, loadingWorkspaces }) => {
  // Build combo box options: non-prometheus datasources + prometheus workspace entries
  // EuiComboBox uses `label` as the key, so we build a label->id map
  const { options, labelToId, idToLabel } = useMemo(() => {
    const lToId: Record<string, string> = {};
    const iToL: Record<string, string> = {};
    const opts: Array<{ label: string; options?: Array<{ label: string }> }> = [];

    // Non-prometheus datasources as direct options
    const nonProm = datasources.filter(d => d.type !== 'prometheus');
    if (nonProm.length > 0) {
      opts.push({
        label: 'OpenSearch',
        options: nonProm.map(d => {
          lToId[d.name] = d.id;
          iToL[d.id] = d.name;
          return { label: d.name };
        }),
      });
    }

    // Prometheus workspaces grouped under their parent
    const promDs = datasources.filter(d => d.type === 'prometheus');
    for (const pds of promDs) {
      const wsForDs = workspaceOptions.filter(w => w.parentDatasourceId === pds.id);
      if (wsForDs.length > 0) {
        opts.push({
          label: pds.name,
          options: wsForDs.map(w => {
            const displayLabel = `${pds.name} / ${w.workspaceName || w.name}`;
            lToId[displayLabel] = w.id;
            iToL[w.id] = displayLabel;
            return { label: displayLabel };
          }),
        });
      } else if (loadingWorkspaces) {
        opts.push({ label: `${pds.name} (loading workspaces...)`, options: [] });
      } else {
        // Fallback: show the raw prometheus datasource
        lToId[pds.name] = pds.id;
        iToL[pds.id] = pds.name;
        opts.push({
          label: 'Prometheus',
          options: [{ label: pds.name }],
        });
      }
    }
    return { options: opts, labelToId: lToId, idToLabel: iToL };
  }, [datasources, workspaceOptions, loadingWorkspaces]);

  const selectedOptions = useMemo(() => {
    const all: Array<{ label: string }> = [];
    for (const id of selectedIds) {
      const label = idToLabel[id];
      if (label) all.push({ label });
    }
    return all;
  }, [selectedIds, idToLabel]);

  return (
    <EuiPanel paddingSize="s" hasBorder style={{ marginBottom: 12 }}>
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="database" size="s" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs"><strong>Datasource(s)</strong></EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiComboBox
            placeholder="Select a datasource to view rules and alerts..."
            options={options as any}
            selectedOptions={selectedOptions}
            onChange={(selected: Array<{ label: string }>) => {
              const ids = selected.map(s => labelToId[s.label]).filter(Boolean);
              onSelectionChange(ids);
            }}
            isLoading={loading || loadingWorkspaces}
            isClearable
            compressed
            aria-label="Select datasource"
          />
        </EuiFlexItem>
        {loadingWorkspaces && (
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

// ============================================================================
// Pagination Controls
// ============================================================================

const PaginationBar: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}> = ({ page, pageSize, total, hasMore, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false} style={{ padding: '8px 0' }}>
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued">
          Showing {total > 0 ? start : 0}–{end} of {total} items
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">Rows:</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{ padding: '2px 4px', fontSize: 12, border: '1px solid #D3DAE6', borderRadius: 4 }}
              aria-label="Rows per page"
            >
              {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => onPageChange(page - 1)} isDisabled={page <= 1} iconType="arrowLeft" aria-label="Previous page">
              Prev
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs">Page {page} of {totalPages}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => onPageChange(page + 1)} isDisabled={!hasMore} iconType="arrowRight" iconSide="right" aria-label="Next page">
              Next
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

interface AlarmsPageProps {
  apiClient: AlarmsApiClient;
}

type TabId = 'alerts' | 'rules' | 'routing' | 'suppression' | 'datasources';

const DEFAULT_PAGE_SIZE = 20;

export const AlarmsPage: React.FC<AlarmsPageProps> = ({ apiClient }) => {
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [workspaceOptions, setWorkspaceOptions] = useState<Datasource[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paginated data
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsPageSize, setAlertsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [alertsHasMore, setAlertsHasMore] = useState(false);

  const [rules, setRules] = useState<UnifiedRule[]>([]);
  const [rulesTotal, setRulesTotal] = useState(0);
  const [rulesPage, setRulesPage] = useState(1);
  const [rulesPageSize, setRulesPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [rulesHasMore, setRulesHasMore] = useState(false);

  const [deletedRuleIds, setDeletedRuleIds] = useState<Set<string>>(new Set());
  const [showCreateMonitor, setShowCreateMonitor] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlert | null>(null);

  const visibleRules = rules.filter(r => !deletedRuleIds.has(r.id));

  // All selectable datasources for the create form: non-prometheus + workspace entries
  const creatableDatasources = useMemo(() => {
    const result: Datasource[] = [];
    for (const ds of datasources) {
      if (ds.type !== 'prometheus') {
        result.push(ds);
      }
    }
    // Add workspace-scoped entries for Prometheus
    for (const ws of workspaceOptions) {
      result.push(ws);
    }
    return result;
  }, [datasources, workspaceOptions]);

  // ---- Load datasources and discover workspaces on mount ----

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ds = await apiClient.listDatasources();
        setDatasources(ds || []);

        // Discover workspaces for all Prometheus datasources
        const promDs = (ds || []).filter(d => d.type === 'prometheus');
        if (promDs.length > 0) {
          setLoadingWorkspaces(true);
          const allWs: Datasource[] = [];
          for (const pds of promDs) {
            try {
              const ws = await apiClient.listWorkspaces(pds.id);
              allWs.push(...ws);
            } catch (_e) { /* skip failed workspace discovery */ }
          }
          setWorkspaceOptions(allWs);
          setLoadingWorkspaces(false);

          // Auto-select the first Prometheus production workspace as default
          const prodWs = allWs.find(w => w.workspaceName === 'production') || allWs[0];
          if (prodWs) {
            setSelectedDsIds([prodWs.id]);
          }
        }
      } catch (e) {
        console.error('Failed to load datasources', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [apiClient]);

  // ---- Fetch data when datasource selection or page changes ----

  const fetchAlerts = useCallback(async (dsIds: string[], page: number, pageSize: number) => {
    if (dsIds.length === 0) {
      setAlerts([]);
      setAlertsTotal(0);
      setAlertsHasMore(false);
      return;
    }
    setDataLoading(true);
    setError(null);
    try {
      const res = await apiClient.listAlertsPaginated(dsIds, page, pageSize);
      setAlerts(res.results || []);
      setAlertsTotal(res.total || 0);
      setAlertsHasMore(res.hasMore || false);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch alerts');
    } finally {
      setDataLoading(false);
    }
  }, [apiClient]);

  const fetchRules = useCallback(async (dsIds: string[], page: number, pageSize: number) => {
    if (dsIds.length === 0) {
      setRules([]);
      setRulesTotal(0);
      setRulesHasMore(false);
      return;
    }
    setDataLoading(true);
    setError(null);
    try {
      const res = await apiClient.listRulesPaginated(dsIds, page, pageSize);
      setRules(res.results || []);
      setRulesTotal(res.total || 0);
      setRulesHasMore(res.hasMore || false);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch rules');
    } finally {
      setDataLoading(false);
    }
  }, [apiClient]);

  // Fetch when selection or pagination changes
  useEffect(() => {
    if (selectedDsIds.length === 0) return;
    if (activeTab === 'alerts') {
      fetchAlerts(selectedDsIds, alertsPage, alertsPageSize);
    }
  }, [selectedDsIds, alertsPage, alertsPageSize, activeTab, fetchAlerts]);

  useEffect(() => {
    if (selectedDsIds.length === 0) return;
    if (activeTab === 'rules') {
      fetchRules(selectedDsIds, rulesPage, rulesPageSize);
    }
  }, [selectedDsIds, rulesPage, rulesPageSize, activeTab, fetchRules]);

  // Reset pages when datasource selection changes
  const handleDatasourceChange = useCallback((ids: string[]) => {
    setSelectedDsIds(ids);
    setAlertsPage(1);
    setRulesPage(1);
    setDeletedRuleIds(new Set());
  }, []);

  // ---- Datasource columns ----
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

  // ---- Handlers ----

  const handleAcknowledgeAlert = async (alertId: string) => {
    try { await apiClient.acknowledgeAlert(alertId); } catch (_e) { /* fallback */ }
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, state: 'acknowledged' as const, lastUpdated: new Date().toISOString() } : a
    ));
  };

  const handleSilenceAlert = async (alertId: string) => {
    try { await apiClient.silenceAlert(alertId); } catch (_e) { /* fallback */ }
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, state: 'resolved' as const, lastUpdated: new Date().toISOString() } : a
    ));
  };

  const handleDeleteRules = async (ids: string[]) => {
    for (const id of ids) {
      try { await apiClient.deleteMonitor(id); } catch (_e) { /* continue */ }
    }
    setDeletedRuleIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleSilenceRule = async (id: string) => {
    const rule = rules.find(r => r.id === id);
    if (rule && rule.status === 'muted') {
      try { await apiClient.deleteSuppressionRule(id); } catch (_e) { /* fallback */ }
    } else {
      try { await apiClient.createSuppressionRule({ name: `Silence ${rule?.name || id}`, matchers: { monitor_id: id }, schedule: { type: 'one_time', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() }, enabled: true }); } catch (_e) { /* fallback */ }
    }
    setRules(prev => prev.map(r => {
      if (r.id === id) {
        const newStatus = r.status === 'muted' ? 'active' : 'muted';
        return { ...r, status: newStatus as any };
      }
      return r;
    }));
  };

  const handleCloneRule = async (monitor: UnifiedRule) => {
    const clone: UnifiedRule = {
      ...monitor,
      id: `clone-${Date.now()}`,
      name: `${monitor.name} (Copy)`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      createdBy: 'current-user',
    };
    try { await apiClient.createMonitor(clone); } catch (_e) { /* fallback */ }
    setRules(prev => [clone, ...prev]);
  };

  const handleImportMonitors = async (configs: any[]) => {
    try {
      await apiClient.importMonitors(configs);
      fetchRules(selectedDsIds, rulesPage, rulesPageSize);
    } catch (_e) { /* silently handle */ }
  };

  const formStateToRule = (formState: MonitorFormState, index = 0): UnifiedRule => {
    const now = new Date().toISOString();

    if (formState.datasourceType === 'prometheus') {
      const labelsObj: Record<string, string> = {};
      for (const l of formState.labels) {
        if (l.key && l.value) labelsObj[l.key] = l.value;
      }
      const annotationsObj: Record<string, string> = {};
      for (const a of formState.annotations) {
        if (a.key && a.value) annotationsObj[a.key] = a.value;
      }
      return {
        id: `new-${Date.now()}-${index}`,
        datasourceId: formState.datasourceId || selectedDsIds[0] || 'ds-2',
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
    } else {
      // OpenSearch monitor
      const isPPL = formState.monitorType === 'ppl_monitor';
      const indices = formState.indices.split(',').map(s => s.trim()).filter(Boolean);
      const monitorType = formState.monitorType === 'ppl_monitor' ? 'metric' as const
        : formState.monitorType === 'bucket_level_monitor' ? 'infrastructure' as const
        : formState.monitorType === 'doc_level_monitor' ? 'log' as const
        : 'metric' as const;

      // PPL monitors have Prometheus-like labels/annotations
      const labelsObj: Record<string, string> = {};
      const annotationsObj: Record<string, string> = {};
      if (isPPL) {
        for (const l of formState.labels) {
          if (l.key && l.value) labelsObj[l.key] = l.value;
        }
        for (const a of formState.annotations) {
          if (a.key && a.value) annotationsObj[a.key] = a.value;
        }
      }
      if (indices.length > 0) labelsObj.indices = indices.join(', ');
      labelsObj.monitorType = formState.monitorType;

      return {
        id: `new-${Date.now()}-${index}`,
        datasourceId: formState.datasourceId || selectedDsIds[0] || 'ds-1',
        datasourceType: 'opensearch',
        name: formState.name,
        enabled: formState.enabled,
        severity: formState.severity,
        query: formState.query,
        condition: isPPL
          ? `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`
          : formState.triggerCondition,
        labels: labelsObj,
        annotations: annotationsObj,
        monitorType,
        status: formState.enabled ? 'active' : 'disabled',
        healthStatus: 'healthy',
        createdBy: 'current-user',
        createdAt: now,
        lastModified: now,
        notificationDestinations: formState.actionName ? [formState.actionName] : [],
        description: isPPL
          ? `OpenSearch PPL monitor${indices.length > 0 ? ` on ${indices.join(', ')}` : ''}`
          : `OpenSearch ${formState.monitorType} on ${indices.join(', ')}`,
        aiSummary: 'Newly created OpenSearch monitor. No historical data available yet.',
        evaluationInterval: isPPL ? formState.evaluationInterval : `${formState.schedule.interval} ${formState.schedule.unit.toLowerCase()}`,
        pendingPeriod: isPPL ? formState.pendingPeriod : '5 minutes',
        threshold: isPPL ? { operator: formState.threshold.operator, value: formState.threshold.value, unit: formState.threshold.unit } : undefined,
        alertHistory: [],
        conditionPreviewData: [],
        notificationRouting: [],
        suppressionRules: [],
        raw: {} as any,
      };
    }
  };

  const handleCreateMonitor = async (formState: MonitorFormState) => {
    const newRule = formStateToRule(formState);
    try { await apiClient.createMonitor(formState); } catch (_e) { /* local-only fallback */ }
    setRules(prev => [newRule, ...prev]);
    setShowCreateMonitor(false);
  };

  const handleBatchCreateMonitors = async (forms: MonitorFormState[]) => {
    const newRules = forms.map((f, i) => formStateToRule(f, i));
    for (const f of forms) {
      try { await apiClient.createMonitor(f); } catch (_e) { /* local-only fallback */ }
    }
    setRules(prev => [...newRules, ...prev]);
    // Don't close flyout — AI wizard shows its own summary step and "Done" button
  };

  // ---- Render ----

  const tabs = [
    { id: 'alerts' as TabId, name: `Alerts (${alertsTotal})` },
    { id: 'rules' as TabId, name: `Rules (${rulesTotal})` },
    { id: 'routing' as TabId, name: 'Routing' },
    { id: 'suppression' as TabId, name: 'Suppression' },
    { id: 'datasources' as TabId, name: `Datasources (${datasources.length})` },
  ];

  const noDatasourceSelected = selectedDsIds.length === 0;

  const renderTable = () => {
    if (activeTab === 'alerts') {
      if (noDatasourceSelected) {
        return (
          <EuiEmptyPrompt
            iconType="database"
            title={<h3>Select a datasource</h3>}
            body={<p>Choose a datasource above to view alerts. For Prometheus datasources, select a specific workspace.</p>}
          />
        );
      }
      return (
        <>
          <AlertsDashboard
            alerts={alerts}
            datasources={datasources}
            loading={dataLoading}
            onViewDetail={(alert) => setSelectedAlert(alert)}
            onAcknowledge={handleAcknowledgeAlert}
            onSilence={handleSilenceAlert}
          />
          <PaginationBar
            page={alertsPage}
            pageSize={alertsPageSize}
            total={alertsTotal}
            hasMore={alertsHasMore}
            onPageChange={setAlertsPage}
            onPageSizeChange={(size) => { setAlertsPageSize(size); setAlertsPage(1); }}
          />
        </>
      );
    }
    if (activeTab === 'rules') {
      if (noDatasourceSelected) {
        return (
          <>
            <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiButton fill iconType="plusInCircle" size="s" onClick={() => setShowCreateMonitor(true)}>
                  Create Monitor
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            <EuiEmptyPrompt
              iconType="database"
              title={<h3>Select a datasource</h3>}
              body={<p>Choose a datasource above to view rules. For Prometheus datasources, select a specific workspace.</p>}
            />
          </>
        );
      }
      return (
        <>
          <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiButton fill iconType="plusInCircle" size="s" onClick={() => setShowCreateMonitor(true)}>
                Create Monitor
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <MonitorsTable
            rules={visibleRules}
            datasources={datasources}
            loading={dataLoading}
            onDelete={handleDeleteRules}
            onSilence={handleSilenceRule}
            onClone={handleCloneRule}
            onImport={handleImportMonitors}
          />
          <PaginationBar
            page={rulesPage}
            pageSize={rulesPageSize}
            total={rulesTotal}
            hasMore={rulesHasMore}
            onPageChange={setRulesPage}
            onPageSizeChange={(size) => { setRulesPageSize(size); setRulesPage(1); }}
          />
        </>
      );
    }
    if (activeTab === 'routing') {
      return <NotificationRoutingPanel apiClient={apiClient} />;
    }
    if (activeTab === 'suppression') {
      return <SuppressionRulesPanel apiClient={apiClient} />;
    }
    if (!loading && datasources.length === 0) return <EuiEmptyPrompt title={<h2>No Datasources</h2>} body={<p>Add a datasource to get started.</p>} />;
    return <EuiBasicTable items={datasources} columns={datasourceColumns} loading={loading} />;
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
        <EuiSpacer size="s" />

        {/* Datasource selector for alerts and rules tabs */}
        {(activeTab === 'alerts' || activeTab === 'rules') && (
          <DatasourceSelector
            datasources={datasources}
            selectedIds={selectedDsIds}
            onSelectionChange={handleDatasourceChange}
            loading={loading}
            workspaceOptions={workspaceOptions}
            loadingWorkspaces={loadingWorkspaces}
          />
        )}

        {error && (
          <EuiCallOut title="Error loading data" color="danger" iconType="alert" size="s" style={{ marginBottom: 12 }}>
            <p>{error}</p>
          </EuiCallOut>
        )}

        {renderTable()}
        {showCreateMonitor && (
          <CreateMonitor
            onSave={handleCreateMonitor}
            onBatchSave={handleBatchCreateMonitors}
            onCancel={() => setShowCreateMonitor(false)}
            datasources={creatableDatasources}
            selectedDsIds={selectedDsIds}
          />
        )}
        {selectedAlert && (
          <AlertDetailFlyout
            alert={selectedAlert}
            datasources={datasources}
            onClose={() => setSelectedAlert(null)}
            onAcknowledge={(id) => { handleAcknowledgeAlert(id); setSelectedAlert(null); }}
            onSilence={(id) => { handleSilenceAlert(id); setSelectedAlert(null); }}
          />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};
