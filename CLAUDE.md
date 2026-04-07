# Alert Manager -- Claude Code Instructions

## Quick Reference

```bash
npm test                          # Run all unit tests (Jest, two projects: server + components)
npm run test:coverage             # Unit tests with coverage (80%+ branches, 90%+ lines/functions/statements)
npm run e2e                       # Cypress E2E against standalone (MOCK_MODE, port 5603)
./scripts/e2e-osd.sh              # Full OSD E2E: teardown + rebuild + clean stack + Cypress
./scripts/e2e-osd.sh --running    # OSD E2E against already-running stack (no teardown)
./scripts/e2e-osd.sh --no-rebuild # OSD E2E: teardown + restart, skip plugin build
npm run build:standalone          # Build standalone server
./build.sh                        # Build OSD plugin zip (build/alertManager.zip)
```

## Architecture

**Dual-mode plugin**: runs as both a standalone Express app and an OpenSearch Dashboards (OSD) plugin.

- `public/components/` -- Shared React UI (symlinked into standalone via `standalone/components`)
- `core/` -- Backend-agnostic services, types, and business logic
- `server/` -- OSD plugin server (routes, saved objects, plugin lifecycle)
- `standalone/` -- Express server with its own `package.json` and build
- `stubs/` -- OSD type stubs for out-of-tree compilation

**API paths differ by mode**:
- Standalone: `/api/slos`, `/api/alerts`, etc.
- OSD plugin: `/api/alerting/slos`, `/api/alerting/unified/alerts`, etc.
- `AlarmsApiClient` in `public/services/alarms_client.ts` handles this via `ApiPaths`

**SLO storage**: `ISloStore` interface (`core/slo_types.ts`) with two implementations:
- `InMemorySloStore` (standalone default)
- `SavedObjectSloStore` (OSD plugin, persists to OpenSearch)

## Testing

### Unit Tests (Jest)

Two projects in `jest.config.js`:
- `server` -- Node environment, tests in `core/__tests__/` and `server/**/__tests__/`
- `components` -- jsdom environment, tests in `public/**/__tests__/`

Coverage thresholds: 80% branches, 90% functions/lines/statements. Large render-heavy components are excluded from unit coverage and validated via Cypress E2E instead.

### E2E Tests (Cypress)

5 spec files in `cypress/e2e/` (navigation, alerts, rules, SLOs, suppression). Two modes:

**Standalone mode** (default, fast, no Docker needed):
```bash
npm run e2e                       # Builds standalone, starts with MOCK_MODE, runs Cypress
```
- Port 5603, mock data seeded automatically, no auth
- All 53 tests pass (MOCK_MODE seeds alerts, rules, SLOs)

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

All 32 tests pass on both a clean stack (full teardown, ~36s) and a warm stack (~34s).

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

## Key Gotchas

- OUI `EuiBasicTable` pagination uses broken `<a href>` links -- use `table_pagination.tsx`
- OSD caches bundles aggressively by build number -- see AGENTS.md Rio section for cache-busting
- `standalone/components` is a **symlink** to `../public/components` -- don't break it
- The plugin's `tsconfig.json` extends `../../tsconfig.json` (OSD monorepo root) -- CI creates a stub
- `build.sh` does `rm -rf build/` which invalidates Docker bind mounts -- restart container after build
- OSD workspace IDs are random per stack instance -- `e2e-osd.sh` auto-detects via API, or set `CYPRESS_OSD_WORKSPACE_ID` manually

## CI Workflows (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `test-and-build.yml` | Unit tests + coverage + standalone build (Node 18 + 20) |
| `cypress-e2e.yml` | Cypress E2E: standalone job + OSD plugin job |
| `publish.yml` | Package publishing |
