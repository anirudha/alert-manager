/**
 * Core Alarms UI — pure React + EUI. No OSD-specific imports.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  EuiButton,
  EuiBasicTable,
  EuiHealth,
  EuiSwitch,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiSpacer,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { Alarm } from '../../core';
import { AlarmsApiClient } from '../services/alarms_client';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
};

interface AlarmsPageProps {
  apiClient: AlarmsApiClient;
}

export const AlarmsPage: React.FC<AlarmsPageProps> = ({ apiClient }) => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.list();
      setAlarms(data);
    } catch (e) {
      console.error('Failed to fetch alarms', e);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchAlarms();
  }, [fetchAlarms]);

  const handleToggle = async (id: string) => {
    await apiClient.toggle(id);
    fetchAlarms();
  };

  const handleDelete = async (id: string) => {
    await apiClient.delete(id);
    fetchAlarms();
  };

  const columns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'severity',
      name: 'Severity',
      render: (severity: string) => (
        <EuiHealth color={SEVERITY_COLORS[severity] || 'subdued'}>
          {severity}
        </EuiHealth>
      ),
    },
    { field: 'condition', name: 'Condition' },
    {
      field: 'enabled',
      name: 'Enabled',
      render: (enabled: boolean, alarm: Alarm) => (
        <EuiSwitch
          label=""
          checked={enabled}
          onChange={() => handleToggle(alarm.id)}
          compressed
          showLabel={false}
        />
      ),
    },
    {
      name: 'Actions',
      render: (alarm: Alarm) => (
        <EuiButton size="s" color="danger" onClick={() => handleDelete(alarm.id)}>
          Delete
        </EuiButton>
      ),
    },
  ];

  if (!loading && alarms.length === 0) {
    return (
      <EuiPage>
        <EuiPageBody component="main">
          <EuiEmptyPrompt
            title={<h2>Welcome to Alarms</h2>}
            body={
              <p>
                Create and manage alert rules to monitor your system health and get
                notified when issues occur.
              </p>
            }
            actions={
              <EuiButton color="primary" fill>
                Create alert rule
              </EuiButton>
            }
          />
        </EuiPageBody>
      </EuiPage>
    );
  }

  return (
    <EuiPage>
      <EuiPageBody component="main">
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Alarms</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
          <EuiPageHeaderSection>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiButton fill>Create alert rule</EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageHeaderSection>
        </EuiPageHeader>
        <EuiSpacer />
        <EuiBasicTable items={alarms} columns={columns} loading={loading} />
      </EuiPageBody>
    </EuiPage>
  );
};
