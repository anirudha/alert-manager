/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Manager UI — shared between OSD plugin and standalone mode.
 * Uses unified views + backend-native drill-down.
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
} from '@elastic/eui';
import { Datasource, UnifiedAlert, UnifiedRule } from '../../core';
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

interface AlarmsPageProps {
  apiClient: AlarmsApiClient;
}

type TabId = 'alerts' | 'rules';

export const AlarmsPage: React.FC<AlarmsPageProps> = ({ apiClient }) => {
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [rules, setRules] = useState<UnifiedRule[]>([]);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);

  const dsNameMap = new Map(datasources.map((d) => [d.id, d.name]));

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Alert columns ---
  const alertColumns = [
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
  ];

  // --- Rule columns ---
  const ruleColumns = [
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
  ];

  const tabs = [
    { id: 'alerts' as TabId, name: `Alerts (${alerts.length})` },
    { id: 'rules' as TabId, name: `Rules (${rules.length})` },
  ];

  const renderTable = () => {
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
