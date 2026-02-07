import * as vscode from 'vscode';
import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import {
  InMemoryDatasourceService,
  MultiBackendAlertService,
  MockOpenSearchBackend,
  MockPrometheusBackend,
  Logger,
} from '../../core';
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
} from '../../server/routes/handlers';

let server: http.Server | undefined;
let currentPort: number | undefined;

const logger: Logger = {
  info: (msg) => console.log(`[Alert Manager] ${msg}`),
  warn: (msg) => console.warn(`[Alert Manager] ${msg}`),
  error: (msg) => console.error(`[Alert Manager] ${msg}`),
  debug: (msg) => console.debug(`[Alert Manager] ${msg}`),
};

export async function startServer(context: vscode.ExtensionContext): Promise<number> {
  if (server && currentPort) {
    return currentPort;
  }

  const port = vscode.workspace.getConfiguration('alertManager').get<number>('port') || 5603;

  const datasourceService = new InMemoryDatasourceService(logger);
  const alertService = new MultiBackendAlertService(datasourceService, logger);

  const osBackend = new MockOpenSearchBackend(logger);
  const promBackend = new MockPrometheusBackend(logger);
  alertService.registerOpenSearch(osBackend);
  alertService.registerPrometheus(promBackend);

  // Seed mock data
  datasourceService.seed([
    { name: 'OpenSearch Production', type: 'opensearch', url: 'https://opensearch.example.com:9200', enabled: true },
    { name: 'Prometheus US-East (AMP)', type: 'prometheus', url: 'https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx', enabled: true },
    { name: 'OpenSearch Staging', type: 'opensearch', url: 'https://opensearch-staging.example.com:9200', enabled: true },
  ]);
  osBackend.seed('ds-1');
  osBackend.seed('ds-3');
  promBackend.seed('ds-2');

  const app = express();
  app.use(express.json());

  // After esbuild bundling, dist/extension.js is the entry point.
  // UI assets are copied to dist/public/ during build.
  // context.extensionPath points to the extension root (which contains dist/).
  const publicPath = path.join(context.extensionPath, 'dist', 'public');

  if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    app.use(express.static(publicPath));
    logger.info(`Serving UI from ${publicPath}`);
  } else {
    logger.warn(`UI assets not found at ${publicPath}`);
  }

  // --- API Routes ---

  app.get('/api/datasources', async (_req, res) => { const r = await handleListDatasources(datasourceService); res.status(r.status).json(r.body); });
  app.get('/api/datasources/:id', async (req, res) => { const r = await handleGetDatasource(datasourceService, req.params.id); res.status(r.status).json(r.body); });
  app.post('/api/datasources', async (req, res) => { const r = await handleCreateDatasource(datasourceService, req.body); res.status(r.status).json(r.body); });
  app.put('/api/datasources/:id', async (req, res) => { const r = await handleUpdateDatasource(datasourceService, req.params.id, req.body); res.status(r.status).json(r.body); });
  app.delete('/api/datasources/:id', async (req, res) => { const r = await handleDeleteDatasource(datasourceService, req.params.id); res.status(r.status).json(r.body); });
  app.post('/api/datasources/:id/test', async (req, res) => { const r = await handleTestDatasource(datasourceService, req.params.id); res.status(r.status).json(r.body); });

  app.get('/api/datasources/:dsId/monitors', async (req, res) => { const r = await handleGetOSMonitors(alertService, req.params.dsId); res.status(r.status).json(r.body); });
  app.get('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => { const r = await handleGetOSMonitor(alertService, req.params.dsId, req.params.monitorId); res.status(r.status).json(r.body); });
  app.post('/api/datasources/:dsId/monitors', async (req, res) => { const r = await handleCreateOSMonitor(alertService, req.params.dsId, req.body); res.status(r.status).json(r.body); });
  app.put('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => { const r = await handleUpdateOSMonitor(alertService, req.params.dsId, req.params.monitorId, req.body); res.status(r.status).json(r.body); });
  app.delete('/api/datasources/:dsId/monitors/:monitorId', async (req, res) => { const r = await handleDeleteOSMonitor(alertService, req.params.dsId, req.params.monitorId); res.status(r.status).json(r.body); });
  app.get('/api/datasources/:dsId/alerts', async (req, res) => { const r = await handleGetOSAlerts(alertService, req.params.dsId); res.status(r.status).json(r.body); });
  app.post('/api/datasources/:dsId/monitors/:monitorId/acknowledge', async (req, res) => { const r = await handleAcknowledgeOSAlerts(alertService, req.params.dsId, req.params.monitorId, req.body); res.status(r.status).json(r.body); });

  app.get('/api/datasources/:dsId/rules', async (req, res) => { const r = await handleGetPromRuleGroups(alertService, req.params.dsId); res.status(r.status).json(r.body); });
  app.get('/api/datasources/:dsId/prom-alerts', async (req, res) => { const r = await handleGetPromAlerts(alertService, req.params.dsId); res.status(r.status).json(r.body); });

  app.get('/api/alerts', async (_req, res) => { const r = await handleGetUnifiedAlerts(alertService); res.status(r.status).json(r.body); });
  app.get('/api/rules', async (_req, res) => { const r = await handleGetUnifiedRules(alertService); res.status(r.status).json(r.body); });

  // SPA fallback
  if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    app.get('*', (_req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });
  }

  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      currentPort = port;
      logger.info(`Server running at http://localhost:${port}`);
      vscode.window.showInformationMessage(`Alert Manager running at http://localhost:${port}`);
      resolve(port);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        currentPort = port;
        resolve(port);
      } else {
        reject(err);
      }
    });
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = undefined;
    currentPort = undefined;
    logger.info('Server stopped');
  }
}
