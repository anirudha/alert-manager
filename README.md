<img src="https://opensearch.org/wp-content/uploads/2025/01/opensearch_logo_default.svg" height="64px">

- [Alert Manager](#alert-manager)
  - [Dual-Mode Architecture](#dual-mode-architecture)
  - [Features](#features)
  - [Quick Start](#quick-start)
    - [1. OSD Plugin Mode](#1-osd-plugin-mode)
    - [2. Standalone Mode (npx)](#2-standalone-mode-npx)
  - [Code Summary](#code-summary)
  - [API Reference](#api-reference)
  - [Architecture](#architecture)
  - [Contributing](#contributing)
  - [Getting Help](#getting-help)
  - [Code of Conduct](#code-of-conduct)
  - [Security](#security)
  - [License](#license)
  - [Copyright](#copyright)

# Alert Manager

Alert Manager is a plugin for OpenSearch Dashboards that provides alert rule management and monitoring for **OpenSearch Alerting** and **Amazon Managed Prometheus (AMP)** backends. It supports two distribution modes — run as an OSD plugin or a standalone npx service.

## Dual-Mode Architecture

A single codebase, two ways to run it:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Shared Core Layer                            │
│   core/types.ts · core/alert_service.ts · core/mock_backend.ts      │
│   core/datasource_service.ts · server/routes/handlers.ts            │
└──────────┬──────────────────────┬───────────────────────────────────┘
           │                      │
     ┌─────▼──────┐        ┌─────▼──────┐
     │  OSD Plugin │        │  Standalone │
     │    Mode     │        │  npx Mode   │
     ├────────────┤        ├────────────┤
     │ Hapi server │        │ Express    │
     │ OSD IRouter │        │ server.ts  │
     │ Full OSD UI │        │ Webpack UI │
     ├────────────┤        ├────────────┤
     │ Cloud / SaaS│        │ Dev / Light│
     │ Production  │        │ Prototyping│
     └────────────┘        └────────────┘
          ▲                      ▲
          │                      │
    OSD + Browser          npx + Browser
```

| Mode | Use Case | How to Run | Port |
|------|----------|-----------|------|
| OSD Plugin | Production / Cloud / SaaS | `yarn start` inside OSD | 5601 |
| Standalone (npx) | Quick dev, demos, lightweight serving | `npx @anirudhaj/alarms` | 5603 |

Both modes share the same **core services**, **route handlers**, **UI components**, and **API shape**. The only difference is the hosting layer.

## Features

- 🚀 **Dual-Mode** — OSD plugin or standalone npx
- ⚡ **Instant Startup** — Standalone mode starts in ~1 second
- 📦 **Lightweight** — Standalone build is ~4MB vs ~1GB for full OSD
- 🎨 **Full UI** — OUI-based interface in both modes
- 🔌 **REST API** — OpenSearch Alerting and Prometheus-native API shapes
- 🔄 **Hot Reload** — Development mode with live updates
- 🧪 **Mock Mode** — Seeded OpenSearch and Prometheus data out of the box

## Quick Start

### 1. OSD Plugin Mode

For production / cloud / SaaS deployments:

```bash
# Clone OpenSearch Dashboards
git clone https://github.com/opensearch-project/OpenSearch-Dashboards.git
cd OpenSearch-Dashboards

# Clone this plugin
git clone https://github.com/anirudha/alert-manager.git plugins/alarms

# Install dependencies and start
yarn osd bootstrap
yarn start
```

Navigate to http://localhost:5601/app/alarms

### 2. Standalone Mode (npx)

For quick dev, demos, and lightweight serving:

```bash
# Run with default port 5603
npx @anirudhaj/alarms

# Custom port
npx @anirudhaj/alarms --port 8080

# Disable mock mode (connect to real backends)
MOCK_MODE=false npx @anirudhaj/alarms
```

Open http://localhost:5603 in your browser.

## Code Summary

|                          |                                                                 |
| ------------------------ | --------------------------------------------------------------- |
| Test and build           | [![Build][build-badge]][build-link]                             |
| Distribution build tests | [![Standalone][standalone-badge]][standalone-link]              |
| npm publish              | [![Publish][publish-badge]][publish-link]                       |
| npm version              | [![npm][npm-badge]][npm-link]                                   |

### Repository Checks

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| DCO Checker  | [![Developer certificate of origin][dco-badge]][dco-badge-link] |
| Link Checker | [![Link Checker][link-check-badge]][link-check-link]            |

### Issues

|                                                                |
| -------------------------------------------------------------- |
| [![good first issues open][good-first-badge]][good-first-link] |
| [![features open][feature-badge]][feature-link]                |
| [![bugs open][bug-badge]][bug-link]                            |

[build-badge]: https://img.shields.io/badge/build-passing-brightgreen
[build-link]: https://github.com/anirudha/alert-manager/actions
[standalone-badge]: https://img.shields.io/badge/standalone-ready-blue
[standalone-link]: https://github.com/anirudha/alert-manager/tree/main/standalone
[publish-badge]: https://github.com/anirudha/alert-manager/actions/workflows/publish.yml/badge.svg
[publish-link]: https://github.com/anirudha/alert-manager/actions/workflows/publish.yml
[npm-badge]: https://img.shields.io/npm/v/@anirudhaj/alarms
[npm-link]: https://www.npmjs.com/package/@anirudhaj/alarms
[dco-badge]: https://img.shields.io/badge/DCO-enabled-brightgreen
[dco-badge-link]: https://github.com/anirudha/alert-manager/actions
[link-check-badge]: https://img.shields.io/badge/links-valid-brightgreen
[link-check-link]: https://github.com/anirudha/alert-manager/actions
[good-first-badge]: https://img.shields.io/github/issues/anirudha/alert-manager/good%20first%20issue.svg
[good-first-link]: https://github.com/anirudha/alert-manager/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22
[feature-badge]: https://img.shields.io/github/issues/anirudha/alert-manager/feature.svg
[feature-link]: https://github.com/anirudha/alert-manager/issues?q=is%3Aopen+is%3Aissue+label%3Afeature
[bug-badge]: https://img.shields.io/github/issues/anirudha/alert-manager/bug.svg
[bug-link]: https://github.com/anirudha/alert-manager/issues?q=is%3Aopen+is%3Aissue+label%3Abug

## API Reference

Both modes expose the same operations. The route prefixes differ by mode:

| Mode | Prefix |
|------|--------|
| Standalone (npx) | `/api/` |
| OSD Plugin | `/api/alerting/` |

### Datasource Routes

| Method | Standalone | OSD Plugin | Description |
|--------|-----------|------------|-------------|
| GET | `/api/datasources` | `/api/alerting/datasources` | List all datasources |
| GET | `/api/datasources/:id` | `/api/alerting/datasources/:id` | Get datasource by ID |
| POST | `/api/datasources` | `/api/alerting/datasources` | Create datasource |
| PUT | `/api/datasources/:id` | `/api/alerting/datasources/:id` | Update datasource |
| DELETE | `/api/datasources/:id` | `/api/alerting/datasources/:id` | Delete datasource |
| POST | `/api/datasources/:id/test` | `/api/alerting/datasources/:id/test` | Test datasource connection |

### OpenSearch Alerting Routes

| Method | Standalone | OSD Plugin | Description |
|--------|-----------|------------|-------------|
| GET | `/api/datasources/:dsId/monitors` | `/api/alerting/opensearch/:dsId/monitors` | List monitors |
| GET | `/api/datasources/:dsId/monitors/:id` | `/api/alerting/opensearch/:dsId/monitors/:id` | Get monitor by ID |
| POST | `/api/datasources/:dsId/monitors` | `/api/alerting/opensearch/:dsId/monitors` | Create monitor |
| PUT | `/api/datasources/:dsId/monitors/:id` | `/api/alerting/opensearch/:dsId/monitors/:id` | Update monitor |
| DELETE | `/api/datasources/:dsId/monitors/:id` | `/api/alerting/opensearch/:dsId/monitors/:id` | Delete monitor |
| GET | `/api/datasources/:dsId/alerts` | `/api/alerting/opensearch/:dsId/alerts` | List alerts for datasource |
| POST | `/api/datasources/:dsId/monitors/:id/acknowledge` | `/api/alerting/opensearch/:dsId/monitors/:id/acknowledge` | Acknowledge alerts |

### Prometheus / AMP Routes

| Method | Standalone | OSD Plugin | Description |
|--------|-----------|------------|-------------|
| GET | `/api/datasources/:dsId/rules` | `/api/alerting/prometheus/:dsId/rules` | List Prometheus rule groups |
| GET | `/api/datasources/:dsId/prom-alerts` | `/api/alerting/prometheus/:dsId/alerts` | List active Prometheus alerts |

### Unified Routes (cross-backend)

These aggregate data across all enabled datasources for the UI.

| Method | Standalone | OSD Plugin | Description |
|--------|-----------|------------|-------------|
| GET | `/api/alerts` | `/api/alerting/unified/alerts` | Unified alerts across all backends |
| GET | `/api/rules` | `/api/alerting/unified/rules` | Unified rules across all backends |

### Example Requests (Standalone)

```bash
# List datasources
curl http://localhost:5603/api/datasources

# Create a datasource
curl -X POST http://localhost:5603/api/datasources \
  -H "Content-Type: application/json" \
  -d '{"name":"My OpenSearch","type":"opensearch","url":"https://localhost:9200","enabled":true}'

# Test datasource connection
curl -X POST http://localhost:5603/api/datasources/ds-1/test

# List unified alerts (all backends)
curl http://localhost:5603/api/alerts

# List unified rules (all backends)
curl http://localhost:5603/api/rules

# List OpenSearch monitors for a datasource
curl http://localhost:5603/api/datasources/ds-1/monitors

# List OpenSearch alerts for a datasource
curl http://localhost:5603/api/datasources/ds-1/alerts

# Acknowledge OpenSearch alerts
curl -X POST http://localhost:5603/api/datasources/ds-1/monitors/mon-1/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"alerts":["alert-1","alert-2"]}'

# List Prometheus rule groups
curl http://localhost:5603/api/datasources/ds-2/rules

# List Prometheus alerts
curl http://localhost:5603/api/datasources/ds-2/prom-alerts
```

## Architecture

```
alert-manager/
├── core/                    # Shared business logic (no platform deps)
│   ├── types.ts             # OpenSearch + Prometheus types, unified views
│   ├── alert_service.ts     # Multi-backend alert service
│   ├── datasource_service.ts# In-memory datasource registry
│   ├── mock_backend.ts      # Mock OpenSearch & Prometheus backends
│   └── index.ts
├── server/                  # Server-side code
│   ├── routes/
│   │   ├── handlers.ts      # Framework-agnostic route handlers
│   │   └── index.ts         # OSD IRouter adapter
│   ├── plugin.ts            # OSD server plugin
│   └── types.ts
├── public/                  # Client-side code (shared UI)
│   ├── components/          # React components (used by both modes)
│   ├── services/            # API client (configurable for OSD/standalone)
│   └── plugin.ts
├── standalone/              # Standalone distribution (npx)
│   ├── bin/cli.js           # npx entry point
│   ├── server.ts            # Express server
│   └── client.tsx           # React entry (imports shared UI from public/)
└── common/                  # Shared constants
```

See [DUAL_MODE.md](DUAL_MODE.md) for detailed architecture documentation.

## Contributing

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

### Development Setup

```bash
# Standalone development
cd standalone
npm install --legacy-peer-deps
npm run dev

# OSD plugin development
cd /path/to/OpenSearch-Dashboards
yarn start
```

### Publishing

The standalone package is published to npm automatically via GitHub Actions when a version tag is pushed:

```bash
# Update version in standalone/package.json, then:
git tag v1.0.1
git push --tags
```

This triggers the [publish workflow](.github/workflows/publish.yml) which builds and publishes to npm.

## Getting Help

If you find a bug, or have a feature request, please don't hesitate to open an issue in this repository.

For more information, see [OpenSearch project website](https://opensearch.org/) and [documentation](https://opensearch.org/docs).

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](CODE_OF_CONDUCT.md). For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq), or contact [opensource-codeofconduct@amazon.com](mailto:opensource-codeofconduct@amazon.com) with any additional questions or comments.

## Security

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## License

This project is licensed under the [Apache v2.0 License](LICENSE).

## Copyright

Copyright OpenSearch Contributors. See [NOTICE](NOTICE) for details.
