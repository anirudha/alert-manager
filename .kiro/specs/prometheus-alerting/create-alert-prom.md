# Create Alert Page — UI Mockup Specification for Prometheus alerting rules

## Page Layout

The page is a single-column form layout with collapsible sections, a sticky footer with Cancel and Create buttons. Each section is divided by a line.

---

## Section 1: Monitor Details

Collapsible section (expanded by default).

| Field              | Type        | Placeholder / Notes                  | Required |
|--------------------|-------------|---------------------------------------|----------|
| Monitor name       | Text input  | "Enter a monitor name"               | Yes      |
| Description        | Textarea    | "Describe this monitor" — labeled "optional" | No       |

---

## Section 2: PromQL Query

Collapsible section (expanded by default). Contains a "Run preview" button in the section header (right-aligned).

### Query Editor

- Top bar contains 3 items:
    - Badge that displays the current language **PromQL**, 
    - Button for picking data source, it should display and selected an OpenSearch data source by default. With OUI icon **database** on the left of text
    - Button for picking sample queries named **Query library** with OUI icon **addBookmark** on the left of text
    - Button named **Metric browser** for picking from a searchable list of metrics and inserts it into the query editor

- A small copy/expand icon in the top-right corner of the editor

### Preview Results (collapsible sub-section)

- Header: **Results (N)** — shows result count
- Subtitle: light gray text showing the metric name, e.g. `http_requests_total`

#### Chart
- Time-series line chart (blue line)
- X-axis: timestamps (e.g. `04:00`, `06:00`, `08:00`, ... `17:00`)
- Y-axis: numeric values matching the query result range
- Full-width within the section

---

## Section 3: Trigger Condition

Collapsible section (expanded by default).


| Field              | Type                                | Default / Value                |
|--------------------|-------------------------------------|--------------------------------|
| Operator           | Dropdown                            | `>` (options: `>`, `>=`, `<`, `<=`, `==`, `!=`) |
| Value              | Number input                        | `0`                            |
| Unit               | Text input                          | `%` (placeholder)              |
| For Duration       | Dropdown                            | `5m` (options: `1m`, `5m`, `10m`, `15m`, `30m`, `1h`) |

### Condition Summary

- Inline callout (info style) showing a human-readable summary:
  `Alert fires when: <query> <operator> <value><unit> for <duration>`

### Threshold Visualization

- Same chart as Preview Results, but with a horizontal red dashed threshold line overlaid at the configured value
- Header above chart: **Results** with subtitle showing the metric name

---

## Section 4: Evaluation Settings

Collapsible section (expanded by default).

| Field               | Type                          | Default Value | Help Text            |
|---------------------|-------------------------------|---------------|----------------------|
| Eval Interval       | Dropdown                      | `1m`          | "How often evaluated" |
| Pending Period      | Dropdown                      | `5m`          | "Before firing"       |
| Firing Period       | Dropdown                      | `5m`          | "Min firing time"     |

Dropdown options for all three: `30s`, `1m`, `5m`, `10m`, `15m`, `30m`, `1h`

---

## Section 5: Labels

Collapsible section (expanded by default).

- Subtitle: "Categorize and route alerts"
- Dynamic key-value editor with rows:

| Column   | Type        | Notes                                                  |
|----------|-------------|--------------------------------------------------------|
| Key      | Text input  | e.g. `severity`, `team`, `service`                     |
| Value    | Text input  | Supports dynamic template values (e.g. `{{ $value }}`) |
| Dynamic  | Toggle      | When enabled, value is treated as a Go template        |
| Delete   | Icon button | Removes the row                                        |

- "Add label" button below the list
- If `context` is provided (service/team), pre-populated label suggestions appear

---

## Section 6: Annotations

Collapsible accordion section (expanded by default). Header shows an "Optional" badge.

- Dynamic key-value editor with rows:

| Column   | Type        | Notes                                          |
|----------|-------------|-------------------------------------------------|
| Key      | Text input  | e.g. `summary`, `description`, `runbook_url`   |
| Value    | Text input  | Supports Go template syntax                     |
| Delete   | Icon button | Removes the row                                 |

- "Add annotation" button below the list
- Common defaults: `summary` and `description` rows pre-populated

---

## Section 7: Actions (2)

Not collapsible — shown as a list with a count in the header.

### Action List

Each action is a collapsible accordion row with a "Delete" button (red text) on the right.

| #  | Action Name            |
|----|------------------------|
| 1  | `slack_message`        |
| 2  | `pager-duty_message`   |

### Add Action

- A link-style button below the list: **Add another action** (blue text, outlined)

<!-- ---

## Section 8: Rule Preview (YAML)

Collapsible accordion section (collapsed by default).

- Displays a live-updating YAML preview of the Prometheus alerting rule based on current form state
- Monospace font, syntax-highlighted
- Example output:

```yaml
- alert: HighErrorRate
  expr: rate(http_errors_total[5m]) > 0.05
  for: 5m
  labels:
    severity: critical
    team: platform
  annotations:
    summary: "High error rate detected"
    description: "Error rate is {{ $value }} errors/sec"
``` -->

---

## Page Footer

Sticky footer bar at the bottom of the page, right-aligned:

| Button  | Style             |
|---------|-------------------|
| Cancel  | Secondary / ghost |
| Create  | Primary (blue)    |
