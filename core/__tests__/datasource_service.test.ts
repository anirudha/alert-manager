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
      const ds1 = await service.create({ name: 'DS1', type: 'opensearch', url: 'http://a', enabled: true });
      const ds2 = await service.create({ name: 'DS2', type: 'prometheus', url: 'http://b', enabled: true });
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
      const created = await service.create({ name: 'Test', type: 'opensearch', url: 'http://a', enabled: true });
      const fetched = await service.get(created.id);
      expect(fetched).toEqual(created);
    });

    it('returns null for unknown id', async () => {
      expect(await service.get('ds-999')).toBeNull();
    });

    it('updates a datasource', async () => {
      const ds = await service.create({ name: 'Old', type: 'opensearch', url: 'http://a', enabled: true });
      const updated = await service.update(ds.id, { name: 'New' });
      expect(updated!.name).toBe('New');
      expect(updated!.id).toBe(ds.id);
    });

    it('returns null when updating non-existent', async () => {
      expect(await service.update('ds-999', { name: 'x' })).toBeNull();
    });

    it('deletes a datasource', async () => {
      const ds = await service.create({ name: 'ToDelete', type: 'opensearch', url: 'http://a', enabled: true });
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
      const ds = await service.create({ name: 'X', type: 'unknown' as any, url: 'http://a', enabled: true });
      const result = await service.testConnection(ds.id);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/unknown datasource type/i);
    });
  });
});
