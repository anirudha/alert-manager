/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD route adapter — wires framework-agnostic handlers to OSD's IRouter.
 */
import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import { DatasourceService, MultiBackendAlertService } from '../../core';
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
} from './handlers';

export function defineRoutes(
  router: IRouter,
  datasourceService: DatasourceService,
  alertService: MultiBackendAlertService
) {
  // Datasource routes
  router.get({ path: '/api/alerting/datasources', validate: false }, async (_ctx, _req, res) => {
    const result = await handleListDatasources(datasourceService);
    return res.ok({ body: result.body });
  });

  router.get(
    {
      path: '/api/alerting/datasources/{id}',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetDatasource(datasourceService, req.params.id);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/datasources',
      validate: {
        body: schema.object({
          name: schema.string(),
          type: schema.oneOf([schema.literal('opensearch'), schema.literal('prometheus')]),
          url: schema.string(),
          enabled: schema.maybe(schema.boolean()),
        }),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleCreateDatasource(datasourceService, req.body as any);
      return res.ok({ body: result.body });
    }
  );

  router.put(
    {
      path: '/api/alerting/datasources/{id}',
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          name: schema.maybe(schema.string()),
          url: schema.maybe(schema.string()),
          enabled: schema.maybe(schema.boolean()),
        }),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleUpdateDatasource(
        datasourceService,
        req.params.id,
        req.body as any
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.delete(
    {
      path: '/api/alerting/datasources/{id}',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleDeleteDatasource(datasourceService, req.params.id);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/datasources/{id}/test',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleTestDatasource(datasourceService, req.params.id);
      return res.ok({ body: result.body });
    }
  );

  // Unified view routes
  router.get(
    {
      path: '/api/alerting/unified/alerts',
      validate: {
        query: schema.object({
          dsIds: schema.maybe(schema.string()),
          timeout: schema.maybe(schema.string()),
          maxResults: schema.maybe(schema.string()),
        }),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleGetUnifiedAlerts(alertService, {
        dsIds: req.query.dsIds,
        timeout: req.query.timeout,
        maxResults: req.query.maxResults,
      });
      return res.ok({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/unified/rules',
      validate: {
        query: schema.object({
          dsIds: schema.maybe(schema.string()),
          timeout: schema.maybe(schema.string()),
          maxResults: schema.maybe(schema.string()),
        }),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleGetUnifiedRules(alertService, {
        dsIds: req.query.dsIds,
        timeout: req.query.timeout,
        maxResults: req.query.maxResults,
      });
      return res.ok({ body: result.body });
    }
  );

  // OpenSearch monitor/alert routes
  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetOSMonitors(alertService, req.params.dsId);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetOSMonitor(alertService, req.params.dsId, req.params.monitorId);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: { params: schema.object({ dsId: schema.string() }), body: schema.any() },
    },
    async (_ctx, req, res) => {
      const result = await handleCreateOSMonitor(alertService, req.params.dsId, req.body);
      return res.ok({ body: result.body });
    }
  );

  router.put(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: schema.any(),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleUpdateOSMonitor(
        alertService,
        req.params.dsId,
        req.params.monitorId,
        req.body
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.delete(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleDeleteOSMonitor(
        alertService,
        req.params.dsId,
        req.params.monitorId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetOSAlerts(alertService, req.params.dsId);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: schema.object({ alerts: schema.arrayOf(schema.string()) }),
      },
    },
    async (_ctx, req, res) => {
      const result = await handleAcknowledgeOSAlerts(
        alertService,
        req.params.dsId,
        req.params.monitorId,
        req.body
      );
      return res.ok({ body: result.body });
    }
  );

  // Prometheus routes
  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/rules',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetPromRuleGroups(alertService, req.params.dsId);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (_ctx, req, res) => {
      const result = await handleGetPromAlerts(alertService, req.params.dsId);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );
}
