# Alert Manager -- Claude Code Instructions

## Agent-Driven Development

This project uses specialized AI agents defined in `AGENTS.md` for different tasks. **Always leverage agents for non-trivial work** — they have domain expertise, code quality standards, and established review patterns.

### Available Agents

| Agent | Role | When to Use |
|-------|------|-------------|
| **Jay** | Observability Domain Expert | SLO/SLI design, Prometheus/alerting domain questions, industry best practices, evaluating feature completeness |
| **Sanjay** | Backend Engineer | TypeScript Node.js services, DirectQuery proxy, caching, route handlers, API design, OSD plugin server |
| **Chen** | Senior Frontend Engineer | React components, OUI usage, TypeScript type safety, hooks, state management, accessibility, performance |
| **Maya** | UX Designer | Form layout, user flows, progressive disclosure, ICE scoring, wireframes, accessibility review |
| **Kai** | QA Validation Agent | Playwright UI testing, Cypress E2E, API verification, screenshot-based validation, regression testing |
| **Rio** | OSD Build & Deploy | Plugin build, Docker deploy, cache-busting, health checks, observability stack management |

### How to Use Agents

- **For implementation**: Assign agents to parallel tracks by expertise (backend, frontend, domain logic). See `AGENTS.md` for the "Shared Architecture Knowledge" section.
- **For code review**: Run multi-agent review loops — have Jay, Chen, and Sanjay review in parallel, then apply fixes and repeat (5 rounds is ideal). Each finds different issue classes.
- **For UX review**: Run Jay + Chen + Maya collaborative rounds — Jay identifies SRE pain points, Chen evaluates feasibility, Maya arbitrates with ICE scoring.
- **For testing**: Use Kai with Playwright MCP for OSD UI validation, and run Cypress E2E for automated regression.
- **For build/deploy**: Use Rio for the full build-deploy-verify cycle against the observability stack.

### Proven Patterns

1. **Parallel implementation tracks**: Backend (Sanjay) + Domain (Jay) run in parallel, then Frontend (Chen) starts when both complete
2. **5-round review loops**: Jay+Chen+Sanjay review → fix → repeat. Issues drop from ~18 to ~3 to ~5 to 0 to 3 (security)
3. **Collaborative UX review**: Jay+Chen+Maya discuss → Maya arbitrates with ICE scores → apply top 3-5 fixes per round
4. **Kai final validation**: After all code changes, have Kai verify every feature via Playwright against the live OSD stack

## Quick Reference

```bash
npm test                          # Run all unit tests (Jest, 31 files, 864 tests)
npm run test:coverage             # Unit tests with coverage (80%+ branches, 90%+ lines/functions/statements)
npm run e2e                       # Cypress E2E against standalone (MOCK_MODE, port 5603), 55 tests
./scripts/e2e-osd.sh              # Full OSD E2E: teardown + rebuild + clean stack + Cypress
./scripts/e2e-osd.sh --running    # OSD E2E against already-running stack (no teardown)
./scripts/e2e-osd.sh --no-rebuild # OSD E2E: teardown + restart, skip plugin build
npm run build:standalone          # Build standalone server
yarn plugin-helpers build         # Build OSD plugin zip (uses standard OSD optimizer)
./build.sh                        # Thin wrapper: auto-detects OSD version + runs plugin-helpers build
```

## Local OSD Development (with Observability Stack)

To run the plugin inside OSD from source, connected to the observability stack:

```bash
# 1. Ensure Docker observability stack is running
cd ~/Documents/workspace/observability-stack && docker compose up -d

# 2. Switch to compatible Node version
nvm use 22

# 3. Start OSD from monorepo root with the dev config
cd ~/Documents/workspace/OpenSearch-Dashboards
yarn start --config config/opensearch_dashboards.dev.yml
```

- Local OSD runs on **port 5602** (Docker OSD stays on 5601)
- Both share the same OpenSearch backend — workspaces, dashboards, monitors are shared
- Login: `admin` / `My_password_123!@#`
- The plugin reads OpenSearch credentials from the `--config` YAML file automatically
- Live reload: server restarts on `server/` changes, webpack recompiles on `public/` changes

## Architecture

**Dual-mode plugin**: runs as both a standalone Express app and an OpenSearch Dashboards (OSD) plugin.

- `public/components/` -- Shared React UI (symlinked into standalone via `standalone/components`)
- `common/` -- Backend-agnostic services, types, and business logic
- `server/` -- OSD plugin server (routes, saved objects, plugin lifecycle)
- `standalone/` -- Express server with its own `package.json` and build
- `server/__mocks__/` -- OSD server mock for Jest (mirrors `public/__mocks__/osd_core.ts` pattern)

**API paths differ by mode**:
- Standalone: `/api/slos`, `/api/alerts`, etc.
- OSD plugin: `/api/alerting/slos`, `/api/alerting/unified/alerts`, etc.
- `AlarmsApiClient` in `public/services/alarms_client.ts` handles this via `ApiPaths`

**SLO storage**: `ISloStore` interface (`common/slo_types.ts`) with two implementations:
- `InMemorySloStore` (standalone default)
- `SavedObjectSloStore` (OSD plugin, persists to OpenSearch)

**Prometheus metadata**: `PrometheusMetadataProvider` interface (`common/types.ts`) for metric/label discovery:
- Implemented by `DirectQueryPrometheusBackend` (live) and `MockBackend` (MOCK_MODE)
- Wrapped by `PrometheusMetadataService` (`common/prometheus_metadata_service.ts`) with stale-while-revalidate caching
- 4 API routes: metric names, label names, label values, metric metadata
- `server/plugin.ts` uses `isMetadataProvider()` runtime type guard to conditionally wire routes
- Frontend: `usePrometheusMetadata` hook provides cascading autocomplete with graceful degradation

**SLO templates**: `common/slo_templates.ts` provides template-based SLO creation:
- 5 templates: HTTP Availability, HTTP Latency P99, gRPC Availability, gRPC Latency P99, Custom
- `detectMetricType()` uses metadata API type field with suffix-heuristic fallback
- `formatErrorBudget()` for human-readable error budget display
- `GOOD_EVENTS_FILTER_PRESETS` for common label matchers

## Testing

### Unit Tests (Jest)

Two projects in `jest.config.js`:
- `server` -- Node environment, tests in `common/__tests__/` and `server/**/__tests__/`
- `components` -- jsdom environment, tests in `public/**/__tests__/`

Current: **31 test files, 864 tests**. Coverage thresholds: 80% branches, 90% functions/lines/statements. Large render-heavy components are excluded from unit coverage and validated via Cypress E2E instead.

OUI components are mocked via `public/__mocks__/eui_mock.tsx`. When adding new OUI components to production code, check if a mock exists -- components needing interaction in tests (click handlers, selectable props, role attributes) require explicit mocks.

### E2E Tests (Cypress)

5 spec files in `cypress/e2e/` with **55 total tests** (navigation 3, alerts 7, rules 7, SLOs 33, suppression 5). Two modes:

**Standalone mode** (default, fast, no Docker needed):
```bash
npm run e2e                       # Builds standalone, starts with MOCK_MODE, runs Cypress
```
- Port 5603, mock data seeded automatically, no auth
- All 55 tests pass (MOCK_MODE seeds alerts, rules, SLOs, metadata)

**OSD plugin mode** (full stack, real data, Docker required):
```bash
./scripts/e2e-osd.sh              # One-liner: teardown + build + clean stack + Cypress
./scripts/e2e-osd.sh --running    # Re-run against already-running stack
```

The `e2e-osd.sh` script handles everything for any contributor:
1. **Preflight checks**: Docker daemon, Docker Compose, Node.js, node_modules
2. **Locates observability-stack**: auto-searches common paths, prompts for path or clones from `lezzago/observability-stack` (branch `update-alerting`)
3. **Verifies branch/fork**: shows current branch+remote, warns if unexpected
4. **Configures .env**: auto-sets `ALERT_MANAGER_PLUGIN_ZIP` to point at this checkout
5. **Tears down + rebuilds**: `docker compose down -v`, `./build.sh`, `docker compose up -d`
6. **Waits for readiness**: OSD health check + workspace init container completion
7. **Auto-detects workspace ID**: queries OSD API, passes to Cypress via `CYPRESS_OSD_WORKSPACE_ID`
8. **Seeds SLO test data**: creates 2 SLOs via plugin API (idempotent)
9. **Seeds alert test data**: creates an OpenSearch always-fire monitor + 2 Prometheus/Cortex always-fire alerting rules via Cortex ruler API, waits for alerts to fire
10. **Runs Cypress**: `CYPRESS_MODE=osd npx cypress run --browser chrome`

All 55 tests pass on both a clean stack (full teardown) and a warm stack.

Environment overrides to skip prompts:
```bash
OBSERVABILITY_STACK_DIR=/path/to/stack ./scripts/e2e-osd.sh
OBS_STACK_REPO=https://github.com/user/fork.git OBS_STACK_BRANCH=my-branch ./scripts/e2e-osd.sh
```

**Performance optimizations** (OSD Cypress: 36s, down from original 2:37):
- `ensureLoaded()` command -- reuses existing page instead of full OSD reload per test
- `testIsolation: false` in OSD mode -- preserves browser context between tests
- `numTestsKeptInMemory: 0` -- frees DOM snapshots, reduces memory
- `cy.session()` for auth -- login only happens once per spec, cached across tests
- Batched assertions -- related checks combined into single tests to reduce visit count
- `--running` flag -- skip teardown/rebuild for rapid re-runs

## Conventions

- **TypeScript strict**: No `any` types except at serialization boundaries
- **OUI components first**: Use `@opensearch-project/oui` -- only build custom when OUI can't do it
- **OSD plugin patterns**: `public/` + `server/` directories, plugin lifecycle, saved objects
- **Test naming**: `__tests__/<module>.test.ts(x)` co-located with source
- **Component limit**: Files over 500 lines are candidates for extraction
- **Git commits**: Always use `git commit -s` (DCO sign-off required). Never omit the `-s` flag.
- **Interface-first design**: Define interfaces (`PrometheusMetadataProvider`) before implementations. Use runtime type guards for optional interfaces.
- **Hook extraction**: Complex form state uses `useReducer` with discriminated union actions, not multiple `useState` calls. See `sli_section.tsx` for the pattern.
- **Graceful degradation**: Backend discovery APIs (metadata, labels) are best-effort. UI falls back to plain text inputs on failure. Never block primary workflows on optional enrichment.
- **Route handler style**: Framework-agnostic functions returning `{ status, body }` (see `server/routes/slo_handlers.ts`). OSD routes use `@osd/config-schema` validation.

## Key Gotchas

- OUI `EuiBasicTable` pagination uses broken `<a href>` links -- use `table_pagination.tsx`
- OSD caches bundles aggressively by build number -- see AGENTS.md Rio section for cache-busting
- `standalone/components` is a **symlink** to `../public/components` -- don't break it
- The plugin's `tsconfig.json` extends `../../tsconfig.json` (OSD monorepo root) -- CI creates a stub
- `build.sh` clears `build/` before building which invalidates Docker bind mounts -- restart container after build
- OSD workspace IDs are random per stack instance -- `e2e-osd.sh` auto-detects via API, or set `CYPRESS_OSD_WORKSPACE_ID` manually
- OSD HTTP client **double-encodes `?` in paths** -- never embed query strings in the URL path. Use the `{ query: {} }` option: `this.http.get(path, { query: { search } })`. See `alarms_client.ts` metadata methods for examples.
- `EuiCard` needs an **explicit mock** in `public/__mocks__/eui_mock.tsx` for tests -- the Proxy auto-stub does not handle `selectable.onClick`. Same applies to `EuiConfirmModal` (onConfirm/onCancel) and `EuiButtonGroup` (radio role).
- **Runtime type guards** for optional interfaces: Use `isMetadataProvider()` pattern (see `server/plugin.ts:307`) rather than `instanceof` -- works across module boundaries and with mocks.
- **Cache-busting workflow** for OSD: bump build number to epoch-based unique value (not +1), clear optimizer cache, use fresh browser context. See AGENTS.md Rio section for full steps.
- **common/ must not import from public/** -- mock data lives in `common/mock_data.ts`, not in UI components. The `promql_editor.tsx` imports from `common/mock_data.ts`.

## CI Workflows (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `test-and-build.yml` | Unit tests + coverage + standalone build (Node 18 + 20) |
| `cypress-e2e.yml` | Cypress E2E: standalone job + OSD plugin job |
| `publish.yml` | Package publishing |
