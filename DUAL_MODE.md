# Alarms Plugin — Dual Distribution Mode

This plugin demonstrates a **dual-mode architecture** that allows the same codebase to run as:

1. **OpenSearch Dashboards Plugin** — Full integration with OSD chrome, navigation, and services
2. **Standalone Application** — Independent Express + React app with zero OSD dependencies

## Why Dual Mode?

- **Faster development** — Test UI changes without starting full OSD
- **Microservice deployment** — Run alarms as a separate service
- **Reduced footprint** — Standalone build is ~3.6MB vs ~1GB for full OSD
- **Flexibility** — Same business logic, different deployment targets

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CORE LAYER                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   types.ts      │  │ alarm_service.ts│  │   index.ts      │  │
│  │  (interfaces)   │  │ (business logic)│  │   (exports)     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                    Zero platform dependencies                    │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌─────────────────────────┐           ┌─────────────────────────┐
│     OSD ADAPTER         │           │   STANDALONE ADAPTER    │
│  ┌─────────────────┐    │           │  ┌─────────────────┐    │
│  │ server/plugin.ts│    │           │  │ standalone/     │    │
│  │ (OSD lifecycle) │    │           │  │ server.ts       │    │
│  └─────────────────┘    │           │  │ (Express)       │    │
│  ┌─────────────────┐    │           │  └─────────────────┘    │
│  │ server/routes/  │    │           │  ┌─────────────────┐    │
│  │ index.ts        │    │           │  │ standalone/     │    │
│  │ (IRouter)       │    │           │  │ client.tsx      │    │
│  └─────────────────┘    │           │  │ (React entry)   │    │
│  ┌─────────────────┐    │           │  └─────────────────┘    │
│  │ public/plugin.ts│    │           │                         │
│  │ (OSD app reg)   │    │           │                         │
│  └─────────────────┘    │           │                         │
└─────────────────────────┘           └─────────────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────────┐           ┌─────────────────────────┐
│   OpenSearch Dashboards │           │   Standalone Server     │
│   http://localhost:5601 │           │   http://localhost:5603 │
│   /app/alarms           │           │   /                     │
└─────────────────────────┘           └─────────────────────────┘
```

## Key Design Patterns

### 1. Framework-Agnostic Route Handlers

```typescript
// server/routes/handlers.ts — Pure functions, no framework imports
export async function handleListAlarms(service: AlarmService) {
  const alarms = await service.list();
  return { status: 200, body: { alarms } };
}
```

Adapters wire these to the framework:

```typescript
// OSD adapter (server/routes/index.ts)
router.get({ path: '/api/alert_manager', validate: false }, async (_ctx, _req, res) => {
  const result = await handleListAlarms(service);
  return res.ok({ body: result.body });
});

// Express adapter (standalone/server.ts)
app.get('/api/alert_manager', async (_req, res) => {
  const result = await handleListAlarms(service);
  res.status(result.status).json(result.body);
});
```

### 2. HTTP Client Abstraction

```typescript
// public/services/alarms_client.ts
export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: any): Promise<T>;
  delete<T>(path: string): Promise<T>;
}
```

OSD adapter uses `CoreStart.http`, standalone uses `fetch`.

### 3. Shared UI Components

The `AlarmsPage` component uses pure React + OUI with no OSD imports:

```typescript
// Works in both modes
import { EuiPage, EuiButton, EuiBasicTable } from '@opensearch-project/oui';

export const AlarmsPage: React.FC<{ apiClient: AlarmsApiClient }> = ({ apiClient }) => {
  // Pure React component
};
```

### 4. Separate Dependency Trees

Standalone has its own `node_modules` to avoid OSD version conflicts:

```
plugins/alarms/
├── package.json          # OSD plugin deps (uses workspace)
└── standalone/
    └── package.json      # Standalone deps (isolated)
```

## Quick Start

### OSD Plugin Mode

```bash
# From OSD root
yarn start
# Navigate to http://localhost:5601/app/alarms
```

### Standalone Mode

```bash
cd plugins/alarms/standalone
npm install --legacy-peer-deps
npm run build
npm start
# Navigate to http://localhost:5603
```

## Build Comparison

| Mode | Build Size | Startup Time | Dependencies |
|------|------------|--------------|--------------|
| OSD Plugin | ~1GB (full OSD) | ~60s | Full OSD stack |
| Standalone | ~3.6MB | ~1s | Express, React, OUI |

## Extending This Pattern

To add dual-mode support to another plugin:

1. **Extract core logic** — Move business logic to `core/` with no platform imports
2. **Create handler functions** — Return `{ status, body }` objects
3. **Build adapters** — Wire handlers to OSD IRouter and Express
4. **Abstract HTTP client** — Use interface that works with both `CoreStart.http` and `fetch`
5. **Isolate standalone deps** — Create separate `package.json` in `standalone/`

## Limitations

- **No OSD services in standalone** — SavedObjects, security, etc. not available
- **Separate builds** — Must build both modes if deploying both
- **CSS compatibility** — OUI version must match between modes
