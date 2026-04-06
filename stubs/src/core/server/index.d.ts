export interface PluginInitializerContext {
  logger: { get(): Logger };
}
export interface CoreSetup {
  http: { createRouter(): IRouter };
  savedObjects: { registerType(type: any): void };
}
export interface CoreStart {
  savedObjects: {
    createInternalRepository(includedHiddenTypes?: string[]): SavedObjectsClientContract;
  };
}
export interface Plugin<S, T> {
  setup(core: CoreSetup): S;
  start(core: CoreStart): T;
  stop?(): void;
}
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
export interface IRouter {
  get(opts: any, handler: any): void;
  post(opts: any, handler: any): void;
  put(opts: any, handler: any): void;
  delete(opts: any, handler: any): void;
}
export interface SavedObjectsClientContract {
  get(type: string, id: string): Promise<any>;
  find(options: any): Promise<{ saved_objects: any[]; total: number }>;
  create(type: string, attributes: any, options?: any): Promise<any>;
  delete(type: string, id: string): Promise<any>;
}
