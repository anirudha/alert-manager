/**
 * Standalone Express server for the Alert Manager.
 * Supports OpenSearch Alerting and Prometheus/AMP backends with mock mode.
 */
import express from 'express';
import path from 'path';
import {
  InMemoryDatasourceService,
  MultiBackendAlertService,
  MockOpenSearchBackend,
  MockPrometheusBackend,
  Logger,
} from '../core';
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
} from '../server/routes/handlers';

const PORT = process.env.PORT || 5603;
const MOCK_MODE = process.env.MOCK_MODE !== 'false';

const logger: Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] ${msg}`),
};

// Initialize services
const datasourceService = new InMemoryDatasourceService(logger);
const alertService = new MultiBackendAlertService(datasourceService, logger);

// Register backends
const osBackend = new MockOpenSearchBackend(logger);
const promBackend = new MockPrometheusBackend(logger);
alertService.registerOpenSearch(osBackend);
alertService.registerPrometheus(promBackend);

// Seed mock data
if (MOCK_MODE) {
  logger.info('Running in MOCK MODE — seeding sample datasources');

  datasourceService.seed([
    { name: 'OpenSearch Production', type: 'opensearch', url: 'https://opensearch.example.com:9200', enabled: true },
    { name: 'Prometheus US-East (AMP)', type: 'prometheus', url: 'https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx', enabled: true },
    { name: 'OpenSearch Staging', type: 'opensearch', url: 'https://opensearch-staging.example.com:9200', enabled: true },
  ]);

  osBackend.seed('ds-1');
  osBackend.seed('ds-3');
  promBackend.seed('ds-2');
}

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
  const r = await handleUpdateOSMonitor(alertService, req.params.dsId, req.params.monitorId, req.body);
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
  const r = await handleAcknowledgeOSAlerts(alertService, req.params.dsId, req.params.monitorId, req.body);
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
// Unified Views (cross-backend, for the UI)
// ============================================================================

app.get('/api/alerts', async (_req, res) => {
  const r = await handleGetUnifiedAlerts(alertService);
  res.status(r.status).json(r.body);
});
app.get('/api/rules', async (_req, res) => {
  const r = await handleGetUnifiedRules(alertService);
  res.status(r.status).json(r.body);
});

// ============================================================================
// SPA Fallback
// ============================================================================

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  logger.info(`Alert Manager running at http://localhost:${PORT}`);
  logger.info(`Mock mode: ${MOCK_MODE ? 'ENABLED' : 'DISABLED'}`);
});
