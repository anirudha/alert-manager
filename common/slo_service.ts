/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO lifecycle service — manages CRUD operations for SLO definitions
 * and computes live status from stored data.
 *
 * Data is stored as Saved Objects in OSD plugin mode.
 */

import type {
  SloDefinition,
  SloInput,
  SloUpdateInput,
  SloSummary,
  SloLiveStatus,
  SloStatus,
  SloListFilters,
  GeneratedRuleGroup,
  ISloStore,
} from './slo_types';
import { generateSloRuleGroup, sanitizeName, shortHash } from './slo_promql_generator';
import { validateSloFormFull } from './slo_validators';
import { InMemorySloStore } from './slo_store';
import type { Logger, PaginatedResponse } from './types';

// ============================================================================
// Service
// ============================================================================

export class SloService {
  private store: ISloStore;
  private counter = 0;

  /** Batch status cache: sloId → { status, expiresAt } */
  private statusCache: Map<string, { status: SloLiveStatus; expiresAt: number }> = new Map();
  private readonly STATUS_CACHE_TTL_MS = 60_000; // 60 seconds

  constructor(private readonly logger: Logger, store?: ISloStore) {
    this.store = store ?? new InMemorySloStore();
  }

  /**
   * Replace the storage backend at runtime.
   * Used by the OSD plugin to upgrade from InMemorySloStore to
   * SavedObjectSloStore once the core.savedObjects service is available.
   */
  setStore(store: ISloStore): void {
    this.store = store;
    this.statusCache.clear();
    this.logger.info('SloService: storage backend replaced');
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async create(input: SloInput, createdBy = 'system'): Promise<SloDefinition> {
    // Validate
    const { errors, warnings } = validateSloFormFull(input);
    if (Object.keys(errors).length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
    }
    if (Object.keys(warnings).length > 0) {
      this.logger.warn(`SLO create warnings for "${input.name}": ${JSON.stringify(warnings)}`);
    }

    const id = `slo-${Date.now()}-${++this.counter}`;
    const now = new Date().toISOString();

    const slo: SloDefinition = {
      ...input,
      id,
      ruleGroupName: `slo:${sanitizeName(input.name)}_${shortHash(id)}`,
      rulerNamespace: 'slo-generated',
      generatedRuleNames: [],
      version: 1,
      createdAt: now,
      createdBy,
      updatedAt: now,
      updatedBy: createdBy,
    };

    // Generate rules and record the names for reconciliation
    const ruleGroup = generateSloRuleGroup(slo);
    slo.generatedRuleNames = ruleGroup.rules.map((r) => r.name);

    // Store
    await this.store.save(slo);

    this.logger.info(`Created SLO: ${slo.id} (${slo.name}) — ${ruleGroup.rules.length} rules`);
    return slo;
  }

  async list(filters?: SloListFilters): Promise<SloSummary[]> {
    const all = await this.store.list(filters?.datasourceId);

    // Apply filters
    let filtered = all;

    if (filters?.sliType && filters.sliType.length > 0) {
      filtered = filtered.filter((s) => filters.sliType!.includes(s.sli.type));
    }
    if (filters?.service && filters.service.length > 0) {
      filtered = filtered.filter((s) => filters.service!.includes(s.sli.service.labelValue));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.sli.service.labelValue.toLowerCase().includes(q)
      );
    }

    // Get statuses for all filtered SLOs
    const ids = filtered.map((s) => s.id);
    const statuses = await this.getStatuses(ids);
    const statusMap = new Map(statuses.map((s) => [s.sloId, s]));

    // Filter by status
    if (filters?.status && filters.status.length > 0) {
      filtered = filtered.filter((s) => {
        const st = statusMap.get(s.id);
        return st && filters.status!.includes(st.status);
      });
    }

    return filtered.map((s) => this.toSummary(s, statusMap.get(s.id) ?? this.noDataStatus(s.id)));
  }

  async getPaginated(filters?: SloListFilters): Promise<PaginatedResponse<SloSummary>> {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 20, 100);
    const all = await this.list(filters);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      results: all.slice(start, end),
      total: all.length,
      page,
      pageSize,
      hasMore: end < all.length,
    };
  }

  async get(sloId: string): Promise<SloDefinition | null> {
    return this.store.get(sloId);
  }

  async update(sloId: string, input: SloUpdateInput, updatedBy = 'system'): Promise<SloDefinition> {
    const existing = await this.get(sloId);
    if (!existing) throw new Error(`SLO not found: ${sloId}`);

    const updated: SloDefinition = {
      ...existing,
      ...input,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy,
      // Preserve immutable fields
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      rulerNamespace: existing.rulerNamespace,
    };

    // Re-validate
    const { errors, warnings } = validateSloFormFull(updated);
    if (Object.keys(errors).length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
    }
    if (Object.keys(warnings).length > 0) {
      this.logger.warn(`SLO update warnings for "${updated.name}": ${JSON.stringify(warnings)}`);
    }

    // Regenerate rules
    updated.ruleGroupName = `slo:${sanitizeName(updated.name)}_${shortHash(updated.id)}`;
    const ruleGroup = generateSloRuleGroup(updated);
    updated.generatedRuleNames = ruleGroup.rules.map((r) => r.name);

    // Store
    await this.store.save(updated);

    // Invalidate status cache
    this.statusCache.delete(sloId);

    this.logger.info(`Updated SLO: ${sloId} v${updated.version}`);
    return updated;
  }

  async delete(sloId: string): Promise<{ deleted: boolean; generatedRuleNames: string[] }> {
    const slo = await this.store.get(sloId);
    if (slo) {
      await this.store.delete(sloId);
      this.statusCache.delete(sloId);
      this.logger.info(`Deleted SLO: ${sloId}`);
      return { deleted: true, generatedRuleNames: slo.generatedRuleNames };
    }
    return { deleted: false, generatedRuleNames: [] };
  }

  // --------------------------------------------------------------------------
  // Preview (no persistence)
  // --------------------------------------------------------------------------

  previewRules(input: SloInput): GeneratedRuleGroup {
    const id = `slo-preview-${Date.now()}`;
    const slo: SloDefinition = {
      ...input,
      id,
      ruleGroupName: `slo:${sanitizeName(input.name)}_${shortHash(id)}`,
      rulerNamespace: 'slo-generated',
      generatedRuleNames: [],
      version: 0,
      createdAt: new Date().toISOString(),
      createdBy: 'preview',
      updatedAt: new Date().toISOString(),
      updatedBy: 'preview',
    };
    return generateSloRuleGroup(slo);
  }

  // --------------------------------------------------------------------------
  // Status Computation (with caching)
  // --------------------------------------------------------------------------

  async getStatus(sloId: string): Promise<SloLiveStatus> {
    const statuses = await this.getStatuses([sloId]);
    return statuses[0] || this.noDataStatus(sloId);
  }

  async getStatuses(sloIds: string[]): Promise<SloLiveStatus[]> {
    const now = Date.now();

    // Separate cached from uncached IDs
    const cached = new Map<string, SloLiveStatus>();
    const uncachedIds: string[] = [];
    for (const sloId of sloIds) {
      const entry = this.statusCache.get(sloId);
      if (entry && entry.expiresAt > now) {
        cached.set(sloId, entry.status);
      } else {
        uncachedIds.push(sloId);
      }
    }

    // Fetch uncached SLOs in parallel
    const fetched = await Promise.all(uncachedIds.map((id) => this.get(id)));
    for (let i = 0; i < uncachedIds.length; i++) {
      const slo = fetched[i];
      const status = slo ? this.computeStatus(slo) : this.noDataStatus(uncachedIds[i]);
      this.statusCache.set(uncachedIds[i], { status, expiresAt: now + this.STATUS_CACHE_TTL_MS });
      cached.set(uncachedIds[i], status);
    }

    // Return in original order
    return sloIds.map((id) => cached.get(id) ?? this.noDataStatus(id));
  }

  private noDataStatus(sloId: string): SloLiveStatus {
    return {
      sloId,
      currentValue: 0,
      attainment: 0,
      errorBudgetRemaining: 0,
      status: 'no_data',
      ruleCount: 0,
      firingCount: 0,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Compute status from the SLO definition.
   *
   * TODO: Replace with live Prometheus queries in production:
   *   1. `slo:sli_error:ratio_rate_<window>` -> current error ratio
   *   2. Attainment = 1 - error_ratio
   *   3. Budget remaining = 1 - (error_ratio / error_budget)
   *   4. Derive {@link SloStatus} from attainment + budget thresholds
   *
   * Currently returns a default healthy state as a placeholder.
   */
  private computeStatus(slo: SloDefinition): SloLiveStatus {
    const errorBudget = 1 - slo.target;
    const attainment = slo.target + errorBudget * 0.5; // Halfway through budget
    return {
      sloId: slo.id,
      currentValue: slo.sli.type === 'availability' ? attainment : 0,
      attainment,
      errorBudgetRemaining: 0.5,
      status: 'ok',
      ruleCount: slo.generatedRuleNames.length,
      firingCount: 0,
      computedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Summary Projection
  // --------------------------------------------------------------------------

  private toSummary(slo: SloDefinition, status: SloLiveStatus): SloSummary {
    return {
      id: slo.id,
      datasourceId: slo.datasourceId,
      name: slo.name,
      sliType: slo.sli.type,
      serviceName: slo.sli.service.labelValue,
      operationName: slo.sli.operation.labelValue,
      target: slo.target,
      window: slo.window,
      tags: slo.tags,
      status,
    };
  }
}
