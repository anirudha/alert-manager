/**
 * Route handlers for monitor CRUD, import/export, routing, suppression, and alert actions.
 */
import {
  MultiBackendAlertService,
  NotificationRoutingService,
  SuppressionRuleService,
  RoutingRuleConfig,
  SuppressionRuleConfig,
} from '../../core';
import { validateMonitorForm } from '../../core/validators';
import { serializeMonitors, deserializeMonitor } from '../../core/serializer';

type Result = { status: number; body: any };

// ============================================================================
// Monitor CRUD
// ============================================================================

export async function handleCreateMonitor(alertSvc: MultiBackendAlertService, body: any): Promise<Result> {
  try {
    // For Prometheus monitors, create via the first prometheus datasource
    const dsId = body.datasourceId || 'ds-2';
    const monitor = await alertSvc.createOSMonitor(dsId, body);
    return { status: 201, body: monitor };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleUpdateMonitor(alertSvc: MultiBackendAlertService, id: string, body: any): Promise<Result> {
  try {
    const dsId = body.datasourceId || 'ds-2';
    const monitor = await alertSvc.updateOSMonitor(dsId, id, body);
    if (!monitor) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: monitor };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleDeleteMonitor(alertSvc: MultiBackendAlertService, id: string, dsId?: string): Promise<Result> {
  try {
    const targetDsId = dsId || 'ds-2';
    const ok = await alertSvc.deleteOSMonitor(targetDsId, id);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

// ============================================================================
// Import / Export
// ============================================================================

export async function handleImportMonitors(alertSvc: MultiBackendAlertService, body: any): Promise<Result> {
  const configs = Array.isArray(body) ? body : body.monitors;
  if (!Array.isArray(configs)) return { status: 400, body: { error: 'Expected array of monitor configs' } };

  const results: { index: number; success: boolean; errors?: string[] }[] = [];
  for (let i = 0; i < configs.length; i++) {
    const { config, errors } = deserializeMonitor(configs[i]);
    if (!config) {
      results.push({ index: i, success: false, errors });
    } else {
      results.push({ index: i, success: true });
    }
  }
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    return { status: 400, body: { error: 'Validation errors', details: failed } };
  }
  return { status: 200, body: { imported: configs.length } };
}

export async function handleExportMonitors(alertSvc: MultiBackendAlertService, query?: any): Promise<Result> {
  try {
    const response = await alertSvc.getUnifiedRules();
    const configs = serializeMonitors(response.results);
    return { status: 200, body: { monitors: configs } };
  } catch (e) { return { status: 500, body: { error: String(e) } }; }
}

// ============================================================================
// Routing Rules
// ============================================================================

export function handleListRoutingRules(svc: NotificationRoutingService): Result {
  return { status: 200, body: { rules: svc.list() } };
}

export function handleGetRoutingRule(svc: NotificationRoutingService, id: string): Result {
  const rule = svc.get(id);
  if (!rule) return { status: 404, body: { error: 'Routing rule not found' } };
  return { status: 200, body: rule };
}

export function handleCreateRoutingRule(svc: NotificationRoutingService, body: Omit<RoutingRuleConfig, 'id'>): Result {
  const rule = svc.create(body);
  return { status: 201, body: rule };
}

export function handleUpdateRoutingRule(svc: NotificationRoutingService, id: string, body: Partial<RoutingRuleConfig>): Result {
  const rule = svc.update(id, body);
  if (!rule) return { status: 404, body: { error: 'Routing rule not found' } };
  return { status: 200, body: rule };
}

export function handleDeleteRoutingRule(svc: NotificationRoutingService, id: string): Result {
  const ok = svc.delete(id);
  if (!ok) return { status: 404, body: { error: 'Routing rule not found' } };
  return { status: 200, body: { deleted: true } };
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

export function handleCreateSuppressionRule(svc: SuppressionRuleService, body: Omit<SuppressionRuleConfig, 'id' | 'createdAt'>): Result {
  const rule = svc.create(body);
  return { status: 201, body: rule };
}

export function handleUpdateSuppressionRule(svc: SuppressionRuleService, id: string, body: Partial<SuppressionRuleConfig>): Result {
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

export async function handleAcknowledgeAlert(alertSvc: MultiBackendAlertService, alertId: string): Promise<Result> {
  // In a real implementation, this would update the alert state in the backend
  return { status: 200, body: { id: alertId, state: 'acknowledged' } };
}

export async function handleSilenceAlert(svc: SuppressionRuleService, alertId: string, body: any): Promise<Result> {
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
