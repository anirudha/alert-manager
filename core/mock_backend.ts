/**
 * Mock backends — simulate real OpenSearch Alerting and Prometheus API responses.
 */
import {
  Datasource,
  Logger,
  OpenSearchBackend,
  PrometheusBackend,
  OSMonitor,
  OSAlert,
  OSAlertState,
  OSDestination,
  OSTrigger,
  PromAlert,
  PromAlertState,
  PromAlertingRule,
  PromRuleGroup,
  PromRuleHealth,
} from './types';

let idCounter = 100;
const nextId = () => `mock-${++idCounter}`;

// ============================================================================
// Mock OpenSearch Alerting Backend
// ============================================================================

export class MockOpenSearchBackend implements OpenSearchBackend {
  readonly type = 'opensearch' as const;
  private monitors: Map<string, Map<string, OSMonitor>> = new Map(); // dsId -> monitorId -> monitor
  private alerts: Map<string, OSAlert[]> = new Map(); // dsId -> alerts
  private destinations: Map<string, Map<string, OSDestination>> = new Map();

  constructor(private readonly logger: Logger) {}

  // --- Monitors ---

  async getMonitors(ds: Datasource): Promise<OSMonitor[]> {
    return Array.from(this.monitors.get(ds.id)?.values() ?? []);
  }

  async getMonitor(ds: Datasource, monitorId: string): Promise<OSMonitor | null> {
    return this.monitors.get(ds.id)?.get(monitorId) ?? null;
  }

  async createMonitor(ds: Datasource, input: Omit<OSMonitor, 'id'>): Promise<OSMonitor> {
    const id = nextId();
    const monitor: OSMonitor = { ...input, id };
    if (!this.monitors.has(ds.id)) this.monitors.set(ds.id, new Map());
    this.monitors.get(ds.id)!.set(id, monitor);
    this.logger.info(`[OS Mock] Created monitor ${id} for ${ds.id}`);
    return monitor;
  }

  async updateMonitor(ds: Datasource, monitorId: string, input: Partial<OSMonitor>): Promise<OSMonitor | null> {
    const m = this.monitors.get(ds.id)?.get(monitorId);
    if (!m) return null;
    Object.assign(m, input, { last_update_time: Date.now() });
    return m;
  }

  async deleteMonitor(ds: Datasource, monitorId: string): Promise<boolean> {
    return this.monitors.get(ds.id)?.delete(monitorId) ?? false;
  }

  async runMonitor(_ds: Datasource, _monitorId: string, _dryRun?: boolean): Promise<any> {
    return { ok: true };
  }

  // --- Alerts ---

  async getAlerts(ds: Datasource): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    const alerts = this.alerts.get(ds.id) ?? [];
    return { alerts, totalAlerts: alerts.length };
  }

  async acknowledgeAlerts(ds: Datasource, _monitorId: string, alertIds: string[]): Promise<any> {
    const alerts = this.alerts.get(ds.id) ?? [];
    for (const a of alerts) {
      if (alertIds.includes(a.id)) {
        a.state = 'ACKNOWLEDGED';
        a.acknowledged_time = Date.now();
      }
    }
    return { success: true };
  }

  // --- Destinations ---

  async getDestinations(ds: Datasource): Promise<OSDestination[]> {
    return Array.from(this.destinations.get(ds.id)?.values() ?? []);
  }

  async createDestination(ds: Datasource, input: Omit<OSDestination, 'id'>): Promise<OSDestination> {
    const id = nextId();
    const dest: OSDestination = { ...input, id };
    if (!this.destinations.has(ds.id)) this.destinations.set(ds.id, new Map());
    this.destinations.get(ds.id)!.set(id, dest);
    return dest;
  }

  async deleteDestination(ds: Datasource, destId: string): Promise<boolean> {
    return this.destinations.get(ds.id)?.delete(destId) ?? false;
  }

  // --- Seeding ---

  seed(dsId: string): void {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60_000;
    const oneHourAgo = now - 60 * 60_000;
    const oneDayAgo = now - 24 * 60 * 60_000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60_000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60_000;

    // Destinations
    if (!this.destinations.has(dsId)) this.destinations.set(dsId, new Map());
    const slackDest: OSDestination = {
      id: nextId(), type: 'slack', name: 'ops-alerts-slack',
      last_update_time: now, slack: { url: 'https://hooks.slack.com/services/xxx' },
    };
    const emailDest: OSDestination = {
      id: nextId(), type: 'email', name: 'oncall-email',
      last_update_time: now, email: { recipients: ['oncall@example.com'] },
    };
    this.destinations.get(dsId)!.set(slackDest.id, slackDest);
    this.destinations.get(dsId)!.set(emailDest.id, emailDest);

    // Monitors
    if (!this.monitors.has(dsId)) this.monitors.set(dsId, new Map());
    const monitors: OSMonitor[] = [
      {
        id: nextId(), type: 'monitor', monitor_type: 'query_level_monitor',
        name: 'High Error Rate', enabled: true, last_update_time: now,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['logs-*'], query: { query: { bool: { filter: [{ range: { '@timestamp': { gte: '{{period_end}}||-5m', lte: '{{period_end}}', format: 'epoch_millis' } } }] } }, size: 0, aggs: { error_count: { filter: { range: { status: { gte: 500 } } } } } } } }],
        triggers: [{
          id: nextId(), name: 'Error count > 100', severity: '1',
          condition: { script: { source: 'ctx.results[0].aggregations.error_count.doc_count > 100', lang: 'painless' } },
          actions: [{ id: nextId(), name: 'Notify Slack', destination_id: slackDest.id, message_template: { source: 'High error rate: {{ctx.results[0].aggregations.error_count.doc_count}} errors in last 5m' }, throttle_enabled: true, throttle: { value: 10, unit: 'MINUTES' } }],
        }],
      },
      {
        id: nextId(), type: 'monitor', monitor_type: 'query_level_monitor',
        name: 'Slow Response Time', enabled: true, last_update_time: now,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['apm-*'], query: { query: { bool: { filter: [{ range: { '@timestamp': { gte: '{{period_end}}||-10m', lte: '{{period_end}}', format: 'epoch_millis' } } }] } }, size: 0, aggs: { avg_latency: { avg: { field: 'transaction.duration.us' } } } } } }],
        triggers: [{
          id: nextId(), name: 'Avg latency > 5s', severity: '2',
          condition: { script: { source: 'ctx.results[0].aggregations.avg_latency.value > 5000000', lang: 'painless' } },
          actions: [{ id: nextId(), name: 'Notify Slack', destination_id: slackDest.id, message_template: { source: 'Slow responses: avg {{ctx.results[0].aggregations.avg_latency.value}}us' }, throttle_enabled: false }],
        }],
      },
      {
        id: nextId(), type: 'monitor', monitor_type: 'bucket_level_monitor',
        name: 'Disk Usage by Host', enabled: false, last_update_time: oneHourAgo,
        schedule: { period: { interval: 15, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['metrics-*'], query: { size: 0, query: { match_all: {} }, aggs: { hosts: { terms: { field: 'host.name' }, aggs: { disk_pct: { avg: { field: 'system.filesystem.used.pct' } } } } } } } }],
        triggers: [{
          id: nextId(), name: 'Disk > 90%', severity: '2',
          condition: { script: { source: 'params._count > 0 && params.disk_pct > 0.9', lang: 'painless' } },
          actions: [],
        }],
      },
      {
        id: nextId(), type: 'monitor', monitor_type: 'query_level_monitor',
        name: 'Authentication Failures', enabled: true, last_update_time: oneDayAgo,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['security-*'], query: { query: { bool: { filter: [{ term: { 'event.action': 'authentication_failure' } }] } }, size: 0 } } }],
        triggers: [{
          id: nextId(), name: 'Auth failures > 50', severity: '1',
          condition: { script: { source: 'ctx.results[0].hits.total.value > 50', lang: 'painless' } },
          actions: [
            { id: nextId(), name: 'Notify Slack', destination_id: slackDest.id, message_template: { source: 'Auth failures spike detected' }, throttle_enabled: true, throttle: { value: 15, unit: 'MINUTES' } },
            { id: nextId(), name: 'Email Oncall', destination_id: emailDest.id, message_template: { source: 'Auth failures spike detected' }, throttle_enabled: false },
          ],
        }],
      },
      {
        id: nextId(), type: 'monitor', monitor_type: 'query_level_monitor',
        name: 'Payment Processing Errors', enabled: true, last_update_time: threeDaysAgo,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['payments-*'], query: { query: { bool: { filter: [{ term: { 'status': 'failed' } }] } }, size: 0 } } }],
        triggers: [{
          id: nextId(), name: 'Payment errors > 10', severity: '1',
          condition: { script: { source: 'ctx.results[0].hits.total.value > 10', lang: 'painless' } },
          actions: [{ id: nextId(), name: 'Email Oncall', destination_id: emailDest.id, message_template: { source: 'Payment processing errors detected' }, throttle_enabled: false }],
        }],
      },
      {
        id: nextId(), type: 'monitor', monitor_type: 'doc_level_monitor',
        name: 'Log Anomaly Detection', enabled: true, last_update_time: oneWeekAgo,
        schedule: { period: { interval: 10, unit: 'MINUTES' } },
        inputs: [{ search: { indices: ['logs-*'], query: { query: { match_all: {} }, size: 100 } } }],
        triggers: [{
          id: nextId(), name: 'Anomaly score > 0.8', severity: '3',
          condition: { script: { source: 'ctx.results[0].anomaly_score > 0.8', lang: 'painless' } },
          actions: [{ id: nextId(), name: 'Notify Slack', destination_id: slackDest.id, message_template: { source: 'Log anomaly detected' }, throttle_enabled: true, throttle: { value: 30, unit: 'MINUTES' } }],
        }],
      },
    ];
    for (const m of monitors) this.monitors.get(dsId)!.set(m.id, m);

    // Alerts
    const osAlerts: OSAlert[] = [
      {
        id: nextId(), version: 1, monitor_id: monitors[0].id, monitor_name: monitors[0].name,
        monitor_version: 1, trigger_id: monitors[0].triggers[0].id, trigger_name: monitors[0].triggers[0].name,
        state: 'ACTIVE', severity: '1', error_message: null,
        start_time: fiveMinAgo, last_notification_time: now, end_time: null, acknowledged_time: null,
        action_execution_results: [{ action_id: monitors[0].triggers[0].actions[0].id, last_execution_time: now, throttled_count: 2 }],
      },
      {
        id: nextId(), version: 3, monitor_id: monitors[1].id, monitor_name: monitors[1].name,
        monitor_version: 1, trigger_id: monitors[1].triggers[0].id, trigger_name: monitors[1].triggers[0].name,
        state: 'ACKNOWLEDGED', severity: '2', error_message: null,
        start_time: oneHourAgo, last_notification_time: fiveMinAgo, end_time: null, acknowledged_time: fiveMinAgo,
        action_execution_results: [],
      },
      {
        id: nextId(), version: 1, monitor_id: monitors[3].id, monitor_name: monitors[3].name,
        monitor_version: 1, trigger_id: monitors[3].triggers[0].id, trigger_name: monitors[3].triggers[0].name,
        state: 'ACTIVE', severity: '1', error_message: null,
        start_time: oneDayAgo, last_notification_time: now, end_time: null, acknowledged_time: null,
        action_execution_results: [],
      },
    ];
    this.alerts.set(dsId, osAlerts);
  }
}

// ============================================================================
// Mock Prometheus / AMP Backend
// ============================================================================

export class MockPrometheusBackend implements PrometheusBackend {
  readonly type = 'prometheus' as const;
  private ruleGroups: Map<string, PromRuleGroup[]> = new Map();
  private activeAlerts: Map<string, PromAlert[]> = new Map();

  constructor(private readonly logger: Logger) {}

  async getRuleGroups(ds: Datasource): Promise<PromRuleGroup[]> {
    return this.ruleGroups.get(ds.id) ?? [];
  }

  async getAlerts(ds: Datasource): Promise<PromAlert[]> {
    return this.activeAlerts.get(ds.id) ?? [];
  }

  // --- Seeding ---

  seed(dsId: string): void {
    const now = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    const groups: PromRuleGroup[] = [
      {
        name: 'node_alerts', file: '/etc/prometheus/rules/node.yml', interval: 60,
        rules: [
          {
            type: 'alerting', name: 'HighCpuUsage', health: 'ok', state: 'firing',
            query: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
            duration: 300,
            labels: { severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', application: 'platform' },
            annotations: { summary: 'CPU usage above 80% on {{ $labels.instance }}', description: 'CPU has been above 80% for more than 5 minutes.', runbook_url: 'https://wiki.example.com/runbooks/high-cpu' },
            alerts: [
              { labels: { alertname: 'HighCpuUsage', instance: 'i-0abc123:9100', severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1' }, annotations: { summary: 'CPU usage above 80% on i-0abc123:9100' }, state: 'firing', activeAt: fiveMinAgo, value: '92.3' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.003,
          },
          {
            type: 'alerting', name: 'HighMemoryUsage', health: 'ok', state: 'firing',
            query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90',
            duration: 600,
            labels: { severity: 'critical', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', application: 'platform' },
            annotations: { summary: 'Memory usage above 90% on {{ $labels.instance }}', runbook_url: 'https://wiki.example.com/runbooks/high-memory' },
            alerts: [
              { labels: { alertname: 'HighMemoryUsage', instance: 'i-0def456:9100', severity: 'critical', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1' }, annotations: { summary: 'Memory usage above 90% on i-0def456:9100' }, state: 'firing', activeAt: tenMinAgo, value: '94.7' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.002,
          },
          {
            type: 'alerting', name: 'DiskSpaceLow', health: 'ok', state: 'pending',
            query: '(node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 15',
            duration: 900,
            labels: { severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'staging', region: 'us-west-2', application: 'platform' },
            annotations: { summary: 'Disk space below 15% on {{ $labels.instance }}' },
            alerts: [
              { labels: { alertname: 'DiskSpaceLow', instance: 'i-0ghi789:9100', severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'staging', region: 'us-west-2' }, annotations: { summary: 'Disk space below 15% on i-0ghi789:9100' }, state: 'pending', activeAt: now, value: '12.1' },
            ],
            lastEvaluation: now, evaluationTime: 0.001,
          },
          {
            type: 'alerting', name: 'NetworkPacketDrops', health: 'ok', state: 'inactive',
            query: 'rate(node_network_receive_drop_total[5m]) > 100',
            duration: 300,
            labels: { severity: 'warning', team: 'network', service: 'node-exporter', environment: 'production', region: 'eu-west-1', application: 'platform' },
            annotations: { summary: 'Network packet drops detected on {{ $labels.instance }}' },
            alerts: [],
            lastEvaluation: oneHourAgo, evaluationTime: 0.001,
          },
        ],
      },
      {
        name: 'app_alerts', file: '/etc/prometheus/rules/app.yml', interval: 30,
        rules: [
          {
            type: 'alerting', name: 'HighErrorRate', health: 'ok', state: 'firing',
            query: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
            duration: 300,
            labels: { severity: 'critical', team: 'platform', service: 'api-gateway', environment: 'production', region: 'us-east-1', application: 'checkout' },
            annotations: { summary: 'Error rate above 5%', runbook_url: 'https://wiki.example.com/runbooks/high-error-rate', description: 'HTTP 5xx error rate has exceeded 5% for the last 5 minutes.' },
            alerts: [
              { labels: { alertname: 'HighErrorRate', severity: 'critical', team: 'platform', service: 'api-gateway', environment: 'production', region: 'us-east-1' }, annotations: { summary: 'Error rate above 5%' }, state: 'firing', activeAt: fiveMinAgo, value: '0.082' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.005,
          },
          {
            type: 'alerting', name: 'HighLatencyP99', health: 'ok', state: 'inactive',
            query: 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2',
            duration: 300,
            labels: { severity: 'warning', team: 'platform', service: 'api-gateway', environment: 'production', region: 'us-east-1', application: 'checkout' },
            annotations: { summary: 'P99 latency above 2s' },
            alerts: [],
            lastEvaluation: oneHourAgo, evaluationTime: 0.004,
          },
          {
            type: 'alerting', name: 'PodCrashLooping', health: 'ok', state: 'firing',
            query: 'rate(kube_pod_container_status_restarts_total[15m]) * 60 * 5 > 0',
            duration: 900,
            labels: { severity: 'critical', team: 'sre', service: 'kubernetes', environment: 'production', region: 'us-east-1', application: 'order-service' },
            annotations: { summary: 'Pod {{ $labels.pod }} is crash looping', description: 'Pod has restarted more than 5 times in the last 15 minutes.' },
            alerts: [
              { labels: { alertname: 'PodCrashLooping', severity: 'critical', team: 'sre', pod: 'order-service-7d4f8b-x2k9p', namespace: 'production', service: 'kubernetes', environment: 'production', region: 'us-east-1' }, annotations: { summary: 'Pod order-service-7d4f8b-x2k9p is crash looping' }, state: 'firing', activeAt: tenMinAgo, value: '3' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.002,
          },
          {
            type: 'alerting', name: 'DatabaseConnectionPoolExhausted', health: 'ok', state: 'inactive',
            query: 'db_connection_pool_available{} < 5',
            duration: 120,
            labels: { severity: 'critical', team: 'data', service: 'postgres', environment: 'production', region: 'us-east-1', application: 'user-service' },
            annotations: { summary: 'Database connection pool nearly exhausted', runbook_url: 'https://wiki.example.com/runbooks/db-pool' },
            alerts: [],
            lastEvaluation: oneDayAgo, evaluationTime: 0.001,
          },
          {
            type: 'alerting', name: 'CertificateExpiringSoon', health: 'ok', state: 'pending',
            query: '(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30',
            duration: 3600,
            labels: { severity: 'warning', team: 'security', service: 'blackbox-exporter', environment: 'production', region: 'us-east-1', application: 'platform' },
            annotations: { summary: 'TLS certificate expiring within 30 days for {{ $labels.instance }}' },
            alerts: [
              { labels: { alertname: 'CertificateExpiringSoon', severity: 'warning', team: 'security', instance: 'api.example.com:443', service: 'blackbox-exporter', environment: 'production', region: 'us-east-1' }, annotations: { summary: 'TLS certificate expiring within 30 days for api.example.com:443' }, state: 'pending', activeAt: oneDayAgo, value: '22' },
            ],
            lastEvaluation: oneHourAgo, evaluationTime: 0.001,
          },
        ],
      },
    ];

    this.ruleGroups.set(dsId, groups);

    // Active alerts = all firing/pending alerts from rules
    const active: PromAlert[] = [];
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.type === 'alerting') {
          for (const a of r.alerts) {
            if (a.state === 'firing' || a.state === 'pending') {
              active.push(a);
            }
          }
        }
      }
    }
    this.activeAlerts.set(dsId, active);
  }
}
