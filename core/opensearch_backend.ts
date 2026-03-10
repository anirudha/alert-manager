/**
 * Real OpenSearch Alerting backend — talks to _plugins/_alerting REST APIs.
 *
 * API reference: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */
import { HttpClient, buildAuthFromDatasource } from './http_client';
import {
  Datasource,
  Logger,
  OpenSearchBackend,
  OSMonitor,
  OSAlert,
  OSDestination,
} from './types';

export class HttpOpenSearchBackend implements OpenSearchBackend {
  readonly type = 'opensearch' as const;
  private readonly http: HttpClient;

  constructor(private readonly logger: Logger) {
    this.http = new HttpClient(logger);
  }

  // =========================================================================
  // Monitors
  // =========================================================================

  async getMonitors(ds: Datasource): Promise<OSMonitor[]> {
    const resp = await this.req<any>(ds, 'POST', '/_plugins/_alerting/monitors/_search', {
      query: { match_all: {} },
      size: 1000,
    });
    const hits = resp.body?.hits?.hits ?? [];
    return hits.map((hit: any) => this.mapMonitor(hit._id, hit._source));
  }

  async getMonitor(ds: Datasource, monitorId: string): Promise<OSMonitor | null> {
    try {
      const resp = await this.req<any>(ds, 'GET', `/_plugins/_alerting/monitors/${monitorId}`);
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }
  }

  async createMonitor(ds: Datasource, monitor: Omit<OSMonitor, 'id'>): Promise<OSMonitor> {
    const resp = await this.req<any>(ds, 'POST', '/_plugins/_alerting/monitors', {
      type: 'monitor',
      ...monitor,
    });
    return this.mapMonitor(resp.body._id, resp.body.monitor);
  }

  async updateMonitor(ds: Datasource, monitorId: string, input: Partial<OSMonitor>): Promise<OSMonitor | null> {
    // Fetch the current monitor so we can merge the partial update
    const current = await this.getMonitor(ds, monitorId);
    if (!current) return null;

    const { id: _id, ...currentFields } = current;
    const merged = { ...currentFields, ...input, last_update_time: Date.now() };

    try {
      const resp = await this.req<any>(ds, 'PUT', `/_plugins/_alerting/monitors/${monitorId}`, {
        type: 'monitor',
        ...merged,
      });
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }
  }

  async deleteMonitor(ds: Datasource, monitorId: string): Promise<boolean> {
    try {
      await this.req(ds, 'DELETE', `/_plugins/_alerting/monitors/${monitorId}`);
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  async runMonitor(ds: Datasource, monitorId: string, dryRun?: boolean): Promise<any> {
    const resp = await this.req<any>(ds, 'POST', `/_plugins/_alerting/monitors/${monitorId}/_execute`, {
      dryrun: dryRun ?? false,
    });
    return resp.body;
  }

  // =========================================================================
  // Alerts
  // =========================================================================

  async getAlerts(ds: Datasource): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    const resp = await this.req<any>(ds, 'GET', '/_plugins/_alerting/monitors/alerts?size=1000');
    const alerts: OSAlert[] = (resp.body.alerts ?? []).map((a: any) => this.mapAlert(a));
    return { alerts, totalAlerts: resp.body.totalAlerts ?? alerts.length };
  }

  async acknowledgeAlerts(ds: Datasource, monitorId: string, alertIds: string[]): Promise<any> {
    const resp = await this.req<any>(
      ds,
      'POST',
      `/_plugins/_alerting/monitors/${monitorId}/_acknowledge/alerts`,
      { alerts: alertIds },
    );
    return resp.body;
  }

  // =========================================================================
  // Destinations
  // =========================================================================

  async getDestinations(ds: Datasource): Promise<OSDestination[]> {
    const resp = await this.req<any>(ds, 'GET', '/_plugins/_alerting/destinations?size=200');
    return (resp.body.destinations ?? []).map((d: any) => this.mapDestination(d));
  }

  async createDestination(ds: Datasource, dest: Omit<OSDestination, 'id'>): Promise<OSDestination> {
    const resp = await this.req<any>(ds, 'POST', '/_plugins/_alerting/destinations', dest);
    return this.mapDestination({ id: resp.body._id, ...resp.body.destination });
  }

  async deleteDestination(ds: Datasource, destId: string): Promise<boolean> {
    try {
      await this.req(ds, 'DELETE', `/_plugins/_alerting/destinations/${destId}`);
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async req<T = any>(
    ds: Datasource,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ) {
    return this.http.request<T>({
      method,
      url: `${ds.url.replace(/\/+$/, '')}${path}`,
      body,
      auth: buildAuthFromDatasource(ds),
      rejectUnauthorized: false,
      timeoutMs: 10_000,
    });
  }

  private mapMonitor(id: string, source: any): OSMonitor {
    return {
      id,
      type: source.type || 'monitor',
      monitor_type: source.monitor_type || 'query_level_monitor',
      name: source.name || '',
      enabled: source.enabled ?? true,
      schedule: source.schedule || { period: { interval: 5, unit: 'MINUTES' } },
      inputs: source.inputs || [],
      triggers: (source.triggers || []).map((t: any) => this.mapTrigger(t)),
      last_update_time: source.last_update_time || Date.now(),
      schema_version: source.schema_version,
    };
  }

  private mapTrigger(t: any): any {
    // OpenSearch returns triggers in different formats depending on monitor_type
    // For query_level_monitor: { query_level_trigger: { ... } }
    // For bucket_level_monitor: { bucket_level_trigger: { ... } }
    // Normalize to flat trigger format
    const inner = t.query_level_trigger || t.bucket_level_trigger || t.doc_level_trigger || t;
    return {
      id: inner.id || '',
      name: inner.name || '',
      severity: String(inner.severity || '3'),
      condition: inner.condition || { script: { source: '', lang: 'painless' } },
      actions: (inner.actions || []).map((a: any) => ({
        id: a.id || '',
        name: a.name || '',
        destination_id: a.destination_id || '',
        message_template: a.message_template || { source: '' },
        subject_template: a.subject_template,
        throttle_enabled: a.throttle_enabled ?? false,
        throttle: a.throttle,
      })),
    };
  }

  private mapAlert(a: any): OSAlert {
    return {
      id: a.id || a.alert_id || '',
      version: a.version ?? 1,
      monitor_id: a.monitor_id || '',
      monitor_name: a.monitor_name || '',
      monitor_version: a.monitor_version ?? 1,
      trigger_id: a.trigger_id || '',
      trigger_name: a.trigger_name || '',
      state: a.state || 'ACTIVE',
      severity: String(a.severity || '3') as any,
      error_message: a.error_message || null,
      start_time: a.start_time || Date.now(),
      last_notification_time: a.last_notification_time || Date.now(),
      end_time: a.end_time || null,
      acknowledged_time: a.acknowledged_time || null,
      action_execution_results: a.action_execution_results || [],
    };
  }

  private mapDestination(d: any): OSDestination {
    return {
      id: d.id || '',
      type: d.type || 'custom_webhook',
      name: d.name || '',
      last_update_time: d.last_update_time || Date.now(),
      schema_version: d.schema_version,
      slack: d.slack,
      custom_webhook: d.custom_webhook,
      email: d.email,
    };
  }

  private is404(err: unknown): boolean {
    return String(err).includes('HTTP 404');
  }
}
