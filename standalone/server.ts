/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone Express server for the Alert Manager.
 * Supports OpenSearch Alerting and Prometheus/AMP backends with mock mode.
 */
import express from 'express';
import path from 'path';
import yaml from 'js-yaml';
import {
  InMemoryDatasourceService,
  MultiBackendAlertService,
  HttpOpenSearchBackend,
  DirectQueryPrometheusBackend,
  SuppressionRuleService,
  Logger,
  OpenSearchBackend,
  PrometheusBackend,
} from '../core';
import { MockOpenSearchBackend, MockPrometheusBackend } from '../core/testing';
import {
  handleListDatasources,
  handleGetDatasource,
  handleCreateDatasource,
  handleUpdateDatasource,
  handleDeleteDatasource,
  handleTestDatasource,
  handleGetOSMonitors,
  handleGetOSMonitor,
  handleCreateOSMonitor,
  handleUpdateOSMonitor,
  handleDeleteOSMonitor,
  handleGetOSAlerts,
  handleAcknowledgeOSAlerts,
  handleGetPromRuleGroups,
  handleGetPromAlerts,
  handleGetUnifiedAlerts,
  handleGetUnifiedRules,
  handleGetRuleDetail,
  handleGetAlertDetail,
} from '../server/routes/handlers';
import {
  handleCreateMonitor,
  handleUpdateMonitor,
  handleDeleteMonitor,
  handleImportMonitors,
  handleExportMonitors,
  handleListSuppressionRules,
  handleCreateSuppressionRule,
  handleUpdateSuppressionRule,
  handleDeleteSuppressionRule,
  handleAcknowledgeAlert,
  handleSilenceAlert,
} from '../server/routes/monitor_handlers';
import {
  handleListSLOs,
  handleCreateSLO,
  handleGetSLO,
  handleUpdateSLO,
  handleDeleteSLO,
  handlePreviewSLORules,
  handleGetSLOStatuses,
} from '../server/routes/slo_handlers';
import { SloService } from '../core/slo_service';

const PORT = process.env.PORT || 5603;
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Real backend configuration (used when MOCK_MODE is not 'true')
// All values are read from environment variables with safe defaults.
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'https://localhost:9200';
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || 'admin';
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || 'My_password_123!@#';

const logger: Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] ${msg}`),
};

// Initialize services
const datasourceService = new InMemoryDatasourceService(logger);
const alertService = new MultiBackendAlertService(datasourceService, logger);

let osBackend: OpenSearchBackend;
let promBackend: PrometheusBackend;

/**
 * Initialize backends. In live mode, auto-discovers Prometheus datasources
 * registered in the OpenSearch SQL plugin — no hardcoded names needed.
 */
async function initBackends(): Promise<void> {
  if (MOCK_MODE) {
    logger.info('Running in MOCK MODE — seeding sample datasources');

    const mockOs = new MockOpenSearchBackend(logger);
    const mockProm = new MockPrometheusBackend(logger);
    osBackend = mockOs;
    promBackend = mockProm;

    datasourceService.seed([
      {
        name: 'OpenSearch Production',
        type: 'opensearch',
        url: 'https://opensearch.example.com:9200',
        enabled: true,
      },
      {
        name: 'Prometheus US-East (AMP)',
        type: 'prometheus',
        url: 'https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx',
        enabled: true,
      },
      {
        name: 'OpenSearch Staging',
        type: 'opensearch',
        url: 'https://opensearch-staging.example.com:9200',
        enabled: true,
      },
    ]);

    mockOs.seed('ds-1');
    mockOs.seed('ds-3');
    mockProm.seed('ds-2');

    // Seed SLO data for Prometheus datasource
    await sloService.seed('ds-2');
  } else {
    logger.info('Running in LIVE MODE — connecting to real backends');
    logger.info(`  OpenSearch: ${OPENSEARCH_URL}`);

    osBackend = new HttpOpenSearchBackend(logger);

    // DirectQuery backend handles all Prometheus/Alertmanager API calls via OpenSearch
    const dqBackend = new DirectQueryPrometheusBackend(logger, {
      opensearchUrl: OPENSEARCH_URL,
      auth: { username: OPENSEARCH_USERNAME, password: OPENSEARCH_PASSWORD },
    });
    promBackend = dqBackend;

    // Seed the OpenSearch datasource (always present)
    datasourceService.seed([
      {
        name: 'OpenSearch',
        type: 'opensearch',
        url: OPENSEARCH_URL,
        enabled: true,
        auth: {
          type: 'basic',
          credentials: { username: OPENSEARCH_USERNAME, password: OPENSEARCH_PASSWORD },
        },
      },
    ]);

    // Auto-discover Prometheus datasources registered in the OpenSearch SQL plugin.
    // Each PROMETHEUS connector becomes a datasource entry with directQueryName set.
    logger.info('Discovering Prometheus datasources from OpenSearch SQL plugin...');
    const discovered = await dqBackend.discoverDatasources();

    if (discovered.length > 0) {
      datasourceService.seed(discovered);
      // Set the first discovered datasource as the default for alertmanager operations
      const firstDs = await datasourceService.list();
      const firstProm = firstDs.find((d) => d.type === 'prometheus');
      if (firstProm) {
        dqBackend.setDefaultDatasource(firstProm);
      }
    } else {
      logger.warn(
        'No Prometheus datasources found in OpenSearch SQL plugin. ' +
          'Register one via POST /_plugins/_query/_datasources with connector=PROMETHEUS.'
      );
    }
  }

  alertService.registerOpenSearch(osBackend);
  alertService.registerPrometheus(promBackend);
  datasourceService.setPrometheusBackend(promBackend);
}

// Suppression service
const suppressionService = new SuppressionRuleService();

// SLO service (mockMode aligns with MOCK_MODE env var)
const sloService = new SloService(logger, MOCK_MODE);

const app = express();
app.use(express.json());

// Serve static React build
// npm (compiled): __dirname = dist/standalone/ → ../public = dist/public/ ✓
// dev (ts-node):  __dirname = standalone/     → dist/public              ✓
import fs from 'fs';
const npmPublicPath = path.join(__dirname, '..', 'public');
const devPublicPath = path.join(__dirname, 'dist', 'public');
const publicPath = fs.existsSync(npmPublicPath + '/index.html') ? npmPublicPath : devPublicPath;
app.use(express.static(publicPath));

// ============================================================================
// Datasource Routes
// ============================================================================

app.get('/api/datasources', async (_req, res) => {
  const r = await handleListDatasources(datasourceService);
  res.status(r.status).json(r.body);
});
app.get('/api/datasources/:id', async (req, res) => {
  const r = await handleGetDatasource(datasourceService, req.params.id);
  res.status(r.status).json(r.body);
});
app.post('/api/datasources', async (req, res) => {
  const r = await handleCreateDatasource(datasourceService, req.body);
  res.status(r.status).json(r.body);
});
app.put('/api/datasources/:id', async (req, res) => {
  const r = await handleUpdateDatasource(datasourceService, req.params.id, req.body);
  res.status(r.status).json(r.body);
});
app.delete('/api/datasources/:id', async (req, res) => {
  const r = await handleDeleteDatasource(datasourceService, req.params.id);
  res.status(r.status).json(r.body);
});
app.post('/api/datasources/:id/test', async (req, res) => {
  const r = await handleTestDatasource(datasourceService, req.params.id);
  res.status(r.status).json(r.body);
});

// ============================================================================
// OpenSearch Alerting Routes (native API shape)
// ============================================================================

app.get('/api/datasources/:dsId/monitors', async (req, res) => {
  const r = await handleGetOSMonitors(alertService, req.params.dsId);
  res.status(r.status).json(r.body);
});
app.get('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => {
  const r = await handleGetOSMonitor(alertService, req.params.dsId, req.params.monitorId);
  res.status(r.status).json(r.body);
});
app.post('/api/datasources/:dsId/monitors', async (req, res) => {
  const r = await handleCreateOSMonitor(alertService, req.params.dsId, req.body);
  res.status(r.status).json(r.body);
});
app.put('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => {
  const r = await handleUpdateOSMonitor(
    alertService,
    req.params.dsId,
    req.params.monitorId,
    req.body
  );
  res.status(r.status).json(r.body);
});
app.delete('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => {
  const r = await handleDeleteOSMonitor(alertService, req.params.dsId, req.params.monitorId);
  res.status(r.status).json(r.body);
});
app.get('/api/datasources/:dsId/alerts', async (req, res) => {
  const r = await handleGetOSAlerts(alertService, req.params.dsId);
  res.status(r.status).json(r.body);
});
app.post('/api/datasources/:dsId/monitors/:monitorId/acknowledge', async (req, res) => {
  const r = await handleAcknowledgeOSAlerts(
    alertService,
    req.params.dsId,
    req.params.monitorId,
    req.body
  );
  res.status(r.status).json(r.body);
});

// ============================================================================
// Prometheus Routes (native API shape)
// ============================================================================

app.get('/api/datasources/:dsId/rules', async (req, res) => {
  const r = await handleGetPromRuleGroups(alertService, req.params.dsId);
  res.status(r.status).json(r.body);
});
app.get('/api/datasources/:dsId/prom-alerts', async (req, res) => {
  const r = await handleGetPromAlerts(alertService, req.params.dsId);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Prometheus Alertmanager Routes (prom/alertmanager API v2)
// ============================================================================

app.get('/api/alertmanager/alerts', async (_req, res) => {
  try {
    if (!promBackend.getAlertmanagerAlerts) {
      return res.status(501).json({ error: 'Alertmanager not configured' });
    }
    const alerts = await promBackend.getAlertmanagerAlerts();
    res.json({ alerts });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alertmanager/silences', async (_req, res) => {
  try {
    if (!promBackend.getSilences) {
      return res.status(501).json({ error: 'Alertmanager not configured' });
    }
    const silences = await promBackend.getSilences();
    res.json({ silences });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alertmanager/silences', async (req, res) => {
  try {
    if (!promBackend.createSilence) {
      return res.status(501).json({ error: 'Alertmanager not configured' });
    }
    const silenceId = await promBackend.createSilence(req.body);
    res.json({ silenceID: silenceId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/alertmanager/silences/:id', async (req, res) => {
  try {
    if (!promBackend.deleteSilence) {
      return res.status(501).json({ error: 'Alertmanager not configured' });
    }
    const ok = await promBackend.deleteSilence(req.params.id);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alertmanager/status', async (_req, res) => {
  try {
    if (!promBackend.getAlertmanagerStatus) {
      return res.status(501).json({ error: 'Alertmanager not configured' });
    }
    const status = await promBackend.getAlertmanagerStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alertmanager/receivers', async (_req, res) => {
  try {
    if (!promBackend.getAlertmanagerReceivers) {
      return res.status(501).json({ error: 'Alertmanager receivers not available' });
    }
    const receivers = await promBackend.getAlertmanagerReceivers();
    res.json({ receivers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alertmanager/alert-groups', async (_req, res) => {
  try {
    if (!promBackend.getAlertmanagerAlertGroups) {
      return res.status(501).json({ error: 'Alertmanager alert groups not available' });
    }
    const groups = await promBackend.getAlertmanagerAlertGroups();
    res.json({ groups });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Parsed Alertmanager configuration (route tree, receivers, inhibit rules).
// Fetches status via OpenSearch Direct Query proxy, parses YAML server-side.
app.get('/api/alertmanager/config', async (_req, res) => {
  try {
    if (!promBackend.getAlertmanagerStatus) {
      return res.json({ available: false, error: 'Alertmanager not configured' });
    }
    const status = await promBackend.getAlertmanagerStatus();

    let parsedConfig: any = {};
    try {
      parsedConfig = yaml.load(status.config?.original || '') || {};
    } catch (yamlErr: any) {
      return res.json({
        available: true,
        configParseError: yamlErr.message,
        raw: status.config?.original || '',
        cluster: status.cluster,
        uptime: status.uptime,
        versionInfo: status.versionInfo,
      });
    }

    const receivers = (parsedConfig.receivers || []).map((r: any) => ({
      name: r.name,
      integrations: extractReceiverIntegrations(r),
    }));

    res.json({
      available: true,
      cluster: {
        status: status.cluster?.status || 'unknown',
        peers: status.cluster?.peers || [],
        peerCount: (status.cluster?.peers || []).length,
      },
      uptime: status.uptime,
      versionInfo: status.versionInfo || {},
      config: {
        global: parsedConfig.global || {},
        route: parsedConfig.route || null,
        receivers,
        inhibitRules: parsedConfig.inhibit_rules || [],
      },
    });
  } catch (e: any) {
    res.json({ available: false, error: e.message });
  }
});

function extractReceiverIntegrations(receiver: any): Array<{ type: string; summary: string }> {
  const integrations: Array<{ type: string; summary: string }> = [];
  const configKeys = [
    'webhook_configs',
    'slack_configs',
    'email_configs',
    'pagerduty_configs',
    'opsgenie_configs',
    'victorops_configs',
    'pushover_configs',
    'wechat_configs',
    'sns_configs',
    'telegram_configs',
    'msteams_configs',
    'webex_configs',
  ];
  for (const key of configKeys) {
    if (receiver[key] && Array.isArray(receiver[key])) {
      for (const cfg of receiver[key]) {
        const typeName = key.replace('_configs', '');
        let summary = '';
        if (typeName === 'webhook') summary = cfg.url || cfg.url_file || 'webhook';
        else if (typeName === 'slack') summary = cfg.channel || 'slack';
        else if (typeName === 'email') summary = cfg.to || 'email';
        else if (typeName === 'pagerduty') summary = 'pagerduty';
        else summary = typeName;
        integrations.push({ type: typeName, summary });
      }
    }
  }
  if (integrations.length === 0) {
    integrations.push({ type: 'none', summary: 'No integrations' });
  }
  return integrations;
}

// ============================================================================
// Unified Views (cross-backend, for the UI)
// ============================================================================

app.get('/api/alerts', async (req, res) => {
  const r = await handleGetUnifiedAlerts(alertService, req.query as any);
  res.status(r.status).json(r.body);
});
app.get('/api/rules', async (req, res) => {
  const r = await handleGetUnifiedRules(alertService, req.query as any);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Paginated Unified Views (single-datasource selection)
// ============================================================================

app.get('/api/paginated/rules', async (req, res) => {
  try {
    const dsIds = req.query.dsIds ? String(req.query.dsIds).split(',') : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 20;
    const result = await alertService.getPaginatedRules({ dsIds, page, pageSize });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/paginated/alerts', async (req, res) => {
  try {
    const dsIds = req.query.dsIds ? String(req.query.dsIds).split(',') : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 20;
    const result = await alertService.getPaginatedAlerts({ dsIds, page, pageSize });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// Workspace Discovery
// ============================================================================

app.get('/api/datasources/:dsId/workspaces', async (req, res) => {
  try {
    const workspaces = await datasourceService.listWorkspaces(req.params.dsId);
    res.json({ workspaces });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// Monitor CRUD Routes
// ============================================================================

app.post('/api/monitors', async (req, res) => {
  const r = await handleCreateMonitor(alertService, req.body);
  res.status(r.status).json(r.body);
});
app.put('/api/monitors/:id', async (req, res) => {
  const r = await handleUpdateMonitor(alertService, req.params.id, req.body);
  res.status(r.status).json(r.body);
});
app.delete('/api/monitors/:id', async (req, res) => {
  const r = await handleDeleteMonitor(alertService, req.params.id, req.query.dsId as string);
  res.status(r.status).json(r.body);
});
app.post('/api/monitors/import', async (req, res) => {
  const r = await handleImportMonitors(alertService, req.body);
  res.status(r.status).json(r.body);
});
app.get('/api/monitors/export', async (_req, res) => {
  const r = await handleExportMonitors(alertService);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Suppression Rules Routes
// ============================================================================

app.get('/api/suppression-rules', (_req, res) => {
  const r = handleListSuppressionRules(suppressionService);
  res.status(r.status).json(r.body);
});
app.post('/api/suppression-rules', (req, res) => {
  const r = handleCreateSuppressionRule(suppressionService, req.body);
  res.status(r.status).json(r.body);
});
app.put('/api/suppression-rules/:id', (req, res) => {
  const r = handleUpdateSuppressionRule(suppressionService, req.params.id, req.body);
  res.status(r.status).json(r.body);
});
app.delete('/api/suppression-rules/:id', (req, res) => {
  const r = handleDeleteSuppressionRule(suppressionService, req.params.id);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Alert Actions Routes
// ============================================================================

app.post('/api/alerts/:id/acknowledge', async (req, res) => {
  const r = await handleAcknowledgeAlert(alertService, req.params.id);
  res.status(r.status).json(r.body);
});
app.post('/api/alerts/:id/silence', async (req, res) => {
  const r = await handleSilenceAlert(suppressionService, req.params.id, req.body);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Detail View Endpoints (on-demand, loaded when user opens flyout)
// ============================================================================

app.get('/api/rules/:dsId/:ruleId', async (req, res) => {
  const r = await handleGetRuleDetail(alertService, req.params.dsId, req.params.ruleId);
  res.status(r.status).json(r.body);
});

app.get('/api/alerts/:dsId/:alertId', async (req, res) => {
  const r = await handleGetAlertDetail(alertService, req.params.dsId, req.params.alertId);
  res.status(r.status).json(r.body);
});

// ============================================================================
// Alertmanager Webhook Receiver
// Receives alert notifications from Prometheus Alertmanager
// ============================================================================

app.post('/api/webhooks/alertmanager', (req, res) => {
  const alerts = req.body?.alerts || [];
  logger.info(`Received ${alerts.length} alert(s) from Alertmanager`);
  for (const alert of alerts) {
    const name = alert.labels?.alertname || 'unknown';
    const status = alert.status || 'unknown';
    logger.info(`  [${status.toUpperCase()}] ${name}`);
  }
  res.json({ status: 'ok' });
});

// ============================================================================
// SLO Routes
// ============================================================================

app.get('/api/slos', async (req, res) => {
  const r = await handleListSLOs(sloService, req.query as any, logger);
  res.status(r.status).json(r.body);
});
app.post('/api/slos', async (req, res) => {
  const r = await handleCreateSLO(sloService, req.body, logger);
  res.status(r.status).json(r.body);
});
app.get('/api/slos/statuses', async (req, res) => {
  const ids = req.query.ids ? String(req.query.ids).split(',') : [];
  const r = await handleGetSLOStatuses(sloService, ids, logger);
  res.status(r.status).json(r.body);
});
app.post('/api/slos/preview', async (req, res) => {
  const r = await handlePreviewSLORules(sloService, req.body, logger);
  res.status(r.status).json(r.body);
});
app.get('/api/slos/:id', async (req, res) => {
  const r = await handleGetSLO(sloService, req.params.id, logger);
  res.status(r.status).json(r.body);
});
app.put('/api/slos/:id', async (req, res) => {
  const r = await handleUpdateSLO(sloService, req.params.id, req.body, logger);
  res.status(r.status).json(r.body);
});
app.delete('/api/slos/:id', async (req, res) => {
  const r = await handleDeleteSLO(sloService, req.params.id, logger);
  res.status(r.status).json(r.body);
});

// ============================================================================
// SPA Fallback
// ============================================================================

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Initialize backends (with auto-discovery) then start the server
initBackends()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Alert Manager running at http://localhost:${PORT}`);
      logger.info(`Mock mode: ${MOCK_MODE ? 'ENABLED' : 'DISABLED'}`);
    });
  })
  .catch((err) => {
    logger.error(`Failed to initialize backends: ${err}`);
    process.exit(1);
  });
