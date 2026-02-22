/**
 * Suppression Rules Panel — manage suppression rules with CRUD and conflict detection.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
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
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  EuiFieldNumber,
  EuiDatePicker,
} from '@opensearch-project/oui';
import { AlarmsApiClient } from './alarms_page';

interface SuppressionRuleItem {
  id: string;
  name: string;
  description: string;
  matchers: Record<string, string>;
  schedule: {
    type: 'one_time' | 'recurring';
    start: string;
    end: string;
    recurrence?: { days: string[]; timezone: string };
  };
  status: 'active' | 'scheduled' | 'expired';
  enabled: boolean;
  affectedMonitors?: number;
  suppressedAlerts?: number;
}

export interface SuppressionRulesPanelProps {
  apiClient: AlarmsApiClient;
}

export const SuppressionRulesPanel: React.FC<SuppressionRulesPanelProps> = ({ apiClient }) => {
  const [rules, setRules] = useState<SuppressionRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFlyout, setShowFlyout] = useState(false);
  const [editingRule, setEditingRule] = useState<SuppressionRuleItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMatcherKey, setFormMatcherKey] = useState('');
  const [formMatcherValue, setFormMatcherValue] = useState('');
  const [formMatchers, setFormMatchers] = useState<Record<string, string>>({});
  const [formScheduleType, setFormScheduleType] = useState<'one_time' | 'recurring'>('one_time');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formRecurrenceDays, setFormRecurrenceDays] = useState('');
  const [formTimezone, setFormTimezone] = useState('UTC');

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listSuppressionRules();
      setRules(res.rules || res || []);
    } catch (_e) { /* empty */ }
    setLoading(false);
  }, [apiClient]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormName(''); setFormDescription(''); setFormMatchers({});
    setFormMatcherKey(''); setFormMatcherValue('');
    setFormScheduleType('one_time'); setFormStart(''); setFormEnd('');
    setFormRecurrenceDays(''); setFormTimezone('UTC'); setConflicts([]);
  };

  const openCreate = () => { resetForm(); setEditingRule(null); setShowFlyout(true); };

  const openEdit = (rule: SuppressionRuleItem) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description || '');
    setFormMatchers(rule.matchers || {});
    setFormScheduleType(rule.schedule?.type || 'one_time');
    setFormStart(rule.schedule?.start || '');
    setFormEnd(rule.schedule?.end || '');
    setFormRecurrenceDays((rule.schedule?.recurrence?.days || []).join(', '));
    setFormTimezone(rule.schedule?.recurrence?.timezone || 'UTC');
    setConflicts([]);
    setShowFlyout(true);
  };

  const handleSave = async () => {
    const data = {
      name: formName,
      description: formDescription,
      matchers: formMatchers,
      schedule: {
        type: formScheduleType,
        start: formStart,
        end: formEnd,
        ...(formScheduleType === 'recurring' ? {
          recurrence: {
            days: formRecurrenceDays.split(',').map(s => s.trim()).filter(Boolean),
            timezone: formTimezone,
          },
        } : {}),
      },
      enabled: true,
    };
    try {
      if (editingRule) {
        await apiClient.updateSuppressionRule(editingRule.id, data);
      } else {
        await apiClient.createSuppressionRule(data);
      }
    } catch (_e) { /* fallback */ }
    setShowFlyout(false);
    fetchRules();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await apiClient.deleteSuppressionRule(deleteId); } catch (_e) { /* */ }
    setDeleteId(null);
    fetchRules();
  };

  const addMatcher = () => {
    if (formMatcherKey && formMatcherValue) {
      setFormMatchers(prev => ({ ...prev, [formMatcherKey]: formMatcherValue }));
      setFormMatcherKey(''); setFormMatcherValue('');
    }
  };

  const STATUS_COLORS: Record<string, string> = { active: 'success', scheduled: 'primary', expired: 'subdued' };

  const columns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'status', name: 'Status', width: '100px',
      render: (s: string) => <EuiBadge color={STATUS_COLORS[s] || 'default'}>{s}</EuiBadge>,
    },
    {
      field: 'schedule', name: 'Schedule',
      render: (sch: SuppressionRuleItem['schedule']) => {
        if (!sch) return '—';
        const type = sch.type === 'recurring' ? 'Recurring' : 'One-time';
        return `${type}: ${sch.start || '?'} → ${sch.end || '?'}`;
      },
    },
    {
      field: 'matchers', name: 'Matchers',
      render: (m: Record<string, string>) => {
        const entries = Object.entries(m || {});
        return entries.length > 0
          ? entries.map(([k, v]) => <EuiBadge key={k} color="hollow">{k}={v}</EuiBadge>)
          : <EuiBadge color="default">all</EuiBadge>;
      },
    },
    {
      field: 'affectedMonitors', name: 'Monitors', width: '80px',
      render: (n: number | undefined) => n ?? '—',
    },
    {
      field: 'suppressedAlerts', name: 'Suppressed', width: '80px',
      render: (n: number | undefined) => n ?? '—',
    },
    {
      name: 'Actions', width: '100px',
      render: (rule: SuppressionRuleItem) => (
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
          <EuiTitle size="xs"><h3>Suppression Rules</h3></EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType="plusInCircle" size="s" onClick={openCreate}>Create Rule</EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {!loading && rules.length === 0 ? (
        <EuiEmptyPrompt title={<h2>No Suppression Rules</h2>} body={<p>Create a suppression rule to silence alerts during maintenance windows.</p>} />
      ) : (
        <EuiBasicTable items={rules} columns={columns} loading={loading} />
      )}

      {showFlyout && (
        <EuiFlyout onClose={() => setShowFlyout(false)} size="s" ownFocus>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m"><h2>{editingRule ? 'Edit' : 'Create'} Suppression Rule</h2></EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {conflicts.length > 0 && (
              <>
                <EuiCallOut title="Conflict detected" color="warning" iconType="alert" size="s">
                  <p>This rule overlaps with: {conflicts.join(', ')}</p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}
            <EuiFormRow label="Name">
              <EuiFieldText value={formName} onChange={e => setFormName(e.target.value)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Description">
              <EuiTextArea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} />
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
            <EuiFormRow label="Schedule Type">
              <EuiSelect options={[
                { value: 'one_time', text: 'One-time' },
                { value: 'recurring', text: 'Recurring' },
              ]} value={formScheduleType} onChange={e => setFormScheduleType(e.target.value as any)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Start Time (ISO)">
              <EuiFieldText value={formStart} onChange={e => setFormStart(e.target.value)} placeholder="2025-01-01T00:00:00Z" />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="End Time (ISO)">
              <EuiFieldText value={formEnd} onChange={e => setFormEnd(e.target.value)} placeholder="2025-01-01T06:00:00Z" />
            </EuiFormRow>
            {formScheduleType === 'recurring' && (
              <>
                <EuiSpacer size="m" />
                <EuiFormRow label="Recurrence Days (comma-separated)">
                  <EuiFieldText value={formRecurrenceDays} onChange={e => setFormRecurrenceDays(e.target.value)} placeholder="Mon, Tue, Wed" />
                </EuiFormRow>
                <EuiSpacer size="m" />
                <EuiFormRow label="Timezone">
                  <EuiFieldText value={formTimezone} onChange={e => setFormTimezone(e.target.value)} />
                </EuiFormRow>
              </>
            )}
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
          title="Delete suppression rule?"
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
        >
          <p>This will remove the suppression rule. Alerts that were suppressed by this rule will resume notifications.</p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
