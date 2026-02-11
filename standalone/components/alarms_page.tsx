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
} from '@opensearch-project/oui';
import { Datasource, UnifiedAlert, UnifiedRule, MonitorStatus } from '../../core';
import { MonitorsTable } from './monitors_table';
import { CreateMonitor } from './create_monitor';
import { AiMonitorWizard, AlertTemplate } from './ai_monitor_wizard';

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
    { field: 'name', name: 'Name', sortable: true },
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

  const renderTable = () => {
    if (activeTab === 'alerts') {
      if (!loading && alerts.length === 0) return <EuiEmptyPrompt title={<h2>No Active Alerts</h2>} body={<p>All systems operating normally.</p>} />;
      return <EuiBasicTable items={alerts} columns={alertColumns} loading={loading} />;
    }
    if (activeTab === 'rules') {
      return (
        <>
          <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiButton iconType="sparkles" size="s" color="secondary" onClick={() => setShowAiWizard(true)}>
                AI Monitor
              </EuiButton>
            </EuiFlexItem>
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
            loading={loading}
            onDelete={handleDeleteRules}
            onSilence={handleSilenceRule}
            onClone={handleCloneRule}
          />
        </>
      );
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
        <EuiSpacer />
        {renderTable()}
        {showCreateMonitor && (
          <CreateMonitor onSave={handleCreateMonitor} onCancel={() => setShowCreateMonitor(false)} />
        )}
        {showAiWizard && (
          <AiMonitorWizard onClose={() => setShowAiWizard(false)} onCreateMonitors={handleAiCreateMonitors} />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};
