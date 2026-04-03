/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTTP client for the Alert Manager API.
 * Works in both OSD and standalone mode via the HttpClient abstraction.
 * API paths are configurable to support different route prefixes.
 */
import { Datasource, UnifiedAlert, UnifiedRule } from '../../core';

export interface HttpClient {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: any): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
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

export class AlarmsApiClient {
  private readonly paths: ApiPaths;

  constructor(private readonly http: HttpClient, mode: 'osd' | 'standalone' = 'osd') {
    this.paths = mode === 'standalone' ? STANDALONE_PATHS : OSD_PATHS;
  }

  async listDatasources(): Promise<Datasource[]> {
    const res = await this.http.get<{ datasources: Datasource[] }>(this.paths.datasources);
    return res.datasources;
  }

  async listAlerts(): Promise<UnifiedAlert[]> {
    const res = await this.http.get<any>(this.paths.alerts);
    return res.results ?? res.alerts ?? [];
  }

  async listRules(): Promise<UnifiedRule[]> {
    const res = await this.http.get<any>(this.paths.rules);
    return res.results ?? res.rules ?? [];
  }
}
