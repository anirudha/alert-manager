/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object-backed implementation of ISloStore.
 *
 * Persists SLO definitions to OpenSearch via the OSD
 * SavedObjectsClientContract so they survive container restarts.
 *
 * The saved object type `slo-definition` is registered in server/plugin.ts.
 */

import type { SloDefinition, ISloStore } from '../common/slo_types';
import type { SavedObjectsClientContract } from 'opensearch-dashboards/server';

const SO_TYPE = 'slo-definition';

/** Type guard for OSD saved-object 404 errors (which have varying shapes). */
function isSavedObjectNotFound(err: unknown): boolean {
  const e = err as Record<string, unknown> | undefined;
  return (
    (e as { output?: { statusCode?: number } })?.output?.statusCode === 404 ||
    (e as { statusCode?: number })?.statusCode === 404
  );
}

/** Shape of saved objects returned by the OSD client. */
interface SavedObjectEnvelope {
  id: string;
  attributes: Record<string, unknown>;
}

export class SavedObjectSloStore implements ISloStore {
  constructor(private readonly client: SavedObjectsClientContract) {}

  async get(id: string): Promise<SloDefinition | null> {
    try {
      const obj = await this.client.get(SO_TYPE, id);
      return this.toSloDefinition(obj);
    } catch (err: unknown) {
      // 404 → not found
      if (isSavedObjectNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  async list(datasourceId?: string): Promise<SloDefinition[]> {
    const results: SloDefinition[] = [];
    let page = 1;
    const perPage = 1000;

    // Paginate through all results to avoid the 1000-object cap
    while (true) {
      const findOpts: { type: string; perPage: number; page: number; filter?: string } = {
        type: SO_TYPE,
        perPage,
        page,
      };
      if (datasourceId) {
        // Escape quotes in datasourceId to prevent KQL injection
        const escaped = datasourceId.replace(/"/g, '\\"');
        findOpts.filter = `${SO_TYPE}.attributes.datasourceId: "${escaped}"`;
      }
      const response = await this.client.find(findOpts);
      results.push(
        ...response.saved_objects.map((obj: SavedObjectEnvelope) => this.toSloDefinition(obj))
      );
      if (response.saved_objects.length === 0 || results.length >= response.total) break;
      page++;
    }
    return results;
  }

  async save(slo: SloDefinition): Promise<void> {
    const { id, ...attributes } = slo;
    await this.client.create(SO_TYPE, attributes, { id, overwrite: true });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(SO_TYPE, id);
      return true;
    } catch (err: unknown) {
      if (isSavedObjectNotFound(err)) {
        return false;
      }
      throw err;
    }
  }

  /** Reconstruct SloDefinition from a saved object envelope. */
  private toSloDefinition(obj: SavedObjectEnvelope): SloDefinition {
    return {
      id: obj.id,
      ...obj.attributes,
    } as SloDefinition;
  }
}
