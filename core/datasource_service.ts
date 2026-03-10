/**
 * Datasource service — manages alert datasource configurations
 */
import { Datasource, DatasourceService, PrometheusBackend, Logger } from './types';
import { HttpClient, buildAuthFromDatasource } from './http_client';

export class InMemoryDatasourceService implements DatasourceService {
  private datasources: Map<string, Datasource> = new Map();
  private counter = 0;
  private promBackend?: PrometheusBackend;
  private readonly httpClient: HttpClient;

  constructor(private readonly logger: Logger) {
    this.httpClient = new HttpClient(logger);
  }

  setPrometheusBackend(backend: PrometheusBackend): void {
    this.promBackend = backend;
  }

  async list(): Promise<Datasource[]> {
    return Array.from(this.datasources.values());
  }

  async get(id: string): Promise<Datasource | null> {
    return this.datasources.get(id) ?? null;
  }

  async create(input: Omit<Datasource, 'id'>): Promise<Datasource> {
    const id = `ds-${++this.counter}`;
    const datasource: Datasource = { id, ...input };
    this.datasources.set(id, datasource);
    this.logger.info(`Created datasource: ${id} (${input.name})`);
    return datasource;
  }

  async update(id: string, input: Partial<Datasource>): Promise<Datasource | null> {
    const datasource = this.datasources.get(id);
    if (!datasource) return null;
    
    Object.assign(datasource, input);
    this.logger.info(`Updated datasource: ${id}`);
    return datasource;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.datasources.delete(id);
    if (existed) this.logger.info(`Deleted datasource: ${id}`);
    return existed;
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const datasource = this.datasources.get(id);
    if (!datasource) {
      return { success: false, message: 'Datasource not found' };
    }

    try {
      if (datasource.type === 'opensearch') {
        const resp = await this.httpClient.request({
          method: 'GET',
          url: `${datasource.url.replace(/\/+$/, '')}/_cluster/health`,
          auth: buildAuthFromDatasource(datasource),
          rejectUnauthorized: false,
          timeoutMs: 5000,
        });
        const status = resp.body?.status; // green, yellow, red
        return { success: true, message: `Connected. Cluster health: ${status}` };
      } else if (datasource.type === 'prometheus') {
        await this.httpClient.request({
          method: 'GET',
          url: `${datasource.url.replace(/\/+$/, '')}/-/healthy`,
          timeoutMs: 5000,
        });
        return { success: true, message: 'Prometheus is healthy' };
      }
      return { success: false, message: `Unknown datasource type: ${datasource.type}` };
    } catch (err) {
      return {
        success: false,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async listWorkspaces(dsId: string): Promise<Datasource[]> {
    const ds = this.datasources.get(dsId);
    if (!ds || ds.type !== 'prometheus' || !this.promBackend) return [];

    const workspaces = await this.promBackend.listWorkspaces(ds);
    return workspaces.map(ws => ({
      id: `${dsId}::${ws.id}`,
      name: `${ds.name} / ${ws.alias || ws.name}`,
      type: ds.type,
      url: ds.url,
      enabled: ws.status === 'active',
      workspaceId: ws.id,
      workspaceName: ws.name,
      parentDatasourceId: dsId,
    }));
  }

  // Helper to seed initial datasources
  seed(datasources: Omit<Datasource, 'id'>[]): void {
    for (const ds of datasources) {
      this.create(ds);
    }
  }
}
