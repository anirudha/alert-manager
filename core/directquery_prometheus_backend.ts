/**
 * Prometheus backend that routes all API calls through OpenSearch Direct Query
 * resource APIs instead of connecting to Prometheus directly.
 *
 * Each Datasource object carries a `directQueryName` field that identifies which
 * Prometheus datasource (registered in the OpenSearch SQL plugin) to target.
 * This enables auto-discovery: on startup the server queries
 *   GET /_plugins/_query/_datasources
 * and seeds one Datasource per registered PROMETHEUS connector.
 *
 * API calls are routed through:
 *   GET/POST/DELETE {opensearchUrl}/_plugins/_directquery/_resources/{directQueryName}/...
 *
 * Reference (OpenSearch SQL plugin):
 *   - RestDirectQueryResourcesManagementAction.java
 *   - PrometheusQueryHandler.java / PrometheusClient.java
 */
import { HttpClient, buildAuthFromDatasource } from './http_client';
import {
  Datasource,
  Logger,
  PrometheusBackend,
  PromAlert,
  PromAlertingRule,
  PromRecordingRule,
  PromRule,
  PromRuleGroup,
  PrometheusWorkspace,
  AlertmanagerAlert,
  AlertmanagerAlertGroup,
  AlertmanagerReceiver,
  AlertmanagerSilence,
  AlertmanagerStatus,
} from './types';

export interface DirectQueryConfig {
  /** OpenSearch cluster URL (e.g. https://localhost:9200) */
  opensearchUrl: string;
  /** OpenSearch basic auth credentials */
  auth?: { username: string; password: string };
}

export class DirectQueryPrometheusBackend implements PrometheusBackend {
  readonly type = 'prometheus' as const;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly defaultAuth?: { username: string; password: string };

  constructor(private readonly logger: Logger, private readonly config: DirectQueryConfig) {
    this.http = new HttpClient(logger);
    this.baseUrl = config.opensearchUrl.replace(/\/+$/, '');
    this.defaultAuth = config.auth;

    this.logger.info(
      `DirectQuery Prometheus backend configured: OpenSearch=${this.baseUrl}`
    );
  }

  // =========================================================================
  // Auto-discovery — query OpenSearch SQL plugin for registered PROMETHEUS datasources
  // =========================================================================

  /**
   * Discover all Prometheus datasources registered in the OpenSearch SQL plugin.
   * Returns entries suitable for seeding into the DatasourceService.
   *
   * Endpoint: GET /_plugins/_query/_datasources
   */
  async discoverDatasources(): Promise<Array<Omit<Datasource, 'id'>>> {
    try {
      const resp = await this.http.request<any>({
        method: 'GET',
        url: `${this.baseUrl}/_plugins/_query/_datasources`,
        auth: this.defaultAuth,
        rejectUnauthorized: false,
        timeoutMs: 10_000,
      });

      const all: any[] = Array.isArray(resp.body) ? resp.body : [];
      const promSources = all.filter(
        (d) => d.connector?.toUpperCase() === 'PROMETHEUS' && d.status !== 'DISABLED',
      );

      this.logger.info(
        `Discovered ${promSources.length} Prometheus datasource(s) in OpenSearch SQL plugin` +
        (promSources.length > 0
          ? `: ${promSources.map((d: any) => d.name).join(', ')}`
          : ''),
      );

      return promSources.map((d: any) => ({
        name: d.name,
        type: 'prometheus' as const,
        url: this.baseUrl,
        enabled: true,
        directQueryName: d.name,
        auth: this.defaultAuth
          ? { type: 'basic' as const, credentials: { username: this.defaultAuth.username, password: this.defaultAuth.password } }
          : undefined,
      }));
    } catch (err) {
      this.logger.warn(`Failed to discover Prometheus datasources from SQL plugin: ${err}`);
      return [];
    }
  }

  // =========================================================================
  // Helper — build direct query resource URL from a Datasource
  // =========================================================================

  private resolveDqName(ds: Datasource): string {
    const name = ds.directQueryName;
    if (!name) {
      throw new Error(
        `Datasource "${ds.name}" (${ds.id}) has no directQueryName. ` +
        'It must be auto-discovered from the OpenSearch SQL plugin.',
      );
    }
    return name;
  }

  private resourceUrl(ds: Datasource, path: string): string {
    const dqName = encodeURIComponent(this.resolveDqName(ds));
    const osUrl = ds.url?.replace(/\/+$/, '') || this.baseUrl;
    return `${osUrl}/_plugins/_directquery/_resources/${dqName}${path}`;
  }

  private resolveAuth(ds: Datasource): { username: string; password: string } | undefined {
    return buildAuthFromDatasource(ds) || this.defaultAuth;
  }

  private async get<T = any>(ds: Datasource, path: string, timeoutMs = 15_000): Promise<T> {
    const url = this.resourceUrl(ds, path);
    this.logger.debug(`DirectQuery GET ${url}`);
    const resp = await this.http.request<any>({
      method: 'GET',
      url,
      auth: this.resolveAuth(ds),
      rejectUnauthorized: false,
      timeoutMs,
    });
    return resp.body?.data !== undefined ? resp.body.data : resp.body;
  }

  private async post<T = any>(ds: Datasource, path: string, body: any, timeoutMs = 15_000): Promise<T> {
    const url = this.resourceUrl(ds, path);
    this.logger.debug(`DirectQuery POST ${url}`);
    const resp = await this.http.request<any>({
      method: 'POST',
      url,
      body,
      auth: this.resolveAuth(ds),
      rejectUnauthorized: false,
      timeoutMs,
    });
    return resp.body?.data !== undefined ? resp.body.data : resp.body;
  }

  private async del<T = any>(ds: Datasource, path: string, timeoutMs = 15_000): Promise<T> {
    const url = this.resourceUrl(ds, path);
    this.logger.debug(`DirectQuery DELETE ${url}`);
    const resp = await this.http.request<any>({
      method: 'DELETE',
      url,
      auth: this.resolveAuth(ds),
      rejectUnauthorized: false,
      timeoutMs,
    });
    return resp.body?.data !== undefined ? resp.body.data : resp.body;
  }

  // =========================================================================
  // Rules — GET /_plugins/_directquery/_resources/{ds}/api/v1/rules
  // =========================================================================

  async getRuleGroups(ds: Datasource): Promise<PromRuleGroup[]> {
    const data = await this.get<any>(ds, '/api/v1/rules');

    let rawGroups: any[];
    if (Array.isArray(data)) {
      rawGroups = data;
    } else if (data?.groups) {
      rawGroups = data.groups;
    } else if (data?.data?.groups) {
      rawGroups = data.data.groups;
    } else {
      this.logger.warn('Unexpected rules response shape, returning empty');
      rawGroups = [];
    }

    const groups: PromRuleGroup[] = rawGroups.map((g: any) => ({
      name: g.name || '',
      file: g.file || '',
      interval: typeof g.interval === 'number'
        ? g.interval
        : this.parseDurationToSeconds(g.interval || '60s'),
      rules: (g.rules || []).map((r: any) => this.mapRule(r)),
    }));

    if (ds.workspaceId && ds.workspaceId !== 'default') {
      return groups.filter(
        (g) =>
          g.file.includes(ds.workspaceId!) ||
          g.rules.some((r) => r.type === 'alerting' && r.labels._workspace === ds.workspaceId),
      );
    }

    return groups;
  }

  // =========================================================================
  // Alerts — derived from rules when /api/v1/alerts is unavailable
  // =========================================================================

  async getAlerts(ds: Datasource): Promise<PromAlert[]> {
    try {
      const data = await this.get<any>(ds, '/api/v1/alerts');
      let rawAlerts: any[];
      if (Array.isArray(data)) {
        rawAlerts = data;
      } else if (data?.alerts) {
        rawAlerts = data.alerts;
      } else if (data?.data?.alerts) {
        rawAlerts = data.data.alerts;
      } else {
        rawAlerts = [];
      }

      if (rawAlerts.length > 0) {
        const alerts = rawAlerts.map((a: any) => this.mapAlert(a));
        if (ds.workspaceId && ds.workspaceId !== 'default') {
          return alerts.filter((a) => a.labels._workspace === ds.workspaceId);
        }
        return alerts;
      }
    } catch {
      this.logger.debug('Dedicated /api/v1/alerts not available, extracting alerts from rules');
    }

    // Fallback: extract alerts from rule groups
    const groups = await this.getRuleGroups(ds);
    const alerts: PromAlert[] = [];
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.type === 'alerting') {
          for (const a of r.alerts) {
            alerts.push(a);
          }
        }
      }
    }
    return alerts;
  }

  // =========================================================================
  // Workspaces
  // =========================================================================

  async listWorkspaces(ds: Datasource): Promise<PrometheusWorkspace[]> {
    const ampMatch = ds.url.match(
      /aps-workspaces\.([^.]+)\.amazonaws\.com\/workspaces\/(ws-[a-zA-Z0-9]+)/,
    );
    if (ampMatch) {
      return [
        {
          id: ampMatch[2],
          name: ampMatch[2],
          alias: `AMP Workspace (${ampMatch[1]})`,
          region: ampMatch[1],
          status: 'active',
        },
      ];
    }

    return [{ id: 'default', name: 'default', alias: 'Default', status: 'active' }];
  }

  // =========================================================================
  // Alertmanager — via direct query resource APIs
  // =========================================================================

  // Alertmanager methods use the first available Prometheus datasource since
  // they are global (not per-datasource). A `_defaultDs` is resolved lazily
  // from whatever datasource was last used in getRuleGroups/getAlerts, or
  // the caller can set it via setDefaultDatasource().

  private _defaultDs?: Datasource;

  setDefaultDatasource(ds: Datasource): void {
    this._defaultDs = ds;
  }

  private requireDefaultDs(): Datasource {
    if (!this._defaultDs) {
      throw new Error('No default Prometheus datasource set for alertmanager operations');
    }
    return this._defaultDs;
  }

  async getAlertmanagerAlerts(): Promise<AlertmanagerAlert[]> {
    try {
      const data = await this.get<any>(this.requireDefaultDs(), '/alertmanager/api/v2/alerts');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alerts via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerAlertGroups(): Promise<AlertmanagerAlertGroup[]> {
    try {
      const data = await this.get<any>(this.requireDefaultDs(), '/alertmanager/api/v2/alerts/groups');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alert groups via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerReceivers(): Promise<AlertmanagerReceiver[]> {
    try {
      const data = await this.get<any>(this.requireDefaultDs(), '/alertmanager/api/v2/receivers');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager receivers via direct query: ${err}`);
      return [];
    }
  }

  async getSilences(): Promise<AlertmanagerSilence[]> {
    try {
      const data = await this.get<any>(this.requireDefaultDs(), '/alertmanager/api/v2/silences');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager silences via direct query: ${err}`);
      return [];
    }
  }

  async createSilence(silence: AlertmanagerSilence): Promise<string> {
    const data = await this.post<any>(this.requireDefaultDs(), '/alertmanager/api/v2/silences', silence);
    if (typeof data === 'string') return data;
    return data?.silenceID || data?.silenceId || '';
  }

  async deleteSilence(silenceId: string): Promise<boolean> {
    try {
      await this.del(this.requireDefaultDs(), `/alertmanager/api/v2/silence/${encodeURIComponent(silenceId)}`);
      return true;
    } catch {
      return false;
    }
  }

  async getAlertmanagerStatus(): Promise<AlertmanagerStatus> {
    return this.get<AlertmanagerStatus>(this.requireDefaultDs(), '/alertmanager/api/v2/status');
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private mapRule(r: any): PromRule {
    if (r.type === 'recording' || r.record) {
      return {
        type: 'recording',
        name: r.name || r.record || '',
        query: r.query || r.expr || '',
        labels: r.labels || {},
        health: r.health || 'unknown',
        lastEvaluation: r.lastEvaluation,
        evaluationTime: r.evaluationTime,
      } as PromRecordingRule;
    }

    const name = r.name || r.alert || '';
    const query = r.query || r.expr || '';
    const duration = typeof r.duration === 'number'
      ? r.duration
      : this.parseDurationToSeconds(r.for || r.duration || '0s');

    return {
      type: 'alerting',
      name,
      query,
      duration,
      labels: r.labels || {},
      annotations: r.annotations || {},
      alerts: (r.alerts || []).map((a: any) => this.mapAlert(a)),
      health: r.health || 'unknown',
      state: r.state || 'inactive',
      lastEvaluation: r.lastEvaluation,
      evaluationTime: r.evaluationTime,
    } as PromAlertingRule;
  }

  private parseDurationToSeconds(dur: string): number {
    if (!dur || dur === '0s') return 0;
    let total = 0;
    const hours = dur.match(/(\d+)h/);
    const mins = dur.match(/(\d+)m(?!s)/);
    const secs = dur.match(/(\d+)s/);
    if (hours) total += parseInt(hours[1], 10) * 3600;
    if (mins) total += parseInt(mins[1], 10) * 60;
    if (secs) total += parseInt(secs[1], 10);
    return total;
  }

  private mapAlert(a: any): PromAlert {
    return {
      labels: a.labels || {},
      annotations: a.annotations || {},
      state: a.state || 'inactive',
      activeAt: a.activeAt || '',
      value: a.value ?? '',
    };
  }
}
