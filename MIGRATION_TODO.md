# Migration TODO: alert-manager -> dashboards-observability

This document lists all changes required when importing alert-manager code into
dashboards-observability. These changes depend on dashboards-observability
infrastructure and **cannot** be made in this repo without breaking the
standalone OSD plugin.

### Prep work already completed

- Standalone Express server removed (`standalone/` deleted)
- Mock mode removed from `server/plugin.ts` (no `ALERT_MANAGER_MOCK_MODE`)
- Mock seed data removed from `SloService` (no `mockMode`, `seed()`)
- `TablePagination` replaced with EUI built-in pagination in 3 components
- `ErrorBoundary` removed (dashboards-observability provides app-level error handling)
- Workspace discovery removed from frontend (server-side auto-discovery kept)
- `AlarmsApiClient` stripped to OSD-only (no standalone paths/mode)
- Auth credentials stripped from all datasource REST API responses
- `validate: false` fixed to `validate: {}` on 3 routes
- CI workflows cleaned (standalone job removed, publish.yml deleted)
- Duplicate color constants consolidated in flyout files
- Dead state, imports, exports cleaned across codebase
- All 895 unit tests and 71 Cypress E2E tests pass

---

## Phase 0: Scaffolding (in dashboards-observability)

- [ ] Create `common/constants/alerting.ts` with plugin ID, title, route prefix
- [ ] Create directory skeleton: `common/types/alerting/`, `public/components/alerting/`,
      `server/routes/alerting/`, `server/services/alerting/`, `server/saved_objects/alerting/`
- [ ] Add `js-yaml: ^4.1.1` to `package.json`

---

## Phase 1: Server — Replace Custom HTTP Client with OSD Scoped Client

### 1.1 Introduce ITransport interface
Create `common/transport.ts`:
```typescript
export interface ITransport {
  request<T = unknown>(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    query?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ status: number; body: T }>;
}
```

### 1.2 Refactor HttpOpenSearchBackend (`common/opensearch_backend.ts`)
- Change constructor to accept `ITransport` instead of creating `new HttpClient(logger)`
- Remove `envAuth()` method (lines 41-44) — env-var credential fallback is a security anti-pattern in OSD
- Remove `buildAuthFromDatasource(ds) ?? this.envAuth()` pattern — auth handled by transport layer

### 1.3 Refactor DirectQueryPrometheusBackend (`common/directquery_prometheus_backend.ts`)
- Change constructor to accept `ITransport` instead of creating `new HttpClient(logger)`
- Remove stored `defaultAuth`/`baseUrl` from constructor — auth comes from OSD scoped client
- Make alertmanager methods accept `ds: Datasource` param instead of using mutable `_defaultDs` state

### 1.4 Create OSD scoped transport
In `server/plugin.ts`, create an `OsdScopedTransport` that wraps
`context.core.opensearch.legacy.client.callAsCurrentUser()` and passes it to both backends.
`http_client.ts` becomes a test-only implementation of `ITransport`.

### 1.5 Delete credential resolution
- Delete `readOsdConfigCredentials()` from `server/plugin.ts`
- Delete all `process.env.OPENSEARCH_USER/PASSWORD` references
- Delete `admin/admin` fallback
- Delete OpenSearch datasource auto-seeding with credentials

---

## Phase 2: Server — Replace InMemoryDatasourceService with SavedObjects

### 2.1 Separate store from service concerns
The `DatasourceService` interface currently includes `testConnection()` and `listWorkspaces()`.
Extract a pure CRUD `DatasourceStore` interface, similar to `ISloStore`:
```typescript
export interface DatasourceStore {
  list(): Promise<Datasource[]>;
  get(id: string): Promise<Datasource | null>;
  create(input: Omit<Datasource, 'id'>): Promise<Datasource>;
  update(id: string, input: Partial<Datasource>): Promise<Datasource | null>;
  delete(id: string): Promise<boolean>;
}
```

### 2.2 Implement SavedObjectDatasourceStore
Register `alerting-datasource` saved object type in plugin setup.
Implement `SavedObjectDatasourceStore` following `slo_saved_object_store.ts` pattern.
Swap in `start()` the same way SloService upgrades storage.

### 2.3 ~~Strip auth credentials from REST API responses~~ (DONE)
Fixed during prep: `sanitizeDatasource()` strips `auth` and `tls` from all 4 datasource
API responses (`handleListDatasources`, `handleGetDatasource`, `handleCreateDatasource`,
`handleUpdateDatasource`).

---

## Phase 3: Server — Route Validation

### 3.1 ~~Fix routes with `validate: false`~~ (DONE)
Fixed during prep: all `validate: false` changed to `validate: {}`.

### 3.2 Fix routes with `{ unknowns: 'allow' }` (no real validation)
- Suppression rule POST/PUT bodies — `server/routes/index.ts:413,429`
- SLO update body — `server/routes/index.ts:609`
- Monitor schedule/inputs/triggers — `server/routes/index.ts:235-237` (uses `schema.any()`)

Add proper field schemas for each.

### 3.3 Remove duplicate handler-level validation
`handleCreateDatasource` in `server/routes/handlers.ts:42-48` manually validates `name`, `type`, `url`
which the OSD router already validates. Delete the manual checks.

---

## Phase 4: Frontend — Delete Plugin Shell Files

These files are replaced by dashboards-observability's app framework:

### 4.1 Delete `public/plugin.ts`
OSD application registration is handled by dashboards-observability's `public/plugin.tsx`.
Add alerting to its `core.application.register()` calls instead.

### 4.2 Delete `public/application.tsx`
`ReactDOM.render` is handled by dashboards-observability's mount function.

### 4.3 Delete `public/components/app.tsx`
Router, I18nProvider, TopNavMenu are already provided by dashboards-observability's app shell.
The `createOsdHttpClient()` adapter is unnecessary since `coreRefs.http` provides the same interface.

---

## Phase 5: Frontend — Reuse dashboards-observability Utilities

### 5.1 Replace HTTP prop drilling with coreRefs (`public/services/alarms_client.ts`)
`AlarmsApiClient` currently takes `http` via constructor, threaded through ~20 component props.
Change to use `coreRefs.http` singleton from `public/framework/core_refs.ts`:
```typescript
import { coreRefs } from '../../framework/core_refs';
export class AlarmsApiClient {
  private get http() { return coreRefs.http!; }
  constructor() {} // no params needed
}
```
Then remove `apiClient` prop from `AlarmsPage` and all child components.

### 5.2 Replace custom toast system (`public/components/alarms_page.tsx`)
Delete the ~30 lines of `useState` + `addToast` + `<EuiGlobalToastList>`.
Replace with dashboards-observability's `useToast` hook:
```typescript
import { useToast } from '../common/toast';
const { setToast } = useToast();
// setToast('Alert acknowledged', 'success_toast')
// setToast('Failed', 'danger_toast', errMsg)
```
~15 `addToast(...)` call sites in the component need updating.

### 5.3 Add breadcrumb management
No breadcrumbs exist currently. Add `setNavBreadCrumbs` calls:
```typescript
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
// On tab change:
setNavBreadCrumbs(
  [{ text: 'Observability', href: '/' }, { text: 'Alerting', href: '/alerting' }],
  [{ text: 'Alerts' }]
);
```
Add at `AlarmsPage` level for each tab, and in each flyout for drill-down breadcrumbs.

### 5.4 Replace delete confirm modals with DeleteModal
3 inline `<EuiConfirmModal>` delete patterns in:
- `public/components/monitors_table.tsx`
- `public/components/monitor_detail_flyout.tsx`
- `public/components/slo_detail_flyout.tsx`

Replace with:
```typescript
import { DeleteModal } from '../common/helpers/delete_modal';
```

### 5.5 Replace inline empty prompts with EmptyState
3+ inline `<EuiEmptyPrompt>` blocks in:
- `public/components/alerts_dashboard.tsx`
- `public/components/monitors_table.tsx`
- `public/components/slo_listing.tsx`

Replace with:
```typescript
import { EmptyState } from '../apm/shared/components/empty_state';
```

### 5.6 Replace raw EuiFlyout with FlyoutContainers
3 flyout components use raw `<EuiFlyout>`:
- `public/components/alert_detail_flyout.tsx`
- `public/components/monitor_detail_flyout.tsx`
- `public/components/slo_detail_flyout.tsx`

Wrap with `FlyoutContainers` from `public/components/common/flyout_containers/`
for consistent sizing/styling with other observability flyouts.

### 5.7 Replace setInterval with usePolling
`public/components/ai_monitor_wizard.tsx` uses raw `setInterval` (line 576).
Replace with dashboards-observability's `usePolling` hook from
`public/components/hooks/use_polling.ts`.

### 5.8 Handle echarts_render.tsx
`public/components/echarts_render.tsx` is used by 5 components.
Options:
- If dashboards-observability's `Plt` can render the same ECharts specs, use `Plt` instead
- Otherwise, promote `echarts_render.tsx` to `public/components/common/echarts_render.tsx` as shared utility

Consumers: `alerts_charts.tsx`, `slo_charts.tsx`, `monitor_detail_flyout.tsx`,
`create_logs_monitor.tsx`, `create_metrics_monitor.tsx`

---

## Phase 6: Frontend — Code Cleanup

### 6.1 Consolidate duplicate color constants
`alerts_dashboard.tsx` and `alerts_charts.tsx` define local hex-color variants of
`SEVERITY_COLORS`/`STATE_COLORS` (for ECharts rendering). These are intentionally
different from the semantic OUI color names in `shared_constants.ts`. Consider adding
hex variants as separate exports (e.g., `SEVERITY_HEX_COLORS`) in `shared_constants.ts`.

Note: Flyout files (`alert_detail_flyout.tsx`, `monitor_detail_flyout.tsx`) already
import from `shared_constants.ts` — this was consolidated in the prep cleanup.

### 6.2 Consolidate INTERNAL_LABEL_KEYS
Defined in 4 places with slightly different contents:
- `alerts_dashboard.tsx`
- `monitors_table.tsx`
- `alert_detail_flyout.tsx`
- `monitor_detail_flyout.tsx`

Move to single export in `shared_constants.ts`.

### 6.3 Populate plugin Setup/Start types
`server/types.ts` has empty `AlarmsPluginSetup`/`AlarmsPluginStart` interfaces.
Populate with services that other observability features may consume:
```typescript
export interface AlarmsPluginSetup {
  alertService: MultiBackendAlertService;
  sloService: SloService;
  datasourceService: DatasourceService;
}
```

---

## Verification Checklist

After migration:
- [ ] `grep -r "standalone\|admin/admin\|OPENSEARCH_USER\|OPENSEARCH_PASSWORD" server/ public/` returns zero
- [ ] `grep -r "http_client" server/ public/` returns zero (replaced by ITransport)
- [ ] All routes use `@osd/config-schema` (no `validate: false`)
- [ ] No `auth.credentials` in REST API responses
- [ ] `yarn build` passes with zero errors
- [ ] `yarn test` passes
- [ ] Smoke test: OSD -> Observability -> Alerting renders all 5 tabs
- [ ] Auth test: access as non-admin user works via scoped client

---

## Code Structure & Key Files for Migration

The plugin follows a three-layer architecture with strict dependency rules:

```
public/ (UI)  -->  common/ (shared logic)  <--  server/ (OSD integration)
```

- **`common/`** — Isomorphic TypeScript (no OSD/React/Node-specific APIs). All business logic lives here.
- **`server/`** — OSD plugin server. Imports from `common/`. Handles lifecycle, routes, persistence.
- **`public/`** — React UI. Imports from `common/` for types. All server calls go through `AlarmsApiClient`.

**Key rule**: `common/` must never import from `public/` or `server/`.

### Target directory structure in dashboards-observability

```
dashboards-observability/
├── common/types/alerting/            <-- from common/types.ts, slo_types.ts, suppression.ts, filter.ts, errors.ts
├── server/routes/alerting/           <-- from server/routes/*.ts
├── server/services/alerting/         <-- from common/alert_service.ts, slo_service.ts, backends, etc.
├── server/saved_objects/alerting/    <-- from server/slo_saved_object_store.ts + new datasource store
├── public/components/alerting/       <-- from public/components/*.tsx
└── public/components/alerting/services/ <-- from public/services/alarms_client.ts
```

### common/ — Shared Logic (migrate to `server/services/alerting/` and `common/types/alerting/`)

| File | Purpose | Migration Notes |
|------|---------|-----------------|
| `types.ts` | Core types: `Datasource`, `OpenSearchBackend`, `PrometheusBackend`, `MultiBackendAlertService`, unified alert/rule types | Move type definitions to `common/types/alerting/`. Move interface implementations to `server/services/alerting/`. |
| `slo_types.ts` | `ISloStore`, `SloDefinition`, `SloInput`, MWMBR tiers | Move to `common/types/alerting/` |
| `alert_service.ts` | `MultiBackendAlertService` — orchestrates both backends, progressive loading, unified views | Move to `server/services/alerting/`. Largest service file (~50K chars). |
| `slo_service.ts` | SLO CRUD, status computation, store abstraction | Move to `server/services/alerting/` |
| `slo_promql_generator.ts` | SLO -> PromQL recording + alerting rules (MWMBR) | Move to `server/services/alerting/`. Stateless, pure — also used client-side for preview. |
| `slo_templates.ts` | 5 pre-built SLO templates, `detectMetricType()` | Move to `server/services/alerting/` |
| `slo_validators.ts` | SLO form validation | Move to `server/services/alerting/` |
| `slo_store.ts` | `InMemorySloStore` (bootstrap fallback) | Move to `server/services/alerting/` |
| `opensearch_backend.ts` | `HttpOpenSearchBackend` — OpenSearch Alerting REST API | **Rewrite** to use OSD scoped client (Phase 1.2) |
| `directquery_prometheus_backend.ts` | `DirectQueryPrometheusBackend` — Prometheus via DirectQuery SQL plugin | **Rewrite** to use OSD scoped client (Phase 1.3) |
| `datasource_service.ts` | `InMemoryDatasourceService` — runtime datasource registry | **Replace** with SavedObjects store (Phase 2) |
| `http_client.ts` | Zero-dependency HTTP client with pooling/retry | **Delete** — replaced by OSD scoped client (Phase 1) |
| `prometheus_metadata_service.ts` | Stale-while-revalidate metadata cache | Move to `server/services/alerting/`. Rewrite to use OSD client. |
| `suppression.ts` | `SuppressionRuleService` | Move to `server/services/alerting/` |
| `serializer.ts` | Monitor import/export | Move to `server/services/alerting/` |
| `promql_validator.ts` | PromQL syntax validation | Move to `server/services/alerting/` |
| `filter.ts` | Alert/rule filtering and sorting | Move to `server/services/alerting/` |
| `validators.ts` | Monitor form validation | Move to `server/services/alerting/` |
| `errors.ts` | Typed error factories | Move to `common/types/alerting/` |
| `constants.ts` | `PLUGIN_ID`, `PLUGIN_NAME` | Replace with `common/constants/alerting.ts` |
| `mock_backend.ts` | Mock backends for testing | Keep for unit tests only |
| `mock_data.ts` | Test fixture data | Keep for unit tests only |
| `mock_enrichment.ts` | Mock enrichment helpers | Keep for unit tests only |
| `testing.ts` | Re-exports mock modules | Keep for unit tests only |

### server/ — OSD Plugin Server (migrate to `server/routes/alerting/` and `server/saved_objects/alerting/`)

| File | Purpose | Migration Notes |
|------|---------|-----------------|
| `plugin.ts` | Plugin lifecycle: setup (services, routes, saved objects) + start (storage upgrade) | **Do not copy.** Wire alerting services into dashboards-observability's `server/plugin.ts` instead. |
| `routes/index.ts` | ~40 route registrations with `@osd/config-schema` validation | Move to `server/routes/alerting/index.ts`. Route prefix stays `/api/alerting/`. |
| `routes/handlers.ts` | Datasource CRUD, unified alert/rule views, monitor CRUD handlers | Move to `server/routes/alerting/`. Includes `sanitizeDatasource()` for credential stripping. |
| `routes/slo_handlers.ts` | SLO CRUD + status + preview handlers | Move to `server/routes/alerting/` |
| `routes/metadata_handlers.ts` | Prometheus metric/label discovery handlers | Move to `server/routes/alerting/` |
| `routes/alertmanager_handlers.ts` | Alertmanager config handler | Move to `server/routes/alerting/` |
| `routes/route_utils.ts` | Error-to-HTTP-status mapping | Move to `server/routes/alerting/` |
| `slo_saved_object_store.ts` | `SavedObjectSloStore` — persists SLOs to OpenSearch | Move to `server/saved_objects/alerting/` |
| `types.ts` | `AlarmsPluginSetup`, `AlarmsPluginStart` (currently empty) | Merge into dashboards-observability's server types |

### public/ — React UI (migrate to `public/components/alerting/`)

| File | Purpose | Migration Notes |
|------|---------|-----------------|
| `plugin.ts` | OSD app registration | **Delete.** Register in dashboards-observability's `public/plugin.tsx` instead. |
| `application.tsx` | ReactDOM mount | **Delete.** Handled by dashboards-observability's mount function. |
| `components/app.tsx` | Router, I18nProvider, TopNavMenu wrapper | **Delete.** Dashboards-observability's app shell provides these. |
| `components/alarms_page.tsx` | Main page — 5 tabs, datasource loading, data fetching | **Keep as entry point.** Replace toast/breadcrumbs with dashboards-observability utilities (Phase 5). |
| `components/alerts_dashboard.tsx` | Alerts tab — charts, table, filters, EUI pagination | Keep. Replace inline empty prompts with `EmptyState`. |
| `components/monitors_table.tsx` | Rules tab — table, search, filters, column customization, bulk actions | Keep. Replace delete modal with `DeleteModal`. |
| `components/slo_listing.tsx` | SLOs tab — table, charts, filters, expandable rows | Keep. |
| `components/create_monitor.tsx` | Monitor creation wizard (orchestrator) | Keep. |
| `components/create_slo_wizard.tsx` | SLO creation wizard (multi-step) | Keep. |
| `components/sli_section.tsx` | SLI form with `useReducer` pattern | Keep. |
| `components/promql_editor.tsx` | PromQL editor with syntax highlighting, autocomplete | Keep. |
| `components/alert_detail_flyout.tsx` | Alert detail side panel | Keep. Wrap with `FlyoutContainers`. |
| `components/monitor_detail_flyout.tsx` | Monitor detail side panel | Keep. Wrap with `FlyoutContainers`. |
| `components/slo_detail_flyout.tsx` | SLO detail side panel | Keep. Wrap with `FlyoutContainers`. |
| `components/suppression_rules_panel.tsx` | Suppression rules management | Keep. |
| `components/notification_routing_panel.tsx` | Alert routing config | Keep. |
| `components/echarts_render.tsx` | Generic ECharts wrapper (59 lines) | Promote to `public/components/common/echarts_render.tsx` or replace with `Plt`. |
| `components/alerts_charts.tsx` | Alert visualizations (ECharts) | Keep. |
| `components/slo_charts.tsx` | SLO visualizations (ECharts) | Keep. |
| `components/shared_constants.ts` | Color maps, formatting utilities | Keep. |
| `components/facet_filter_panel.tsx` | Reusable facet filter UI | Keep. |
| `components/metric_browser.tsx` | Metric exploration tool | Keep. |
| `components/ai_monitor_wizard.tsx` | AI-assisted monitor creation | Keep. |
| `services/alarms_client.ts` | API client — OSD paths, caching, dedup | Keep. Replace `http` constructor param with `coreRefs.http` (Phase 5.1). |
| `hooks/use_prometheus_metadata.ts` | Debounced metadata discovery hook | Keep. |

### Files NOT to migrate (test/build infrastructure)

These stay in the alert-manager repo or are recreated as part of dashboards-observability's existing infrastructure:

- `cypress/` — E2E tests (adapt to `.cypress/integration/alerting/` format)
- `docker/` — Slim CI stack (not needed, dashboards-observability has its own)
- `scripts/` — Build/deploy scripts
- `jest.config.js`, `tsconfig.json`, `cypress.config.js` — Config files
- `build.sh`, `package.json` — Build infrastructure
- `public/__mocks__/` — Jest mocks (adapt to dashboards-observability's `test/__mocks__/` pattern)
- `server/__mocks__/` — OSD server mocks

### Architecture diagram

```
                    MultiBackendAlertService (common/alert_service.ts)
                    +------------------+------------------+
                    |                                     |
              OpenSearchBackend                   PrometheusBackend
         (common/opensearch_backend.ts)    (common/directquery_prometheus_backend.ts)
                    |                                     |
              OpenSearch                          DirectQuery SQL Plugin
              _plugins/_alerting                  --> Prometheus/Cortex
                    |                                     |
                    +------ DatasourceService -------------+
                           (common/datasource_service.ts)

                    SloService (common/slo_service.ts)
                    +------------------+------------------+
                    |                  |                  |
              ISloStore          SloPromqlGenerator    SloValidators
         (SavedObjectSloStore)  (common/slo_promql_   (common/slo_
                                 generator.ts)         validators.ts)

Frontend:
  AlarmsPage --> AlarmsApiClient --> /api/alerting/* --> Route Handlers --> Services
       |
       +-- AlertsDashboard (alerts tab)
       +-- MonitorsTable (rules tab)
       +-- SloListing (SLOs tab)
       +-- SuppressionRulesPanel (suppression tab)
       +-- NotificationRoutingPanel (routing tab)
```
