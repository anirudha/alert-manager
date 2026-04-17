# Alert Manager — Architecture & Code Structure

## Overview

Alert Manager is a **multi-backend alerting plugin** for OpenSearch Dashboards (OSD). It provides a unified interface for managing alerts, monitoring rules, and SLOs across both OpenSearch and Prometheus datasources. The plugin aggregates data from multiple backends into a single pane of glass, enabling operators to monitor heterogeneous observability stacks from one UI.

```
┌──────────────────────────────────────────────────────────────────┐
│                    OpenSearch Dashboards (OSD)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Alert Manager Plugin (this repo)              │  │
│  │                                                            │  │
│  │  public/          common/            server/               │  │
│  │  React UI ◄────► Shared Logic ◄────► OSD Routes            │  │
│  │  (browser)        (isomorphic)       (Node.js)             │  │
│  └───────┬──────────────────────────────────────┬─────────────┘  │
│          │ HTTP (OSD proxy)                      │                │
│          ▼                                       ▼                │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │  OpenSearch   │  │ Prometheus   │  │ OSD Saved Objects   │    │
│  │  Alerting API │  │ (via DQ*)    │  │ (SLO persistence)   │    │
│  └──────────────┘  └──────────────┘  └─────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                    * DQ = DirectQuery (SQL plugin)
```

---

## Directory Structure

```
alert-manager/
├── common/                      # Shared isomorphic code (Node + browser)
│   ├── types.ts                 # Core type definitions (all backends)
│   ├── slo_types.ts             # SLO domain types
│   ├── index.ts                 # Barrel exports
│   ├── alert_service.ts         # Multi-backend orchestrator
│   ├── slo_service.ts           # SLO lifecycle management
│   ├── slo_promql_generator.ts  # SLO → PromQL rule generation
│   ├── slo_templates.ts         # Pre-built SLO templates
│   ├── slo_validators.ts        # SLO form validation
│   ├── slo_store.ts             # InMemorySloStore
│   ├── datasource_service.ts    # In-memory datasource registry
│   ├── opensearch_backend.ts    # OpenSearch alerting backend
│   ├── directquery_prometheus_backend.ts  # Prometheus via OpenSearch DirectQuery
│   ├── prometheus_metadata_service.ts     # Stale-while-revalidate metadata cache
│   ├── http_client.ts           # HTTP wrapper
│   ├── mock_backend.ts          # Full mock for testing/standalone
│   ├── mock_data.ts             # Test fixtures
│   ├── validators.ts            # Monitor form validation
│   ├── promql_validator.ts      # PromQL syntax checker
│   ├── serializer.ts            # Monitor serialization
│   ├── suppression.ts           # Suppression rule logic
│   ├── filter.ts                # Alert/rule filtering & sorting
│   ├── errors.ts                # Typed error factories
│   ├── constants.ts             # PLUGIN_ID, PLUGIN_NAME
│   └── __tests__/               # Unit tests for common/
│
├── server/                      # OSD plugin server-side
│   ├── plugin.ts                # Plugin lifecycle (setup/start/stop)
│   ├── types.ts                 # Server-specific type exports
│   ├── slo_saved_object_store.ts  # SavedObject-backed ISloStore
│   ├── __mocks__/               # OSD server mocks for Jest
│   └── routes/
│       ├── index.ts             # Route definitions (~40 endpoints)
│       ├── handlers.ts          # Unified alert/rule request handlers
│       ├── slo_handlers.ts      # SLO-specific request handlers
│       ├── metadata_handlers.ts # Prometheus metadata handlers
│       ├── alertmanager_handlers.ts  # Alertmanager config handler
│       └── __tests__/           # Route handler unit tests
│
├── public/                      # OSD plugin client-side (React)
│   ├── plugin.ts                # Plugin registration with OSD
│   ├── application.tsx          # App mount point
│   ├── components/
│   │   ├── app.tsx              # OSD wrapper (routing, i18n, nav)
│   │   ├── alarms_page.tsx      # Main page (tab navigation)
│   │   ├── alerts_dashboard.tsx # Alerts tab
│   │   ├── monitors_table.tsx   # Rules/Monitors tab
│   │   ├── slo_listing.tsx      # SLOs tab
│   │   ├── create_monitor.tsx   # Monitor creation wizard
│   │   ├── create_slo_wizard.tsx  # SLO creation wizard
│   │   ├── sli_section.tsx      # SLI form (useReducer pattern)
│   │   ├── promql_editor.tsx    # PromQL editor with autocomplete
│   │   ├── alert_detail_flyout.tsx   # Alert detail side panel
│   │   ├── monitor_detail_flyout.tsx # Monitor detail side panel
│   │   ├── slo_detail_flyout.tsx     # SLO detail side panel
│   │   ├── suppression_rules_panel.tsx  # Suppression rules management
│   │   ├── slo_charts.tsx       # SLO visualizations (ECharts)
│   │   ├── alerts_charts.tsx    # Alert visualizations (ECharts)
│   │   └── ... (30+ components total)
│   ├── services/
│   │   └── alarms_client.ts     # API client (mode-aware HTTP)
│   ├── hooks/
│   │   └── use_prometheus_metadata.ts  # Metadata discovery hook
│   └── __mocks__/               # OUI/EUI component mocks for Jest
│
├── cypress/                     # E2E tests
│   ├── e2e/                     # 8 spec files, 71 tests
│   └── support/                 # Test helpers & commands
│
├── docker/                      # Slim CI Docker stack
│   ├── docker-compose.yml       # OpenSearch + OSD + Cortex
│   ├── cortex-config.yml
│   └── init-osd.sh              # Workspace bootstrap
│
├── scripts/                     # Build & E2E scripts
│   ├── e2e-osd.sh               # Full OSD E2E runner
│   └── e2e-ci.sh                # CI-friendly slim stack E2E
│
├── jest.config.js               # Two Jest projects: server + components
├── tsconfig.json                # Extends OSD monorepo tsconfig
├── cypress.config.js            # Cypress configuration
├── build.sh                     # Plugin build wrapper
└── package.json                 # Dependencies & scripts
```

---

## Core Architecture Concepts

### 1. Three-Layer Design

The codebase is split into three layers with strict dependency rules:

```
public/ (UI)  →  common/ (shared logic)  ←  server/ (OSD integration)
```

- **`common/`** — Isomorphic TypeScript. No OSD imports, no React imports, no Node-specific APIs. Runs in both browser and Node.js. Contains all business logic, type definitions, backend implementations, and services.
- **`server/`** — OSD plugin server. Imports from `common/`. Handles OSD lifecycle, route registration, saved object persistence, and credential resolution.
- **`public/`** — React UI. Imports from `common/` for types and constants. All server communication goes through `AlarmsApiClient`.

**Key rule**: `common/` must never import from `public/` or `server/`.

### 2. Multi-Backend Abstraction

The plugin supports two alerting backends behind a unified interface:

```
                    MultiBackendAlertService
                    ┌──────────┬──────────┐
                    │          │          │
              OpenSearchBackend    PrometheusBackend
                    │                    │
              OpenSearch            DirectQuery
              _alerting API         (SQL plugin → Prometheus)
```

**`OpenSearchBackend`** (`common/opensearch_backend.ts`):
- Talks to the OpenSearch Alerting plugin REST API (`_plugins/_alerting`)
- Manages monitors, triggers, actions, destinations, and alerts
- Direct HTTP calls to the OpenSearch cluster

**`PrometheusBackend`** (`common/directquery_prometheus_backend.ts`):
- Accesses Prometheus through OpenSearch's DirectQuery/SQL plugin
- Reads rule groups, active alerts, and Alertmanager state
- Also implements `PrometheusMetadataProvider` for metric discovery
- Supports `queryRange()` and `queryInstant()` for time-series queries

**`MultiBackendAlertService`** (`common/alert_service.ts`):
- Orchestrates both backends
- Provides unified alert/rule views that normalize data from both sources
- Supports progressive loading with per-datasource timeouts and status tracking
- Each datasource fetch runs in parallel with individual timeout handling

### 3. Unified Type System

Alerts and rules from different backends are normalized into unified types:

```
OpenSearch Monitor  ──┐
                      ├──► UnifiedRuleSummary / UnifiedRule
Prometheus Rule     ──┘

OpenSearch Alert    ──┐
                      ├──► UnifiedAlertSummary / UnifiedAlert
Prometheus Alert    ──┘
```

Key unified types (defined in `common/types.ts`):
- **`UnifiedAlertSummary`** — Common alert fields: id, name, state, severity, labels, timestamps
- **`UnifiedRuleSummary`** — Common rule fields: id, name, enabled, severity, query, health status
- **`UnifiedAlert`** / **`UnifiedRule`** — Extended versions with the original `raw` object attached

Severity is normalized from OpenSearch's 1-5 scale and Prometheus labels into: `critical | high | medium | low | info`.

Alert state is normalized into: `active | pending | acknowledged | silenced | resolved | error`.

### 4. Progressive Loading

When fetching from multiple datasources, the service uses progressive loading:

```typescript
interface ProgressiveResponse<T> {
  results: T[];                              // Aggregated data
  datasourceStatus: DatasourceFetchResult[];  // Per-datasource status
  totalDatasources: number;
  completedDatasources: number;
  fetchedAt: string;
}
```

Each datasource fetch is tracked independently with states: `pending → loading → success | error | timeout`. The UI can show partial results as datasources complete, rather than waiting for all to finish.

---

## Server-Side Architecture

### Plugin Lifecycle (`server/plugin.ts`)

The OSD plugin follows the standard `setup()` / `start()` / `stop()` lifecycle:

**`setup(core)`**:
1. Registers the `slo-definition` saved object type
2. Creates service instances: `InMemoryDatasourceService`, `MultiBackendAlertService`, `SloService`, `SuppressionRuleService`
3. Resolves OpenSearch credentials (env vars → OSD config → fallback)
4. Creates and registers `HttpOpenSearchBackend` and `DirectQueryPrometheusBackend`
5. Auto-seeds the local OpenSearch as a datasource
6. Auto-discovers Prometheus datasources from the DirectQuery/SQL plugin
7. Conditionally initializes `PrometheusMetadataService` (via `isMetadataProvider()` runtime type guard)
8. Registers all HTTP routes (~40 endpoints)

**`start(core)`**:
- Upgrades SLO storage from `InMemorySloStore` to `SavedObjectSloStore`
- This two-phase approach is needed because `SavedObjectsClient` isn't available during `setup()`

### Route Organization (`server/routes/`)

Routes are defined in `index.ts` and delegate to framework-agnostic handler functions:

```
server/routes/
├── index.ts                  # Route registration (OSD router + @osd/config-schema validation)
├── handlers.ts               # Unified alert/rule handlers, datasource CRUD, monitor CRUD
├── slo_handlers.ts           # SLO CRUD + status + preview
├── metadata_handlers.ts      # Prometheus metric/label discovery
└── alertmanager_handlers.ts  # Alertmanager configuration
```

Handler functions are pure: they accept services and request data, return `{ status, body }`. The OSD route wrapper in `index.ts` handles schema validation and HTTP response formatting. This separation allows handlers to be tested without OSD infrastructure.

### API Endpoints

| Category | Prefix | Endpoints |
|----------|--------|-----------|
| **Datasources** | `/api/alerting/datasources` | CRUD + test connection |
| **Unified Views** | `/api/alerting/unified/` | `alerts`, `rules` (aggregated from all backends) |
| **OpenSearch** | `/api/alerting/opensearch/{dsId}/` | monitors CRUD, alerts, acknowledge |
| **Prometheus** | `/api/alerting/prometheus/{dsId}/` | rules, alerts |
| **Detail Views** | `/api/alerting/rules/{dsId}/{id}` | Rule/alert detail (for flyouts) |
| **Alertmanager** | `/api/alerting/alertmanager/` | config |
| **Suppression** | `/api/alerting/suppression-rules` | CRUD |
| **Metadata** | `/api/alerting/prometheus/{dsId}/metadata/` | metrics, labels, label-values, metric-metadata |
| **SLOs** | `/api/alerting/slos` | CRUD, statuses, preview |

### SLO Persistence

SLOs use a pluggable storage interface:

```typescript
interface ISloStore {
  get(id: string): Promise<SloDefinition | null>;
  list(datasourceId?: string): Promise<SloDefinition[]>;
  save(slo: SloDefinition): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

Two implementations:
- **`InMemorySloStore`** (`common/slo_store.ts`) — Map-based, used during plugin `setup()` and in tests
- **`SavedObjectSloStore`** (`server/slo_saved_object_store.ts`) — Persists to OpenSearch via OSD's saved objects framework. Paginates through results to avoid the 1000-object cap.

The `SloService` starts with `InMemorySloStore` and upgrades to `SavedObjectSloStore` when `plugin.start()` is called.

---

## Client-Side Architecture

### Component Hierarchy

```
AlarmsApp (app.tsx)
  └── AlarmsPage (alarms_page.tsx)         — Tab navigation, datasource loading
       ├── AlertsDashboard                  — Alerts tab (charts + table)
       │   ├── AlertsSummaryCards            — Severity/state aggregations
       │   ├── AlertsCharts                  — ECharts visualizations
       │   └── AlertDetailFlyout             — Side panel for alert details
       │
       ├── MonitorsTable                    — Rules/Monitors tab
       │   ├── FacetFilterPanel              — Severity/state/type filters
       │   └── MonitorDetailFlyout           — Side panel for rule details
       │
       ├── SloListing                       — SLOs tab
       │   ├── SloSummaryCards               — Status aggregation cards
       │   ├── SloCharts                     — Error budget & attainment charts
       │   ├── SloDetailFlyout               — Side panel for SLO details
       │   └── CreateSloWizard               — Multi-step SLO creation
       │       ├── SloTemplateSelector       — Template picker
       │       ├── SliSection                — SLI form (useReducer)
       │       │   └── SliComboBoxes         — Autocomplete inputs
       │       └── SloPreviewPanel           — Generated rule preview
       │
       ├── CreateMonitor                    — Monitor creation wizard
       │   ├── CreateMetricsMonitor          — Prometheus metrics monitor
       │   ├── CreateLogsMonitor             — OpenSearch logs monitor
       │   └── PromqlEditor                  — PromQL editor with autocomplete
       │
       └── SuppressionRulesPanel            — Suppression rules management
```

### API Client (`public/services/alarms_client.ts`)

`AlarmsApiClient` is the single HTTP interface between UI and server:

- **Mode-aware paths**: Uses `OSD_PATHS` constants for all endpoint URLs (e.g., `/api/alerting/slos`)
- **Client-side caching**: 30-second TTL with `Map<string, CacheEntry>`, plus request deduplication for concurrent calls to the same endpoint
- **Paginated fetches**: `listAlertsPaginated()` and `listRulesPaginated()` support server-side pagination
- **Graceful degradation**: Metadata endpoints return empty results on failure, never throw

```typescript
const apiClient = new AlarmsApiClient(httpClient);
const alerts = await apiClient.listAlertsPaginated(['ds-1', 'ds-2'], 1, 50);
const slos = await apiClient.listSlos();
const metrics = await apiClient.getMetricNames('ds-1', 'http_');
```

### Key UI Patterns

**Tab-based navigation**: `AlarmsPage` manages tabs (Alerts, Rules, SLOs, Suppression) with lazy rendering. Each tab manages its own data fetching and state.

**Flyout detail panels**: Clicking a row opens a flyout (`EuiFlyout`) that fetches and displays detailed information. Flyouts use the `getAlertDetail()` / `getRuleDetail()` / `getSlo()` API methods.

**useReducer for complex forms**: The SLI section (`sli_section.tsx`) uses `useReducer` with discriminated union actions rather than multiple `useState` calls. This keeps form state transitions explicit and testable.

**Prometheus metadata hook**: `usePrometheusMetadata` provides debounced autocomplete for metric names, label names, and label values. It degrades gracefully — if metadata endpoints fail, inputs fall back to plain text.

---

## SLO System

The SLO subsystem is the most architecturally complex part of the codebase.

### Data Flow

```
User Input (CreateSloWizard)
    │
    ▼
SloInput (validated by slo_validators.ts)
    │
    ▼
SloService.create()
    ├── Validates input
    ├── Generates ID, timestamps, rule names
    ├── Calls generateSloRuleGroup() → PromQL rules
    ├── Persists SloDefinition to ISloStore
    └── Returns SloDefinition
    │
    ▼
Generated PromQL Rules (YAML)
    │ (deployed to Prometheus ruler)
    ▼
Recording Rules evaluate every 60s
    │
    ▼
SloService.getStatus() queries Prometheus
    └── Returns SloLiveStatus (attainment, error budget, burn rates)
```

### SLO → PromQL Generation (`common/slo_promql_generator.ts`)

The generator converts an `SloDefinition` into a Prometheus rule group containing:

1. **Recording rules** at 7 window granularities (5m, 30m, 1h, 2h, 6h, 1d, 3d) — Pre-computes `rate()` to avoid expensive large-window calculations at query time
2. **MWMBR alerting rules** — Multi-window multi-burn-rate alerts per the [Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/)
3. **SLI health alerts** — Fires when the SLI recording rules produce errors
4. **Attainment breach alerts** — Fires when attainment drops below target
5. **Error budget warning alerts** — Fires when remaining budget crosses threshold

The default burn-rate tiers follow Google's recommendations:

| Severity | Short Window | Long Window | Burn Rate |
|----------|-------------|-------------|-----------|
| Critical | 5m | 1h | 14.4x |
| Critical | 30m | 6h | 6x |
| Warning | 2h | 1d | 3x |
| Warning | 6h | 3d | 1x |

This module is **stateless and pure** — same code runs server-side (for deployment) and client-side (for the preview panel), ensuring no divergence.

### SLO Templates (`common/slo_templates.ts`)

Five pre-built templates to accelerate SLO creation:

| Template | SLI Type | Description |
|----------|----------|-------------|
| HTTP Availability | availability | Good requests = non-5xx responses |
| HTTP Latency P99 | latency_p99 | 99th percentile response time |
| gRPC Availability | availability | Good requests = non-error gRPC status |
| gRPC Latency P99 | latency_p99 | 99th percentile gRPC response time |
| Custom | (user-defined) | Blank template for custom SLIs |

Templates include `detectMetricType()` which uses the metadata API's type field with suffix-heuristic fallback (e.g., `_total` → counter, `_bucket` → histogram).

---

## Prometheus Integration

### DirectQuery Path

The plugin accesses Prometheus through OpenSearch's DirectQuery/SQL plugin rather than connecting to Prometheus directly:

```
Alert Manager Plugin
    │
    ▼
OpenSearch (DirectQuery SQL Plugin)
    │
    ▼
Prometheus-compatible backend (e.g., Cortex, Thanos, AMP)
```

`DirectQueryPrometheusBackend` implements both:
- **`PrometheusBackend`** — Rule groups, alerts, query execution, Alertmanager operations
- **`PrometheusMetadataProvider`** — Metric names, label names, label values, metric metadata

The `isMetadataProvider()` runtime type guard (used in `server/plugin.ts`) checks if the backend supports metadata, and conditionally wires the metadata routes.

### Metadata Caching (`common/prometheus_metadata_service.ts`)

Prometheus metadata is cached with **stale-while-revalidate** strategy:
- Cache hit (fresh): return immediately
- Cache hit (stale): return immediately, trigger background refresh
- Cache miss: wait for fetch, then cache

Differentiated TTLs:
- Metric names: 5 minutes
- Label names: 5 minutes
- Label values: 90 seconds (more volatile)
- Metric metadata: 10 minutes

---

## Datasource Management

### Auto-Discovery

On plugin startup, `server/plugin.ts`:
1. Seeds the local OpenSearch cluster as a datasource (using resolved credentials)
2. Queries the SQL plugin for registered DirectQuery datasources
3. Registers discovered Prometheus datasources in `InMemoryDatasourceService`

### Credential Resolution

OpenSearch credentials are resolved in priority order:
1. Environment variables: `OPENSEARCH_USER`, `OPENSEARCH_PASSWORD`
2. OSD config file (the `--config` YAML passed to OSD)
3. Fallback: `admin` / `admin`

---

## Testing Architecture

### Unit Tests (Jest)

Two Jest projects configured in `jest.config.js`:

| Project | Environment | Scope |
|---------|-------------|-------|
| `server` | Node.js | `common/__tests__/`, `server/**/__tests__/` |
| `components` | jsdom | `public/**/__tests__/` |

**Coverage thresholds**: 80% branches, 90% functions/lines/statements.

Large render-heavy components (alarms_page, alerts_dashboard, monitors_table, slo_listing) are excluded from unit coverage — they're validated by Cypress E2E instead.

**Module mocking**:
- OUI/EUI components: `public/__mocks__/eui_mock.tsx` — Proxy-based auto-stub with explicit mocks for interactive components (EuiCard, EuiConfirmModal, EuiButtonGroup)
- OSD core: `public/__mocks__/osd_core.ts`
- Styles/ECharts: `public/__mocks__/style_mock.ts`

### E2E Tests (Cypress)

8 spec files with 71 tests, running in two modes:

**Standalone mode** (`npm run e2e`): Builds standalone server, starts with MOCK_MODE, runs headless Cypress on port 5603. Fast, no Docker needed.

**Docker OSD mode** (`scripts/e2e-osd.sh`): Full observability stack (OpenSearch + OSD + Cortex), real data, real API calls. Seeds monitors, SLOs, and alerting rules before test run.

| Spec | Tests | Coverage |
|------|-------|----------|
| 01_navigation | 3 | Tab navigation |
| 02_alerts | 7 | Alert dashboard, filtering, detail flyout |
| 03_rules | 8 | Monitor table, CRUD operations |
| 04_slos | 33 | SLO listing, creation wizard, templates, status |
| 05_suppression | 5 | Suppression rule management |
| 06_routing | 3 | Alert routing configuration |
| 07_api | 10 | Direct API endpoint validation |
| 08_error_monitoring | 2 | Error handling edge cases |

---

## Build & Deployment

### Plugin Build

```bash
./build.sh                    # Auto-detects OSD version, runs plugin-helpers build
yarn plugin-helpers build     # Standard OSD plugin optimizer
```

The build produces a zip file that OSD installs as a plugin. The `tsconfig.json` extends the OSD monorepo root tsconfig (`../../tsconfig.json`); CI creates a stub when building standalone.

### Docker Stack (`docker/`)

The slim CI Docker stack contains:
- **OpenSearch 3.6.0** — With alerting and DirectQuery SQL plugins (port 9200)
- **Cortex v1.18.1** — Prometheus-compatible metrics store + ruler API (port 9090)
- **OpenSearch Dashboards 3.6.0** — With the Alert Manager plugin installed (port 5601)
- **osd-init** — Alpine init container that bootstraps workspace and test data

### CI Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `test-and-build.yml` | Push/PR | Unit tests + coverage + standalone build (Node 18 + 20) |
| `cypress-e2e.yml` | Push/PR | Standalone Cypress + OSD plugin Cypress (slim Docker stack) |

---

## Key Design Decisions

1. **Interface-first design**: Interfaces (`PrometheusBackend`, `PrometheusMetadataProvider`, `ISloStore`) are defined before implementations. Runtime type guards (`isMetadataProvider()`) check for optional capabilities.

2. **Framework-agnostic handlers**: Route handlers return `{ status, body }` and never import OSD types. The OSD route layer in `index.ts` handles framework-specific concerns (schema validation, response formatting).

3. **Isomorphic core**: All business logic lives in `common/` and runs unchanged in browser and Node.js. The SLO PromQL generator runs client-side for instant preview and server-side for deployment.

4. **Graceful degradation**: Metadata and enrichment APIs are best-effort. If Prometheus metadata is unavailable, the UI falls back to plain text inputs. Primary workflows (alert viewing, rule management) never block on optional features.

5. **Pluggable storage**: The `ISloStore` interface allows swapping storage backends at runtime (in-memory → SavedObjects), enabling the two-phase OSD plugin lifecycle where saved objects aren't available during `setup()`.

6. **Progressive loading**: Multi-datasource fetches run in parallel with individual timeouts. The UI can render partial results as each datasource completes, providing responsiveness even when some backends are slow.

7. **Stale-while-revalidate caching**: Metadata APIs return stale data instantly while refreshing in the background, providing a responsive autocomplete experience without stale data persisting.
