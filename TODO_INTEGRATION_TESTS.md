# Integration Test TODOs

These files are excluded from unit test coverage because they require a running backend or OSD context. They should be covered by CI integration tests.

## Needs Real Backend (OpenSearch + Prometheus)

- [ ] `core/directquery_prometheus_backend.ts` — Tests require a running OpenSearch instance with SQL plugin and a configured Prometheus datasource. Test: query execution, datasource discovery, error handling for unreachable backends.

## Needs OSD Plugin Context

These files are the OpenSearch Dashboards plugin shell. They import from `src/core/public`, `src/core/server`, `@osd/i18n`, etc. which only exist inside the OSD monorepo.

- [ ] `public/plugin.ts` — Plugin lifecycle (setup, start, stop)
- [ ] `public/application.tsx` — React mount/unmount in OSD app container
- [ ] `public/components/app.tsx` — OSD-wrapped component with i18n and routing
- [ ] `public/types.ts` — Type re-exports (no runtime code, but coverage instrumentation fails)
- [ ] `server/plugin.ts` — Server-side plugin lifecycle, route registration, backend wiring

## Test Infrastructure Needed

1. **Docker Compose** for local integration test environment (OpenSearch + Prometheus + Alertmanager)
2. **GitHub Actions workflow** that spins up the stack and runs Playwright E2E tests
3. **OSD bootstrap** step that checks out OSD, links this plugin, and runs plugin-level tests
