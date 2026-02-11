/**
 * Core types for the Alert Manager plugin.
 *
 * OpenSearch types match: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 * Prometheus types match: https://prometheus.io/docs/prometheus/latest/querying/api/
 */

// ============================================================================
// Datasource
// ============================================================================

export type DatasourceType = 'opensearch' | 'prometheus';

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  url: string;
  enabled: boolean;
  auth?: {
    type: 'basic' | 'apikey' | 'sigv4';
    credentials?: Record<string, string>;
  };
}

// ============================================================================
// OpenSearch Alerting types
// (mirrors _plugins/_alerting API shapes)
// ============================================================================

export interface OSSchedule {
  period: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
}

export interface OSAction {
  id: string;
  name: string;
  destination_id: string;
  message_template: { source: string; lang?: string };
  subject_template?: { source: string; lang?: string };
  throttle_enabled: boolean;
  throttle?: { value: number; unit: 'MINUTES' };
}

export interface OSTrigger {
  id: string;
  name: string;
  severity: '1' | '2' | '3' | '4' | '5';
  condition: { script: { source: string; lang: string } };
  actions: OSAction[];
}

export interface OSMonitorInput {
  search: {
    indices: string[];
    query: Record<string, any>;
  };
}

export interface OSMonitor {
  id: string;
  type: 'monitor';
  monitor_type: 'query_level_monitor' | 'bucket_level_monitor' | 'doc_level_monitor';
  name: string;
  enabled: boolean;
  schedule: OSSchedule;
  inputs: OSMonitorInput[];
  triggers: OSTrigger[];
  last_update_time: number;
  schema_version?: number;
}

export type OSAlertState = 'ACTIVE' | 'ACKNOWLEDGED' | 'COMPLETED' | 'ERROR' | 'DELETED';

export interface OSAlert {
  id: string;
  version: number;
  monitor_id: string;
  monitor_name: string;
  monitor_version: number;
  trigger_id: string;
  trigger_name: string;
  state: OSAlertState;
  severity: '1' | '2' | '3' | '4' | '5';
  error_message: string | null;
  start_time: number;
  last_notification_time: number;
  end_time: number | null;
  acknowledged_time: number | null;
  action_execution_results: Array<{
    action_id: string;
    last_execution_time: number;
    throttled_count: number;
  }>;
}

export interface OSDestination {
  id: string;
  type: 'slack' | 'email' | 'custom_webhook' | 'chime';
  name: string;
  last_update_time: number;
  schema_version?: number;
  slack?: { url: string };
  custom_webhook?: Record<string, any>;
  email?: Record<string, any>;
}

// ============================================================================
// Prometheus / AMP Alerting types
// (mirrors /api/v1/rules and /api/v1/alerts)
// ============================================================================

export type PromAlertState = 'firing' | 'pending' | 'inactive';
export type PromRuleHealth = 'ok' | 'err' | 'unknown';

export interface PromAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: PromAlertState;
  activeAt: string;
  value: string;
}

export interface PromAlertingRule {
  name: string;
  query: string;
  duration: number; // seconds
  labels: Record<string, string>;
  annotations: Record<string, string>;
  alerts: PromAlert[];
  health: PromRuleHealth;
  type: 'alerting';
  state: PromAlertState;
  lastEvaluation?: string;
  evaluationTime?: number;
}

export interface PromRecordingRule {
  name: string;
  query: string;
  labels: Record<string, string>;
  health: PromRuleHealth;
  type: 'recording';
  lastEvaluation?: string;
  evaluationTime?: number;
}

export type PromRule = PromAlertingRule | PromRecordingRule;

export interface PromRuleGroup {
  name: string;
  file: string;
  rules: PromRule[];
  interval: number; // seconds
}

// ============================================================================
// Service interfaces
// ============================================================================

/** OpenSearch Alerting backend */
export interface OpenSearchBackend {
  readonly type: 'opensearch';

  // Monitors
  getMonitors(ds: Datasource): Promise<OSMonitor[]>;
  getMonitor(ds: Datasource, monitorId: string): Promise<OSMonitor | null>;
  createMonitor(ds: Datasource, monitor: Omit<OSMonitor, 'id'>): Promise<OSMonitor>;
  updateMonitor(ds: Datasource, monitorId: string, monitor: Partial<OSMonitor>): Promise<OSMonitor | null>;
  deleteMonitor(ds: Datasource, monitorId: string): Promise<boolean>;
  runMonitor(ds: Datasource, monitorId: string, dryRun?: boolean): Promise<any>;

  // Alerts
  getAlerts(ds: Datasource): Promise<{ alerts: OSAlert[]; totalAlerts: number }>;
  acknowledgeAlerts(ds: Datasource, monitorId: string, alertIds: string[]): Promise<any>;

  // Destinations
  getDestinations(ds: Datasource): Promise<OSDestination[]>;
  createDestination(ds: Datasource, dest: Omit<OSDestination, 'id'>): Promise<OSDestination>;
  deleteDestination(ds: Datasource, destId: string): Promise<boolean>;
}

/** Prometheus / AMP backend */
export interface PrometheusBackend {
  readonly type: 'prometheus';

  // Rules (read-only from Prometheus API; AMP supports write via ruler API)
  getRuleGroups(ds: Datasource): Promise<PromRuleGroup[]>;

  // Active alerts
  getAlerts(ds: Datasource): Promise<PromAlert[]>;
}

export interface DatasourceService {
  list(): Promise<Datasource[]>;
  get(id: string): Promise<Datasource | null>;
  create(input: Omit<Datasource, 'id'>): Promise<Datasource>;
  update(id: string, input: Partial<Datasource>): Promise<Datasource | null>;
  delete(id: string): Promise<boolean>;
  testConnection(id: string): Promise<{ success: boolean; message: string }>;
}

// ============================================================================
// Unified view types (for the UI to consume across backends)
// ============================================================================

export type UnifiedAlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type UnifiedAlertState = 'active' | 'pending' | 'acknowledged' | 'resolved' | 'error';

export interface UnifiedAlert {
  id: string;
  datasourceId: string;
  datasourceType: DatasourceType;
  name: string;
  state: UnifiedAlertState;
  severity: UnifiedAlertSeverity;
  message?: string;
  startTime: string;
  lastUpdated: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  // Original backend-specific data
  raw: OSAlert | PromAlert;
}

export type MonitorType = 'metric' | 'log' | 'apm' | 'composite' | 'infrastructure' | 'synthetics';
export type MonitorStatus = 'active' | 'pending' | 'muted' | 'disabled';
export type MonitorHealthStatus = 'healthy' | 'failing' | 'no_data';

export interface SuppressionRule {
  id: string;
  name: string;
  reason: string;
  schedule?: string; // e.g. "Sat 02:00-06:00 UTC"
  matchLabels?: Record<string, string>;
  active: boolean;
}

export interface AlertHistoryEntry {
  timestamp: string;
  state: UnifiedAlertState;
  value?: string;
  message?: string;
}

export interface NotificationRouting {
  channel: string; // e.g. "Slack", "Email", "PagerDuty"
  destination: string; // e.g. "#ops-alerts", "oncall@example.com"
  severity?: UnifiedAlertSeverity[];
  throttle?: string; // e.g. "10 minutes"
}

export interface UnifiedRule {
  id: string;
  datasourceId: string;
  datasourceType: DatasourceType;
  name: string;
  enabled: boolean;
  severity: UnifiedAlertSeverity;
  query: string;
  condition: string;
  group?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  // Extended fields for monitor management
  monitorType: MonitorType;
  status: MonitorStatus;
  healthStatus: MonitorHealthStatus;
  createdBy: string;
  createdAt: string;
  lastModified: string;
  lastTriggered?: string;
  notificationDestinations: string[];
  // Detail view fields
  description: string;
  aiSummary: string;
  evaluationInterval: string;
  pendingPeriod: string;
  firingPeriod?: string;
  lookbackPeriod?: string;
  threshold?: { operator: string; value: number; unit?: string };
  alertHistory: AlertHistoryEntry[];
  conditionPreviewData: Array<{ timestamp: number; value: number }>;
  notificationRouting: NotificationRouting[];
  suppressionRules: SuppressionRule[];
  // Original backend-specific data
  raw: OSMonitor | PromAlertingRule;
}

// ============================================================================
// Logger
// ============================================================================

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
