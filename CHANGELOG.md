# Changelog

All notable changes to Alert Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Apache 2.0 SPDX license headers on all source files with ESLint enforcement
- Prettier integration with `.prettierrc` matching OSD conventions (single quotes, ES5 trailing commas, 100 char width)
- ESLint extends: `react-hooks/recommended`, `jest/recommended`, `prettier/recommended`
- `data-test-subj` attributes on all interactive elements in `alarms_page.tsx` for E2E testing
- Husky v9 pre-commit hooks with lint-staged (Prettier on staged files)
- CI workflow (`test-and-build.yml`) running tests and standalone build on PR/push
- Jest coverage configuration with 50% branches / 60% functions/lines/statements thresholds
- React component tests for `AlarmsPage` using `@testing-library/react` (10 tests)
- Server route handler tests for `handlers.ts` and `monitor_handlers.ts` (48 tests)
- Core tests for `alert_service.ts` (28 tests) and `mock_backend.ts` (20 tests)
- `core/mock_enrichment.ts` — extracted mock data generators from production code
- `core/testing.ts` — dedicated entry point for dev/test mock imports

### Changed
- Renamed plugin ID from `alarms` to `alertManager` across all configs and source
- Renamed npm package from `@anirudhaj/alarms` to `@opensearch-project/alert-manager`
- Renamed binary from `osd-alarms` to `osd-alert-manager`
- Updated all repository URLs from personal fork to `opensearch-project/dashboards-observability`
- Updated API base path constant from `/api/alarms` to `/api/alert_manager`
- Replaced `any` types with `unknown`/generics in public API layer
- Removed `MockOpenSearchBackend`/`MockPrometheusBackend` from `core/index.ts` barrel exports
- Enabled TypeScript `strict: true` for standalone server compilation
- Added `core/**/*.ts` to root `tsconfig.json`, excluded `standalone/`

### Fixed
- Package license field: `ISC` -> `Apache-2.0`
- Removed incorrect `"main": ".eslintrc.js"` from `package.json`
- Fixed TS2783 spread overwrite warning in `opensearch_backend.ts`

## [1.0.0] - 2025-06-01

### Added
- Dual-mode architecture: OSD plugin and standalone npx distribution
- Multi-backend support: OpenSearch Alerting and Amazon Managed Prometheus
- Unified alert and rule views with per-datasource timeout isolation
- Framework-agnostic route handlers shared between OSD (Hapi) and Express
- PromQL validation and prettification
- Monitor serialization (YAML/JSON import/export)
- Suppression rule management
- Progressive loading with datasource-level status tracking
- Mock mode with seeded OpenSearch and Prometheus data
- OUI-based React interface
- Japanese i18n translation support
