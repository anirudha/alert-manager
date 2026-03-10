/**
 * Real Prometheus backend — talks to the Prometheus HTTP API for rules/alerts,
 * and optionally registers Prometheus as a datasource in OpenSearch via the SQL plugin.
 *
 * Prometheus API: https://prometheus.io/docs/prometheus/latest/querying/api/
 * OpenSearch SQL datasource API: /_plugins/_query/_datasources
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
  AlertmanagerSilence,
  AlertmanagerStatus,
} from './types';

export class HttpPrometheusBackend implements PrometheusBackend {
  readonly type = 'prometheus' as const;
  private readonly http: HttpClient;
  private alertmanagerUrl?: string;

  constructor(private readonly logger: Logger, alertmanagerUrl?: string) {
    this.http = new HttpClient(logger);
    if (alertmanagerUrl) {
      this.alertmanagerUrl = alertmanagerUrl.replace(/\/+$/, '');
      this.logger.info(`Prometheus Alertmanager configured at ${this.alertmanagerUrl}`);
    }
  }

  // =========================================================================
  // Rules
  // =========================================================================

  async getRuleGroups(ds: Datasource): Promise<PromRuleGroup[]> {
    const baseUrl = ds.url.replace(/\/+$/, '');
    const resp = await this.http.request<any>({
      method: 'GET',
      url: `${baseUrl}/api/v1/rules?type=alert`,
      timeoutMs: 10_000,
    });

    if (resp.body?.status !== 'success') {
      throw new Error(`Prometheus rules API returned status: ${resp.body?.status}`);
    }

    const groups: PromRuleGroup[] = (resp.body.data?.groups ?? []).map((g: any) => ({
      name: g.name || '',
      file: g.file || '',
      interval: g.interval ?? 60,
      rules: (g.rules || []).map((r: any) => this.mapRule(r)),
    }));

    // If workspace-scoped, filter by workspace label or file path.
    // Skip filtering for the "default" workspace — it represents all rules.
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
  // Alerts
  // =========================================================================

  async getAlerts(ds: Datasource): Promise<PromAlert[]> {
    const baseUrl = ds.url.replace(/\/+$/, '');
    const resp = await this.http.request<any>({
      method: 'GET',
      url: `${baseUrl}/api/v1/alerts`,
      timeoutMs: 10_000,
    });

    if (resp.body?.status !== 'success') {
      throw new Error(`Prometheus alerts API returned status: ${resp.body?.status}`);
    }

    const alerts: PromAlert[] = (resp.body.data?.alerts ?? []).map((a: any) => this.mapAlert(a));

    // If workspace-scoped, filter by workspace label.
    // Skip filtering for the "default" workspace — it represents all alerts.
    if (ds.workspaceId && ds.workspaceId !== 'default') {
      return alerts.filter((a) => a.labels._workspace === ds.workspaceId);
    }

    return alerts;
  }

  // =========================================================================
  // Workspaces
  // =========================================================================

  async listWorkspaces(ds: Datasource): Promise<PrometheusWorkspace[]> {
    // For Amazon Managed Prometheus, parse workspace from URL
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

    // For standalone Prometheus, return a single default workspace
    return [
      {
        id: 'default',
        name: 'default',
        alias: 'Default',
        status: 'active',
      },
    ];
  }

  // =========================================================================
  // Alertmanager operations (prom/alertmanager API v2)
  // =========================================================================

  async getAlertmanagerAlerts(): Promise<AlertmanagerAlert[]> {
    if (!this.alertmanagerUrl) return [];
    const resp = await this.http.request<AlertmanagerAlert[]>({
      method: 'GET',
      url: `${this.alertmanagerUrl}/api/v2/alerts`,
      timeoutMs: 10_000,
    });
    return resp.body;
  }

  async getSilences(): Promise<AlertmanagerSilence[]> {
    if (!this.alertmanagerUrl) return [];
    const resp = await this.http.request<AlertmanagerSilence[]>({
      method: 'GET',
      url: `${this.alertmanagerUrl}/api/v2/silences`,
      timeoutMs: 10_000,
    });
    return resp.body;
  }

  async createSilence(silence: AlertmanagerSilence): Promise<string> {
    if (!this.alertmanagerUrl) throw new Error('Alertmanager URL not configured');
    const resp = await this.http.request<{ silenceID: string }>({
      method: 'POST',
      url: `${this.alertmanagerUrl}/api/v2/silences`,
      body: silence,
      timeoutMs: 10_000,
    });
    return resp.body.silenceID;
  }

  async deleteSilence(silenceId: string): Promise<boolean> {
    if (!this.alertmanagerUrl) throw new Error('Alertmanager URL not configured');
    try {
      await this.http.request({
        method: 'DELETE',
        url: `${this.alertmanagerUrl}/api/v2/silence/${silenceId}`,
        timeoutMs: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getAlertmanagerStatus(): Promise<AlertmanagerStatus> {
    if (!this.alertmanagerUrl) throw new Error('Alertmanager URL not configured');
    const resp = await this.http.request<AlertmanagerStatus>({
      method: 'GET',
      url: `${this.alertmanagerUrl}/api/v2/status`,
      timeoutMs: 10_000,
    });
    return resp.body;
  }

  // =========================================================================
  // OpenSearch SQL Plugin integration — register Prometheus as a datasource
  // =========================================================================

  /**
   * Register this Prometheus instance as a datasource in OpenSearch via the SQL plugin.
   * This enables querying Prometheus metrics via SQL/PPL through OpenSearch.
   *
   * Endpoint: POST /_plugins/_query/_datasources
   * Reference: https://github.com/opensearch-project/sql/blob/main/datasources/src/main/java/org/opensearch/sql/datasources/rest/RestDataSourceQueryAction.java
   */
  async registerInOpenSearch(
    opensearchUrl: string,
    promDs: Datasource,
    opensearchAuth?: { username: string; password: string },
  ): Promise<void> {
    const dsName = promDs.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const baseOsUrl = opensearchUrl.replace(/\/+$/, '');

    try {
      await this.http.request({
        method: 'POST',
        url: `${baseOsUrl}/_plugins/_query/_datasources`,
        body: {
          name: dsName,
          connector: 'prometheus',
          properties: {
            'prometheus.uri': promDs.url,
          },
        },
        auth: opensearchAuth,
        rejectUnauthorized: false,
        timeoutMs: 10_000,
      });
      this.logger.info(`Registered Prometheus datasource "${dsName}" in OpenSearch SQL plugin`);
    } catch (err) {
      // Might fail if already registered or if SQL plugin is not installed — log and continue
      this.logger.warn(
        `Could not register Prometheus in OpenSearch SQL plugin: ${err}. ` +
          'This is non-fatal; direct Prometheus queries will still work.',
      );
    }
  }

  /**
   * List Prometheus datasources registered in OpenSearch via the SQL plugin.
   *
   * Endpoint: GET /_plugins/_query/_datasources
   */
  async listOpenSearchDatasources(
    opensearchUrl: string,
    opensearchAuth?: { username: string; password: string },
  ): Promise<any[]> {
    const baseOsUrl = opensearchUrl.replace(/\/+$/, '');
    try {
      const resp = await this.http.request<any>({
        method: 'GET',
        url: `${baseOsUrl}/_plugins/_query/_datasources`,
        auth: opensearchAuth,
        rejectUnauthorized: false,
        timeoutMs: 10_000,
      });
      return Array.isArray(resp.body) ? resp.body : [];
    } catch (err) {
      this.logger.warn(`Could not list SQL plugin datasources: ${err}`);
      return [];
    }
  }

  /**
   * Execute a direct query against a Prometheus datasource registered in OpenSearch.
   *
   * Endpoint: POST /_plugins/_directquery/_query/{datasourceName}
   */
  async executeDirectQuery(
    opensearchUrl: string,
    datasourceName: string,
    query: string,
    opensearchAuth?: { username: string; password: string },
  ): Promise<any> {
    const baseOsUrl = opensearchUrl.replace(/\/+$/, '');
    const resp = await this.http.request<any>({
      method: 'POST',
      url: `${baseOsUrl}/_plugins/_directquery/_query/${encodeURIComponent(datasourceName)}`,
      body: { query },
      auth: opensearchAuth,
      rejectUnauthorized: false,
      timeoutMs: 30_000,
    });
    return resp.body;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private mapRule(r: any): PromRule {
    if (r.type === 'recording') {
      return {
        type: 'recording',
        name: r.name || '',
        query: r.query || '',
        labels: r.labels || {},
        health: r.health || 'unknown',
        lastEvaluation: r.lastEvaluation,
        evaluationTime: r.evaluationTime,
      } as PromRecordingRule;
    }

    return {
      type: 'alerting',
      name: r.name || '',
      query: r.query || '',
      duration: r.duration ?? 0,
      labels: r.labels || {},
      annotations: r.annotations || {},
      alerts: (r.alerts || []).map((a: any) => this.mapAlert(a)),
      health: r.health || 'unknown',
      state: r.state || 'inactive',
      lastEvaluation: r.lastEvaluation,
      evaluationTime: r.evaluationTime,
    } as PromAlertingRule;
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
