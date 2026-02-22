/**
 * Notification Routing Panel — manage routing rules with CRUD operations.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiHealth,
  EuiSelect,
  EuiSpacer,
  EuiSwitch,
  EuiTitle,
  EuiToolTip,
  EuiComboBox,
  EuiFieldNumber,
} from '@opensearch-project/oui';
import { AlarmsApiClient } from './alarms_page';

interface RoutingRule {
  id: string;
  name: string;
  matchers: Record<string, string>;
  severityFilter: string[];
  destinations: Array<{ type: string; target: string }>;
  groupBy: string[];
  groupWindow: string;
  priority: number;
  enabled: boolean;
}

export interface NotificationRoutingPanelProps {
  apiClient: AlarmsApiClient;
}

export const NotificationRoutingPanel: React.FC<NotificationRoutingPanelProps> = ({ apiClient }) => {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFlyout, setShowFlyout] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formMatcherKey, setFormMatcherKey] = useState('');
  const [formMatcherValue, setFormMatcherValue] = useState('');
  const [formMatchers, setFormMatchers] = useState<Record<string, string>>({});
  const [formDestType, setFormDestType] = useState('slack');
  const [formDestTarget, setFormDestTarget] = useState('');
  const [formDestinations, setFormDestinations] = useState<Array<{ type: string; target: string }>>([]);
  const [formGroupBy, setFormGroupBy] = useState('');
  const [formGroupWindow, setFormGroupWindow] = useState('5m');
  const [formPriority, setFormPriority] = useState(0);
  const [formEnabled, setFormEnabled] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listRoutingRules();
      setRules(res.rules || res || []);
    } catch (_e) { /* empty */ }
    setLoading(false);
  }, [apiClient]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormName(''); setFormMatchers({}); setFormMatcherKey(''); setFormMatcherValue('');
    setFormDestinations([]); setFormDestType('slack'); setFormDestTarget('');
    setFormGroupBy(''); setFormGroupWindow('5m'); setFormPriority(0); setFormEnabled(true);
  };

  const openCreate = () => { resetForm(); setEditingRule(null); setShowFlyout(true); };

  const openEdit = (rule: RoutingRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormMatchers(rule.matchers || {});
    setFormDestinations(rule.destinations || []);
    setFormGroupBy((rule.groupBy || []).join(', '));
    setFormGroupWindow(rule.groupWindow || '5m');
    setFormPriority(rule.priority);
    setFormEnabled(rule.enabled);
    setShowFlyout(true);
  };

  const handleSave = async () => {
    const data = {
      name: formName,
      matchers: formMatchers,
      severityFilter: [],
      destinations: formDestinations,
      groupBy: formGroupBy.split(',').map(s => s.trim()).filter(Boolean),
      groupWindow: formGroupWindow,
      priority: formPriority,
      enabled: formEnabled,
    };
    try {
      if (editingRule) {
        await apiClient.updateRoutingRule(editingRule.id, data);
      } else {
        await apiClient.createRoutingRule(data);
      }
    } catch (_e) { /* fallback */ }
    setShowFlyout(false);
    fetchRules();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await apiClient.deleteRoutingRule(deleteId); } catch (_e) { /* */ }
    setDeleteId(null);
    fetchRules();
  };

  const addMatcher = () => {
    if (formMatcherKey && formMatcherValue) {
      setFormMatchers(prev => ({ ...prev, [formMatcherKey]: formMatcherValue }));
      setFormMatcherKey(''); setFormMatcherValue('');
    }
  };

  const addDestination = () => {
    if (formDestTarget) {
      setFormDestinations(prev => [...prev, { type: formDestType, target: formDestTarget }]);
      setFormDestTarget('');
    }
  };

  const columns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'matchers', name: 'Matchers',
      render: (m: Record<string, string>) => {
        const entries = Object.entries(m || {});
        return entries.length > 0
          ? entries.map(([k, v]) => <EuiBadge key={k} color="hollow">{k}={v}</EuiBadge>)
          : <EuiBadge color="default">catch-all</EuiBadge>;
      },
    },
    {
      field: 'destinations', name: 'Destinations',
      render: (d: Array<{ type: string; target: string }>) =>
        (d || []).map((dest, i) => <EuiBadge key={i} color="primary">{dest.type}: {dest.target}</EuiBadge>),
    },
    { field: 'priority', name: 'Priority', width: '80px', sortable: true },
    {
      field: 'enabled', name: 'Status', width: '80px',
      render: (e: boolean) => <EuiHealth color={e ? 'success' : 'subdued'}>{e ? 'On' : 'Off'}</EuiHealth>,
    },
    {
      name: 'Actions', width: '100px',
      render: (rule: RoutingRule) => (
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Edit"><EuiButtonIcon iconType="pencil" aria-label="Edit" size="s" onClick={() => openEdit(rule)} /></EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Delete"><EuiButtonIcon iconType="trash" aria-label="Delete" size="s" color="danger" onClick={() => setDeleteId(rule.id)} /></EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  return (
    <div>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs"><h3>Notification Routing Rules</h3></EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType="plusInCircle" size="s" onClick={openCreate}>Create Rule</EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {!loading && rules.length === 0 ? (
        <EuiEmptyPrompt title={<h2>No Routing Rules</h2>} body={<p>Create a routing rule to direct alert notifications.</p>} />
      ) : (
        <EuiBasicTable items={rules} columns={columns} loading={loading} />
      )}

      {showFlyout && (
        <EuiFlyout onClose={() => setShowFlyout(false)} size="s" ownFocus>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m"><h2>{editingRule ? 'Edit' : 'Create'} Routing Rule</h2></EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiFormRow label="Name">
              <EuiFieldText value={formName} onChange={e => setFormName(e.target.value)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Label Matchers">
              <div>
                {Object.entries(formMatchers).map(([k, v]) => (
                  <EuiBadge key={k} color="hollow" iconType="cross" iconSide="right"
                    iconOnClick={() => setFormMatchers(prev => { const n = { ...prev }; delete n[k]; return n; })}
                    iconOnClickAriaLabel="Remove">{k}={v}</EuiBadge>
                ))}
                <EuiSpacer size="xs" />
                <EuiFlexGroup gutterSize="xs" responsive={false}>
                  <EuiFlexItem><EuiFieldText placeholder="key" compressed value={formMatcherKey} onChange={e => setFormMatcherKey(e.target.value)} /></EuiFlexItem>
                  <EuiFlexItem><EuiFieldText placeholder="value" compressed value={formMatcherValue} onChange={e => setFormMatcherValue(e.target.value)} /></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiButtonEmpty size="xs" onClick={addMatcher}>Add</EuiButtonEmpty></EuiFlexItem>
                </EuiFlexGroup>
              </div>
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Destinations">
              <div>
                {formDestinations.map((d, i) => (
                  <EuiBadge key={i} color="primary" iconType="cross" iconSide="right"
                    iconOnClick={() => setFormDestinations(prev => prev.filter((_, j) => j !== i))}
                    iconOnClickAriaLabel="Remove">{d.type}: {d.target}</EuiBadge>
                ))}
                <EuiSpacer size="xs" />
                <EuiFlexGroup gutterSize="xs" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiSelect compressed options={[
                      { value: 'slack', text: 'Slack' },
                      { value: 'email', text: 'Email' },
                      { value: 'pagerduty', text: 'PagerDuty' },
                      { value: 'webhook', text: 'Webhook' },
                    ]} value={formDestType} onChange={e => setFormDestType(e.target.value)} />
                  </EuiFlexItem>
                  <EuiFlexItem><EuiFieldText placeholder="target" compressed value={formDestTarget} onChange={e => setFormDestTarget(e.target.value)} /></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiButtonEmpty size="xs" onClick={addDestination}>Add</EuiButtonEmpty></EuiFlexItem>
                </EuiFlexGroup>
              </div>
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Group By (comma-separated labels)">
              <EuiFieldText value={formGroupBy} onChange={e => setFormGroupBy(e.target.value)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Group Window">
              <EuiFieldText value={formGroupWindow} onChange={e => setFormGroupWindow(e.target.value)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Priority">
              <EuiFieldNumber value={formPriority} onChange={e => setFormPriority(Number(e.target.value))} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow>
              <EuiSwitch label="Enabled" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} />
            </EuiFormRow>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}><EuiButtonEmpty onClick={() => setShowFlyout(false)}>Cancel</EuiButtonEmpty></EuiFlexItem>
              <EuiFlexItem grow={false}><EuiButton fill onClick={handleSave} isDisabled={!formName}>{editingRule ? 'Update' : 'Create'}</EuiButton></EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}

      {deleteId && (
        <EuiConfirmModal
          title="Delete routing rule?"
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
        >
          <p>This action cannot be undone.</p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
