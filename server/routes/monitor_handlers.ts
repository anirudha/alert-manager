/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route handlers for monitor CRUD, import/export, routing, suppression, and alert actions.
 */
import {
  MultiBackendAlertService,
  SuppressionRuleService,
  SuppressionRuleConfig,
  OSMonitor,
} from '../../common';
import { serializeMonitors, deserializeMonitor, MonitorConfig } from '../../common/serializer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { status: number; body: any };

/** Sanitize error for client response. */
function safeError(e: unknown): string {
  const full = String(e);
  if (full.includes('not found') || full.includes('required') || full.includes('must be')) {
    return full;
  }
  return 'An internal error occurred';
}

// ============================================================================
// Monitor CRUD
// ============================================================================

interface MonitorMutationBody {
  datasourceId?: string;
  [key: string]: unknown;
}

export async function handleCreateMonitor(
  alertSvc: MultiBackendAlertService,
  body: MonitorMutationBody
): Promise<Result> {
  if (!body.datasourceId) {
    return { status: 400, body: { error: 'datasourceId is required' } };
  }
  try {
    const monitor = await alertSvc.createOSMonitor(
      body.datasourceId,
      body as unknown as Omit<OSMonitor, 'id'>
    );
    return { status: 201, body: monitor };
  } catch (e) {
    return { status: 400, body: { error: safeError(e) } };
  }
}

export async function handleUpdateMonitor(
  alertSvc: MultiBackendAlertService,
  id: string,
  body: MonitorMutationBody
): Promise<Result> {
  if (!body.datasourceId) {
    return { status: 400, body: { error: 'datasourceId is required' } };
  }
  try {
    const monitor = await alertSvc.updateOSMonitor(
      body.datasourceId,
      id,
      body as unknown as Partial<OSMonitor>
    );
    if (!monitor) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: monitor };
  } catch (e) {
    return { status: 400, body: { error: safeError(e) } };
  }
}

export async function handleDeleteMonitor(
  alertSvc: MultiBackendAlertService,
  id: string,
  dsId?: string
): Promise<Result> {
  if (!dsId) {
    return { status: 400, body: { error: 'datasourceId is required' } };
  }
  try {
    const ok = await alertSvc.deleteOSMonitor(dsId, id);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return { status: 400, body: { error: safeError(e) } };
  }
}

// ============================================================================
// Import / Export
// ============================================================================

interface MonitorImportBody {
  datasourceId?: string;
  monitors?: unknown[];
}

export async function handleImportMonitors(
  alertSvc: MultiBackendAlertService,
  body: MonitorImportBody | unknown[]
): Promise<Result> {
  const importBody = body as MonitorImportBody;
  const dsId = Array.isArray(body) ? undefined : importBody.datasourceId;
  const configs = Array.isArray(body) ? body : importBody.monitors;
  if (!Array.isArray(configs))
    return { status: 400, body: { error: 'Expected array of monitor configs' } };

  // Phase 1: validate all configs
  const importResults: { index: number; success: boolean; errors?: string[]; id?: string }[] = [];
  const validConfigs: { index: number; config: MonitorConfig }[] = [];
  for (let i = 0; i < configs.length; i++) {
    const { config, errors } = deserializeMonitor(configs[i]);
    if (!config) {
      importResults.push({ index: i, success: false, errors });
    } else {
      validConfigs.push({ index: i, config });
    }
  }

  const validationFailed = importResults.filter((r) => !r.success);
  if (validationFailed.length > 0) {
    return { status: 400, body: { error: 'Validation errors', details: validationFailed } };
  }

  // Phase 2: create monitors via backend (if datasourceId provided)
  if (dsId) {
    for (const { index, config } of validConfigs) {
      try {
        const created = await alertSvc.createOSMonitor(
          dsId,
          config as unknown as Omit<OSMonitor, 'id'>
        );
        importResults.push({ index, success: true, id: created.id });
      } catch (e) {
        importResults.push({ index, success: false, errors: [safeError(e)] });
      }
    }
  } else {
    // No datasourceId — validation-only mode (dry run)
    for (const { index } of validConfigs) {
      importResults.push({ index, success: true });
    }
  }

  const failed = importResults.filter((r) => !r.success);
  return {
    status: failed.length > 0 ? 207 : 200,
    body: {
      imported: importResults.filter((r) => r.success).length,
      total: configs.length,
      results: importResults,
    },
  };
}

export async function handleExportMonitors(alertSvc: MultiBackendAlertService): Promise<Result> {
  try {
    const response = await alertSvc.getUnifiedRules();
    const configs = serializeMonitors(response.results);
    return { status: 200, body: { monitors: configs } };
  } catch (e) {
    return { status: 500, body: { error: safeError(e) } };
  }
}

// ============================================================================
// Suppression Rules
// ============================================================================

export function handleListSuppressionRules(svc: SuppressionRuleService): Result {
  return { status: 200, body: { rules: svc.list() } };
}

export function handleGetSuppressionRule(svc: SuppressionRuleService, id: string): Result {
  const rule = svc.get(id);
  if (!rule) return { status: 404, body: { error: 'Suppression rule not found' } };
  return { status: 200, body: rule };
}

export function handleCreateSuppressionRule(
  svc: SuppressionRuleService,
  body: Omit<SuppressionRuleConfig, 'id' | 'createdAt'>
): Result {
  const rule = svc.create(body);
  return { status: 201, body: rule };
}

export function handleUpdateSuppressionRule(
  svc: SuppressionRuleService,
  id: string,
  body: Partial<SuppressionRuleConfig>
): Result {
  const rule = svc.update(id, body);
  if (!rule) return { status: 404, body: { error: 'Suppression rule not found' } };
  return { status: 200, body: rule };
}

export function handleDeleteSuppressionRule(svc: SuppressionRuleService, id: string): Result {
  const ok = svc.delete(id);
  if (!ok) return { status: 404, body: { error: 'Suppression rule not found' } };
  return { status: 200, body: { deleted: true } };
}

// ============================================================================
// Alert Actions
// ============================================================================

export async function handleAcknowledgeAlert(
  alertSvc: MultiBackendAlertService,
  alertId: string,
  body?: { datasourceId?: string; monitorId?: string }
): Promise<Result> {
  const dsId = body?.datasourceId;
  const monitorId = body?.monitorId;
  if (!dsId || !monitorId) {
    return { status: 400, body: { error: 'datasourceId and monitorId are required' } };
  }
  try {
    const result = await alertSvc.acknowledgeOSAlerts(dsId, monitorId, [alertId]);
    return { status: 200, body: { id: alertId, state: 'acknowledged', result } };
  } catch (e) {
    return { status: 400, body: { error: safeError(e) } };
  }
}

export async function handleSilenceAlert(
  svc: SuppressionRuleService,
  alertId: string,
  body: { duration?: string }
): Promise<Result> {
  const duration = body?.duration || '1h';
  const now = new Date();
  const endTime = new Date(now.getTime() + parseDurationMs(duration));
  const rule = svc.create({
    name: `Silence alert ${alertId}`,
    description: `Temporary silence for alert ${alertId}`,
    matchers: { alertId },
    scheduleType: 'one_time',
    startTime: now.toISOString(),
    endTime: endTime.toISOString(),
    createdBy: 'system',
  });
  return { status: 200, body: { silenced: true, suppressionRule: rule } };
}

function parseDurationMs(dur: string): number {
  const match = dur.match(/^(\d+)\s*([smhd])$/);
  if (!match) return 3600000; // default 1h
  const val = parseInt(match[1], 10);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2]] || 3600000);
}
