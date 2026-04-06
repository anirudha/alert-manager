/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * REST API handlers for SLO CRUD operations.
 * Framework-agnostic: returns { status, body } objects.
 * Follows the same pattern as server/routes/handlers.ts.
 */

import type { SloService } from '../../core/slo_service';
import type {
  SloInput,
  SloUpdateInput,
  SloListFilters,
  SloStatus,
  SliType,
} from '../../core/slo_types';
import type { Logger } from '../../core/types';

type Result = { status: number; body: unknown };

function safeError(e: unknown, logger?: Logger): string {
  const full = String(e instanceof Error ? e.message : e);
  if (logger) logger.error(`SLO handler error: ${full}`);
  if (full.includes('not found') || full.includes('required') || full.includes('Validation')) {
    return full;
  }
  return 'An internal error occurred';
}

// --------------------------------------------------------------------------
// List SLOs
// --------------------------------------------------------------------------

export async function handleListSLOs(
  svc: SloService,
  query?: Record<string, string | string[] | undefined>,
  logger?: Logger
): Promise<Result> {
  try {
    const filters: SloListFilters = {};
    if (query?.datasourceId) filters.datasourceId = String(query.datasourceId);
    if (query?.status) {
      const raw = Array.isArray(query.status) ? query.status : String(query.status).split(',');
      filters.status = raw as SloStatus[];
    }
    if (query?.sliType) {
      const raw = Array.isArray(query.sliType) ? query.sliType : String(query.sliType).split(',');
      filters.sliType = raw as SliType[];
    }
    if (query?.service) {
      filters.service = Array.isArray(query.service)
        ? query.service
        : String(query.service).split(',');
    }
    if (query?.search) filters.search = String(query.search);
    if (query?.page) {
      const p = parseInt(String(query.page), 10);
      if (!Number.isFinite(p) || p < 1)
        return { status: 400, body: { error: 'Invalid page number' } };
      filters.page = p;
    }
    if (query?.pageSize) {
      const ps = parseInt(String(query.pageSize), 10);
      if (!Number.isFinite(ps) || ps < 1)
        return { status: 400, body: { error: 'Invalid page size' } };
      filters.pageSize = ps;
    }

    const result = await svc.getPaginated(filters);
    return { status: 200, body: result };
  } catch (e) {
    return { status: 500, body: { error: safeError(e, logger) } };
  }
}

// --------------------------------------------------------------------------
// Create SLO
// --------------------------------------------------------------------------

export async function handleCreateSLO(
  svc: SloService,
  input: SloInput,
  logger?: Logger
): Promise<Result> {
  if (!input || !input.name) {
    return { status: 400, body: { error: 'name is required' } };
  }
  try {
    const slo = await svc.create(input);
    return { status: 201, body: slo };
  } catch (e) {
    // Always expose the full error for SLO creation — helps debugging
    const fullMsg = e instanceof Error ? e.message : String(e);
    if (logger) logger.error(`SLO create failed: ${fullMsg}`);
    const status = fullMsg.includes('Validation') ? 400 : 500;
    return { status, body: { error: fullMsg } };
  }
}

// --------------------------------------------------------------------------
// Get SLO
// --------------------------------------------------------------------------

export async function handleGetSLO(svc: SloService, id: string, logger?: Logger): Promise<Result> {
  try {
    const slo = await svc.get(id);
    if (!slo) return { status: 404, body: { error: 'SLO not found' } };

    const status = await svc.getStatus(id);
    return { status: 200, body: { ...slo, liveStatus: status } };
  } catch (e) {
    return { status: 500, body: { error: safeError(e, logger) } };
  }
}

// --------------------------------------------------------------------------
// Update SLO
// --------------------------------------------------------------------------

export async function handleUpdateSLO(
  svc: SloService,
  id: string,
  input: SloUpdateInput,
  logger?: Logger
): Promise<Result> {
  try {
    const slo = await svc.update(id, input);
    return { status: 200, body: slo };
  } catch (e) {
    const msg = safeError(e, logger);
    const status = msg.includes('not found') ? 404 : msg.includes('Validation') ? 400 : 500;
    return { status, body: { error: msg } };
  }
}

// --------------------------------------------------------------------------
// Delete SLO
// --------------------------------------------------------------------------

export async function handleDeleteSLO(
  svc: SloService,
  id: string,
  logger?: Logger
): Promise<Result> {
  try {
    const result = await svc.delete(id);
    if (!result.deleted) return { status: 404, body: { error: 'SLO not found' } };
    return { status: 200, body: { deleted: true, generatedRuleNames: result.generatedRuleNames } };
  } catch (e) {
    return { status: 500, body: { error: safeError(e, logger) } };
  }
}

// --------------------------------------------------------------------------
// Preview SLO Rules
// --------------------------------------------------------------------------

export async function handlePreviewSLORules(
  svc: SloService,
  input: SloInput,
  logger?: Logger
): Promise<Result> {
  if (!input || !input.name) {
    return { status: 400, body: { error: 'name is required for preview' } };
  }
  try {
    const ruleGroup = svc.previewRules(input);
    return { status: 200, body: ruleGroup };
  } catch (e) {
    return { status: 500, body: { error: safeError(e, logger) } };
  }
}

// --------------------------------------------------------------------------
// Batch SLO Statuses
// --------------------------------------------------------------------------

export async function handleGetSLOStatuses(
  svc: SloService,
  ids: string[],
  logger?: Logger
): Promise<Result> {
  if (!ids || ids.length === 0) {
    return { status: 400, body: { error: 'ids parameter is required' } };
  }
  try {
    const statuses = await svc.getStatuses(ids);
    return { status: 200, body: { statuses } };
  } catch (e) {
    return { status: 500, body: { error: safeError(e, logger) } };
  }
}
