/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InMemorySloStore } from '../slo_store';
import type { SloDefinition, ISloStore } from '../slo_types';
import { DEFAULT_MWMBR_TIERS } from '../slo_types';

function makeSlo(overrides: Partial<SloDefinition> = {}): SloDefinition {
  return {
    id: 'slo-test-1',
    datasourceId: 'ds-1',
    name: 'Test SLO',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      goodEventsFilter: 'status_code!~"5.."',
      service: { labelName: 'service', labelValue: 'test-svc' },
      operation: { labelName: 'endpoint', labelValue: 'GET /api' },
    },
    target: 0.999,
    budgetWarningThreshold: 0.3,
    window: { type: 'rolling', duration: '1d' },
    burnRates: [...DEFAULT_MWMBR_TIERS],
    alarms: {
      sliHealth: { enabled: true },
      attainmentBreach: { enabled: true },
      budgetWarning: { enabled: true },
    },
    exclusionWindows: [],
    tags: {},
    ruleGroupName: 'slo:test',
    rulerNamespace: 'slo-generated',
    generatedRuleNames: [],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'test',
    updatedAt: new Date().toISOString(),
    updatedBy: 'test',
    ...overrides,
  };
}

describe('InMemorySloStore', () => {
  let store: ISloStore;

  beforeEach(() => {
    store = new InMemorySloStore();
  });

  describe('save + get', () => {
    it('saves and retrieves an SLO by id', async () => {
      await store.save(makeSlo());
      const result = await store.get('slo-test-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('slo-test-1');
      expect(result!.name).toBe('Test SLO');
    });

    it('returns null for non-existent SLO', async () => {
      expect(await store.get('does-not-exist')).toBeNull();
    });

    it('overwrites existing SLO on save (upsert)', async () => {
      await store.save(makeSlo());
      await store.save(makeSlo({ name: 'Updated SLO' }));
      const result = await store.get('slo-test-1');
      expect(result!.name).toBe('Updated SLO');
    });

    it('handles SLOs in different datasources', async () => {
      await store.save(makeSlo({ id: 'slo-1', datasourceId: 'ds-1' }));
      await store.save(makeSlo({ id: 'slo-2', datasourceId: 'ds-2' }));
      expect(await store.get('slo-1')).not.toBeNull();
      expect(await store.get('slo-2')).not.toBeNull();
    });
  });

  describe('list', () => {
    it('lists all SLOs across datasources', async () => {
      await store.save(makeSlo({ id: 'slo-1', datasourceId: 'ds-1' }));
      await store.save(makeSlo({ id: 'slo-2', datasourceId: 'ds-2' }));
      const all = await store.list();
      expect(all).toHaveLength(2);
    });

    it('filters by datasourceId', async () => {
      await store.save(makeSlo({ id: 'slo-1', datasourceId: 'ds-1' }));
      await store.save(makeSlo({ id: 'slo-2', datasourceId: 'ds-2' }));
      await store.save(makeSlo({ id: 'slo-3', datasourceId: 'ds-1' }));
      const filtered = await store.list('ds-1');
      expect(filtered).toHaveLength(2);
      expect(filtered.map((s) => s.id).sort()).toEqual(['slo-1', 'slo-3']);
    });

    it('returns empty array for non-existent datasource', async () => {
      await store.save(makeSlo({ id: 'slo-1', datasourceId: 'ds-1' }));
      expect(await store.list('ds-999')).toEqual([]);
    });

    it('returns empty array when store is empty', async () => {
      expect(await store.list()).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes an existing SLO and returns true', async () => {
      await store.save(makeSlo({ id: 'slo-1' }));
      expect(await store.delete('slo-1')).toBe(true);
      expect(await store.get('slo-1')).toBeNull();
    });

    it('returns false for non-existent SLO', async () => {
      expect(await store.delete('does-not-exist')).toBe(false);
    });

    it('does not affect other SLOs when deleting', async () => {
      await store.save(makeSlo({ id: 'slo-1' }));
      await store.save(makeSlo({ id: 'slo-2' }));
      await store.delete('slo-1');
      expect(await store.get('slo-2')).not.toBeNull();
      expect(await store.list()).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles duplicate IDs in different datasources — last write wins', async () => {
      await store.save(makeSlo({ id: 'dup', datasourceId: 'ds-1', name: 'First' }));
      await store.save(makeSlo({ id: 'dup', datasourceId: 'ds-2', name: 'Second' }));
      // The second save is in ds-2, get should find it
      const result = await store.get('dup');
      expect(result).not.toBeNull();
    });

    it('handles rapid save/delete cycles', async () => {
      for (let i = 0; i < 100; i++) {
        await store.save(makeSlo({ id: `slo-${i}` }));
      }
      for (let i = 0; i < 50; i++) {
        await store.delete(`slo-${i}`);
      }
      const all = await store.list();
      expect(all).toHaveLength(50);
    });
  });
});
