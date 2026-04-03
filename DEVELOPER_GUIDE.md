# Developer Guide

This guide covers development setup and architecture for the Alert Manager plugin.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding Features](#adding-features)
- [Testing](#testing)
- [Building](#building)

## Architecture Overview

Alert Manager uses a **dual-mode architecture** that allows the same codebase to run as:

1. **OpenSearch Dashboards Plugin** — Full integration with OSD
2. **Standalone Application** — Independent Express + React app

The key design principle is **separation of concerns**:

- **Core layer** — Pure business logic with zero platform dependencies
- **Adapters** — Platform-specific wiring (OSD or Express)
- **UI components** — Shared React + OUI components

See [DUAL_MODE.md](DUAL_MODE.md) for detailed architecture documentation.

## Development Setup

### Standalone Mode (Recommended for UI development)

```bash
cd standalone
npm install --legacy-peer-deps

# Development with hot reload
npm run dev

# Or build and run
npm run build
npm start
```

- API server: http://localhost:5603
- Dev server (hot reload): http://localhost:3000

### OSD Plugin Mode

```bash
# From OSD root directory
yarn start
```

Navigate to http://localhost:5601/app/alarms

## Project Structure

```
alert-manager/
├── core/                    # Platform-agnostic business logic
│   ├── types.ts             # Shared TypeScript interfaces
│   ├── alarm_service.ts     # In-memory alarm service
│   └── index.ts             # Exports
│
├── server/                  # Server-side code
│   ├── routes/
│   │   ├── handlers.ts      # Framework-agnostic route handlers
│   │   └── index.ts         # OSD IRouter adapter
│   ├── plugin.ts            # OSD server plugin lifecycle
│   ├── index.ts             # Plugin entry point
│   └── types.ts             # Server types
│
├── public/                  # OSD client-side code
│   ├── components/
│   │   ├── alarms_page.tsx  # Main UI component
│   │   └── app.tsx          # OSD app wrapper
│   ├── services/
│   │   └── alarms_client.ts # API client
│   ├── plugin.ts            # OSD public plugin
│   ├── application.tsx      # App mount
│   ├── index.ts             # Plugin entry
│   └── types.ts             # Client types
│
├── standalone/              # Standalone distribution
│   ├── bin/
│   │   └── cli.js           # npx entry point
│   ├── components/
│   │   └── alarms_page.tsx  # Standalone UI (uses OUI directly)
│   ├── server.ts            # Express server
│   ├── client.tsx           # React entry point
│   ├── package.json         # Standalone dependencies
│   ├── webpack.config.js    # Client bundler config
│   └── tsconfig*.json       # TypeScript configs
│
├── common/                  # Shared constants
│   └── index.ts
│
└── opensearch_dashboards.json  # OSD plugin manifest
```

## Adding Features

### 1. Add Types

```typescript
// core/types.ts
export interface NewFeature {
  id: string;
  // ...
}
```

### 2. Implement Business Logic

```typescript
// core/alarm_service.ts
async newMethod(): Promise<Result> {
  // Pure logic, no platform deps
}
```

### 3. Add Route Handler

```typescript
// server/routes/handlers.ts
export async function handleNewFeature(service: AlarmService, input: Input) {
  const result = await service.newMethod(input);
  return { status: 200, body: result };
}
```

### 4. Wire to OSD Router

```typescript
// server/routes/index.ts
router.post(
  { path: '/api/alert_manager/new-feature', validate: { body: schema } },
  async (_ctx, req, res) => {
    const result = await handleNewFeature(service, req.body);
    return res.ok({ body: result.body });
  }
);
```

### 5. Wire to Express

```typescript
// standalone/server.ts
app.post('/api/alert_manager/new-feature', async (req, res) => {
  const result = await handleNewFeature(service, req.body);
  res.status(result.status).json(result.body);
});
```

### 6. Update UI

Update both:
- `public/components/alarms_page.tsx` (OSD mode)
- `standalone/components/alarms_page.tsx` (standalone mode)

## Testing

### Manual API Testing

```bash
# List alarms
curl http://localhost:5603/api/alert_manager

# Create alarm
curl -X POST http://localhost:5603/api/alert_manager \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","severity":"low","condition":"test > 0"}'

# Toggle alarm
curl -X POST http://localhost:5603/api/alert_manager/alarm-1/toggle

# Delete alarm
curl -X DELETE http://localhost:5603/api/alert_manager/alarm-1
```

### Unit Tests

```bash
# TODO: Add test commands
npm test
```

## Building

### Standalone Build

```bash
cd standalone
npm run build
```

Output:
- `dist/public/` — Bundled React app (~1.5MB)
- `dist/standalone/` — Compiled server

### OSD Plugin Build

```bash
yarn plugin-helpers build
```

### NPM Package

```bash
cd standalone
npm publish --access public
```

## Debugging

### Standalone

```bash
# Enable debug logging
DEBUG=* npm start
```

### OSD Plugin

```bash
# From OSD root
yarn start --verbose
```

## Common Issues

### Peer Dependency Conflicts

Use `--legacy-peer-deps` when installing standalone dependencies:

```bash
npm install --legacy-peer-deps
```

### CSS Not Loading

Ensure OUI CSS is imported and `OuiContext` wraps the app:

```typescript
import '@opensearch-project/oui/dist/eui_theme_light.css';
import { OuiContext } from '@opensearch-project/oui/lib/components/context';

<OuiContext>
  <App />
</OuiContext>
```
