# Developer Guide

This guide covers everything you need to develop, test, and build the Alert Manager plugin.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Running the Plugin](#running-the-plugin)
  - [1. OSD Plugin Mode (with Observability Stack)](#1-osd-plugin-mode-with-observability-stack)
  - [2. Standalone Mode](#2-standalone-mode)
  - [3. Mock Mode](#3-mock-mode)
- [Building](#building)
  - [OSD Plugin Zip](#osd-plugin-zip)
  - [Standalone Build](#standalone-build)
  - [npm Publish](#npm-publish)
- [Testing](#testing)
  - [Unit Tests (Jest)](#unit-tests-jest)
  - [E2E Tests (Cypress) -- Standalone](#e2e-tests-cypress----standalone)
  - [E2E Tests (Cypress) -- OSD Plugin](#e2e-tests-cypress----osd-plugin)
- [Project Structure](#project-structure)
- [Adding Features](#adding-features)
- [API Paths](#api-paths)
- [Key Gotchas](#key-gotchas)
- [CI Workflows](#ci-workflows)

---

## Architecture Overview

Alert Manager uses a **dual-mode architecture** -- one codebase, two distribution modes:

```
┌──────────────────────────────────────────────────────────┐
│                    Shared Core Layer                      │
│  core/types.ts  core/alert_service.ts  core/slo_types.ts │
│  core/datasource_service.ts  server/routes/handlers.ts   │
│  public/components/*  (shared React UI)                  │
└─────────┬─────────────────────────┬──────────────────────┘
          │                         │
    ┌─────▼──────┐           ┌─────▼──────┐
    │  OSD Plugin │           │  Standalone │
    │    Mode     │           │  npx Mode   │
    ├────────────┤           ├────────────┤
    │ Hapi/IRouter│           │ Express.js  │
    │ SavedObjects│           │ In-Memory   │
    │ Full OSD UI │           │ Webpack UI  │
    ├────────────┤           ├────────────┤
    │ Port 5601   │           │ Port 5603   │
    │ Production  │           │ Dev / Demo  │
    └────────────┘           └────────────┘
```

**Key layers:**

- **`core/`** -- Pure business logic, zero platform dependencies. Services for alerts, datasources, SLOs, and suppression rules. Shared between both modes.
- **`server/`** -- OSD plugin server: Hapi routes via `IRouter`, saved object types, plugin lifecycle.
- **`public/`** -- Shared React + OUI components. Mounted by OSD's app framework or standalone webpack.
- **`standalone/`** -- Express server + webpack client. Separate `package.json`, published to npm.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18 or 20 (< 23 for OSD) | Runtime |
| npm | 8+ | Package management |
| Docker + Docker Compose | Latest | Observability stack (OSD mode) |
| nvm | Any | Switch Node versions |

---

## Running the Plugin

### 1. OSD Plugin Mode (with Observability Stack)

This runs OSD from source with the plugin loaded, connected to the observability stack's OpenSearch, Prometheus, and Alertmanager. Best for **end-to-end plugin development**.

**One-time setup:**

```bash
# Clone the OSD monorepo (if you haven't already)
git clone https://github.com/opensearch-project/OpenSearch-Dashboards.git
cd OpenSearch-Dashboards

# The plugin lives at plugins/alertManager/
# Bootstrap the OSD monorepo (installs all deps + builds internal packages)
yarn osd bootstrap
```

**Start the observability stack (Docker):**

```bash
cd ~/Documents/workspace/observability-stack   # or wherever your stack lives
docker compose up -d
docker compose ps   # Verify all services are healthy
```

The stack runs: OpenSearch (9200), OSD (5601), Prometheus/Cortex (9090), Alertmanager (9093), OTel Collector, Data Prepper.

**Start local OSD (with plugin):**

```bash
# Switch to a compatible Node version (OSD requires < 23)
nvm use 22   # or nvm use 20, nvm use 18

# From the OSD monorepo root
cd ~/Documents/workspace/OpenSearch-Dashboards
yarn start --config config/opensearch_dashboards.dev.yml
```

**What `opensearch_dashboards.dev.yml` does:**
- Runs on **port 5602** (avoids conflict with the Docker OSD on 5601)
- Points at Docker OpenSearch at `https://localhost:9200`
- Uses `admin` / `My_password_123!@#` credentials
- Enables workspace, data source, explore (traces/metrics), and dataset management features

**Access the plugin:**

1. Open `http://localhost:5602` in your browser
2. Log in: `admin` / `My_password_123!@#`
3. The **Observability Stack** workspace loads automatically (shared saved objects from Docker OSD)
4. Navigate to **Alert Manager** via the sidebar, or go to: `http://localhost:5602/<basepath>/w/<workspaceId>/app/alertManager`

> **Note:** The basepath (e.g. `/uyb`) is a random 3-letter string generated on each startup. Check the terminal for `Server running at http://0.0.0.0:5603/<basepath>`.

**How it works:** Both the Docker OSD (port 5601) and your local OSD (port 5602) share the **same OpenSearch backend**. All saved objects -- workspaces, index patterns, dashboards, monitors -- created by the Docker init container are automatically available to your local OSD. The plugin reads OpenSearch credentials from the `--config` file, so no extra env vars are needed.

**Live reload:** OSD dev mode watches for file changes. Edits to `server/` files restart the server automatically. Edits to `public/` files trigger a webpack recompile (refresh your browser).

### 2. Standalone Mode

Standalone mode runs the plugin as an independent Express + React app. Best for **fast UI iteration** without the OSD monorepo overhead.

```bash
cd plugins/alertManager/standalone
npm install --legacy-peer-deps

# Development with hot reload (server + client)
npm run dev
# Server: http://localhost:5603
# Webpack dev server: http://localhost:3000 (proxies API to 5603)

# Or build and run
npm run build
npm start
```

**With real backends:** Set env vars to connect to a running OpenSearch + Prometheus:

```bash
OPENSEARCH_URL=https://localhost:9200 \
OPENSEARCH_USERNAME=admin \
OPENSEARCH_PASSWORD='My_password_123!@#' \
npm start
```

### 3. Mock Mode

Mock mode seeds fake alerts, rules, monitors, and SLOs without any external services. Useful for UI development and CI.

```bash
# Standalone with mock data
cd standalone
MOCK_MODE=true npm start

# OSD plugin with mock data
ALERT_MANAGER_MOCK_MODE=true yarn start --config config/opensearch_dashboards.dev.yml
```

---

## Building

### OSD Plugin Zip

Produces `build/alertManager.zip` -- an installable OSD plugin artifact.

```bash
cd plugins/alertManager
./build.sh
```

**Output:** `build/alertManager.zip` (~4-5 MB)

**What it does:**
1. Compiles server-side TypeScript (`core/`, `server/`, `common/`) to ES2020
2. Bundles client-side code via webpack into a single `alertManager.plugin.js`
3. Creates OSD stubs for out-of-tree compilation (auto-cleaned up)
4. Packages everything into the OSD plugin zip format

**Install to a cluster:**
```bash
# Install
bin/opensearch-dashboards-plugin install file:///path/to/alertManager.zip

# Or in Docker
docker exec opensearch-dashboards \
  bin/opensearch-dashboards-plugin install file:///tmp/alertManager.zip
docker restart opensearch-dashboards
```

> **Note:** `build.sh` is designed for out-of-tree builds (CI, Docker). When the plugin is inside the OSD monorepo, it uses TypeScript stubs to avoid resolving the real `src/core/` source tree.

### Standalone Build

```bash
cd standalone
npm run build
```

**Output:**
- `dist/standalone/server.js` -- Compiled Express server
- `dist/public/bundle.js` -- Bundled React client

### npm Publish

The standalone mode is published to npm as `@opensearch-project/alert-manager`:

```bash
cd standalone
npm publish --access public
```

Users can then run it with:
```bash
npx @opensearch-project/alert-manager
```

---

## Testing

### Unit Tests (Jest)

Two test projects run in parallel:

| Project | Environment | Test Root | What it tests |
|---------|------------|-----------|---------------|
| `server` | Node.js | `core/`, `server/` | Services, backends, route handlers |
| `components` | jsdom | `public/` | React components, UI logic |

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a single test file
npx jest core/__tests__/alert_service.test.ts
npx jest public/__tests__/alerts_tab.test.tsx
```

**Coverage thresholds** (enforced in CI):

| Metric | Threshold |
|--------|-----------|
| Branches | 80% |
| Functions | 90% |
| Lines | 90% |
| Statements | 90% |

Large render-heavy components are excluded from unit coverage and validated via Cypress E2E instead. See `jest.config.js` for the full exclusion list.

**Test naming convention:** `__tests__/<module>.test.ts(x)` co-located with source.

### E2E Tests (Cypress) -- Standalone

Fast E2E against the standalone server with mock data. No Docker required.

```bash
# One-liner: builds standalone, starts with MOCK_MODE, runs Cypress
npm run e2e

# Or manually:
cd standalone && MOCK_MODE=true npm start &
npx cypress run --browser chrome
```

**53 tests** across 5 spec files:

| Spec | What it tests |
|------|---------------|
| `01_navigation.cy.ts` | Tab navigation, page loading |
| `02_alerts.cy.ts` | Alert dashboard, filters, detail flyout |
| `03_rules.cy.ts` | Rules listing, monitor CRUD |
| `04_slos.cy.ts` | SLO listing, creation wizard |
| `05_suppression.cy.ts` | Suppression rule CRUD |

### E2E Tests (Cypress) -- OSD Plugin

Full E2E against the observability stack with real data. Requires Docker.

```bash
# Full run: teardown + rebuild plugin + restart stack + seed data + Cypress
./scripts/e2e-osd.sh

# Quick re-run against an already-running stack (skip teardown/build)
./scripts/e2e-osd.sh --running

# Teardown + restart stack, but skip plugin rebuild
./scripts/e2e-osd.sh --no-rebuild
```

**32 tests** pass in OSD mode. The script handles everything automatically:
- Locates or clones the observability-stack repo
- Configures `.env` with the plugin zip path
- Tears down and rebuilds the Docker stack
- Waits for OSD health + workspace init
- Seeds SLO and alert test data (OpenSearch monitors + Prometheus rules)
- Warms up the plugin page
- Runs Cypress with `CYPRESS_MODE=osd`

**Environment overrides:**
```bash
# Skip interactive prompts
OBSERVABILITY_STACK_DIR=/path/to/stack ./scripts/e2e-osd.sh

# Use a custom fork/branch
OBS_STACK_REPO=https://github.com/user/fork.git \
OBS_STACK_BRANCH=my-branch \
./scripts/e2e-osd.sh
```

---

## Project Structure

```
alertManager/
├── opensearch_dashboards.json   # OSD plugin manifest (id, version, deps)
├── build.sh                     # Build OSD plugin zip
├── jest.config.js               # Jest config (2 projects: server + components)
├── cypress.config.js            # Cypress E2E config (standalone + OSD modes)
├── webpack.osd.config.js        # Webpack config for OSD plugin client bundle
├── tsconfig.json                # Main TS config (extends OSD monorepo root)
├── tsconfig.test.json           # Test TS config (Jest)
├── tsconfig.osd.json            # OSD plugin build TS config
├── package.json                 # Root package.json (scripts, devDeps)
│
├── core/                        # Platform-agnostic business logic
│   ├── types.ts                 # All TypeScript interfaces (Datasource, Alert, etc.)
│   ├── alert_service.ts         # Multi-backend alert service
│   ├── datasource_service.ts    # In-memory datasource registry
│   ├── opensearch_backend.ts    # OpenSearch Alerting API client
│   ├── directquery_prometheus_backend.ts  # Prometheus via Direct Query
│   ├── slo_types.ts             # SLO interfaces + InMemorySloStore
│   ├── http_client.ts           # HTTP client wrapper
│   ├── mock_backend.ts          # Mock data backends
│   ├── testing.ts               # Test utilities
│   └── __tests__/               # Unit tests (Node environment)
│
├── server/                      # OSD plugin server
│   ├── plugin.ts                # Plugin lifecycle (setup/start/stop)
│   ├── index.ts                 # Plugin entry point
│   ├── types.ts                 # Server type exports
│   ├── slo_saved_object_store.ts # SLO persistence via SavedObjects
│   ├── routes/
│   │   ├── index.ts             # OSD IRouter route definitions
│   │   ├── handlers.ts          # Framework-agnostic handlers (alerts, rules, datasources)
│   │   ├── monitor_handlers.ts  # Monitor + suppression CRUD
│   │   └── slo_handlers.ts      # SLO CRUD + preview
│   └── __tests__/               # Server unit tests
│
├── public/                      # OSD plugin UI
│   ├── plugin.ts                # OSD public plugin class
│   ├── application.tsx          # App mount handler
│   ├── index.ts                 # Plugin export
│   ├── types.ts                 # Client type exports
│   ├── components/              # Shared React components (used by both modes)
│   │   ├── alarms_page.tsx      # Main page with tabs
│   │   ├── alerts_tab.tsx       # Alerts dashboard
│   │   ├── alerts_dashboard.tsx # Charts + stats
│   │   ├── rules_tab.tsx        # Rules listing
│   │   ├── slo_listing.tsx      # SLO listing
│   │   ├── create_slo_wizard.tsx # SLO creation wizard
│   │   └── ...                  # More components
│   ├── services/
│   │   └── alarms_client.ts     # Mode-aware API client (OSD vs standalone paths)
│   ├── __mocks__/               # Jest mocks (OSD core, EUI, echarts)
│   └── __tests__/               # Component unit tests (jsdom)
│
├── standalone/                  # Standalone Express server (separate npm package)
│   ├── package.json             # Published as @opensearch-project/alert-manager
│   ├── server.ts                # Express app
│   ├── client.tsx               # React client entry
│   ├── webpack.config.js        # Client webpack config
│   ├── tsconfig.json            # Client TS config
│   ├── tsconfig.server.json     # Server TS config
│   ├── bin/cli.js               # npx entry point
│   └── components/              # Symlink to ../public/components
│
├── stubs/                       # OSD type stubs for out-of-tree builds
│   ├── src/core/server/
│   └── @osd/config-schema/
│
├── scripts/
│   └── e2e-osd.sh              # OSD E2E orchestration script
│
├── cypress/
│   ├── e2e/                     # 5 spec files (01-05)
│   └── support/                 # Helpers, commands
│
└── .github/workflows/
    ├── test-and-build.yml       # Unit tests + coverage + standalone build
    ├── cypress-e2e.yml          # Cypress E2E (standalone)
    └── publish.yml              # npm publish on tag
```

---

## Adding Features

The dual-mode architecture means features are added in layers:

### 1. Define types in `core/types.ts`

```typescript
export interface MyNewThing {
  id: string;
  name: string;
}
```

### 2. Implement business logic in `core/`

```typescript
// core/my_service.ts
export class MyService {
  async doSomething(): Promise<MyNewThing[]> {
    // Pure logic, no platform dependencies
  }
}
```

### 3. Add a framework-agnostic route handler in `server/routes/handlers.ts`

```typescript
export async function handleMyNewThing(service: MyService) {
  const result = await service.doSomething();
  return { status: 200, body: result };
}
```

### 4. Wire to the OSD router in `server/routes/index.ts`

```typescript
router.get(
  { path: '/api/alerting/my-thing', validate: false },
  async (_ctx, _req, res) => {
    const result = await handleMyNewThing(myService);
    return res.ok({ body: result.body });
  }
);
```

### 5. Wire to Express in `standalone/server.ts`

```typescript
app.get('/api/my-thing', async (req, res) => {
  const result = await handleMyNewThing(myService);
  res.status(result.status).json(result.body);
});
```

### 6. Update the shared UI in `public/components/`

Components in `public/components/` are shared between both modes via symlink (`standalone/components` -> `../public/components`). The `AlarmsApiClient` handles path differences automatically.

### 7. Add tests

- Unit test in `core/__tests__/my_service.test.ts` or `public/__tests__/my_component.test.tsx`
- E2E coverage in `cypress/e2e/`

---

## API Paths

The `AlarmsApiClient` abstracts path differences between modes:

| Resource | Standalone | OSD Plugin |
|----------|-----------|-----------|
| Datasources | `/api/datasources` | `/api/alerting/datasources` |
| Unified alerts | `/api/paginated/alerts` | `/api/alerting/unified/alerts` |
| Unified rules | `/api/paginated/rules` | `/api/alerting/unified/rules` |
| OpenSearch monitors | `/api/monitors` | `/api/alerting/opensearch/{dsId}/monitors` |
| Prometheus rules | `/api/prometheus/{dsId}/rules` | `/api/alerting/prometheus/{dsId}/rules` |
| SLOs | `/api/slos` | `/api/alerting/slos` |
| Suppression rules | `/api/suppression-rules` | `/api/alerting/suppression-rules` |
| Alertmanager config | `/api/alertmanager/config` | `/api/alerting/alertmanager/config` |

---

## Key Gotchas

- **OUI `EuiBasicTable` pagination** uses broken `<a href>` links. The plugin uses a custom `table_pagination.tsx` wrapper instead.
- **OSD caches bundles aggressively** by build number. After rebuilding the plugin zip, restart the OSD container.
- **`standalone/components`** is a **symlink** to `../public/components`. Don't break it -- both modes share the same React components.
- **The plugin `tsconfig.json`** extends `../../tsconfig.json` (OSD monorepo root). CI creates a stub when building out-of-tree.
- **`build.sh` does `rm -rf build/`** which invalidates Docker bind mounts. Restart the container after rebuilding.
- **OSD workspace IDs are random** per stack instance. `e2e-osd.sh` auto-detects via API.
- **Webpack mode must be `'none'`** in `webpack.osd.config.js`. Production mode breaks ECharts and tree-shakes away tab definitions.
- **Node version**: OSD requires Node < 23. Use `nvm use 22` (or 20, or 18).
- **Shell escaping**: The observability stack password `My_password_123!@#` has special chars. Use Python or single-quoted strings when `curl`-ing directly.

---

## CI Workflows

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `test-and-build.yml` | Push/PR to main | Unit tests + coverage on Node 18 & 20, standalone build |
| `cypress-e2e.yml` | Push/PR to main | Standalone Cypress E2E (53 tests, mock mode) |
| `publish.yml` | Git tag `v*` | Build + publish standalone to npm |

OSD plugin E2E (`e2e-osd.sh`) runs locally, not in CI, because the full Docker stack exceeds GitHub Actions resource limits.
