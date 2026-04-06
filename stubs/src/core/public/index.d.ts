export interface CoreSetup {
  application: { register(app: any): void };
  chrome: {
    navGroup: { getNavGroupEnabled(): boolean; addNavLinksToGroup(group: any, links: any[]): void };
  };
  getStartServices(): Promise<[CoreStart, any]>;
}
export interface CoreStart {
  notifications: any;
  http: any;
}
export interface AppMountParameters {
  appBasePath: string;
  element: HTMLElement;
}
export interface Plugin<S, T> {
  setup(core: CoreSetup): S;
  start(core: CoreStart): T;
  stop?(): void;
}
export declare const DEFAULT_NAV_GROUPS: { observability: any };
