/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route handlers — pure functions that work with any HTTP framework.
 * Exposes backend-native API shapes + unified views.
 */
import { DatasourceService, Datasource, MultiBackendAlertService, OSMonitor } from '../../common';
import { toHandlerResult } from './route_utils';
import type { HandlerResult } from './route_utils';

// ============================================================================
// Datasource Handlers
// ============================================================================

export async function handleListDatasources(svc: DatasourceService): Promise<HandlerResult> {
  try {
    return { status: 200, body: { datasources: await svc.list() } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetDatasource(
  svc: DatasourceService,
  id: string
): Promise<HandlerResult> {
  try {
    const ds = await svc.get(id);
    if (!ds) return { status: 404, body: { error: 'Datasource not found' } };
    return { status: 200, body: ds };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleCreateDatasource(
  svc: DatasourceService,
  input: Omit<Datasource, 'id'>
): Promise<HandlerResult> {
  if (!input.name || !input.type || !input.url) {
    return { status: 400, body: { error: 'name, type, and url are required' } };
  }
  if (input.type !== 'opensearch' && input.type !== 'prometheus') {
    return { status: 400, body: { error: 'type must be opensearch or prometheus' } };
  }
  try {
    return { status: 201, body: await svc.create(input) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleUpdateDatasource(
  svc: DatasourceService,
  id: string,
  input: Partial<Datasource>
): Promise<HandlerResult> {
  try {
    const ds = await svc.update(id, input);
    if (!ds) return { status: 404, body: { error: 'Datasource not found' } };
    return { status: 200, body: ds };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleDeleteDatasource(
  svc: DatasourceService,
  id: string
): Promise<HandlerResult> {
  try {
    const ok = await svc.delete(id);
    if (!ok) return { status: 404, body: { error: 'Datasource not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleTestDatasource(
  svc: DatasourceService,
  id: string
): Promise<HandlerResult> {
  try {
    const r = await svc.testConnection(id);
    return { status: r.success ? 200 : 400, body: r };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// OpenSearch Monitor Handlers
// ============================================================================

export async function handleGetOSMonitors(
  alertSvc: MultiBackendAlertService,
  dsId: string
): Promise<HandlerResult> {
  try {
    return { status: 200, body: { monitors: await alertSvc.getOSMonitors(dsId) } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetOSMonitor(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  monitorId: string
): Promise<HandlerResult> {
  try {
    const m = await alertSvc.getOSMonitor(dsId, monitorId);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleCreateOSMonitor(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  body: Omit<OSMonitor, 'id'>
): Promise<HandlerResult> {
  try {
    return { status: 201, body: await alertSvc.createOSMonitor(dsId, body) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleUpdateOSMonitor(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  monitorId: string,
  body: Partial<OSMonitor>
): Promise<HandlerResult> {
  try {
    const m = await alertSvc.updateOSMonitor(dsId, monitorId, body);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleDeleteOSMonitor(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  monitorId: string
): Promise<HandlerResult> {
  try {
    const ok = await alertSvc.deleteOSMonitor(dsId, monitorId);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// OpenSearch Alert Handlers
// ============================================================================

export async function handleGetOSAlerts(
  alertSvc: MultiBackendAlertService,
  dsId: string
): Promise<HandlerResult> {
  try {
    return { status: 200, body: await alertSvc.getOSAlerts(dsId) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleAcknowledgeOSAlerts(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  monitorId: string,
  body: { alerts?: string[] }
): Promise<HandlerResult> {
  try {
    return {
      status: 200,
      body: { result: await alertSvc.acknowledgeOSAlerts(dsId, monitorId, body.alerts || []) },
    };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Prometheus Handlers
// ============================================================================

export async function handleGetPromRuleGroups(
  alertSvc: MultiBackendAlertService,
  dsId: string
): Promise<HandlerResult> {
  try {
    const groups = await alertSvc.getPromRuleGroups(dsId);
    return { status: 200, body: { status: 'success', data: { groups } } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetPromAlerts(
  alertSvc: MultiBackendAlertService,
  dsId: string
): Promise<HandlerResult> {
  try {
    const alerts = await alertSvc.getPromAlerts(dsId);
    return { status: 200, body: { status: 'success', data: { alerts } } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Unified View Handlers (cross-backend, parallel with per-datasource status)
// ============================================================================

export async function handleGetUnifiedAlerts(
  alertSvc: MultiBackendAlertService,
  query?: { dsIds?: string; timeout?: string; maxResults?: string }
): Promise<HandlerResult> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const rawTimeout = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const timeoutMs =
      rawTimeout !== undefined && Number.isFinite(rawTimeout) ? rawTimeout : undefined;
    const rawMaxResults = query?.maxResults ? parseInt(query.maxResults, 10) : undefined;
    const maxResults =
      rawMaxResults !== undefined && Number.isFinite(rawMaxResults) ? rawMaxResults : undefined;
    const response = await alertSvc.getUnifiedAlerts({ dsIds, timeoutMs, maxResults });
    return { status: 200, body: response };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetUnifiedRules(
  alertSvc: MultiBackendAlertService,
  query?: { dsIds?: string; timeout?: string; maxResults?: string }
): Promise<HandlerResult> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const rawTimeout = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const timeoutMs =
      rawTimeout !== undefined && Number.isFinite(rawTimeout) ? rawTimeout : undefined;
    const rawMaxResults = query?.maxResults ? parseInt(query.maxResults, 10) : undefined;
    const maxResults =
      rawMaxResults !== undefined && Number.isFinite(rawMaxResults) ? rawMaxResults : undefined;
    const response = await alertSvc.getUnifiedRules({ dsIds, timeoutMs, maxResults });
    return { status: 200, body: response };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Workspace Discovery
// ============================================================================

export async function handleListWorkspaces(
  datasourceService: DatasourceService,
  dsId: string
): Promise<HandlerResult> {
  try {
    const workspaces = await datasourceService.listWorkspaces(dsId);
    return { status: 200, body: { workspaces } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Detail View Handlers (on-demand, loaded when user opens flyout)
// ============================================================================

export async function handleGetRuleDetail(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  ruleId: string
): Promise<HandlerResult> {
  try {
    const rule = await alertSvc.getRuleDetail(dsId, ruleId);
    if (!rule) return { status: 404, body: { error: 'Rule not found' } };
    return { status: 200, body: rule };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertDetail(
  alertSvc: MultiBackendAlertService,
  dsId: string,
  alertId: string
): Promise<HandlerResult> {
  try {
    const alert = await alertSvc.getAlertDetail(dsId, alertId);
    if (!alert) return { status: 404, body: { error: 'Alert not found' } };
    return { status: 200, body: alert };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}
