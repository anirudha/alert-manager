/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source-of-truth HTTP client for the Alert Manager API.
 *
 * Features:
 *  - Mode-aware paths (OSD `/api/alerting/...` vs standalone `/api/...`)
 *  - Response caching with 30s TTL
 *  - Request deduplication for concurrent calls
 *  - Full CRUD: monitors, suppression rules, alert actions, SLOs
 */
import { Datasource } from '../../core';
import type { SloDefinition, SloInput, SloSummary } from '../../core/slo_types';

// ---------------------------------------------------------------------------
// HttpClient interface — implemented by OSD's http service adapter or fetch()
// ---------------------------------------------------------------------------

export interface HttpClient {
  get<T = any>(path: string, opts?: any): Promise<T>;
  post<T = any>(path: string, body?: any): Promise<T>;
  put<T = any>(path: string, body?: any): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared response types
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Path configuration
// ---------------------------------------------------------------------------

interface ApiPaths {
  datasources: string;
  alerts: string;
  rules: string;
  slos: string;
  monitors: (dsId: string) => string;
  suppressionRules: string;
  alertmanagerConfig: string;
  acknowledgeAlert: (id: string) => string;
  silenceAlert: (id: string) => string;
}

const OSD_PATHS: ApiPaths = {
  datasources: '/api/alerting/datasources',
  alerts: '/api/alerting/unified/alerts',
  rules: '/api/alerting/unified/rules',
  slos: '/api/alerting/slos',
  monitors: (dsId) => `/api/alerting/opensearch/${dsId}/monitors`,
  suppressionRules: '/api/alerting/suppression-rules',
  alertmanagerConfig: '/api/alerting/alertmanager/config',
  acknowledgeAlert: (id) => `/api/alerting/alerts/${encodeURIComponent(id)}/acknowledge`,
  silenceAlert: (id) => `/api/alerting/alerts/${encodeURIComponent(id)}/silence`,
};

const STANDALONE_PATHS: ApiPaths = {
  datasources: '/api/datasources',
  alerts: '/api/paginated/alerts',
  rules: '/api/paginated/rules',
  slos: '/api/slos',
  monitors: (_dsId) => '/api/monitors',
  suppressionRules: '/api/suppression-rules',
  alertmanagerConfig: '/api/alertmanager/config',
  acknowledgeAlert: (id) => `/api/alerts/${encodeURIComponent(id)}/acknowledge`,
  silenceAlert: (id) => `/api/alerts/${encodeURIComponent(id)}/silence`,
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// AlarmsApiClient
// ---------------------------------------------------------------------------

export class AlarmsApiClient {
  private readonly paths: ApiPaths;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly http: HttpClient,
    private readonly mode: 'osd' | 'standalone' = 'osd'
  ) {
    this.paths = mode === 'standalone' ? STANDALONE_PATHS : OSD_PATHS;
  }

  /** Expose raw HTTP client for components that need direct API access. */
  get rawHttp(): HttpClient {
    return this.http;
  }

  // ---- Datasources --------------------------------------------------------

  async listDatasources(): Promise<Datasource[]> {
    const res = await this.cachedGet<{ datasources: Datasource[] }>(this.paths.datasources);
    return res.datasources ?? [];
  }

  async listWorkspaces(dsId: string): Promise<Datasource[]> {
    if (this.mode === 'osd') return []; // auto-discovered server-side
    const res = await this.http.get<{ workspaces: Datasource[] }>(
      `${this.paths.datasources}/${dsId}/workspaces`
    );
    return res.workspaces ?? [];
  }

  // ---- Alerts (paginated) -------------------------------------------------

  async listAlertsPaginated(
    dsIds: string[],
    _page: number,
    pageSize: number
  ): Promise<PaginatedResponse<any>> {
    const query: Record<string, string> = { maxResults: String(pageSize) };
    if (dsIds.length > 0) query.dsIds = dsIds.join(',');
    const res = await this.http.get<{ results?: any[]; alerts?: any[] }>(
      this.paths.alerts,
      this.mode === 'osd' ? { query } : undefined
    );
    const items = res.results ?? res.alerts ?? [];
    return { results: items, total: items.length, page: 1, pageSize: items.length, hasMore: false };
  }

  // ---- Rules (paginated) --------------------------------------------------

  async listRulesPaginated(
    dsIds: string[],
    _page: number,
    pageSize: number
  ): Promise<PaginatedResponse<any>> {
    const query: Record<string, string> = { maxResults: String(pageSize) };
    if (dsIds.length > 0) query.dsIds = dsIds.join(',');
    const res = await this.http.get<{ results?: any[]; rules?: any[] }>(
      this.paths.rules,
      this.mode === 'osd' ? { query } : undefined
    );
    const items = res.results ?? res.rules ?? [];
    return { results: items, total: items.length, page: 1, pageSize: items.length, hasMore: false };
  }

  // ---- Monitor CRUD -------------------------------------------------------

  async createMonitor(data: any, dsId = 'ds-1'): Promise<any> {
    return this.http.post(this.paths.monitors(dsId), data);
  }
  async updateMonitor(id: string, data: any, dsId = 'ds-1'): Promise<any> {
    return this.http.put(`${this.paths.monitors(dsId)}/${encodeURIComponent(id)}`, data);
  }
  async deleteMonitor(id: string, dsId = 'ds-1'): Promise<any> {
    return this.http.delete(`${this.paths.monitors(dsId)}/${encodeURIComponent(id)}`);
  }
  async importMonitors(json: any[], dsId = 'ds-1'): Promise<any> {
    return this.http.post(`${this.paths.monitors(dsId)}/import`, json);
  }
  async exportMonitors(dsId = 'ds-1'): Promise<any> {
    return this.http.get(`${this.paths.monitors(dsId)}/export`);
  }

  // ---- Alertmanager config ------------------------------------------------

  async getAlertmanagerConfig(): Promise<any> {
    return this.http.get(this.paths.alertmanagerConfig);
  }

  // ---- Suppression rules --------------------------------------------------

  async listSuppressionRules(): Promise<any> {
    return this.http.get(this.paths.suppressionRules);
  }
  async createSuppressionRule(data: any): Promise<any> {
    return this.http.post(this.paths.suppressionRules, data);
  }
  async updateSuppressionRule(id: string, data: any): Promise<any> {
    return this.http.put(`${this.paths.suppressionRules}/${encodeURIComponent(id)}`, data);
  }
  async deleteSuppressionRule(id: string): Promise<any> {
    return this.http.delete(`${this.paths.suppressionRules}/${encodeURIComponent(id)}`);
  }

  // ---- SLO CRUD -----------------------------------------------------------

  async listSlos(): Promise<PaginatedResponse<SloSummary>> {
    return this.http.get(this.paths.slos);
  }
  async getSlo(id: string): Promise<SloDefinition> {
    return this.http.get(`${this.paths.slos}/${encodeURIComponent(id)}`);
  }
  async createSlo(data: SloInput): Promise<SloDefinition> {
    return this.http.post(this.paths.slos, data);
  }
  async deleteSlo(id: string): Promise<{ deleted: boolean; generatedRuleNames: string[] }> {
    return this.http.delete(`${this.paths.slos}/${encodeURIComponent(id)}`);
  }

  // ---- Alert actions ------------------------------------------------------

  async acknowledgeAlert(id: string, datasourceId?: string, monitorId?: string): Promise<any> {
    return this.http.post(this.paths.acknowledgeAlert(id), { datasourceId, monitorId });
  }
  async silenceAlert(id: string, duration?: string): Promise<any> {
    return this.http.post(this.paths.silenceAlert(id), { duration: duration || '1h' });
  }

  // ---- Cache management ---------------------------------------------------

  invalidateCache(): void {
    this.cache.clear();
  }

  private async cachedGet<T>(path: string): Promise<T> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;

    const existing = this.inFlight.get(path);
    if (existing) return existing as Promise<T>;

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
