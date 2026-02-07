# @anirudhaj/alarms

Standalone Alarms service for OpenSearch Dashboards. Run alert management without the full OSD stack.

## Quick Start

```bash
npx @anirudhaj/alarms
```

Open http://localhost:5603 in your browser.

## Options

```bash
npx @anirudhaj/alarms --port 8080   # Custom port
npx @anirudhaj/alarms --help        # Show help
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alarms` | List all alarms |
| GET | `/api/alarms/:id` | Get alarm by ID |
| POST | `/api/alarms` | Create alarm |
| DELETE | `/api/alarms/:id` | Delete alarm |
| POST | `/api/alarms/:id/toggle` | Toggle enabled state |

### Create Alarm

```bash
curl -X POST http://localhost:5603/api/alarms \
  -H "Content-Type: application/json" \
  -d '{"name":"CPU High","severity":"critical","condition":"cpu > 90%"}'
```

### List Alarms

```bash
curl http://localhost:5603/api/alarms
```

## Features

- 🚀 **Instant startup** — No OSD bootstrap required
- 📦 **Tiny footprint** — ~4MB vs ~1GB for full OSD
- 🎨 **Full UI** — Same OUI-based interface as OSD plugin
- 🔌 **REST API** — Standard JSON API for integrations
- 🔄 **Dual mode** — Same codebase runs as OSD plugin or standalone

## Repository

https://github.com/anirudha/alert-manager

## License

Apache-2.0
