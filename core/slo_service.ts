/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO lifecycle service — manages CRUD operations for SLO definitions
 * and computes live status from stored data.
 *
 * In standalone/mock mode, data is stored in memory.
 * In OSD plugin mode, data would be stored as Saved Objects.
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
import { DEFAULT_MWMBR_TIERS } from './slo_types';
import { generateSloRuleGroup, sanitizeName, shortHash } from './slo_promql_generator';
import { validateSloForm } from './slo_validators';
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

  constructor(
    private readonly logger: Logger,
    private readonly mockMode: boolean = false,
    store?: ISloStore
  ) {
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
    const errors = validateSloForm(input);
    if (Object.keys(errors).length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
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
    const errors = validateSloForm(updated);
    if (Object.keys(errors).length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
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
      const status = slo ? this.computeMockStatus(slo) : this.noDataStatus(uncachedIds[i]);
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
   * Compute mock status from the SLO definition.
   * In a real implementation, this would execute PromQL queries.
   */
  private computeMockStatus(slo: SloDefinition): SloLiveStatus {
    // For seeded SLOs, use the attached mock status data.
    // For user-created SLOs, simulate a healthy state.
    const mockData = (slo as SloDefinitionWithMockStatus).__mockStatus;
    if (mockData) {
      return {
        sloId: slo.id,
        ...mockData,
        ruleCount: slo.generatedRuleNames.length,
        computedAt: new Date().toISOString(),
      };
    }

    // Default: healthy
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

  // --------------------------------------------------------------------------
  // Seed Mock Data
  // --------------------------------------------------------------------------

  async seed(dsId: string): Promise<void> {
    if (!this.mockMode) {
      this.logger.warn('SloService.seed() called but mockMode is false — skipping');
      return;
    }

    // Check if already seeded
    const existing = await this.store.list(dsId);
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    const sloData = getSeedData(dsId, now);

    for (const slo of sloData) {
      // Generate rules
      const ruleGroup = generateSloRuleGroup(slo);
      slo.generatedRuleNames = ruleGroup.rules.map((r) => r.name);
      await this.store.save(slo);
    }

    this.logger.info(`Seeded ${sloData.length} SLOs for datasource ${dsId}`);
  }
}

// ============================================================================
// Mock Status Extension (for seeded SLOs only)
// ============================================================================

interface MockStatusData {
  currentValue: number;
  attainment: number;
  errorBudgetRemaining: number;
  status: SloStatus;
  firingCount: number;
}

interface SloDefinitionWithMockStatus extends SloDefinition {
  __mockStatus?: MockStatusData;
}

// ============================================================================
// Seed Data — 9 SLOs matching the listing mockup
// ============================================================================

function getSeedData(dsId: string, now: string): SloDefinitionWithMockStatus[] {
  const base: Pick<
    SloDefinition,
    | 'datasourceId'
    | 'rulerNamespace'
    | 'generatedRuleNames'
    | 'version'
    | 'createdAt'
    | 'createdBy'
    | 'updatedAt'
    | 'updatedBy'
  > = {
    datasourceId: dsId,
    rulerNamespace: 'slo-generated',
    generatedRuleNames: [],
    version: 1,
    createdAt: now,
    createdBy: 'seed',
    updatedAt: now,
    updatedBy: 'seed',
  };

  const defaultAlarms = {
    sliHealth: { enabled: true },
    attainmentBreach: { enabled: true },
    budgetWarning: { enabled: true },
  };

  return [
    {
      ...base,
      id: 'slo-seed-001',
      name: 'Pet Clinic Availability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'pet-clinic-frontend' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/customer/owners' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: [...DEFAULT_MWMBR_TIERS],
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'platform', env: 'prod' },
      ruleGroupName: `slo:pet_clinic_availability_${shortHash('slo-seed-001')}`,
      __mockStatus: {
        currentValue: 0.9997,
        attainment: 0.9997,
        errorBudgetRemaining: 0.93,
        status: 'ok',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-002',
      name: 'Payment Service Reliability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'payment-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/payments/process' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '7d' },
      burnRates: DEFAULT_MWMBR_TIERS.slice(0, 2),
      alarms: {
        sliHealth: { enabled: true },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: false },
      },
      exclusionWindows: [],
      tags: { team: 'payments' },
      ruleGroupName: `slo:payment_service_reliability_${shortHash('slo-seed-002')}`,
      __mockStatus: {
        currentValue: 0.9982,
        attainment: 0.9982,
        errorBudgetRemaining: -1.8,
        status: 'breached',
        firingCount: 2,
      },
    },
    {
      ...base,
      id: 'slo-seed-003',
      name: 'Checkout p99 Latency',
      sli: {
        type: 'latency_p99',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_request_duration_seconds_bucket',
        latencyThreshold: 0.5,
        service: { labelName: 'service', labelValue: 'checkout-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/checkout' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: DEFAULT_MWMBR_TIERS.slice(0, 2),
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'commerce' },
      ruleGroupName: `slo:checkout_p99_latency_${shortHash('slo-seed-003')}`,
      __mockStatus: {
        currentValue: 0.412,
        attainment: 0.9985,
        errorBudgetRemaining: 0.76,
        status: 'ok',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-004',
      name: 'Inventory Service Availability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'inventory-service' },
        operation: { labelName: 'endpoint', labelValue: 'GET /api/inventory' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: [...DEFAULT_MWMBR_TIERS],
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'supply' },
      ruleGroupName: `slo:inventory_service_availability_${shortHash('slo-seed-004')}`,
      __mockStatus: {
        currentValue: 0.9991,
        attainment: 0.9991,
        errorBudgetRemaining: 0.22,
        status: 'warning',
        firingCount: 1,
      },
    },
    {
      ...base,
      id: 'slo-seed-005',
      name: 'Auth Service p90 Latency',
      sli: {
        type: 'latency_p90',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_request_duration_seconds_bucket',
        latencyThreshold: 0.1,
        service: { labelName: 'service', labelValue: 'auth-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/auth/token' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '7d' },
      burnRates: DEFAULT_MWMBR_TIERS.slice(0, 2),
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'identity' },
      ruleGroupName: `slo:auth_service_p90_latency_${shortHash('slo-seed-005')}`,
      __mockStatus: {
        currentValue: 0.045,
        attainment: 0.9996,
        errorBudgetRemaining: 0.88,
        status: 'ok',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-006',
      name: 'Search Service Availability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'search-service' },
        operation: { labelName: 'endpoint', labelValue: 'GET /api/search' },
      },
      target: 0.995,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: DEFAULT_MWMBR_TIERS.slice(0, 2),
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: {},
      ruleGroupName: `slo:search_service_availability_${shortHash('slo-seed-006')}`,
      __mockStatus: {
        currentValue: 0,
        attainment: 0,
        errorBudgetRemaining: 0,
        status: 'no_data',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-007',
      name: 'Order Processing Availability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'order-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/orders' },
      },
      target: 0.9995,
      budgetWarningThreshold: 0.25,
      window: { type: 'rolling', duration: '7d' },
      burnRates: [...DEFAULT_MWMBR_TIERS],
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'commerce', env: 'prod' },
      ruleGroupName: `slo:order_processing_availability_${shortHash('slo-seed-007')}`,
      __mockStatus: {
        currentValue: 0.9999,
        attainment: 0.9999,
        errorBudgetRemaining: 0.97,
        status: 'ok',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-008',
      name: 'Notification Service p99 Latency',
      sli: {
        type: 'latency_p99',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_request_duration_seconds_bucket',
        latencyThreshold: 1.0,
        service: { labelName: 'service', labelValue: 'notification-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/notifications/send' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: DEFAULT_MWMBR_TIERS.slice(0, 2),
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'platform' },
      ruleGroupName: `slo:notification_service_p99_latency_${shortHash('slo-seed-008')}`,
      __mockStatus: {
        currentValue: 0.89,
        attainment: 0.9975,
        errorBudgetRemaining: 0.35,
        status: 'warning',
        firingCount: 0,
      },
    },
    {
      ...base,
      id: 'slo-seed-009',
      name: 'Cart Service Availability',
      sli: {
        type: 'availability',
        calcMethod: 'good_requests',
        sourceType: 'service_operation',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
        service: { labelName: 'service', labelValue: 'cart-service' },
        operation: { labelName: 'endpoint', labelValue: 'POST /api/cart/add' },
      },
      target: 0.999,
      budgetWarningThreshold: 0.3,
      window: { type: 'rolling', duration: '1d' },
      burnRates: [...DEFAULT_MWMBR_TIERS],
      alarms: defaultAlarms,
      exclusionWindows: [],
      tags: { team: 'commerce' },
      ruleGroupName: `slo:cart_service_availability_${shortHash('slo-seed-009')}`,
      __mockStatus: {
        currentValue: 0.9995,
        attainment: 0.9995,
        errorBudgetRemaining: 0.5,
        status: 'ok',
        firingCount: 0,
      },
    },
  ] as SloDefinitionWithMockStatus[];
}
