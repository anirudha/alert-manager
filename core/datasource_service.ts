/**
 * Datasource service — manages alert datasource configurations
 */
import { Datasource, DatasourceService, PrometheusBackend, Logger } from './types';

export class InMemoryDatasourceService implements DatasourceService {
  private datasources: Map<string, Datasource> = new Map();
  private counter = 0;
  private promBackend?: PrometheusBackend;

  constructor(private readonly logger: Logger) {}

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
    // In mock mode, always succeed
    return { success: true, message: 'Connection successful' };
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
