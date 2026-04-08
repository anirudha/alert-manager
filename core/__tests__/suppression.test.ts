/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SuppressionRuleService, SuppressionRuleConfig } from '../suppression';

describe('SuppressionRuleService', () => {
  let service: SuppressionRuleService;

  beforeEach(() => {
    service = new SuppressionRuleService();
  });

  describe('CRUD operations', () => {
    it('creates a rule with auto-generated id', () => {
      const rule = service.create({
        name: 'Maintenance Window',
        description: 'Suppress during deploy',
        matchers: { service: 'api-gateway' },
        scheduleType: 'one_time',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T06:00:00Z',
        createdBy: 'admin',
      });
      expect(rule.id).toMatch(/^sup-\d+$/);
      expect(rule.name).toBe('Maintenance Window');
      expect(rule.createdAt).toBeDefined();
    });

    it('lists all rules', () => {
      service.create({
        name: 'A',
        description: '',
        matchers: {},
        scheduleType: 'one_time',
        startTime: '',
        endTime: '',
        createdBy: 'x',
      });
      service.create({
        name: 'B',
        description: '',
        matchers: {},
        scheduleType: 'one_time',
        startTime: '',
        endTime: '',
        createdBy: 'x',
      });
      expect(service.list()).toHaveLength(2);
    });

    it('gets a rule by id', () => {
      const rule = service.create({
        name: 'Test',
        description: '',
        matchers: {},
        scheduleType: 'one_time',
        startTime: '',
        endTime: '',
        createdBy: 'x',
      });
      expect(service.get(rule.id)).toEqual(rule);
    });

    it('returns undefined for unknown id', () => {
      expect(service.get('sup-999')).toBeUndefined();
    });

    it('updates a rule', () => {
      const rule = service.create({
        name: 'Old',
        description: '',
        matchers: {},
        scheduleType: 'one_time',
        startTime: '',
        endTime: '',
        createdBy: 'x',
      });
      const updated = service.update(rule.id, { name: 'New' });
      expect(updated!.name).toBe('New');
      expect(updated!.id).toBe(rule.id);
    });

    it('returns null when updating non-existent rule', () => {
      expect(service.update('sup-999', { name: 'New' })).toBeNull();
    });

    it('deletes a rule', () => {
      const rule = service.create({
        name: 'ToDelete',
        description: '',
        matchers: {},
        scheduleType: 'one_time',
        startTime: '',
        endTime: '',
        createdBy: 'x',
      });
      expect(service.delete(rule.id)).toBe(true);
      expect(service.get(rule.id)).toBeUndefined();
    });

    it('returns false when deleting non-existent rule', () => {
      expect(service.delete('sup-999')).toBe(false);
    });
  });

  describe('isAlertSuppressed', () => {
    it('returns true when alert matches active rule', () => {
      const now = new Date();
      const start = new Date(now.getTime() - 3600000); // 1 hour ago
      const end = new Date(now.getTime() + 3600000); // 1 hour from now
      service.create({
        name: 'Active Rule',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        createdBy: 'admin',
      });
      expect(service.isAlertSuppressed({ labels: { service: 'api', env: 'prod' } })).toBe(true);
    });

    it('returns false when labels do not match', () => {
      const now = new Date();
      service.create({
        name: 'Active Rule',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: new Date(now.getTime() - 3600000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        createdBy: 'admin',
      });
      expect(service.isAlertSuppressed({ labels: { service: 'web' } })).toBe(false);
    });

    it('returns false when rule is not in active window', () => {
      service.create({
        name: 'Past Rule',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2020-01-01T06:00:00Z',
        createdBy: 'admin',
      });
      expect(service.isAlertSuppressed({ labels: { service: 'api' } })).toBe(false);
    });
  });

  describe('getActiveRules', () => {
    it('returns only rules whose time window contains now', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 7200000);
      const pastEnd = new Date(now.getTime() - 3600000);
      const activeStart = new Date(now.getTime() - 1800000);
      const activeEnd = new Date(now.getTime() + 1800000);

      service.create({
        name: 'Past Rule',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: past.toISOString(),
        endTime: pastEnd.toISOString(),
        createdBy: 'x',
      });
      service.create({
        name: 'Current Rule',
        description: '',
        matchers: { service: 'web' },
        scheduleType: 'one_time',
        startTime: activeStart.toISOString(),
        endTime: activeEnd.toISOString(),
        createdBy: 'x',
      });

      const active = service.getActiveRules();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Current Rule');
    });

    it('handles recurring rules that match the current day', () => {
      // Pin to a known time: Wednesday 2025-06-11T14:30:00Z (day=3)
      jest.useFakeTimers({ doNotFake: ['performance'] });
      jest.setSystemTime(new Date('2025-06-11T14:30:00Z'));

      service.create({
        name: 'Recurring Today',
        description: '',
        matchers: { env: 'staging' },
        scheduleType: 'recurring',
        startTime: '2024-01-01T13:00:00Z',
        endTime: '2024-01-01T15:59:00Z',
        recurrence: { days: [3], timezone: 'UTC' }, // Wednesday
        createdBy: 'admin',
      });

      const active = service.getActiveRules();
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(active.some((r) => r.name === 'Recurring Today')).toBe(true);

      jest.useRealTimers();
    });

    it('excludes recurring rules that do not match current day', () => {
      // Pin to Wednesday (day=3), rule is for Saturday (day=6)
      jest.useFakeTimers({ doNotFake: ['performance'] });
      jest.setSystemTime(new Date('2025-06-11T14:30:00Z'));

      service.create({
        name: 'Recurring Other Day',
        description: '',
        matchers: { env: 'staging' },
        scheduleType: 'recurring',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T23:59:00Z',
        recurrence: { days: [6], timezone: 'UTC' }, // Saturday, not Wednesday
        createdBy: 'admin',
      });

      const active = service.getActiveRules();
      expect(active.every((r) => r.name !== 'Recurring Other Day')).toBe(true);

      jest.useRealTimers();
    });

    it('handles recurring rules with no recurrence field (falls through to date range)', () => {
      const now = new Date();
      const start = new Date(now.getTime() - 3600000);
      const end = new Date(now.getTime() + 3600000);

      service.create({
        name: 'Recurring No Recurrence',
        description: '',
        matchers: {},
        scheduleType: 'recurring',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        // Note: no recurrence field -- will fall through to date range check
        createdBy: 'admin',
      });

      const active = service.getActiveRules();
      expect(active.some((r) => r.name === 'Recurring No Recurrence')).toBe(true);
    });
  });

  describe('detectConflicts', () => {
    it('detects overlapping rules with same matchers and schedule', () => {
      const rule1 = service.create({
        name: 'Rule 1',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2024-06-01T00:00:00Z',
        endTime: '2024-06-01T12:00:00Z',
        createdBy: 'admin',
      });

      const candidate: SuppressionRuleConfig = {
        id: 'new-rule',
        name: 'Rule 2',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2024-06-01T06:00:00Z',
        endTime: '2024-06-01T18:00:00Z',
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
      };

      const conflicts = service.detectConflicts(candidate);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].id).toBe(rule1.id);
    });

    it('returns empty for non-overlapping schedules', () => {
      service.create({
        name: 'Rule 1',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2024-06-01T00:00:00Z',
        endTime: '2024-06-01T06:00:00Z',
        createdBy: 'admin',
      });

      const candidate: SuppressionRuleConfig = {
        id: 'new-rule',
        name: 'Rule 2',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2024-06-02T00:00:00Z',
        endTime: '2024-06-02T06:00:00Z',
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
      };

      expect(service.detectConflicts(candidate)).toHaveLength(0);
    });

    it('returns empty for different matchers', () => {
      service.create({
        name: 'Rule 1',
        description: '',
        matchers: { service: 'api' },
        scheduleType: 'one_time',
        startTime: '2024-06-01T00:00:00Z',
        endTime: '2024-06-01T12:00:00Z',
        createdBy: 'admin',
      });

      const candidate: SuppressionRuleConfig = {
        id: 'new-rule',
        name: 'Rule 2',
        description: '',
        matchers: { service: 'web', region: 'us-east' },
        scheduleType: 'one_time',
        startTime: '2024-06-01T00:00:00Z',
        endTime: '2024-06-01T12:00:00Z',
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
      };

      expect(service.detectConflicts(candidate)).toHaveLength(0);
    });
  });
});
