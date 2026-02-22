/**
 * Route handlers — pure functions that work with any HTTP framework.
 * Exposes backend-native API shapes + unified views.
 */
import {
  DatasourceService,
  Datasource,
  MultiBackendAlertService,
} from '../../core';

type Result = { status: number; body: any };

// ============================================================================
// Datasource Handlers
// ============================================================================

export async function handleListDatasources(svc: DatasourceService): Promise<Result> {
  return { status: 200, body: { datasources: await svc.list() } };
}

export async function handleGetDatasource(svc: DatasourceService, id: string): Promise<Result> {
  const ds = await svc.get(id);
  if (!ds) return { status: 404, body: { error: 'Datasource not found' } };
  return { status: 200, body: ds };
}

export async function handleCreateDatasource(svc: DatasourceService, input: Omit<Datasource, 'id'>): Promise<Result> {
  if (!input.name || !input.type || !input.url) {
    return { status: 400, body: { error: 'name, type, and url are required' } };
  }
  if (input.type !== 'opensearch' && input.type !== 'prometheus') {
    return { status: 400, body: { error: 'type must be opensearch or prometheus' } };
  }
  return { status: 201, body: await svc.create(input) };
}

export async function handleUpdateDatasource(svc: DatasourceService, id: string, input: Partial<Datasource>): Promise<Result> {
  const ds = await svc.update(id, input);
  if (!ds) return { status: 404, body: { error: 'Datasource not found' } };
  return { status: 200, body: ds };
}

export async function handleDeleteDatasource(svc: DatasourceService, id: string): Promise<Result> {
  const ok = await svc.delete(id);
  if (!ok) return { status: 404, body: { error: 'Datasource not found' } };
  return { status: 200, body: { deleted: true } };
}

export async function handleTestDatasource(svc: DatasourceService, id: string): Promise<Result> {
  const r = await svc.testConnection(id);
  return { status: r.success ? 200 : 400, body: r };
}

// ============================================================================
// OpenSearch Monitor Handlers
// ============================================================================

export async function handleGetOSMonitors(alertSvc: MultiBackendAlertService, dsId: string): Promise<Result> {
  try {
    return { status: 200, body: { monitors: await alertSvc.getOSMonitors(dsId) } };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleGetOSMonitor(alertSvc: MultiBackendAlertService, dsId: string, monitorId: string): Promise<Result> {
  try {
    const m = await alertSvc.getOSMonitor(dsId, monitorId);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleCreateOSMonitor(alertSvc: MultiBackendAlertService, dsId: string, body: any): Promise<Result> {
  try {
    return { status: 201, body: await alertSvc.createOSMonitor(dsId, body) };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleUpdateOSMonitor(alertSvc: MultiBackendAlertService, dsId: string, monitorId: string, body: any): Promise<Result> {
  try {
    const m = await alertSvc.updateOSMonitor(dsId, monitorId, body);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleDeleteOSMonitor(alertSvc: MultiBackendAlertService, dsId: string, monitorId: string): Promise<Result> {
  try {
    const ok = await alertSvc.deleteOSMonitor(dsId, monitorId);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

// ============================================================================
// OpenSearch Alert Handlers
// ============================================================================

export async function handleGetOSAlerts(alertSvc: MultiBackendAlertService, dsId: string): Promise<Result> {
  try {
    return { status: 200, body: await alertSvc.getOSAlerts(dsId) };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleAcknowledgeOSAlerts(alertSvc: MultiBackendAlertService, dsId: string, monitorId: string, body: any): Promise<Result> {
  try {
    return { status: 200, body: await alertSvc.acknowledgeOSAlerts(dsId, monitorId, body.alerts || []) };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

// ============================================================================
// Prometheus Handlers
// ============================================================================

export async function handleGetPromRuleGroups(alertSvc: MultiBackendAlertService, dsId: string): Promise<Result> {
  try {
    const groups = await alertSvc.getPromRuleGroups(dsId);
    return { status: 200, body: { status: 'success', data: { groups } } };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

export async function handleGetPromAlerts(alertSvc: MultiBackendAlertService, dsId: string): Promise<Result> {
  try {
    const alerts = await alertSvc.getPromAlerts(dsId);
    return { status: 200, body: { status: 'success', data: { alerts } } };
  } catch (e) { return { status: 400, body: { error: String(e) } }; }
}

// ============================================================================
// Unified View Handlers (cross-backend, parallel with per-datasource status)
// ============================================================================

export async function handleGetUnifiedAlerts(alertSvc: MultiBackendAlertService, query?: { dsIds?: string; timeout?: string }): Promise<Result> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const timeoutMs = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const response = await alertSvc.getUnifiedAlerts({ dsIds, timeoutMs });
    return { status: 200, body: response };
  } catch (e) { return { status: 500, body: { error: String(e) } }; }
}

export async function handleGetUnifiedRules(alertSvc: MultiBackendAlertService, query?: { dsIds?: string; timeout?: string }): Promise<Result> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const timeoutMs = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const response = await alertSvc.getUnifiedRules({ dsIds, timeoutMs });
    return { status: 200, body: response };
  } catch (e) { return { status: 500, body: { error: String(e) } }; }
}
