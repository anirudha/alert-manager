/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SloService } from '../slo_service';
import type { SloInput } from '../slo_types';
import { DEFAULT_MWMBR_TIERS } from '../slo_types';
import type { Logger } from '../types';

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function makeValidInput(overrides: Partial<SloInput> = {}): SloInput {
  return {
    datasourceId: 'ds-prom-1',
    name: 'Test SLO',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      goodEventsFilter: 'status_code!~"5.."',
      service: { labelName: 'service', labelValue: 'test-svc' },
      operation: { labelName: 'endpoint', labelValue: 'GET /health' },
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
    tags: { env: 'test' },
    ...overrides,
  };
}

describe('SloService', () => {
  let service: SloService;

  beforeEach(() => {
    service = new SloService(mockLogger, true);
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  describe('create', () => {
    it('creates an SLO and returns it with generated fields', async () => {
      const slo = await service.create(makeValidInput());

      expect(slo.id).toBeTruthy();
      expect(slo.name).toBe('Test SLO');
      expect(slo.version).toBe(1);
      expect(slo.ruleGroupName).toContain('slo:');
      expect(slo.generatedRuleNames.length).toBeGreaterThan(0);
      expect(slo.createdAt).toBeTruthy();
    });

    it('stores generatedRuleNames for reconciliation', async () => {
      const slo = await service.create(makeValidInput());
      // Should have recording + alerting rules
      expect(slo.generatedRuleNames.length).toBeGreaterThan(5);
    });

    it('rejects invalid input', async () => {
      await expect(service.create(makeValidInput({ name: '' }))).rejects.toThrow(
        'Validation failed'
      );
    });

    it('assigns unique IDs', async () => {
      const slo1 = await service.create(makeValidInput({ name: 'SLO A' }));
      const slo2 = await service.create(makeValidInput({ name: 'SLO B' }));
      expect(slo1.id).not.toBe(slo2.id);
    });
  });

  // --------------------------------------------------------------------------
  // List
  // --------------------------------------------------------------------------

  describe('list', () => {
    it('returns empty array when no SLOs', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('returns created SLOs as summaries', async () => {
      await service.create(makeValidInput());
      const result = await service.list();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Test SLO');
      expect(result[0].status).toBeDefined();
    });

    it('filters by datasourceId', async () => {
      await service.create(makeValidInput({ datasourceId: 'ds-1' }));
      await service.create(makeValidInput({ datasourceId: 'ds-2', name: 'Other SLO' }));

      const filtered = await service.list({ datasourceId: 'ds-1' });
      expect(filtered.length).toBe(1);
    });

    it('filters by search', async () => {
      await service.create(makeValidInput({ name: 'Payment SLO' }));
      await service.create(makeValidInput({ name: 'Auth SLO' }));

      const filtered = await service.list({ search: 'payment' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Payment SLO');
    });
  });

  // --------------------------------------------------------------------------
  // Get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('returns SLO by ID', async () => {
      const created = await service.create(makeValidInput());
      const result = await service.get(created.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
    });

    it('returns null for non-existent ID', async () => {
      const result = await service.get('does-not-exist');
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------

  describe('update', () => {
    it('updates fields and increments version', async () => {
      const created = await service.create(makeValidInput());
      const updated = await service.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe(2);
      expect(updated.updatedAt).toBeTruthy();
      // Preserve immutable fields
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.createdBy).toBe(created.createdBy);
    });

    it('regenerates rules on update', async () => {
      const created = await service.create(makeValidInput());
      const originalNames = [...created.generatedRuleNames];

      const updated = await service.update(created.id, { name: 'New Name' });
      // Names should change because they contain the sanitized SLO name
      expect(updated.generatedRuleNames).not.toEqual(originalNames);
    });

    it('throws for non-existent SLO', async () => {
      await expect(service.update('does-not-exist', { name: 'X' })).rejects.toThrow(
        'SLO not found'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  describe('delete', () => {
    it('deletes and returns rule names for cleanup', async () => {
      const created = await service.create(makeValidInput());
      const result = await service.delete(created.id);

      expect(result.deleted).toBe(true);
      expect(result.generatedRuleNames.length).toBeGreaterThan(0);

      const check = await service.get(created.id);
      expect(check).toBeNull();
    });

    it('returns deleted=false for non-existent SLO', async () => {
      const result = await service.delete('does-not-exist');
      expect(result.deleted).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Status Caching
  // --------------------------------------------------------------------------

  describe('getStatuses', () => {
    it('returns statuses for given IDs', async () => {
      const slo = await service.create(makeValidInput());
      const statuses = await service.getStatuses([slo.id]);

      expect(statuses.length).toBe(1);
      expect(statuses[0].sloId).toBe(slo.id);
      expect(statuses[0].status).toBeDefined();
    });

    it('returns no_data for unknown IDs', async () => {
      const statuses = await service.getStatuses(['unknown-id']);
      expect(statuses[0].status).toBe('no_data');
    });

    it('caches status within TTL', async () => {
      const slo = await service.create(makeValidInput());

      const first = await service.getStatuses([slo.id]);
      const second = await service.getStatuses([slo.id]);

      // Same reference means cache hit
      expect(first[0].computedAt).toBe(second[0].computedAt);
    });
  });

  // --------------------------------------------------------------------------
  // Seed
  // --------------------------------------------------------------------------

  describe('seed', () => {
    it('seeds 9 SLOs in mock mode', async () => {
      await service.seed('ds-prom-1');
      const result = await service.list();
      expect(result.length).toBe(9);
    });

    it('does not seed when mockMode is false', async () => {
      const productionService = new SloService(mockLogger, false);
      await productionService.seed('ds-prom-1');
      const result = await productionService.list();
      expect(result.length).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('mockMode is false'));
    });

    it('does not double-seed the same datasource', async () => {
      await service.seed('ds-prom-1');
      await service.seed('ds-prom-1');
      const result = await service.list();
      expect(result.length).toBe(9);
    });

    it('seeded SLOs have populated generatedRuleNames', async () => {
      await service.seed('ds-prom-1');
      const result = await service.list();
      for (const slo of result) {
        const full = await service.get(slo.id);
        expect(full!.generatedRuleNames.length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  describe('previewRules', () => {
    it('generates rules without persisting', () => {
      const ruleGroup = service.previewRules(makeValidInput());
      expect(ruleGroup.rules.length).toBeGreaterThan(0);
      expect(ruleGroup.yaml).toContain('name:');
    });
  });
});
