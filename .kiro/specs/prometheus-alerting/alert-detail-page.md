# Alert Detail Page — UI Specification for Log-Based Alerts

## Overview

A full-page detail view for a single alert (navigated from the Alarms list via breadcrumb). This page provides comprehensive context about a firing log-based alert: current status, signal visualization with threshold, correlated signals, history, configuration, and related resources. The layout is a single-column page (not a flyout) using OUI components and echarts for visualizations.

---

## Page Header

### Breadcrumb

- Format: `Alarms > {alert-name}`
- "Alarms" is a clickable link that navigates back to the alarms list page
- `{alert-name}` is plain text (current page)

### Title Row

- Alert name displayed as an `EuiTitle` size `l` (e.g. `prod-api-error-rate`)
- Below the title, a status row containing:
  - State indicator: `EuiHealth` with color mapped to state (e.g. red dot + "In alarm since Mar 30, 22:47 UTC (27 min)")
  - Duration is computed from `startTime` to now, displayed in parentheses
  - Right-aligned action buttons:
    - **Acknowledge** — `EuiButton` outline style, icon `check`. Disabled if already acknowledged.
    - **Mute** — `EuiButton` outline style, icon `bellSlash`. Toggles to "Unmute" if already muted.

---

## Summary Cards

A horizontal row of four `EuiPanel` cards with `hasBorder`, displayed using `EuiFlexGroup` with equal-width `EuiFlexItem`s. Use compressed `EuiDescriptionList` inside each card.

| Card             | Title Line       | Value Line                  |
|------------------|------------------|-----------------------------|
| Current value    | "Current value"  | e.g. `12.4%` + subtitle `error rate` |
| Threshold        | "Threshold"      | e.g. `> 5%` + subtitle `for 5 min`   |
| Duration         | "Duration"       | e.g. `3 of 3 periods` + subtitle `breaching` |
| Actions          | "Actions"        | e.g. `SNS: ops-oncall`               |

- Values use `EuiText` size `m` with bold for the primary value
- Subtitles use `EuiText` size `xs` color `subdued`

---

## Tab Navigation

`EuiTabs` with four tabs:

| Tab ID            | Label                | Default |
|-------------------|----------------------|---------|
| `signal`          | Signal               | Active  |
| `history`         | History              | —       |
| `configuration`   | Configuration        | —       |
| `related`         | Related resources    | —       |

---

## Tab: Signal (default)

### Metric Chart

Wrapped in an `EuiPanel` with `hasBorder`.

#### Chart Header

- Left: metric label as `EuiText` size `s` bold (e.g. `Metric: AWS/ApiGateway 5XXError`)
- Right: time range selector — a group of `EuiButtonGroup` options: `1h`, `3h`, `6h` (default selected), `1d`

#### Chart (echarts)

- Type: area line chart rendered with echarts
- X-axis: timestamps (e.g. `21:00`, `21:30`, `22:00`, `22:30`, `23:00`)
- Y-axis: percentage values (e.g. `0%`, `5%`, `10%`, `15%`)
- Data line: solid blue line with light blue area fill beneath
- Threshold line: horizontal red dashed line at the threshold value, labeled `THRESHOLD` on the right end
- The area above the threshold where the data line exceeds it should have a subtle red fill to highlight the breach
- echarts tooltip on hover showing timestamp and value

#### Alarm Annotation

- Below the chart, inside the same panel: an `EuiCallOut` with `color="warning"` and icon `alert`
- Text: `Alarm triggered at {time} — {description}` (e.g. "Alarm triggered at 22:47 — error rate crossed 5% threshold")

### Correlated Signals

Wrapped in a separate `EuiPanel` with `hasBorder`, below the metric chart.

#### Header

- Left: `EuiTitle` size `xs` — "Correlated signals"
- Right: `EuiButtonEmpty` — "View all >" link

#### Table

`EuiBasicTable` with compressed styling. Columns:

| Column       | Width   | Render                                                        |
|--------------|---------|---------------------------------------------------------------|
| Status icon  | `30px`  | `EuiHealth` dot — red for "In alarm", green for "OK"          |
| Name         | auto    | Alert name as `EuiButtonEmpty` link (e.g. `prod-api-latency-p99`) |
| State        | `100px` | `EuiBadge` — `danger` for "In alarm", `success` for "OK"     |
| Time         | `100px` | Timestamp or `—` if OK                                        |
| Detail       | auto    | Short description (e.g. `p99 > 2000ms`, `> 90% pool`)        |

- Rows are sorted: alarms first, then OK
- Clicking a correlated signal name navigates to that alert's detail page

---

## Tab: History

An `EuiBasicTable` showing the alert's state transition history, sorted newest first.

| Column     | Description                                    |
|------------|------------------------------------------------|
| Timestamp  | Date/time of the state change                  |
| State      | `EuiHealth` with color-coded state label       |
| Value      | The metric value at the time of transition     |
| Message    | Description of what happened                   |

- Data sourced from `UnifiedRule.alertHistory`
- Empty state: `EuiEmptyPrompt` with "No history available"

---

## Tab: Configuration

Displays the monitor's configuration in read-only form using `EuiDescriptionList` type `column` compressed, organized in accordion sections:

### Query Definition

- `EuiAccordion` expanded by default
- `EuiCodeBlock` showing the query (JSON for OpenSearch, PromQL for Prometheus)
- Below: condition text (e.g. `ctx.results[0].hits.total.value > 100`)

### Conditions & Evaluation

- `EuiAccordion` expanded by default
- Fields: Evaluation Interval, Pending Period, Firing Period (if applicable), Lookback Period (if applicable), Threshold

### Labels

- `EuiAccordion` expanded by default
- Rendered as `EuiBadge` with `color="hollow"` for each `key: value` pair

### Notification Routing

- `EuiAccordion` collapsed by default
- `EuiBasicTable` with columns: Channel, Destination, Severities, Throttle

### Suppression Rules

- `EuiAccordion` collapsed by default
- Each rule as an `EuiPanel` showing name, reason, schedule, and active/inactive badge

---

## Tab: Related Resources

A list of related resources displayed as `EuiPanel` cards:

- Associated monitor (link to monitor detail flyout)
- Datasource info (name, type, ID)
- Runbook URL (if present in annotations, rendered as external link)
- Dashboard links (if present in annotations)

Empty state: `EuiEmptyPrompt` with "No related resources found"

---

## Data Model

This page consumes a `UnifiedRule` object (fetched by alert/monitor ID) which already contains:

- `name`, `status`, `severity`, `healthStatus`
- `query`, `condition`, `threshold`
- `evaluationInterval`, `pendingPeriod`, `firingPeriod`, `lookbackPeriod`
- `labels`, `annotations`
- `alertHistory: AlertHistoryEntry[]`
- `conditionPreviewData: Array<{ timestamp: number; value: number }>`
- `notificationRouting: NotificationRouting[]`
- `suppressionRules: SuppressionRule[]`
- `description`, `aiSummary`

### Correlated Signals

Correlated signals are derived by querying other alerts/rules that share common labels (e.g. same `service`, `environment`, or `region`). The API should return a list of `UnifiedAlert` or `UnifiedRule` objects that match overlapping label sets.

---

## Component File

- Path: `standalone/components/alert_detail_page.tsx`
- The component receives the alert/rule data and API client as props
- Navigation: integrated into the existing routing in `alarms_page.tsx` — clicking an alert name navigates to this page instead of opening the flyout

---

## Interactions

| Action              | Behavior                                                    |
|---------------------|-------------------------------------------------------------|
| Click "Acknowledge" | Calls `apiClient.acknowledgeAlert(id)`, updates state badge |
| Click "Mute"        | Calls `apiClient.silenceAlert(id)`, toggles button label    |
| Click breadcrumb    | Navigates back to alarms list                               |
| Change time range   | Re-renders the echarts signal chart with the selected range  |
| Click correlated signal | Navigates to that alert's detail page                   |
| Click "View all >"  | Navigates to alerts list filtered by shared labels           |

---

## Accessibility

- Breadcrumb uses `nav` with `aria-label="Breadcrumb"`
- All action buttons have descriptive `aria-label` attributes
- Chart has `aria-label` describing the metric being visualized
- Table uses proper column headers
- Tab navigation uses `EuiTabs` which handles keyboard navigation natively
- State indicators use both color and text labels (not color alone)
