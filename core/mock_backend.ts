/**
 * Mock backends — simulate real OpenSearch Alerting and Prometheus API responses.
 */
import {
  Datasource,
  Logger,
  OpenSearchBackend,
  PrometheusBackend,
  PrometheusWorkspace,
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
  private workspaces: Map<string, PrometheusWorkspace[]> = new Map();

  constructor(private readonly logger: Logger) {}

  async getRuleGroups(ds: Datasource): Promise<PromRuleGroup[]> {
    // If workspace-scoped, filter by workspace
    if (ds.workspaceId) {
      const allGroups = this.ruleGroups.get(ds.parentDatasourceId || ds.id) ?? [];
      return allGroups.filter(g => g.file.includes(ds.workspaceId!));
    }
    return this.ruleGroups.get(ds.id) ?? [];
  }

  async getAlerts(ds: Datasource): Promise<PromAlert[]> {
    const dsKey = ds.parentDatasourceId || ds.id;
    const allAlerts = this.activeAlerts.get(dsKey) ?? [];
    if (ds.workspaceId) {
      return allAlerts.filter(a => a.labels._workspace === ds.workspaceId);
    }
    return allAlerts;
  }

  async listWorkspaces(ds: Datasource): Promise<PrometheusWorkspace[]> {
    return this.workspaces.get(ds.id) ?? [];
  }

  // --- Seeding ---

  seed(dsId: string): void {
    const now = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    // Create workspaces for this Prometheus datasource
    const wsProduction: PrometheusWorkspace = { id: 'ws-prod-001', name: 'production', alias: 'Production Monitoring', region: 'us-east-1', status: 'active' };
    const wsStaging: PrometheusWorkspace = { id: 'ws-staging-002', name: 'staging', alias: 'Staging Environment', region: 'us-west-2', status: 'active' };
    const wsDev: PrometheusWorkspace = { id: 'ws-dev-003', name: 'development', alias: 'Dev/Test', region: 'us-west-2', status: 'active' };
    this.workspaces.set(dsId, [wsProduction, wsStaging, wsDev]);

    const states: PromAlertState[] = ['firing', 'pending', 'inactive'];
    const severities = ['critical', 'warning', 'info'];
    const teams = ['infra', 'platform', 'sre', 'data', 'security', 'network'];
    const services = ['node-exporter', 'api-gateway', 'kubernetes', 'postgres', 'redis', 'kafka', 'nginx', 'blackbox-exporter'];
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];

    const allGroups: PromRuleGroup[] = [];

    // Helper to generate rules for a workspace
    const generateWorkspaceRules = (wsId: string, wsName: string, ruleCount: number) => {
      const groupCount = Math.ceil(ruleCount / 5);
      for (let g = 0; g < groupCount; g++) {
        const groupName = `${wsName}_alerts_group_${g}`;
        const rules: PromAlertingRule[] = [];
        const rulesInGroup = Math.min(5, ruleCount - g * 5);

        for (let r = 0; r < rulesInGroup; r++) {
          const idx = g * 5 + r;
          const sev = severities[idx % severities.length];
          const team = teams[idx % teams.length];
          const service = services[idx % services.length];
          const region = regions[idx % regions.length];
          const state = idx < 3 ? 'firing' : idx < 6 ? 'pending' : 'inactive';
          const ruleName = `${wsName}_rule_${idx}_${service}`;

          const alerts: PromAlert[] = [];
          if (state === 'firing' || state === 'pending') {
            alerts.push({
              labels: {
                alertname: ruleName, severity: sev, team, service,
                environment: wsName, region, instance: `i-${idx.toString(16).padStart(7, '0')}:9100`,
                _workspace: wsId,
              },
              annotations: { summary: `${ruleName} on ${service}` },
              state,
              activeAt: state === 'firing' ? fiveMinAgo : now,
              value: `${(Math.random() * 100).toFixed(1)}`,
            });
          }

          rules.push({
            type: 'alerting', name: ruleName, health: 'ok', state,
            query: `some_metric{service="${service}",workspace="${wsName}"} > ${50 + idx}`,
            duration: 300,
            labels: { severity: sev, team, service, environment: wsName, region, application: 'platform', _workspace: wsId },
            annotations: { summary: `${ruleName} alert on ${service}` },
            alerts,
            lastEvaluation: fiveMinAgo, evaluationTime: 0.002,
          });
        }

        allGroups.push({
          name: groupName, file: `/etc/prometheus/rules/${wsId}/${wsName}_${g}.yml`,
          interval: 60, rules,
        });
      }
    };

    // Production: 30 rules, Staging: 15 rules, Dev: 10 rules = 55 total
    generateWorkspaceRules(wsProduction.id, 'production', 30);
    generateWorkspaceRules(wsStaging.id, 'staging', 15);
    generateWorkspaceRules(wsDev.id, 'development', 10);

    // Also add the original hand-crafted rules for production workspace
    const handcraftedGroups: PromRuleGroup[] = [
      {
        name: 'node_alerts', file: `/etc/prometheus/rules/${wsProduction.id}/node.yml`, interval: 60,
        rules: [
          {
            type: 'alerting', name: 'HighCpuUsage', health: 'ok', state: 'firing',
            query: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
            duration: 300,
            labels: { severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', application: 'platform', _workspace: wsProduction.id },
            annotations: { summary: 'CPU usage above 80% on {{ $labels.instance }}', runbook_url: 'https://wiki.example.com/runbooks/high-cpu' },
            alerts: [
              { labels: { alertname: 'HighCpuUsage', instance: 'i-0abc123:9100', severity: 'warning', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', _workspace: wsProduction.id }, annotations: { summary: 'CPU usage above 80% on i-0abc123:9100' }, state: 'firing', activeAt: fiveMinAgo, value: '92.3' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.003,
          },
          {
            type: 'alerting', name: 'HighMemoryUsage', health: 'ok', state: 'firing',
            query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90',
            duration: 600,
            labels: { severity: 'critical', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', application: 'platform', _workspace: wsProduction.id },
            annotations: { summary: 'Memory usage above 90% on {{ $labels.instance }}', runbook_url: 'https://wiki.example.com/runbooks/high-memory' },
            alerts: [
              { labels: { alertname: 'HighMemoryUsage', instance: 'i-0def456:9100', severity: 'critical', team: 'infra', service: 'node-exporter', environment: 'production', region: 'us-east-1', _workspace: wsProduction.id }, annotations: { summary: 'Memory usage above 90% on i-0def456:9100' }, state: 'firing', activeAt: tenMinAgo, value: '94.7' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.002,
          },
        ],
      },
      {
        name: 'app_alerts', file: `/etc/prometheus/rules/${wsProduction.id}/app.yml`, interval: 30,
        rules: [
          {
            type: 'alerting', name: 'HighErrorRate', health: 'ok', state: 'firing',
            query: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
            duration: 300,
            labels: { severity: 'critical', team: 'platform', service: 'api-gateway', environment: 'production', region: 'us-east-1', application: 'checkout', _workspace: wsProduction.id },
            annotations: { summary: 'Error rate above 5%', runbook_url: 'https://wiki.example.com/runbooks/high-error-rate' },
            alerts: [
              { labels: { alertname: 'HighErrorRate', severity: 'critical', team: 'platform', service: 'api-gateway', environment: 'production', region: 'us-east-1', _workspace: wsProduction.id }, annotations: { summary: 'Error rate above 5%' }, state: 'firing', activeAt: fiveMinAgo, value: '0.082' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.005,
          },
          {
            type: 'alerting', name: 'PodCrashLooping', health: 'ok', state: 'firing',
            query: 'rate(kube_pod_container_status_restarts_total[15m]) * 60 * 5 > 0',
            duration: 900,
            labels: { severity: 'critical', team: 'sre', service: 'kubernetes', environment: 'production', region: 'us-east-1', application: 'order-service', _workspace: wsProduction.id },
            annotations: { summary: 'Pod {{ $labels.pod }} is crash looping' },
            alerts: [
              { labels: { alertname: 'PodCrashLooping', severity: 'critical', team: 'sre', pod: 'order-service-7d4f8b-x2k9p', namespace: 'production', service: 'kubernetes', environment: 'production', region: 'us-east-1', _workspace: wsProduction.id }, annotations: { summary: 'Pod order-service-7d4f8b-x2k9p is crash looping' }, state: 'firing', activeAt: tenMinAgo, value: '3' },
            ],
            lastEvaluation: fiveMinAgo, evaluationTime: 0.002,
          },
        ],
      },
    ];

    allGroups.push(...handcraftedGroups);
    this.ruleGroups.set(dsId, allGroups);

    // Active alerts = all firing/pending alerts from all rules
    const active: PromAlert[] = [];
    for (const g of allGroups) {
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
