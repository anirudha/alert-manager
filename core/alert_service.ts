/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert service — orchestrates OpenSearch and Prometheus backends,
 * and provides a unified view for the UI.
 */
import {
  Datasource,
  DatasourceService,
  DatasourceFetchResult,
  DatasourceFetchStatus,
  DatasourceWarning,
  Logger,
  OpenSearchBackend,
  PrometheusBackend,
  OSAlert,
  OSMonitor,
  PromAlert,
  PromAlertingRule,
  PromRuleGroup,
  ProgressiveResponse,
  PaginatedResponse,
  UnifiedAlertSummary,
  UnifiedAlertSeverity,
  UnifiedAlertState,
  UnifiedFetchOptions,
  UnifiedAlert,
  UnifiedRule,
  UnifiedRuleSummary,
  AlertHistoryEntry,
  NotificationRouting,
  MonitorType,
  MonitorStatus,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5_000;

/** Typed timeout error for reliable detection without string matching. */
class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class MultiBackendAlertService {
  private osBackend?: OpenSearchBackend;
  private promBackend?: PrometheusBackend;

  constructor(
    private readonly datasourceService: DatasourceService,
    private readonly logger: Logger
  ) {}

  registerOpenSearch(backend: OpenSearchBackend): void {
    this.osBackend = backend;
    this.logger.info('Registered OpenSearch alerting backend');
  }

  registerPrometheus(backend: PrometheusBackend): void {
    this.promBackend = backend;
    this.logger.info('Registered Prometheus alerting backend');
  }

  // =========================================================================
  // OpenSearch pass-through
  // =========================================================================

  async getOSMonitors(dsId: string): Promise<OSMonitor[]> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getMonitors(ds);
  }

  async getOSMonitor(dsId: string, monitorId: string): Promise<OSMonitor | null> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getMonitor(ds, monitorId);
  }

  async createOSMonitor(dsId: string, monitor: Omit<OSMonitor, 'id'>): Promise<OSMonitor> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.createMonitor(ds, monitor);
  }

  async updateOSMonitor(
    dsId: string,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.updateMonitor(ds, monitorId, input);
  }

  async deleteOSMonitor(dsId: string, monitorId: string): Promise<boolean> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.deleteMonitor(ds, monitorId);
  }

  async getOSAlerts(dsId: string): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getAlerts(ds);
  }

  async acknowledgeOSAlerts(dsId: string, monitorId: string, alertIds: string[]): Promise<unknown> {
    const ds = await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.acknowledgeAlerts(ds, monitorId, alertIds);
  }

  // =========================================================================
  // Prometheus pass-through
  // =========================================================================

  async getPromRuleGroups(dsId: string): Promise<PromRuleGroup[]> {
    const ds = await this.requireDatasource(dsId, 'prometheus');
    return this.promBackend!.getRuleGroups(ds);
  }

  async getPromAlerts(dsId: string): Promise<PromAlert[]> {
    const ds = await this.requireDatasource(dsId, 'prometheus');
    return this.promBackend!.getAlerts(ds);
  }

  // =========================================================================
  // Unified views (for the UI) — parallel with per-datasource timeout
  // =========================================================================

  async getUnifiedAlerts(
    options?: UnifiedFetchOptions
  ): Promise<ProgressiveResponse<UnifiedAlertSummary>> {
    const datasources = await this.resolveDatasources(options?.dsIds);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const fetchedAt = new Date().toISOString();

    const dsResults = await Promise.allSettled(
      datasources.map((ds) => this.fetchAlertsFromDatasource(ds, timeoutMs, options?.onProgress))
    );

    const allResults: UnifiedAlertSummary[] = [];
    const statusList: DatasourceFetchResult<UnifiedAlertSummary>[] = [];

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allResults.push(...settled.value.data);
        statusList.push(settled.value);
      } else {
        const errResult: DatasourceFetchResult<UnifiedAlertSummary> = {
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          status: 'error',
          data: [],
          error: String(settled.reason),
          durationMs: timeoutMs,
        };
        statusList.push(errResult);
      }
    }

    return {
      results: allResults.slice(0, maxResults),
      datasourceStatus: statusList,
      totalDatasources: datasources.length,
      completedDatasources: statusList.filter((s) => s.status === 'success').length,
      fetchedAt,
    };
  }

  async getUnifiedRules(
    options?: UnifiedFetchOptions
  ): Promise<ProgressiveResponse<UnifiedRuleSummary>> {
    const datasources = await this.resolveDatasources(options?.dsIds);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const fetchedAt = new Date().toISOString();

    const dsResults = await Promise.allSettled(
      datasources.map((ds) => this.fetchRulesFromDatasource(ds, timeoutMs, options?.onProgress))
    );

    const allResults: UnifiedRuleSummary[] = [];
    const statusList: DatasourceFetchResult<UnifiedRuleSummary>[] = [];

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allResults.push(...settled.value.data);
        statusList.push(settled.value);
      } else {
        const errResult: DatasourceFetchResult<UnifiedRuleSummary> = {
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          status: 'error',
          data: [],
          error: String(settled.reason),
          durationMs: timeoutMs,
        };
        statusList.push(errResult);
      }
    }

    return {
      results: allResults.slice(0, maxResults),
      datasourceStatus: statusList,
      totalDatasources: datasources.length,
      completedDatasources: statusList.filter((s) => s.status === 'success').length,
      fetchedAt,
    };
  }

  // =========================================================================
  // Paginated unified views — for single-datasource selection with pagination
  // =========================================================================

  async getPaginatedRules(
    options?: UnifiedFetchOptions
  ): Promise<PaginatedResponse<UnifiedRuleSummary>> {
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const datasources = await this.resolveDatasources(options?.dsIds);

    const allRules: UnifiedRuleSummary[] = [];
    const warnings: DatasourceWarning[] = [];

    // Fetch from all datasources in parallel
    const dsResults = await Promise.allSettled(datasources.map((ds) => this.fetchRulesRaw(ds)));

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allRules.push(...settled.value);
      } else {
        this.logger.error(
          `Failed to fetch rules from ${datasources[i].name} (${datasources[i].id}): ${settled.reason}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: String(settled.reason),
        });
      }
    }

    if (allRules.length === 0 && warnings.length === datasources.length && datasources.length > 0) {
      throw new Error(
        `All datasources failed: ${warnings.map((w) => `${w.datasourceName}: ${w.error}`).join('; ')}`
      );
    }

    const total = allRules.length;
    const start = (page - 1) * pageSize;
    const results = allRules.slice(start, start + pageSize);

    return {
      results,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async getPaginatedAlerts(
    options?: UnifiedFetchOptions
  ): Promise<PaginatedResponse<UnifiedAlertSummary>> {
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const datasources = await this.resolveDatasources(options?.dsIds);

    const allAlerts: UnifiedAlertSummary[] = [];
    const warnings: DatasourceWarning[] = [];

    // Fetch from all datasources in parallel
    const dsResults = await Promise.allSettled(datasources.map((ds) => this.fetchAlertsRaw(ds)));

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allAlerts.push(...settled.value);
      } else {
        this.logger.error(
          `Failed to fetch alerts from ${datasources[i].name} (${datasources[i].id}): ${settled.reason}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: String(settled.reason),
        });
      }
    }

    if (
      allAlerts.length === 0 &&
      warnings.length === datasources.length &&
      datasources.length > 0
    ) {
      throw new Error(
        `All datasources failed: ${warnings.map((w) => `${w.datasourceName}: ${w.error}`).join('; ')}`
      );
    }

    const total = allAlerts.length;
    const start = (page - 1) * pageSize;
    const results = allAlerts.slice(start, start + pageSize);

    return {
      results,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // =========================================================================
  // Detail views — loaded on demand when user opens a flyout
  // =========================================================================

  /**
   * Get full detail for a single rule/monitor. Fetches real metadata from
   * the backend (alert history, destinations, annotations). Fields that
   * cannot be fetched from the API are marked as mock placeholders.
   */
  async getRuleDetail(dsId: string, ruleId: string): Promise<UnifiedRule | null> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) return null;

    if (ds.type === 'opensearch' && this.osBackend) {
      return this.getOSRuleDetail(ds, ruleId);
    } else if (ds.type === 'prometheus' && this.promBackend) {
      return this.getPromRuleDetail(ds, ruleId);
    }
    return null;
  }

  private async getOSRuleDetail(ds: Datasource, monitorId: string): Promise<UnifiedRule | null> {
    const monitor = await this.osBackend!.getMonitor(ds, monitorId);
    if (!monitor) return null;

    const summary = osMonitorToUnifiedRuleSummary(monitor, ds.id);

    // Fetch real alert history for this monitor
    let alertHistory: AlertHistoryEntry[] = [];
    try {
      const { alerts } = await this.osBackend!.getAlerts(ds);
      const monitorAlerts = alerts.filter((a) => a.monitor_id === monitorId).slice(0, 20);
      alertHistory = monitorAlerts.map((a) => ({
        timestamp: new Date(a.start_time).toISOString(),
        state: osStateToUnified(a.state),
        value: a.severity,
        message: a.error_message || (a.state === 'ACTIVE' ? 'Threshold exceeded' : 'Resolved'),
      }));
    } catch {
      // Alert history fetch is best-effort
    }

    // Build notification routing from trigger actions + destinations
    let notificationRouting: NotificationRouting[] = [];
    try {
      const destinations = await this.osBackend!.getDestinations(ds);
      const destMap = new Map(destinations.map((d) => [d.id, d]));
      for (const trigger of monitor.triggers) {
        for (const action of trigger.actions) {
          const dest = destMap.get(action.destination_id);
          notificationRouting.push({
            channel: dest?.type || 'unknown',
            destination: dest?.name || action.name || action.destination_id,
            throttle: action.throttle
              ? `${action.throttle.value} ${action.throttle.unit}`
              : undefined,
          });
        }
      }
    } catch {
      // Destination fetch is best-effort
    }

    // Build description from trigger message template
    const trigger = monitor.triggers[0];
    const description =
      trigger?.actions?.[0]?.message_template?.source ||
      `${summary.monitorType} monitor targeting ${monitor.inputs[0]?.search?.indices?.join(', ') || 'unknown indices'}`;

    // Fetch condition preview via monitor dry run
    let conditionPreviewData: Array<{ timestamp: number; value: number }> = [];
    try {
      const execResult = await this.osBackend!.runMonitor(ds, monitorId, true);
      conditionPreviewData = this.extractOSPreviewData(execResult);
    } catch {
      // Dry run is best-effort — some monitors may not support it
    }

    return {
      ...summary,
      description,
      // MOCK: AI summary not available from OS alerting API
      aiSummary: '[Not available] AI summaries require integration with an LLM service.',
      firingPeriod: undefined,
      lookbackPeriod: undefined,
      alertHistory,
      conditionPreviewData,
      notificationRouting,
      // Suppression rules from the in-memory service (not from OS API)
      suppressionRules: [],
      raw: monitor,
    };
  }

  private async getPromRuleDetail(ds: Datasource, ruleId: string): Promise<UnifiedRule | null> {
    const groups = await this.promBackend!.getRuleGroups(ds);

    // ruleId format: "{dsId}-{groupName}-{ruleName}"
    for (const group of groups) {
      for (const rule of group.rules) {
        if (rule.type !== 'alerting') continue;
        const alertingRule = rule as PromAlertingRule;
        const id = `${ds.id}-${group.name}-${alertingRule.name}`;
        if (id !== ruleId) continue;

        const summary = promRuleToUnified(alertingRule, group.name, ds.id);

        // Real alert history from the rule's embedded alerts
        const alertHistory: AlertHistoryEntry[] = (alertingRule.alerts || []).map((a) => ({
          timestamp: a.activeAt,
          state: promStateToUnified(a.state),
          value: a.value,
          message: a.annotations.summary || a.annotations.description || a.state,
        }));

        // Description from annotations
        const description =
          alertingRule.annotations.description ||
          alertingRule.annotations.summary ||
          `PromQL rule: ${alertingRule.query}`;

        return {
          ...summary,
          description,
          // MOCK: AI summary not available from Prometheus API
          aiSummary: '[Not available] AI summaries require integration with an LLM service.',
          firingPeriod: undefined,
          lookbackPeriod: undefined,
          alertHistory,
          conditionPreviewData: await this.fetchPromPreviewData(
            ds,
            alertingRule.query,
            alertingRule
          ),
          notificationRouting: [],
          suppressionRules: [],
          raw: alertingRule,
        };
      }
    }
    return null;
  }

  /**
   * Get full detail for a single alert including raw backend data.
   */
  async getAlertDetail(dsId: string, alertId: string): Promise<UnifiedAlert | null> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) return null;

    if (ds.type === 'opensearch' && this.osBackend) {
      const { alerts } = await this.osBackend.getAlerts(ds);
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) return null;
      const summary = osAlertToUnified(alert, ds.id);
      return { ...summary, raw: alert };
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const promAlerts = await this.promBackend.getAlerts(ds);
      const alert = promAlerts.find(
        (a) => `${ds.id}-${a.labels.alertname}-${a.labels.instance || ''}` === alertId
      );
      if (!alert) return null;
      const summary = promAlertToUnified(alert, ds.id);
      return { ...summary, raw: alert };
    }
    return null;
  }

  // =========================================================================

  private async fetchAlertsFromDatasource(
    ds: Datasource,
    timeoutMs: number,
    onProgress?: (result: DatasourceFetchResult<UnifiedAlertSummary>) => void
  ): Promise<DatasourceFetchResult<UnifiedAlertSummary>> {
    const start = Date.now();
    const makeResult = (
      status: DatasourceFetchStatus,
      data: UnifiedAlertSummary[],
      error?: string
    ): DatasourceFetchResult<UnifiedAlertSummary> => ({
      datasourceId: ds.id,
      datasourceName: ds.name,
      datasourceType: ds.type,
      status,
      data,
      error,
      durationMs: Date.now() - start,
    });

    try {
      const data = await this.withTimeout(
        this.fetchAlertsRaw(ds),
        timeoutMs,
        `Datasource ${ds.name} timed out after ${timeoutMs}ms`
      );
      const result = makeResult('success', data);
      if (onProgress) onProgress(result);
      return result;
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], String(err));
      this.logger.error(`Failed to fetch alerts from ${ds.name}: ${err}`);
      if (onProgress) onProgress(result);
      return result;
    }
  }

  private async fetchRulesFromDatasource(
    ds: Datasource,
    timeoutMs: number,
    onProgress?: (result: DatasourceFetchResult<UnifiedRuleSummary>) => void
  ): Promise<DatasourceFetchResult<UnifiedRuleSummary>> {
    const start = Date.now();
    const makeResult = (
      status: DatasourceFetchStatus,
      data: UnifiedRuleSummary[],
      error?: string
    ): DatasourceFetchResult<UnifiedRuleSummary> => ({
      datasourceId: ds.id,
      datasourceName: ds.name,
      datasourceType: ds.type,
      status,
      data,
      error,
      durationMs: Date.now() - start,
    });

    try {
      const data = await this.withTimeout(
        this.fetchRulesRaw(ds),
        timeoutMs,
        `Datasource ${ds.name} timed out after ${timeoutMs}ms`
      );
      const result = makeResult('success', data);
      if (onProgress) onProgress(result);
      return result;
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], String(err));
      this.logger.error(`Failed to fetch rules from ${ds.name}: ${err}`);
      if (onProgress) onProgress(result);
      return result;
    }
  }

  private async fetchAlertsRaw(ds: Datasource): Promise<UnifiedAlertSummary[]> {
    const results: UnifiedAlertSummary[] = [];
    if (ds.type === 'opensearch' && this.osBackend) {
      const { alerts } = await this.osBackend.getAlerts(ds);
      for (const a of alerts) results.push(osAlertToUnified(a, ds.id));
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const alerts = await this.promBackend.getAlerts(ds);
      for (const a of alerts) results.push(promAlertToUnified(a, ds.id));
    }
    return results;
  }

  private async fetchRulesRaw(ds: Datasource): Promise<UnifiedRuleSummary[]> {
    const results: UnifiedRuleSummary[] = [];
    if (ds.type === 'opensearch' && this.osBackend) {
      const monitors = await this.osBackend.getMonitors(ds);
      for (const m of monitors) results.push(osMonitorToUnifiedRuleSummary(m, ds.id));
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const groups = await this.promBackend.getRuleGroups(ds);
      for (const g of groups) {
        for (const r of g.rules) {
          if (r.type === 'alerting') results.push(promRuleToUnified(r, g.name, ds.id));
        }
      }
    }
    return results;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async resolveDatasources(dsIds?: string[]): Promise<Datasource[]> {
    const all = await this.datasourceService.list();
    const enabled = all.filter((ds) => ds.enabled);
    if (!dsIds || dsIds.length === 0) return enabled;

    const resolved: Datasource[] = [];
    for (const id of dsIds) {
      // Check if this is a workspace-scoped ID (e.g., "ds-2::ws-prod-001")
      if (id.indexOf('::') !== -1) {
        const parts = id.split('::');
        const parentId = parts[0];
        const wsId = parts[1];
        const parent = enabled.filter((ds) => ds.id === parentId)[0];
        if (parent) {
          // Create a workspace-scoped datasource view
          resolved.push({
            ...parent,
            id: id,
            workspaceId: wsId,
            parentDatasourceId: parentId,
          });
        }
      } else {
        const match = enabled.filter((ds) => ds.id === id);
        if (match.length > 0) resolved.push(match[0]);
      }
    }
    return resolved;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new TimeoutError(message, ms));
        }
      }, ms);
      promise.then(
        (val) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(val);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    });
  }

  /**
   * Extract preview data from OS monitor dry-run result.
   * The _execute API returns input_results with the query response.
   */
  private extractOSPreviewData(execResult: unknown): Array<{ timestamp: number; value: number }> {
    const points: Array<{ timestamp: number; value: number }> = [];
    if (!execResult || typeof execResult !== 'object') return points;

    const result = execResult as Record<string, unknown>;
    const inputResults = result.input_results as Record<string, unknown> | undefined;
    const triggerResults = result.trigger_results as Record<string, unknown> | undefined;

    // Try to extract a meaningful numeric value from trigger results
    if (triggerResults) {
      const now = Date.now();
      for (const [, triggerData] of Object.entries(triggerResults)) {
        const td = triggerData as Record<string, unknown>;
        // Trigger results contain the evaluated condition value
        if (typeof td.triggered === 'boolean') {
          // Use the period_start/period_end from the execution
          const periodStart = (result.period_start as number) || now - 300_000;
          const periodEnd = (result.period_end as number) || now;
          points.push({
            timestamp: periodEnd,
            value: td.triggered ? 1 : 0,
          });
          // Also add start point for a basic range
          points.push({
            timestamp: periodStart,
            value: td.triggered ? 1 : 0,
          });
        }
      }
    }

    // Try to extract hit counts from input results (common for query-level monitors)
    if (inputResults) {
      const results = inputResults.results as Array<Record<string, unknown>> | undefined;
      if (results && results.length > 0) {
        const firstResult = results[0];
        const hits = firstResult?.hits as Record<string, unknown> | undefined;
        const total = hits?.total as { value?: number } | number | undefined;
        const totalValue = typeof total === 'number' ? total : total?.value;
        if (typeof totalValue === 'number') {
          points.push({ timestamp: Date.now(), value: totalValue });
        }
      }
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Fetch PromQL range query data for condition preview.
   * Queries the last 1 hour with 60-second step.
   */
  /**
   * Fetch condition preview data for Prometheus rules.
   *
   * Attempts queryRange via DirectQuery first. If the API doesn't support it
   * (OpenSearch DirectQuery only proxies /rules and /alerts, not /query_range),
   * falls back to extracting current evaluation data from the rule's embedded
   * alerts and lastEvaluation timestamp.
   */
  private async fetchPromPreviewData(
    ds: Datasource,
    query: string,
    rule: PromAlertingRule
  ): Promise<Array<{ timestamp: number; value: number }>> {
    // Try queryRange first (works with direct Prometheus, not via DirectQuery)
    if (this.promBackend?.queryRange) {
      try {
        const metricQuery = query.replace(/\s*(>|<|>=|<=|==|!=)\s*[\d.]+\s*$/, '').trim();
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;
        const step = 60;
        const points = await this.promBackend.queryRange(ds, metricQuery, oneHourAgo, now, step);
        if (points.length > 0) return points;
      } catch {
        // queryRange not supported (e.g., DirectQuery) — fall through to extraction
      }
    }

    // Fallback: extract data from the rule's embedded alerts and evaluation metadata
    const points: Array<{ timestamp: number; value: number }> = [];

    // Add data points from currently active alerts (they contain the current value)
    for (const alert of rule.alerts || []) {
      const value = parseFloat(alert.value);
      if (!isNaN(value)) {
        points.push({
          timestamp: new Date(alert.activeAt).getTime(),
          value,
        });
      }
    }

    // Add the last evaluation timestamp with the alert count as a proxy metric
    if (rule.lastEvaluation) {
      points.push({
        timestamp: new Date(rule.lastEvaluation).getTime(),
        value: (rule.alerts || []).length,
      });
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
  }

  private async requireDatasource(dsId: string, expectedType: string): Promise<Datasource> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) throw new Error(`Datasource not found: ${dsId}`);
    if (ds.type !== expectedType)
      throw new Error(`Datasource ${dsId} is ${ds.type}, expected ${expectedType}`);
    if (expectedType === 'opensearch' && !this.osBackend)
      throw new Error('No OpenSearch backend registered');
    if (expectedType === 'prometheus' && !this.promBackend)
      throw new Error('No Prometheus backend registered');
    return ds;
  }
}
// ============================================================================
// Mapping helpers
// ============================================================================

function osSeverityToUnified(sev: string): UnifiedAlertSeverity {
  switch (sev) {
    case '1':
      return 'critical';
    case '2':
      return 'high';
    case '3':
      return 'medium';
    case '4':
      return 'low';
    default:
      return 'info';
  }
}

function osStateToUnified(state: string): UnifiedAlertState {
  switch (state) {
    case 'ACTIVE':
      return 'active';
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    case 'COMPLETED':
      return 'resolved';
    case 'ERROR':
      return 'error';
    default:
      return 'active';
  }
}

function promSeverityFromLabels(labels: Record<string, string>): UnifiedAlertSeverity {
  const sev = labels.severity || '';
  if (sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low') return sev;
  if (sev === 'warning') return 'medium';
  if (sev === 'page') return 'critical';
  return 'info';
}

function promStateToUnified(state: string): UnifiedAlertState {
  if (state === 'firing') return 'active';
  if (state === 'pending') return 'pending';
  return 'resolved';
}

function osAlertToUnified(a: OSAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: a.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: `${a.monitor_name} — ${a.trigger_name}`,
    state: osStateToUnified(a.state),
    severity: osSeverityToUnified(a.severity),
    message: a.error_message || undefined,
    startTime: new Date(a.start_time).toISOString(),
    lastUpdated: new Date(a.last_notification_time).toISOString(),
    labels: { monitor_id: a.monitor_id, trigger_id: a.trigger_id },
    annotations: {},
  };
}

function promAlertToUnified(a: PromAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: `${dsId}-${a.labels.alertname}-${a.labels.instance || ''}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: a.labels.alertname || 'Unknown',
    state: promStateToUnified(a.state),
    severity: promSeverityFromLabels(a.labels),
    message: a.annotations.summary || a.annotations.description,
    startTime: a.activeAt,
    lastUpdated: a.activeAt,
    labels: a.labels,
    annotations: a.annotations,
  };
}

function osMonitorToUnifiedRuleSummary(m: OSMonitor, dsId: string): UnifiedRuleSummary {
  const trigger = m.triggers[0];
  const isEnabled = m.enabled;

  // Derive labels from actual monitor metadata (indices targeted)
  const labels: Record<string, string> = {};
  const indices = m.inputs[0]?.search?.indices ?? [];
  if (indices.length > 0) {
    labels.indices = indices.join(',');
  }
  labels.monitor_type = m.monitor_type;
  labels.datasource_id = dsId;

  const annotations: Record<string, string> = {};
  if (trigger?.actions?.[0]?.message_template?.source) {
    annotations.summary = trigger.actions[0].message_template.source;
  }

  const severity = trigger ? osSeverityToUnified(trigger.severity) : 'info';
  const status: MonitorStatus = !isEnabled ? 'disabled' : 'active';
  const monitorType: MonitorType =
    m.monitor_type === 'bucket_level_monitor'
      ? 'infrastructure'
      : m.monitor_type === 'doc_level_monitor'
        ? 'log'
        : 'metric';
  const destNames = trigger?.actions?.map((a) => a.name) ?? [];
  const intervalUnit = m.schedule.period.unit;
  const intervalVal = m.schedule.period.interval;
  const evalInterval = `${intervalVal} ${intervalUnit.toLowerCase()}`;

  return {
    id: m.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: m.name,
    enabled: isEnabled,
    severity,
    query: JSON.stringify(m.inputs[0]?.search?.query ?? {}),
    condition: trigger?.condition?.script?.source ?? '',
    labels,
    annotations,
    monitorType,
    status,
    healthStatus: 'healthy',
    createdBy: '',
    createdAt: new Date(m.last_update_time - 86400000).toISOString(),
    lastModified: new Date(m.last_update_time).toISOString(),
    lastTriggered: undefined,
    notificationDestinations: destNames,
    evaluationInterval: evalInterval,
    pendingPeriod: '5 minutes',
    threshold: trigger
      ? {
          operator: '>',
          value: parseThresholdValue(trigger.condition.script.source),
          unit: monitorType === 'metric' ? '%' : 'count',
        }
      : undefined,
  };
}

function parseThresholdValue(conditionSource: string): number {
  const match = conditionSource.match(/>\s*([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function promRuleToUnified(
  r: PromAlertingRule,
  groupName: string,
  dsId: string
): UnifiedRuleSummary {
  const state = r.state;
  const severity = promSeverityFromLabels(r.labels);
  const status: MonitorStatus =
    state === 'firing' ? 'active' : state === 'pending' ? 'pending' : 'muted';
  const destNames: string[] = [];

  return {
    id: `${dsId}-${groupName}-${r.name}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: r.name,
    enabled: true,
    severity,
    query: r.query,
    condition: `> threshold for ${r.duration}s`,
    group: groupName,
    labels: r.labels,
    annotations: r.annotations,
    monitorType: 'metric',
    status,
    healthStatus: r.health === 'ok' ? 'healthy' : r.health === 'err' ? 'failing' : 'no_data',
    createdBy: 'system',
    createdAt: r.lastEvaluation || new Date().toISOString(),
    lastModified: r.lastEvaluation || new Date().toISOString(),
    lastTriggered: r.alerts?.length > 0 ? r.alerts[0].activeAt : undefined,
    notificationDestinations: destNames,
    evaluationInterval: `${r.duration}s`,
    pendingPeriod: `${r.duration}s`,
    threshold: { operator: '>', value: parseThresholdValue(r.query), unit: '%' },
  };
}
