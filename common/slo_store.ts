/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-memory implementation of ISloStore.
 *
 * Default in-memory store used when no persistent backend is available.
 * Data is lost on process restart.
 */

import type { SloDefinition, ISloStore } from './slo_types';

export class InMemorySloStore implements ISloStore {
  /** datasourceId → (sloId → SloDefinition) */
  private slos: Map<string, Map<string, SloDefinition>> = new Map();

  async get(id: string): Promise<SloDefinition | null> {
    for (const sloMap of this.slos.values()) {
      if (sloMap.has(id)) return sloMap.get(id)!;
    }
    return null;
  }

  async list(datasourceId?: string): Promise<SloDefinition[]> {
    const results: SloDefinition[] = [];
    for (const [dsId, sloMap] of this.slos) {
      if (datasourceId && dsId !== datasourceId) continue;
      results.push(...sloMap.values());
    }
    return results;
  }

  async save(slo: SloDefinition): Promise<void> {
    if (!this.slos.has(slo.datasourceId)) {
      this.slos.set(slo.datasourceId, new Map());
    }
    this.slos.get(slo.datasourceId)!.set(slo.id, slo);
  }

  async delete(id: string): Promise<boolean> {
    for (const sloMap of this.slos.values()) {
      if (sloMap.has(id)) {
        sloMap.delete(id);
        return true;
      }
    }
    return false;
  }
}
