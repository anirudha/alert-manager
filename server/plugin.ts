/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '../../../src/core/server';

import { AlarmsPluginSetup, AlarmsPluginStart } from './types';
import { defineRoutes } from './routes';
import {
  InMemoryDatasourceService,
  MultiBackendAlertService,
  HttpOpenSearchBackend,
  DirectQueryPrometheusBackend,
  Logger as AlarmsLogger,
} from '../core';
import { MockOpenSearchBackend, MockPrometheusBackend } from '../core/testing';

export class AlarmsPlugin implements Plugin<AlarmsPluginSetup, AlarmsPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('alertManager: Setup');
    const router = core.http.createRouter();

    const logger: AlarmsLogger = {
      info: (msg) => this.logger.info(msg),
      warn: (msg) => this.logger.warn(msg),
      error: (msg) => this.logger.error(msg),
      debug: (msg) => this.logger.debug(msg),
    };

    const datasourceService = new InMemoryDatasourceService(logger);
    const alertService = new MultiBackendAlertService(datasourceService, logger);

    // Use mock backends only when explicitly enabled via environment variable.
    // In production (inside OSD), real backends should be registered by the
    // consuming application or configured via opensearch_dashboards.yml.
    const mockMode = process.env.ALERT_MANAGER_MOCK_MODE === 'true';

    if (mockMode) {
      this.logger.info('alertManager: Running in MOCK mode');
      const osBackend = new MockOpenSearchBackend(logger);
      const promBackend = new MockPrometheusBackend(logger);
      alertService.registerOpenSearch(osBackend);
      alertService.registerPrometheus(promBackend);

      datasourceService.seed([
        {
          name: 'Mock OpenSearch',
          type: 'opensearch',
          url: 'http://localhost:9200',
          enabled: true,
        },
        {
          name: 'Mock Prometheus',
          type: 'prometheus',
          url: 'http://localhost:9090',
          enabled: true,
        },
      ]);
    } else {
      this.logger.info('alertManager: Running in LIVE mode — register backends via API');
      // Real backends are registered when datasources are created via the API.
      // The HttpOpenSearchBackend and DirectQueryPrometheusBackend are used
      // automatically based on datasource type.
      alertService.registerOpenSearch(new HttpOpenSearchBackend(logger));
      alertService.registerPrometheus(new DirectQueryPrometheusBackend(logger));
    }

    defineRoutes(router, datasourceService, alertService);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('alertManager: Started');
    return {};
  }

  public stop() {}
}
