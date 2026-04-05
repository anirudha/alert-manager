/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockOpenSearchBackend, MockPrometheusBackend } from '../mock_backend';
import { Datasource, Logger } from '../types';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const osDs: Datasource = {
  id: 'ds-os-1',
  name: 'Test OS',
  type: 'opensearch',
  url: 'http://localhost:9200',
  enabled: true,
};

const promDs: Datasource = {
  id: 'ds-prom-1',
  name: 'Test Prom',
  type: 'prometheus',
  url: 'http://localhost:9090',
  enabled: true,
};

// ---------------------------------------------------------------------------
// MockOpenSearchBackend
// ---------------------------------------------------------------------------

describe('MockOpenSearchBackend', () => {
  let backend: MockOpenSearchBackend;

  beforeEach(() => {
    backend = new MockOpenSearchBackend(noopLogger);
  });

  describe('monitors CRUD', () => {
    it('getMonitors returns empty array initially', async () => {
      const monitors = await backend.getMonitors(osDs);
      expect(monitors).toEqual([]);
    });

    it('createMonitor creates and returns a monitor with generated id', async () => {
      const monitor = await backend.createMonitor(osDs, {
        name: 'CPU Monitor',
        type: 'monitor',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        monitor_type: 'query_level_monitor',
        last_update_time: Date.now(),
      });
      expect(monitor.id).toBeDefined();
      expect(monitor.name).toBe('CPU Monitor');
    });

    it('getMonitor returns created monitor by id', async () => {
      const created = await backend.createMonitor(osDs, {
        name: 'Mem Monitor',
        type: 'monitor',
        enabled: true,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        monitor_type: 'query_level_monitor',
        last_update_time: Date.now(),
      });
      const fetched = await backend.getMonitor(osDs, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Mem Monitor');
    });

    it('getMonitor returns null for non-existent id', async () => {
      const result = await backend.getMonitor(osDs, 'no-such-id');
      expect(result).toBeNull();
    });

    it('updateMonitor updates fields and returns monitor', async () => {
      const created = await backend.createMonitor(osDs, {
        name: 'Original',
        type: 'monitor',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        monitor_type: 'query_level_monitor',
        last_update_time: Date.now(),
      });
      const updated = await backend.updateMonitor(osDs, created.id, { name: 'Updated' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
    });

    it('updateMonitor returns null for non-existent id', async () => {
      const result = await backend.updateMonitor(osDs, 'no-such-id', { name: 'x' });
      expect(result).toBeNull();
    });

    it('deleteMonitor removes the monitor', async () => {
      const created = await backend.createMonitor(osDs, {
        name: 'ToDelete',
        type: 'monitor',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        monitor_type: 'query_level_monitor',
        last_update_time: Date.now(),
      });
      const deleted = await backend.deleteMonitor(osDs, created.id);
      expect(deleted).toBe(true);
      const fetched = await backend.getMonitor(osDs, created.id);
      expect(fetched).toBeNull();
    });

    it('deleteMonitor returns false for non-existent id', async () => {
      const result = await backend.deleteMonitor(osDs, 'no-such-id');
      expect(result).toBe(false);
    });
  });

  describe('alerts', () => {
    it('getAlerts returns empty initially', async () => {
      const result = await backend.getAlerts(osDs);
      expect(result.alerts).toEqual([]);
      expect(result.totalAlerts).toBe(0);
    });

    it('getAlerts returns seeded alerts', async () => {
      backend.seed(osDs.id);
      const result = await backend.getAlerts(osDs);
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.totalAlerts).toBe(result.alerts.length);
    });

    it('acknowledgeAlerts updates alert state', async () => {
      backend.seed(osDs.id);
      const { alerts } = await backend.getAlerts(osDs);
      const activeAlert = alerts.find((a) => a.state === 'ACTIVE');
      if (activeAlert) {
        await backend.acknowledgeAlerts(osDs, 'any-monitor', [activeAlert.id]);
        const { alerts: updated } = await backend.getAlerts(osDs);
        const acked = updated.find((a) => a.id === activeAlert.id);
        expect(acked?.state).toBe('ACKNOWLEDGED');
      }
    });
  });

  describe('destinations', () => {
    it('getDestinations returns empty initially', async () => {
      const dests = await backend.getDestinations(osDs);
      expect(dests).toEqual([]);
    });

    it('createDestination and getDestinations round-trip', async () => {
      const dest = await backend.createDestination(osDs, {
        type: 'slack',
        name: 'test-slack',
        last_update_time: Date.now(),
      });
      expect(dest.id).toBeDefined();

      const dests = await backend.getDestinations(osDs);
      expect(dests).toHaveLength(1);
      expect(dests[0].name).toBe('test-slack');
    });

    it('deleteDestination removes destination', async () => {
      const dest = await backend.createDestination(osDs, {
        type: 'email',
        name: 'test-email',
        last_update_time: Date.now(),
      });
      const deleted = await backend.deleteDestination(osDs, dest.id);
      expect(deleted).toBe(true);

      const dests = await backend.getDestinations(osDs);
      expect(dests).toHaveLength(0);
    });
  });

  describe('seed', () => {
    it('populates monitors, alerts, and destinations', async () => {
      backend.seed(osDs.id);

      const monitors = await backend.getMonitors(osDs);
      expect(monitors.length).toBeGreaterThan(0);

      const { alerts } = await backend.getAlerts(osDs);
      expect(alerts.length).toBeGreaterThan(0);

      const dests = await backend.getDestinations(osDs);
      expect(dests.length).toBeGreaterThan(0);
    });

    it('seeded monitors have expected fields', async () => {
      backend.seed(osDs.id);
      const monitors = await backend.getMonitors(osDs);
      const monitor = monitors[0];
      expect(monitor.id).toBeDefined();
      expect(monitor.name).toBeDefined();
      expect(monitor.type).toBeDefined();
      expect(monitor.enabled).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// MockPrometheusBackend
// ---------------------------------------------------------------------------

describe('MockPrometheusBackend', () => {
  let backend: MockPrometheusBackend;

  beforeEach(() => {
    backend = new MockPrometheusBackend(noopLogger);
  });

  describe('rule groups', () => {
    it('getRuleGroups returns empty initially', async () => {
      const groups = await backend.getRuleGroups(promDs);
      expect(groups).toEqual([]);
    });

    it('getRuleGroups returns seeded groups', async () => {
      backend.seed(promDs.id);
      const groups = await backend.getRuleGroups(promDs);
      expect(groups.length).toBeGreaterThan(0);
    });

    it('seeded rule groups have expected structure', async () => {
      backend.seed(promDs.id);
      const groups = await backend.getRuleGroups(promDs);
      const group = groups[0];
      expect(group.name).toBeDefined();
      expect(group.file).toBeDefined();
      expect(group.rules).toBeDefined();
      expect(Array.isArray(group.rules)).toBe(true);
    });
  });

  describe('alerts', () => {
    it('getAlerts returns empty initially', async () => {
      const alerts = await backend.getAlerts(promDs);
      expect(alerts).toEqual([]);
    });

    it('getAlerts returns seeded alerts', async () => {
      backend.seed(promDs.id);
      const alerts = await backend.getAlerts(promDs);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('seeded alerts have expected fields', async () => {
      backend.seed(promDs.id);
      const alerts = await backend.getAlerts(promDs);
      const alert = alerts[0];
      expect(alert.labels).toBeDefined();
      expect(alert.state).toBeDefined();
      expect(alert.activeAt).toBeDefined();
    });
  });

  describe('workspaces', () => {
    it('listWorkspaces returns empty initially', async () => {
      const ws = await backend.listWorkspaces(promDs);
      expect(ws).toEqual([]);
    });

    it('listWorkspaces returns seeded workspaces', async () => {
      backend.seed(promDs.id);
      const ws = await backend.listWorkspaces(promDs);
      expect(ws.length).toBeGreaterThan(0);
    });

    it('seeded workspaces have id and alias', async () => {
      backend.seed(promDs.id);
      const ws = await backend.listWorkspaces(promDs);
      expect(ws[0].id).toBeDefined();
      expect(ws[0].alias).toBeDefined();
    });
  });

  describe('workspace-scoped queries', () => {
    it('getRuleGroups filters by workspaceId', async () => {
      backend.seed(promDs.id);
      const workspaces = await backend.listWorkspaces(promDs);
      if (workspaces.length > 0) {
        const wsDs: Datasource = {
          ...promDs,
          id: `${promDs.id}-ws-${workspaces[0].id}`,
          workspaceId: workspaces[0].id,
          parentDatasourceId: promDs.id,
        };
        const groups = await backend.getRuleGroups(wsDs);
        // Workspace-scoped groups should be a subset of all groups
        const allGroups = await backend.getRuleGroups(promDs);
        expect(groups.length).toBeLessThanOrEqual(allGroups.length);
      }
    });
  });
});
