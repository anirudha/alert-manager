/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTTP client for the Alert Manager API.
 * Features: request cancellation, response caching with TTL, and
 * request deduplication for concurrent calls.
 */
import { Datasource, UnifiedAlertSummary, UnifiedRuleSummary } from '../../core';

export interface HttpClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

export interface ApiPaths {
  datasources: string;
  alerts: string;
  rules: string;
}

const OSD_PATHS: ApiPaths = {
  datasources: '/api/alerting/datasources',
  alerts: '/api/alerting/unified/alerts',
  rules: '/api/alerting/unified/rules',
};

const STANDALONE_PATHS: ApiPaths = {
  datasources: '/api/datasources',
  alerts: '/api/alerts',
  rules: '/api/rules',
};

interface AlertsResponse {
  results?: UnifiedAlertSummary[];
  alerts?: UnifiedAlertSummary[];
}

interface RulesResponse {
  results?: UnifiedRuleSummary[];
  rules?: UnifiedRuleSummary[];
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Default cache TTL in ms (30 seconds). */
const CACHE_TTL_MS = 30_000;

export class AlarmsApiClient {
  private readonly paths: ApiPaths;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly http: HttpClient,
    mode: 'osd' | 'standalone' = 'osd'
  ) {
    this.paths = mode === 'standalone' ? STANDALONE_PATHS : OSD_PATHS;
  }

  async listDatasources(): Promise<Datasource[]> {
    return this.cachedGet<{ datasources: Datasource[] }>(this.paths.datasources).then(
      (res) => res.datasources
    );
  }

  async listAlerts(): Promise<UnifiedAlertSummary[]> {
    return this.cachedGet<AlertsResponse>(this.paths.alerts).then(
      (res) => res.results ?? res.alerts ?? []
    );
  }

  async listRules(): Promise<UnifiedRuleSummary[]> {
    return this.cachedGet<RulesResponse>(this.paths.rules).then(
      (res) => res.results ?? res.rules ?? []
    );
  }

  /** Invalidate all cached data (e.g., after a mutation). */
  invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Cached GET with request deduplication.
   * Concurrent calls to the same path share a single in-flight request.
   * Results are cached for CACHE_TTL_MS.
   */
  private async cachedGet<T>(path: string): Promise<T> {
    // Check cache
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    // Deduplicate concurrent requests
    const existing = this.inFlight.get(path);
    if (existing) {
      return existing as Promise<T>;
    }

    const request = this.http
      .get<T>(path)
      .then((data) => {
        this.cache.set(path, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        return data;
      })
      .finally(() => {
        this.inFlight.delete(path);
      });

    this.inFlight.set(path, request);
    return request;
  }
}
