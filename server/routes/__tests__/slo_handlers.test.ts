/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleListSLOs,
  handleCreateSLO,
  handleGetSLO,
  handleUpdateSLO,
  handleDeleteSLO,
  handlePreviewSLORules,
  handleGetSLOStatuses,
} from '../slo_handlers';
import { SloService } from '../../../common/slo_service';
import type { SloInput, SloUpdateInput } from '../../../common/slo_types';
import type { Logger } from '../../../common/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function createService(): SloService {
  return new SloService(mockLogger, true /* mockMode */);
}

function makeValidInput(overrides: Partial<SloInput> = {}): SloInput {
  return {
    datasourceId: 'ds-1',
    name: 'Test SLO',
    sli: {
      type: 'availability',
      calcMethod: 'good_requests',
      sourceType: 'service_operation',
      metric: 'http_requests_total',
      goodEventsFilter: 'status_code!~"5.."',
      service: { labelName: 'service', labelValue: 'frontend' },
      operation: { labelName: 'endpoint', labelValue: '/api/health' },
    },
    target: 0.999,
    budgetWarningThreshold: 0.3,
    window: { type: 'rolling', duration: '30d' },
    burnRates: [
      {
        shortWindow: '5m',
        longWindow: '1h',
        burnRateMultiplier: 14.4,
        severity: 'critical',
        createAlarm: true,
        forDuration: '2m',
      },
    ],
    alarms: {
      sliHealth: { enabled: true },
      attainmentBreach: { enabled: true },
      budgetWarning: { enabled: true },
    },
    exclusionWindows: [],
    tags: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleListSLOs
// ---------------------------------------------------------------------------

describe('handleListSLOs', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 200 with empty results when no SLOs exist', async () => {
    const result = await handleListSLOs(svc);
    expect(result.status).toBe(200);
    expect((result.body as any).results).toEqual([]);
  });

  it('returns 200 with SLOs after creating one', async () => {
    await svc.create(makeValidInput());
    const result = await handleListSLOs(svc);
    expect(result.status).toBe(200);
    expect((result.body as any).results.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by datasourceId query param', async () => {
    await svc.create(makeValidInput({ datasourceId: 'ds-A' }));
    await svc.create(makeValidInput({ datasourceId: 'ds-B', name: 'Other SLO' }));
    const result = await handleListSLOs(svc, { datasourceId: 'ds-A' });
    expect(result.status).toBe(200);
    const items = (result.body as any).results;
    for (const item of items) {
      expect(item.datasourceId).toBe('ds-A');
    }
  });

  it('filters by status query param (comma-separated string)', async () => {
    const result = await handleListSLOs(svc, { status: 'ok,warning' });
    expect(result.status).toBe(200);
  });

  it('filters by status query param (array)', async () => {
    const result = await handleListSLOs(svc, { status: ['ok', 'breached'] });
    expect(result.status).toBe(200);
  });

  it('filters by sliType query param', async () => {
    const result = await handleListSLOs(svc, { sliType: 'availability' });
    expect(result.status).toBe(200);
  });

  it('filters by service query param (comma-separated)', async () => {
    const result = await handleListSLOs(svc, { service: 'frontend,backend' });
    expect(result.status).toBe(200);
  });

  it('filters by search query param', async () => {
    await svc.create(makeValidInput({ name: 'Unique Name Alpha' }));
    const result = await handleListSLOs(svc, { search: 'Alpha' });
    expect(result.status).toBe(200);
  });

  it('paginates with page and pageSize', async () => {
    await svc.create(makeValidInput({ name: 'SLO-1' }));
    await svc.create(makeValidInput({ name: 'SLO-2' }));
    const result = await handleListSLOs(svc, { page: '1', pageSize: '1' });
    expect(result.status).toBe(200);
    expect((result.body as any).results.length).toBeLessThanOrEqual(1);
  });

  it('returns 400 for invalid page number (zero)', async () => {
    const result = await handleListSLOs(svc, { page: '0' });
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('Invalid page number');
  });

  it('returns 400 for invalid page number (NaN)', async () => {
    const result = await handleListSLOs(svc, { page: 'abc' });
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('Invalid page number');
  });

  it('returns 400 for invalid pageSize', async () => {
    const result = await handleListSLOs(svc, { pageSize: '-1' });
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('Invalid page size');
  });

  it('returns 500 when service throws', async () => {
    jest.spyOn(svc, 'getPaginated').mockRejectedValueOnce(new Error('DB down'));
    const result = await handleListSLOs(svc, undefined, mockLogger);
    expect(result.status).toBe(500);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCreateSLO
// ---------------------------------------------------------------------------

describe('handleCreateSLO', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 400 when name is missing', async () => {
    const result = await handleCreateSLO(svc, { name: '' } as any);
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('name is required');
  });

  it('returns 400 when input is null', async () => {
    const result = await handleCreateSLO(svc, null as any);
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('name is required');
  });

  it('returns 201 on successful creation', async () => {
    const result = await handleCreateSLO(svc, makeValidInput());
    expect(result.status).toBe(201);
    expect((result.body as any).id).toBeDefined();
    expect((result.body as any).name).toBe('Test SLO');
  });

  it('returns 400 for validation errors', async () => {
    const result = await handleCreateSLO(
      svc,
      makeValidInput({ target: 50 }) // target > 1 is invalid
    );
    expect(result.status).toBe(400);
    expect((result.body as any).error).toBeDefined();
  });

  it('logs error on failure', async () => {
    jest.spyOn(svc, 'create').mockRejectedValueOnce(new Error('Validation failed'));
    const result = await handleCreateSLO(svc, makeValidInput(), mockLogger);
    expect(result.status).toBe(400);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('returns 500 for non-validation errors', async () => {
    jest.spyOn(svc, 'create').mockRejectedValueOnce(new Error('DB crash'));
    const result = await handleCreateSLO(svc, makeValidInput(), mockLogger);
    expect(result.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetSLO
// ---------------------------------------------------------------------------

describe('handleGetSLO', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 404 when SLO is not found', async () => {
    const result = await handleGetSLO(svc, 'non-existent');
    expect(result.status).toBe(404);
    expect((result.body as any).error).toContain('not found');
  });

  it('returns 200 with SLO and liveStatus when found', async () => {
    const created = await svc.create(makeValidInput());
    const result = await handleGetSLO(svc, created.id);
    expect(result.status).toBe(200);
    expect((result.body as any).id).toBe(created.id);
    expect((result.body as any).liveStatus).toBeDefined();
  });

  it('returns 500 when service throws', async () => {
    jest.spyOn(svc, 'get').mockRejectedValueOnce(new Error('timeout'));
    const result = await handleGetSLO(svc, 'some-id', mockLogger);
    expect(result.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleUpdateSLO
// ---------------------------------------------------------------------------

describe('handleUpdateSLO', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 200 on successful update', async () => {
    const created = await svc.create(makeValidInput());
    const update: SloUpdateInput = { name: 'Updated SLO Name' };
    const result = await handleUpdateSLO(svc, created.id, update);
    expect(result.status).toBe(200);
    expect((result.body as any).name).toBe('Updated SLO Name');
  });

  it('returns 404 when SLO is not found', async () => {
    const result = await handleUpdateSLO(svc, 'non-existent', { name: 'x' });
    expect(result.status).toBe(404);
  });

  it('returns 400 for validation errors', async () => {
    const created = await svc.create(makeValidInput());
    const result = await handleUpdateSLO(svc, created.id, { target: 50 });
    expect(result.status).toBe(400);
  });

  it('returns 500 for unexpected errors', async () => {
    jest.spyOn(svc, 'update').mockRejectedValueOnce(new Error('DB error'));
    const result = await handleUpdateSLO(svc, 'id', { name: 'x' }, mockLogger);
    expect(result.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteSLO
// ---------------------------------------------------------------------------

describe('handleDeleteSLO', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 200 with deleted flag on success', async () => {
    const created = await svc.create(makeValidInput());
    const result = await handleDeleteSLO(svc, created.id);
    expect(result.status).toBe(200);
    expect((result.body as any).deleted).toBe(true);
    expect((result.body as any).generatedRuleNames).toBeDefined();
  });

  it('returns 404 when SLO is not found', async () => {
    const result = await handleDeleteSLO(svc, 'non-existent');
    expect(result.status).toBe(404);
  });

  it('returns 500 when service throws', async () => {
    jest.spyOn(svc, 'delete').mockRejectedValueOnce(new Error('disk full'));
    const result = await handleDeleteSLO(svc, 'id', mockLogger);
    expect(result.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handlePreviewSLORules
// ---------------------------------------------------------------------------

describe('handlePreviewSLORules', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 400 when name is missing', async () => {
    const result = await handlePreviewSLORules(svc, { name: '' } as any);
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('name is required');
  });

  it('returns 200 with rule group on valid input', async () => {
    const result = await handlePreviewSLORules(svc, makeValidInput());
    expect(result.status).toBe(200);
    expect((result.body as any).rules).toBeDefined();
    expect((result.body as any).yaml).toBeDefined();
  });

  it('returns 500 when preview throws', async () => {
    jest.spyOn(svc, 'previewRules').mockImplementationOnce(() => {
      throw new Error('bad input');
    });
    const result = await handlePreviewSLORules(svc, makeValidInput(), mockLogger);
    expect(result.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetSLOStatuses
// ---------------------------------------------------------------------------

describe('handleGetSLOStatuses', () => {
  let svc: SloService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  it('returns 400 when ids is empty', async () => {
    const result = await handleGetSLOStatuses(svc, []);
    expect(result.status).toBe(400);
    expect((result.body as any).error).toContain('ids parameter is required');
  });

  it('returns 400 when ids is null', async () => {
    const result = await handleGetSLOStatuses(svc, null as any);
    expect(result.status).toBe(400);
  });

  it('returns 200 with statuses for valid IDs', async () => {
    const created = await svc.create(makeValidInput());
    const result = await handleGetSLOStatuses(svc, [created.id]);
    expect(result.status).toBe(200);
    expect((result.body as any).statuses).toBeDefined();
  });

  it('returns 200 with empty statuses for unknown IDs', async () => {
    const result = await handleGetSLOStatuses(svc, ['unknown-1', 'unknown-2']);
    expect(result.status).toBe(200);
  });

  it('returns 500 when service throws', async () => {
    jest.spyOn(svc, 'getStatuses').mockRejectedValueOnce(new Error('boom'));
    const result = await handleGetSLOStatuses(svc, ['id-1'], mockLogger);
    expect(result.status).toBe(500);
  });
});
