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
  MockOpenSearchBackend,
  MockPrometheusBackend,
  Logger as AlarmsLogger,
} from '../core';

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

    const osBackend = new MockOpenSearchBackend(logger);
    const promBackend = new MockPrometheusBackend(logger);
    alertService.registerOpenSearch(osBackend);
    alertService.registerPrometheus(promBackend);

    datasourceService.seed([
      { name: 'Local OpenSearch', type: 'opensearch', url: 'http://localhost:9200', enabled: true },
      { name: 'Local Prometheus', type: 'prometheus', url: 'http://localhost:9090', enabled: true },
    ]);

    defineRoutes(router, datasourceService, alertService);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('alertManager: Started');
    return {};
  }

  public stop() {}
}
