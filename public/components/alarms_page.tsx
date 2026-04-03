/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Manager UI — shared between OSD plugin and standalone mode.
 * Uses unified views + backend-native drill-down.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
} from '@elastic/eui';
import { Datasource, UnifiedAlertSummary, UnifiedRuleSummary } from '../../core';
import { AlarmsApiClient } from '../services/alarms_client';

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

/** Auto-refresh interval in ms (60 seconds). */
const AUTO_REFRESH_MS = 60_000;

interface AlarmsPageProps {
  apiClient: AlarmsApiClient;
}

type TabId = 'alerts' | 'rules';

export const AlarmsPage: React.FC<AlarmsPageProps> = ({ apiClient }) => {
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const [alerts, setAlerts] = useState<UnifiedAlertSummary[]>([]);
  const [rules, setRules] = useState<UnifiedRuleSummary[]>([]);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track which tabs have been loaded to enable lazy loading
  const loadedTabs = useRef<Set<TabId>>(new Set());

  // Memoize datasource name lookup to avoid re-creating on every render
  const dsNameMap = useMemo(() => new Map(datasources.map((d) => [d.id, d.name])), [datasources]);

  const fetchDatasources = useCallback(async () => {
    try {
      const d = await apiClient.listDatasources();
      setDatasources(d);
    } catch (e) {
      // Non-fatal — datasource names just won't resolve
    }
  }, [apiClient]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const a = await apiClient.listAlerts();
      setAlerts(a);
      loadedTabs.current.add('alerts');
    } catch (e) {
      setError(`Failed to load alerts: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.listRules();
      setRules(r);
      loadedTabs.current.add('rules');
    } catch (e) {
      setError(`Failed to load rules: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  // Fetch data for the active tab (lazy loading)
  const fetchActiveTab = useCallback(() => {
    fetchDatasources();
    if (activeTab === 'alerts') {
      fetchAlerts();
    } else {
      fetchRules();
    }
  }, [activeTab, fetchDatasources, fetchAlerts, fetchRules]);

  // Initial load + load on tab switch (only if not already loaded)
  useEffect(() => {
    if (!loadedTabs.current.has(activeTab)) {
      fetchActiveTab();
    }
  }, [activeTab, fetchActiveTab]);

  // Initial fetch for the default tab
  useEffect(() => {
    fetchActiveTab();
  }, [fetchActiveTab]);

  // Auto-refresh on an interval
  useEffect(() => {
    const interval = setInterval(() => {
      apiClient.invalidateCache();
      fetchActiveTab();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [apiClient, fetchActiveTab]);

  // --- Alert columns ---
  const alertColumns = useMemo(
    () => [
      { field: 'name', name: 'Name', sortable: true },
      {
        field: 'state',
        name: 'State',
        render: (state: string) => (
          <EuiHealth color={STATE_COLORS[state] || 'subdued'}>{state}</EuiHealth>
        ),
      },
      {
        field: 'severity',
        name: 'Severity',
        render: (s: string) => <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>,
      },
      {
        field: 'datasourceType',
        name: 'Backend',
        render: (t: string) => (
          <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>
        ),
      },
      {
        field: 'datasourceId',
        name: 'Datasource',
        render: (id: string) => dsNameMap.get(id) || id,
      },
      { field: 'message', name: 'Message', truncateText: true },
      {
        field: 'startTime',
        name: 'Started',
        render: (ts: string) => (ts ? new Date(ts).toLocaleString() : '-'),
      },
    ],
    [dsNameMap]
  );

  // --- Rule columns ---
  const ruleColumns = useMemo(
    () => [
      { field: 'name', name: 'Name', sortable: true },
      {
        field: 'enabled',
        name: 'Status',
        render: (e: boolean) => (
          <EuiBadge color={e ? 'success' : 'default'}>{e ? 'Enabled' : 'Disabled'}</EuiBadge>
        ),
      },
      {
        field: 'severity',
        name: 'Severity',
        render: (s: string) => <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>,
      },
      {
        field: 'datasourceType',
        name: 'Backend',
        render: (t: string) => (
          <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>
        ),
      },
      {
        field: 'datasourceId',
        name: 'Datasource',
        render: (id: string) => dsNameMap.get(id) || id,
      },
      { field: 'query', name: 'Query', truncateText: true },
      { field: 'group', name: 'Group', render: (g: string) => g || '-' },
    ],
    [dsNameMap]
  );

  const tabs = [
    { id: 'alerts' as TabId, name: `Alerts (${alerts.length})` },
    { id: 'rules' as TabId, name: `Rules (${rules.length})` },
  ];

  const renderError = () => {
    if (!error) return null;
    return (
      <EuiEmptyPrompt
        data-test-subj="alertManagerError"
        iconType="alert"
        title={<h2>Error Loading Data</h2>}
        body={<p>{error}</p>}
        actions={
          <button
            data-test-subj="alertManagerRetryButton"
            onClick={() => {
              apiClient.invalidateCache();
              fetchActiveTab();
            }}
          >
            Retry
          </button>
        }
      />
    );
  };

  const renderTable = () => {
    if (error) return renderError();

    if (activeTab === 'alerts') {
      if (!loading && alerts.length === 0)
        return (
          <EuiEmptyPrompt
            data-test-subj="alertManagerEmptyAlerts"
            title={<h2>No Active Alerts</h2>}
            body={<p>All systems operating normally.</p>}
          />
        );
      return (
        <EuiBasicTable
          items={alerts}
          columns={alertColumns}
          loading={loading}
          data-test-subj="alertManagerAlertsTable"
        />
      );
    }
    if (activeTab === 'rules') {
      if (!loading && rules.length === 0)
        return (
          <EuiEmptyPrompt
            data-test-subj="alertManagerEmptyRules"
            title={<h2>No Rules</h2>}
            body={<p>No alerting rules configured.</p>}
          />
        );
      return (
        <EuiBasicTable
          items={rules}
          columns={ruleColumns}
          loading={loading}
          data-test-subj="alertManagerRulesTable"
        />
      );
    }
    return null;
  };

  return (
    <EuiPage restrictWidth="1200px" data-test-subj="alertManagerPage">
      <EuiPageBody component="main">
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Alert Manager</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
        </EuiPageHeader>
        <EuiSpacer size="m" />
        <EuiTabs data-test-subj="alertManagerTabs">
          {tabs.map((t) => (
            <EuiTab
              key={t.id}
              isSelected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              data-test-subj={`alertManagerTab-${t.id}`}
            >
              {t.name}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer />
        {renderTable()}
      </EuiPageBody>
    </EuiPage>
  );
};
