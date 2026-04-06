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
  SloService,
  SuppressionRuleService,
  Logger as AlarmsLogger,
} from '../core';
import { MockOpenSearchBackend, MockPrometheusBackend } from '../core/testing';
import { SavedObjectSloStore } from './slo_saved_object_store';

export class AlarmsPlugin implements Plugin<AlarmsPluginSetup, AlarmsPluginStart> {
  private readonly logger: Logger;
  private sloService?: SloService;

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

    // Register SLO saved object type for persisting SLO definitions
    core.savedObjects.registerType({
      name: 'slo-definition',
      hidden: false,
      namespaceType: 'single',
      mappings: {
        properties: {
          name: { type: 'text' },
          datasourceId: { type: 'keyword' },
          sli: { type: 'object', enabled: false },
          target: { type: 'float' },
          budgetWarningThreshold: { type: 'float' },
          window: { type: 'object', enabled: false },
          burnRates: { type: 'object', enabled: false },
          alarms: { type: 'object', enabled: false },
          exclusionWindows: { type: 'object', enabled: false },
          tags: { type: 'object', enabled: false },
          ruleGroupName: { type: 'keyword' },
          rulerNamespace: { type: 'keyword' },
          generatedRuleNames: { type: 'keyword' },
          version: { type: 'integer' },
          createdAt: { type: 'date' },
          createdBy: { type: 'keyword' },
          updatedAt: { type: 'date' },
          updatedBy: { type: 'keyword' },
        },
      },
    });

    const datasourceService = new InMemoryDatasourceService(logger);
    const alertService = new MultiBackendAlertService(datasourceService, logger);

    // Use mock backends only when explicitly enabled via environment variable.
    // In production (inside OSD), real backends should be registered by the
    // consuming application or configured via opensearch_dashboards.yml.
    const mockMode = process.env.ALERT_MANAGER_MOCK_MODE === 'true';

    // SLO service (always available, mock mode seeds sample data).
    // Starts with InMemorySloStore; upgraded to SavedObjectSloStore in start().
    const sloService = new SloService(logger, mockMode);
    this.sloService = sloService;

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

      // Seed SLO mock data for Prometheus datasource
      sloService.seed('ds-2').catch((err) => {
        this.logger.warn(`alertManager: Failed to seed SLO mock data: ${err.message}`);
      });
    } else {
      this.logger.info('alertManager: Running in LIVE mode — register backends via API');

      const osUrl = process.env.OPENSEARCH_URL || 'https://localhost:9200';
      const osAuth = {
        username: process.env.OPENSEARCH_USER || 'admin',
        password: process.env.OPENSEARCH_PASSWORD || 'admin',
      };

      const osBackend = new HttpOpenSearchBackend(logger);
      const promBackend = new DirectQueryPrometheusBackend(logger, {
        opensearchUrl: osUrl,
        auth: osAuth,
      });

      alertService.registerOpenSearch(osBackend);
      alertService.registerPrometheus(promBackend);

      // Auto-seed an OpenSearch datasource so the unified view works out of the box
      datasourceService.seed([
        {
          name: 'OpenSearch Cluster',
          type: 'opensearch',
          url: osUrl,
          enabled: true,
        },
      ]);

      // Auto-discover Prometheus datasources from the OpenSearch SQL plugin
      // (async — runs after setup returns, routes are already registered)
      promBackend
        .discoverDatasources()
        .then(async (discovered) => {
          if (discovered.length > 0) {
            this.logger.info(
              `alertManager: Auto-discovered ${discovered.length} Prometheus datasource(s): ${discovered.map((d) => d.name).join(', ')}`
            );
            datasourceService.seed(discovered);
            // Set first Prometheus datasource as default for Alertmanager operations
            // After seeding, look up the first Prometheus datasource by type
            const allDs = await datasourceService.list();
            const promDs = allDs.find((d) => d.type === 'prometheus');
            if (promDs) {
              promBackend.setDefaultDatasource(promDs);
              this.logger.info(
                `alertManager: Default Prometheus datasource set to ${promDs.name} (${promDs.id})`
              );
            }
          } else {
            this.logger.warn(
              'alertManager: No Prometheus datasources found in OpenSearch SQL plugin'
            );
          }
        })
        .catch((err) => {
          this.logger.warn(
            `alertManager: Failed to auto-discover Prometheus datasources: ${err.message}`
          );
        });
    }

    const suppressionService = new SuppressionRuleService();
    defineRoutes(router, datasourceService, alertService, sloService, suppressionService, logger);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('alertManager: Started');

    // Upgrade SLO storage to saved objects for persistence across restarts.
    // Gracefully falls back to the InMemorySloStore if this fails.
    if (this.sloService) {
      try {
        const repository = core.savedObjects.createInternalRepository(['slo-definition']);
        this.sloService.setStore(new SavedObjectSloStore(repository));
        this.logger.info('alertManager: SLO storage upgraded to SavedObjects');

        // Re-seed if in mock mode — InMemory data was lost during the store swap
        const mockMode = process.env.ALERT_MANAGER_MOCK_MODE === 'true';
        if (mockMode) {
          this.sloService.seed('ds-2').catch((err) => {
            this.logger.warn(
              `alertManager: Failed to re-seed SLO data after store upgrade: ${err.message}`
            );
          });
        }
      } catch (err: any) {
        this.logger.warn(
          `alertManager: Failed to create SavedObjectSloStore, using in-memory fallback: ${err.message}`
        );
      }
    }

    return {};
  }

  public stop() {}
}
