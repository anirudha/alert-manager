/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Suppression Rules Panel — manage suppression rules with CRUD and conflict detection.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  EuiFieldNumber,
  EuiDatePicker,
} from '@elastic/eui';
import moment, { Moment } from 'moment';
import { AlarmsApiClient } from '../services/alarms_client';

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
  const [formStartMoment, setFormStartMoment] = useState<Moment>(moment());
  const [formEndMoment, setFormEndMoment] = useState<Moment>(moment().add(1, 'hour'));
  const [formRecurrenceDays, setFormRecurrenceDays] = useState('');
  const [formTimezone, setFormTimezone] = useState('UTC');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Derive ISO strings from moment objects for the API
  const formStart = formStartMoment.toISOString();
  const formEnd = formEndMoment.toISOString();

  // Duration summary
  const durationSummary = useMemo(() => {
    if (!formStartMoment.isValid() || !formEndMoment.isValid()) return '';
    const diffMs = formEndMoment.diff(formStartMoment);
    if (diffMs <= 0) return '';
    const dur = moment.duration(diffMs);
    const parts: string[] = [];
    if (dur.days() > 0) parts.push(`${dur.days()} day${dur.days() > 1 ? 's' : ''}`);
    if (dur.hours() > 0) parts.push(`${dur.hours()} hour${dur.hours() > 1 ? 's' : ''}`);
    if (dur.minutes() > 0) parts.push(`${dur.minutes()} minute${dur.minutes() > 1 ? 's' : ''}`);
    const durationText = parts.join(', ') || 'less than 1 minute';
    const startStr = formStartMoment.format('h:mm A');
    const endStr = formEndMoment.format('h:mm A');
    return `Duration: ${durationText} (${startStr} \u2013 ${endStr})`;
  }, [formStartMoment, formEndMoment]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) errors.name = 'Name is required';
    if (Object.keys(formMatchers).length === 0) {
      errors.matchers = 'At least one matcher is required to prevent suppressing all alerts';
    }
    if (
      formStartMoment.isValid() &&
      formEndMoment.isValid() &&
      formEndMoment.isSameOrBefore(formStartMoment)
    ) {
      errors.endTime = 'End time must be after start time';
    }
    // Matcher input validation: partial fill
    if (formMatcherKey.trim() && !formMatcherValue.trim()) {
      errors.matcherValue = 'Matcher value is required when name is filled';
    }
    if (formMatcherValue.trim() && !formMatcherKey.trim()) {
      errors.matcherKey = 'Matcher name is required when value is filled';
    }
    return errors;
  }, [formName, formMatchers, formStartMoment, formEndMoment, formMatcherKey, formMatcherValue]);

  const isFormValid = Object.keys(validationErrors).length === 0;

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listSuppressionRules();
      setRules(res.rules || res || []);
    } catch (_e) {
      /* empty */
    }
    setLoading(false);
  }, [apiClient]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormMatchers({});
    setFormMatcherKey('');
    setFormMatcherValue('');
    setFormScheduleType('one_time');
    // Default to NOW and NOW + 1 hour
    setFormStartMoment(moment());
    setFormEndMoment(moment().add(1, 'hour'));
    setFormRecurrenceDays('');
    setFormTimezone('UTC');
    setConflicts([]);
    setHasSubmitted(false);
  };

  const openCreate = () => {
    resetForm();
    setEditingRule(null);
    setShowFlyout(true);
  };

  const openEdit = (rule: SuppressionRuleItem) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description || '');
    setFormMatchers(rule.matchers || {});
    setFormScheduleType(rule.schedule?.type || 'one_time');
    setFormStartMoment(rule.schedule?.start ? moment(rule.schedule.start) : moment());
    setFormEndMoment(rule.schedule?.end ? moment(rule.schedule.end) : moment().add(1, 'hour'));
    setFormRecurrenceDays((rule.schedule?.recurrence?.days || []).join(', '));
    setFormTimezone(rule.schedule?.recurrence?.timezone || 'UTC');
    setConflicts([]);
    setHasSubmitted(false);
    setShowFlyout(true);
  };

  const handleSave = async () => {
    setHasSubmitted(true);
    if (!isFormValid) return;

    const data = {
      name: formName,
      description: formDescription,
      matchers: formMatchers,
      schedule: {
        type: formScheduleType,
        start: formStart,
        end: formEnd,
        ...(formScheduleType === 'recurring'
          ? {
              recurrence: {
                days: formRecurrenceDays
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                timezone: formTimezone,
              },
            }
          : {}),
      },
      enabled: true,
    };
    try {
      if (editingRule) {
        await apiClient.updateSuppressionRule(editingRule.id, data);
      } else {
        await apiClient.createSuppressionRule(data);
      }
    } catch (_e) {
      /* fallback */
    }
    setShowFlyout(false);
    fetchRules();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiClient.deleteSuppressionRule(deleteId);
    } catch (_e) {
      /* */
    }
    setDeleteId(null);
    fetchRules();
  };

  const addMatcher = () => {
    if (formMatcherKey && formMatcherValue) {
      setFormMatchers((prev) => ({ ...prev, [formMatcherKey]: formMatcherValue }));
      setFormMatcherKey('');
      setFormMatcherValue('');
    }
  };

  // Quick preset handlers for duration
  const applyPreset = (hours: number) => {
    const start = moment();
    setFormStartMoment(start);
    setFormEndMoment(moment(start).add(hours, 'hours'));
  };

  const applyUntilTomorrowMorning = () => {
    const start = moment();
    const tomorrow9am = moment().add(1, 'day').startOf('day').add(9, 'hours');
    setFormStartMoment(start);
    setFormEndMoment(tomorrow9am);
  };

  const STATUS_COLORS: Record<string, string> = {
    active: 'success',
    scheduled: 'primary',
    expired: 'subdued',
  };

  const columns = [
    { field: 'name', name: 'Name', sortable: true },
    {
      field: 'status',
      name: 'Status',
      width: '100px',
      render: (s: string) => <EuiBadge color={STATUS_COLORS[s] || 'default'}>{s}</EuiBadge>,
    },
    {
      field: 'schedule',
      name: 'Schedule',
      render: (sch: SuppressionRuleItem['schedule']) => {
        if (!sch) return '\u2014';
        const type = sch.type === 'recurring' ? 'Recurring' : 'One-time';
        return `${type}: ${sch.start || '?'} \u2192 ${sch.end || '?'}`;
      },
    },
    {
      field: 'matchers',
      name: 'Matchers',
      render: (m: Record<string, string>) => {
        const entries = Object.entries(m || {});
        return entries.length > 0 ? (
          entries.map(([k, v]) => (
            <EuiBadge key={k} color="hollow">
              {k}={v}
            </EuiBadge>
          ))
        ) : (
          <EuiBadge color="default">all</EuiBadge>
        );
      },
    },
    {
      field: 'affectedMonitors',
      name: 'Monitors',
      width: '80px',
      render: (n: number | undefined) => n ?? '\u2014',
    },
    {
      field: 'suppressedAlerts',
      name: 'Suppressed',
      width: '80px',
      render: (n: number | undefined) => n ?? '\u2014',
    },
    {
      name: 'Actions',
      width: '100px',
      render: (rule: SuppressionRuleItem) => (
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Edit">
              <EuiButtonIcon
                iconType="pencil"
                aria-label="Edit"
                size="s"
                onClick={() => openEdit(rule)}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Delete">
              <EuiButtonIcon
                iconType="trash"
                aria-label="Delete"
                size="s"
                color="danger"
                onClick={() => setDeleteId(rule.id)}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  return (
    <div>
      {/* S-m8: Datasource scoping banner */}
      <EuiCallOut color="primary" iconType="iInCircle" size="s">
        Suppression rules apply globally across all Prometheus datasources.
      </EuiCallOut>
      <EuiSpacer size="m" />

      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>Suppression Rules</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType="plusInCircle" size="s" onClick={openCreate}>
            Create Rule
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {!loading && rules.length === 0 ? (
        <EuiEmptyPrompt
          title={<h2>No Suppression Rules</h2>}
          body={<p>Create a suppression rule to silence alerts during maintenance windows.</p>}
        />
      ) : (
        <EuiBasicTable items={rules} columns={columns} loading={loading} />
      )}

      {showFlyout && (
        <EuiFlyout onClose={() => setShowFlyout(false)} size="m" ownFocus>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2>{editingRule ? 'Edit' : 'Create'} Suppression Rule</h2>
            </EuiTitle>
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
            <EuiFormRow
              label="Name"
              isInvalid={hasSubmitted && !!validationErrors.name}
              error={hasSubmitted ? validationErrors.name : undefined}
            >
              <EuiFieldText value={formName} onChange={(e) => setFormName(e.target.value)} />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Description">
              <EuiTextArea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow
              label="Label Matchers"
              isInvalid={hasSubmitted && !!validationErrors.matchers}
              error={hasSubmitted ? validationErrors.matchers : undefined}
            >
              <div>
                {Object.entries(formMatchers).map(([k, v]) => (
                  <EuiBadge
                    key={k}
                    color="hollow"
                    iconType="cross"
                    iconSide="right"
                    iconOnClick={() =>
                      setFormMatchers((prev) => {
                        const n = { ...prev };
                        delete n[k];
                        return n;
                      })
                    }
                    iconOnClickAriaLabel="Remove"
                  >
                    {k}={v}
                  </EuiBadge>
                ))}
                <EuiSpacer size="xs" />
                <EuiFlexGroup gutterSize="xs" responsive={false}>
                  <EuiFlexItem>
                    <EuiFieldText
                      placeholder="key"
                      compressed
                      value={formMatcherKey}
                      onChange={(e) => setFormMatcherKey(e.target.value)}
                      isInvalid={hasSubmitted && !!validationErrors.matcherKey}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFieldText
                      placeholder="value"
                      compressed
                      value={formMatcherValue}
                      onChange={(e) => setFormMatcherValue(e.target.value)}
                      isInvalid={hasSubmitted && !!validationErrors.matcherValue}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size="xs" onClick={addMatcher}>
                      Add
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {hasSubmitted && validationErrors.matcherKey && (
                  <EuiText size="xs" color="danger">
                    {validationErrors.matcherKey}
                  </EuiText>
                )}
                {hasSubmitted && validationErrors.matcherValue && (
                  <EuiText size="xs" color="danger">
                    {validationErrors.matcherValue}
                  </EuiText>
                )}
              </div>
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow label="Schedule Type">
              <EuiSelect
                options={[
                  { value: 'one_time', text: 'One-time' },
                  { value: 'recurring', text: 'Recurring' },
                ]}
                value={formScheduleType}
                onChange={(e) => setFormScheduleType(e.target.value as any)}
              />
            </EuiFormRow>
            <EuiSpacer size="m" />

            {/* Quick duration presets */}
            <EuiFlexGroup gutterSize="s" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" onClick={() => applyPreset(1)}>
                  1 hour
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" onClick={() => applyPreset(6)}>
                  6 hours
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" onClick={applyUntilTomorrowMorning}>
                  Until tomorrow 9am
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />

            <EuiFormRow label="Start Time">
              <EuiDatePicker
                selected={formStartMoment}
                onChange={(date: Moment | null) => {
                  if (date) setFormStartMoment(date);
                }}
                showTimeSelect
                timeFormat="HH:mm"
                dateFormat="YYYY-MM-DD HH:mm"
              />
            </EuiFormRow>
            <EuiSpacer size="m" />
            <EuiFormRow
              label="End Time"
              isInvalid={hasSubmitted && !!validationErrors.endTime}
              error={hasSubmitted ? validationErrors.endTime : undefined}
            >
              <EuiDatePicker
                selected={formEndMoment}
                onChange={(date: Moment | null) => {
                  if (date) setFormEndMoment(date);
                }}
                showTimeSelect
                timeFormat="HH:mm"
                dateFormat="YYYY-MM-DD HH:mm"
                minDate={formStartMoment}
              />
            </EuiFormRow>

            {/* Duration summary */}
            {durationSummary && (
              <>
                <EuiSpacer size="s" />
                <EuiText size="xs" color="subdued">
                  {durationSummary}
                </EuiText>
              </>
            )}

            {formScheduleType === 'recurring' && (
              <>
                <EuiSpacer size="m" />
                <EuiFormRow label="Recurrence Days (comma-separated)">
                  <EuiFieldText
                    value={formRecurrenceDays}
                    onChange={(e) => setFormRecurrenceDays(e.target.value)}
                    placeholder="Mon, Tue, Wed"
                  />
                </EuiFormRow>
                <EuiSpacer size="m" />
                <EuiFormRow label="Timezone">
                  <EuiFieldText
                    value={formTimezone}
                    onChange={(e) => setFormTimezone(e.target.value)}
                  />
                </EuiFormRow>
              </>
            )}
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={() => setShowFlyout(false)}>Cancel</EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton fill onClick={handleSave} isDisabled={hasSubmitted && !isFormValid}>
                  {editingRule ? 'Update' : 'Create'}
                </EuiButton>
              </EuiFlexItem>
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
          <p>
            This will remove the suppression rule. Alerts that were suppressed by this rule will
            resume notifications.
          </p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
