# @opensearch-project/alert-manager (Standalone)

Alert Manager UI for OpenSearch Alerting and Amazon Managed Prometheus. Supports multiple alerting backends with a unified interface.

## Quick Start

```bash
npx @opensearch-project/alert-manager
```

Open http://localhost:5603 in your browser.

## Options

```bash
npx @opensearch-project/alert-manager --port 8080      # Custom port
MOCK_MODE=false npx @opensearch-project/alert-manager  # Disable mock mode
npx @opensearch-project/alert-manager --help           # Show help
```

## Supported Backends

- **OpenSearch Alerting** — Full alerting API support
- **Amazon Managed Prometheus** — Prometheus-compatible alerting API

## API

### Datasources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/datasources` | List all datasources |
| GET | `/api/datasources/:id` | Get datasource by ID |
| POST | `/api/datasources` | Create datasource |
| PUT | `/api/datasources/:id` | Update datasource |
| DELETE | `/api/datasources/:id` | Delete datasource |
| POST | `/api/datasources/:id/test` | Test connection |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | List all alerts (all datasources) |
| GET | `/api/datasources/:id/alerts` | List alerts for datasource |

### Alert Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rules` | List all rules (all datasources) |
| GET | `/api/datasources/:id/rules` | List rules for datasource |
| GET | `/api/datasources/:id/rules/:ruleId` | Get rule by ID |
| POST | `/api/rules` | Create rule |
| PUT | `/api/datasources/:id/rules/:ruleId` | Update rule |
| DELETE | `/api/datasources/:id/rules/:ruleId` | Delete rule |
| POST | `/api/datasources/:id/rules/:ruleId/toggle` | Toggle rule enabled |

### Examples

```bash
# List datasources
curl http://localhost:5603/api/datasources

# Create a datasource
curl -X POST http://localhost:5603/api/datasources \
  -H "Content-Type: application/json" \
  -d '{"name":"My OpenSearch","type":"opensearch","url":"https://localhost:9200","enabled":true}'

# List all alerts
curl http://localhost:5603/api/alerts

# Create an alert rule
curl -X POST http://localhost:5603/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "datasourceId": "ds-1",
    "name": "High CPU",
    "severity": "critical",
    "query": "cpu > 90",
    "condition": "avg() > 90"
  }'
```

## Features

- 🔌 **Multi-backend** — OpenSearch Alerting + Amazon Managed Prometheus
- 🎭 **Mock mode** — Built-in mock data for development
- 🚀 **Instant startup** — No dependencies required
- 📦 **Tiny footprint** — ~4MB standalone package
- 🎨 **Full UI** — OUI-based interface

## Repository

https://github.com/opensearch-project/dashboards-observability

## License

Apache-2.0
