/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InMemoryDatasourceService } from '../datasource_service';
import { Logger } from '../types';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('InMemoryDatasourceService', () => {
  let service: InMemoryDatasourceService;

  beforeEach(() => {
    service = new InMemoryDatasourceService(noopLogger);
  });

  describe('CRUD', () => {
    it('creates a datasource with auto-generated id', async () => {
      const ds = await service.create({
        name: 'OpenSearch Dev',
        type: 'opensearch',
        url: 'https://localhost:9200',
        enabled: true,
      });
      expect(ds.id).toMatch(/^ds-\d+$/);
      expect(ds.name).toBe('OpenSearch Dev');
    });

    it('increments ids', async () => {
      const ds1 = await service.create({
        name: 'DS1',
        type: 'opensearch',
        url: 'http://a',
        enabled: true,
      });
      const ds2 = await service.create({
        name: 'DS2',
        type: 'prometheus',
        url: 'http://b',
        enabled: true,
      });
      expect(ds1.id).toBe('ds-1');
      expect(ds2.id).toBe('ds-2');
    });

    it('lists all datasources', async () => {
      await service.create({ name: 'A', type: 'opensearch', url: 'http://a', enabled: true });
      await service.create({ name: 'B', type: 'prometheus', url: 'http://b', enabled: true });
      const list = await service.list();
      expect(list).toHaveLength(2);
    });

    it('gets a datasource by id', async () => {
      const created = await service.create({
        name: 'Test',
        type: 'opensearch',
        url: 'http://a',
        enabled: true,
      });
      const fetched = await service.get(created.id);
      expect(fetched).toEqual(created);
    });

    it('returns null for unknown id', async () => {
      expect(await service.get('ds-999')).toBeNull();
    });

    it('updates a datasource', async () => {
      const ds = await service.create({
        name: 'Old',
        type: 'opensearch',
        url: 'http://a',
        enabled: true,
      });
      const updated = await service.update(ds.id, { name: 'New' });
      expect(updated!.name).toBe('New');
      expect(updated!.id).toBe(ds.id);
    });

    it('returns null when updating non-existent', async () => {
      expect(await service.update('ds-999', { name: 'x' })).toBeNull();
    });

    it('deletes a datasource', async () => {
      const ds = await service.create({
        name: 'ToDelete',
        type: 'opensearch',
        url: 'http://a',
        enabled: true,
      });
      expect(await service.delete(ds.id)).toBe(true);
      expect(await service.get(ds.id)).toBeNull();
    });

    it('returns false when deleting non-existent', async () => {
      expect(await service.delete('ds-999')).toBe(false);
    });
  });

  describe('seed', () => {
    it('pre-populates datasources', async () => {
      service.seed([
        { name: 'OS', type: 'opensearch', url: 'http://a', enabled: true },
        { name: 'Prom', type: 'prometheus', url: 'http://b', enabled: true },
      ]);
      const list = await service.list();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('OS');
      expect(list[1].name).toBe('Prom');
    });
  });

  describe('testConnection', () => {
    it('returns not found for unknown datasource', async () => {
      const result = await service.testConnection('ds-999');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found/i);
    });

    it('returns unknown type message for unsupported type', async () => {
      const ds = await service.create({
        name: 'X',
        type: 'unknown' as any,
        url: 'http://a',
        enabled: true,
      });
      const result = await service.testConnection(ds.id);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/unknown datasource type/i);
    });

    it('handles connection error for opensearch', async () => {
      const ds = await service.create({
        name: 'OS',
        type: 'opensearch',
        url: 'http://localhost:19999', // unreachable port
        enabled: true,
      });
      // Mock the httpClient to simulate a connection error
      const httpClient = (service as any).httpClient;
      const originalRequest = httpClient.request.bind(httpClient);
      httpClient.request = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await service.testConnection(ds.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
      httpClient.request = originalRequest;
    });

    it('handles connection error for prometheus', async () => {
      const ds = await service.create({
        name: 'Prom',
        type: 'prometheus',
        url: 'http://localhost:19999',
        enabled: true,
      });
      const httpClient = (service as any).httpClient;
      const originalRequest = httpClient.request.bind(httpClient);
      httpClient.request = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await service.testConnection(ds.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
      httpClient.request = originalRequest;
    });

    it('returns success for opensearch when httpClient responds', async () => {
      const ds = await service.create({
        name: 'OS',
        type: 'opensearch',
        url: 'http://localhost:9200',
        enabled: true,
      });
      const httpClient = (service as any).httpClient;
      const originalRequest = httpClient.request.bind(httpClient);
      httpClient.request = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: { status: 'green' },
      });
      const result = await service.testConnection(ds.id);
      expect(result.success).toBe(true);
      expect(result.message).toContain('green');
      httpClient.request = originalRequest;
    });
  });

  describe('setPrometheusBackend and listWorkspaces', () => {
    it('returns empty array when no prom backend is set', async () => {
      const ds = await service.create({
        name: 'Prom',
        type: 'prometheus',
        url: 'http://localhost:9090',
        enabled: true,
      });
      const result = await service.listWorkspaces(ds.id);
      expect(result).toEqual([]);
    });

    it('returns empty array for non-existent datasource', async () => {
      const result = await service.listWorkspaces('ds-999');
      expect(result).toEqual([]);
    });

    it('returns empty array for non-prometheus datasource', async () => {
      const mockBackend = {
        listWorkspaces: jest.fn().mockResolvedValue([]),
      };
      service.setPrometheusBackend(mockBackend as any);
      const ds = await service.create({
        name: 'OS',
        type: 'opensearch',
        url: 'http://localhost:9200',
        enabled: true,
      });
      const result = await service.listWorkspaces(ds.id);
      expect(result).toEqual([]);
    });

    it('returns workspaces from prometheus backend', async () => {
      const mockBackend = {
        listWorkspaces: jest
          .fn()
          .mockResolvedValue([{ id: 'ws-1', name: 'dev', alias: 'Dev WS', status: 'active' }]),
      };
      service.setPrometheusBackend(mockBackend as any);
      const ds = await service.create({
        name: 'Prom',
        type: 'prometheus',
        url: 'http://localhost:9090',
        enabled: true,
      });
      const result = await service.listWorkspaces(ds.id);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(`${ds.id}::ws-1`);
      expect(result[0].name).toContain('Dev WS');
      expect(result[0].enabled).toBe(true);
      expect(mockBackend.listWorkspaces).toHaveBeenCalled();
    });
  });

  describe('seed', () => {
    it('pre-populates datasources', async () => {
      service.seed([
        { name: 'OS', type: 'opensearch', url: 'http://a', enabled: true },
        { name: 'Prom', type: 'prometheus', url: 'http://b', enabled: true },
      ]);
      const list = await service.list();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('OS');
      expect(list[1].name).toBe('Prom');
    });

    it('increments counter correctly after seed', async () => {
      service.seed([{ name: 'Seeded', type: 'opensearch', url: 'http://a', enabled: true }]);
      const ds = await service.create({
        name: 'After Seed',
        type: 'opensearch',
        url: 'http://b',
        enabled: true,
      });
      // Seed creates ds-1, next should be ds-2
      expect(ds.id).toBe('ds-2');
    });
  });
});
