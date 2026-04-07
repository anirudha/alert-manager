/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectSloStore } from '../slo_saved_object_store';
import type { SloDefinition } from '../../core/slo_types';

// ---------------------------------------------------------------------------
// Mock SavedObjectsClientContract
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    get: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
}

const SO_TYPE = 'slo-definition';

function makeSloDefinition(overrides: Partial<SloDefinition> = {}): SloDefinition {
  return {
    id: 'slo-1',
    datasourceId: 'ds-1',
    name: 'Test SLO',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      service: { labelName: 'service', labelValue: 'frontend' },
      operation: { labelName: 'endpoint', labelValue: '/api/health' },
    },
    target: 0.999,
    budgetWarningThreshold: 0.3,
    window: { type: 'rolling', duration: '30d' },
    burnRates: [],
    alarms: {
      sliHealth: { enabled: true },
      attainmentBreach: { enabled: true },
      budgetWarning: { enabled: true },
    },
    exclusionWindows: [],
    tags: {},
    ruleGroupName: 'slo:test',
    rulerNamespace: 'slo',
    generatedRuleNames: [],
    version: 1,
    createdAt: '2026-01-01',
    createdBy: 'user',
    updatedAt: '2026-01-01',
    updatedBy: 'user',
    ...overrides,
  };
}

function savedObjectEnvelope(slo: SloDefinition) {
  const { id, ...attributes } = slo;
  return { id, attributes, type: SO_TYPE };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SavedObjectSloStore', () => {
  describe('get', () => {
    it('returns SloDefinition when object is found', async () => {
      const client = createMockClient();
      const slo = makeSloDefinition();
      client.get.mockResolvedValue(savedObjectEnvelope(slo));
      const store = new SavedObjectSloStore(client as any);

      const result = await store.get('slo-1');
      expect(client.get).toHaveBeenCalledWith(SO_TYPE, 'slo-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('slo-1');
      expect(result!.name).toBe('Test SLO');
    });

    it('returns null when 404 (output.statusCode)', async () => {
      const client = createMockClient();
      client.get.mockRejectedValue({ output: { statusCode: 404 } });
      const store = new SavedObjectSloStore(client as any);

      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    it('returns null when 404 (statusCode)', async () => {
      const client = createMockClient();
      client.get.mockRejectedValue({ statusCode: 404 });
      const store = new SavedObjectSloStore(client as any);

      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    it('re-throws non-404 errors', async () => {
      const client = createMockClient();
      client.get.mockRejectedValue(new Error('Connection refused'));
      const store = new SavedObjectSloStore(client as any);

      await expect(store.get('some-id')).rejects.toThrow('Connection refused');
    });
  });

  describe('list', () => {
    it('returns all SLOs without filter', async () => {
      const client = createMockClient();
      const slos = [
        makeSloDefinition({ id: 's1' }),
        makeSloDefinition({ id: 's2', name: 'SLO 2' }),
      ];
      client.find.mockResolvedValue({
        saved_objects: slos.map(savedObjectEnvelope),
        total: 2,
      });
      const store = new SavedObjectSloStore(client as any);

      const result = await store.list();
      expect(result).toHaveLength(2);
      expect(client.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: SO_TYPE, perPage: 1000, page: 1 })
      );
    });

    it('applies KQL filter when datasourceId is provided', async () => {
      const client = createMockClient();
      client.find.mockResolvedValue({ saved_objects: [], total: 0 });
      const store = new SavedObjectSloStore(client as any);

      await store.list('ds-42');
      expect(client.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${SO_TYPE}.attributes.datasourceId: "ds-42"`,
        })
      );
    });

    it('escapes quotes in datasourceId to prevent KQL injection', async () => {
      const client = createMockClient();
      client.find.mockResolvedValue({ saved_objects: [], total: 0 });
      const store = new SavedObjectSloStore(client as any);

      await store.list('ds"injection');
      expect(client.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${SO_TYPE}.attributes.datasourceId: "ds\\"injection"`,
        })
      );
    });

    it('paginates when results exceed one page', async () => {
      const client = createMockClient();
      const page1 = Array.from({ length: 1000 }, (_, i) =>
        savedObjectEnvelope(makeSloDefinition({ id: `s-${i}` }))
      );
      const page2 = [savedObjectEnvelope(makeSloDefinition({ id: 's-1000' }))];

      client.find
        .mockResolvedValueOnce({ saved_objects: page1, total: 1001 })
        .mockResolvedValueOnce({ saved_objects: page2, total: 1001 });

      const store = new SavedObjectSloStore(client as any);
      const result = await store.list();

      expect(result).toHaveLength(1001);
      expect(client.find).toHaveBeenCalledTimes(2);
    });

    it('stops paginating when page returns empty', async () => {
      const client = createMockClient();
      client.find
        .mockResolvedValueOnce({
          saved_objects: [savedObjectEnvelope(makeSloDefinition())],
          total: 1,
        })
        .mockResolvedValueOnce({ saved_objects: [], total: 1 });

      const store = new SavedObjectSloStore(client as any);
      await store.list();
      // Second call should still happen, but empty array stops the loop
      expect(client.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('save', () => {
    it('creates saved object with correct type and overwrite', async () => {
      const client = createMockClient();
      client.create.mockResolvedValue({});
      const store = new SavedObjectSloStore(client as any);
      const slo = makeSloDefinition({ id: 'slo-save-test' });

      await store.save(slo);
      expect(client.create).toHaveBeenCalledWith(
        SO_TYPE,
        expect.not.objectContaining({ id: 'slo-save-test' }),
        { id: 'slo-save-test', overwrite: true }
      );
    });

    it('passes attributes without id', async () => {
      const client = createMockClient();
      client.create.mockResolvedValue({});
      const store = new SavedObjectSloStore(client as any);
      const slo = makeSloDefinition();

      await store.save(slo);
      const [, attributes] = client.create.mock.calls[0];
      expect(attributes.id).toBeUndefined();
      expect(attributes.name).toBe('Test SLO');
    });
  });

  describe('delete', () => {
    it('returns true on successful deletion', async () => {
      const client = createMockClient();
      client.delete.mockResolvedValue({});
      const store = new SavedObjectSloStore(client as any);

      const result = await store.delete('slo-1');
      expect(result).toBe(true);
      expect(client.delete).toHaveBeenCalledWith(SO_TYPE, 'slo-1');
    });

    it('returns false on 404 (output.statusCode)', async () => {
      const client = createMockClient();
      client.delete.mockRejectedValue({ output: { statusCode: 404 } });
      const store = new SavedObjectSloStore(client as any);

      const result = await store.delete('missing');
      expect(result).toBe(false);
    });

    it('returns false on 404 (statusCode)', async () => {
      const client = createMockClient();
      client.delete.mockRejectedValue({ statusCode: 404 });
      const store = new SavedObjectSloStore(client as any);

      const result = await store.delete('missing');
      expect(result).toBe(false);
    });

    it('re-throws non-404 errors', async () => {
      const client = createMockClient();
      client.delete.mockRejectedValue(new Error('Permission denied'));
      const store = new SavedObjectSloStore(client as any);

      await expect(store.delete('slo-1')).rejects.toThrow('Permission denied');
    });
  });
});
