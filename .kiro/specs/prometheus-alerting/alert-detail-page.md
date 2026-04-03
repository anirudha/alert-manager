# Alert Detail Page — UI Mockup Specification for log-based alerts

## Page Layout

The page is a single-column layout flyout detail view. It can be opened within a page that reference the specific alert. It has a flyout header with status and actions, a row of summary cards, tabbed content sections, and no footer. Uses OUI compressed components throughout for high density, OUI panels should not have shadows for reduce cognitive load. Uses echarts for chart visualizations. 

---

## Flyout Header section

### Title

- Alert name displayed (e.g. `prod-api-error-rate`)

### Status Row

Horizontal layout with status and labels on the left and action buttons on the far right.

| Element              | Type / Style                          | Notes                                              |
|----------------------|---------------------------------------|----------------------------------------------------|
| State indicator      | EuiHealth (red dot) + text            | e.g. `In alarm since Mar 30, 22:47 UTC (27 min)`  |
| Duration             | Computed from `startTime` to now      | Displayed in parentheses after the timestamp        |
| Labels           |   | OuiBadge (hollow)       |
| Acknowledge button   | EuiButton, outline, icon `check`      | Right-aligned. Disabled if already acknowledged.    |
| Mute button          | EuiButton, outline, icon `bellSlash`  | Right-aligned. Toggles to "Unmute" if muted.        |

---

## Tab Navigation

Tabs should be part of the flyout header, the content of the tabs is the content of the flyout. Use Codensed tabs, the tabs should sit flush with the header border, remove paddings below the tabs.

Four tabs. "Signal" is selected by default with an underline indicator.


| Tab ID            | Label                |
|-------------------|----------------------|
| `overview`          | Overview               |
| `history`         | History              |
| `configuration`   | Configuration        |
| `related`         | Related resources    |

---

## Section 4: Overview Tab (default)

### Quick stats

A horizontal row of four panels with borders, equal width.

| Card             | Primary Value        | Subtitle              |
|------------------|----------------------|-----------------------|
| Current value    | `12.4%`              | `error rate`          |
| Threshold        | `> 5%`               | `for 5 min`           |
| Duration         | `3 of 3 periods`     | `breaching`           |
| Actions          | `SNS: ops-oncall`    | —                     |

- Display a visualization of how the alert is breaching the threshold
- Primary value uses bold text, medium size
- Subtitle uses small text, subdued color

### Metric Chart

Wrapped in a single panel with border.

#### Chart Header

- Left side: metric label in bold small text (e.g. `Metric: AWS/ApiGateway 5XXError`)
- Right side: time range button group with options `1h`, `3h`, `6h` (selected by default), `1d`

#### Chart (echarts)

- Type: area line chart
- X-axis: timestamps (e.g. `21:00`, `21:30`, `22:00`, `22:30`, `23:00`)
- Y-axis: percentage values (e.g. `0%`, `5%`, `10%`, `15%`)
- Data line: solid blue line with light blue area fill beneath
- Threshold line: horizontal red dashed line at the threshold value, labeled `THRESHOLD` on the right end
- Area above threshold where data exceeds it should have a subtle red fill
- Tooltip on hover showing timestamp and value
- Full-width within the panel

#### Alarm Annotation

- Below the chart, inside the same panel
- Warning-style callout with alert icon
- Text: e.g. `Alarm triggered at 22:47 — error rate crossed 5% threshold`

### Summary

- A paragraph explaining what happended and possible causes in human readable format.
- No panels

### Recommendation

- Generated list of recommended actions users can take to remediate the alert.
- No panels

---

### Related alerts

- Display related alerts to this alert
- No panels

#### Header

- Left: title text — "Related alerts"
- Right: link-style button — "View all >"

#### Table

| Column        | Width    | Description                                                    |
|---------------|----------|----------------------------------------------------------------|
| Status icon   | `30px`   | Health dot — red for "In alarm", green for "OK"                |
| Name          | auto     | Alert name as clickable link (e.g. `prod-api-latency-p99`)    |
| State         | `100px`  | Badge — danger for "In alarm", success for "OK"                |
| Time          | `100px`  | Timestamp when alarm triggered, or `—` if OK                   |
| Detail        | auto     | Short description (e.g. `p99 > 2000ms`, `> 90% pool`)         |

- Rows sorted: alarms first, then OK
- Clicking a name navigates to that alert's detail page

---

## Section 5: History Tab

### Timeline visualization 

Display a timeline visulziation of the alert's states.

#### Chart Header

- Right side: time range button group with options `1h`, `3h`, `6h` (selected by default), `1d`



### State history
Table showing the alert's state transition history, sorted newest first.

| Column     | Description                                    |
|------------|------------------------------------------------|
| Timestamp  | Date/time of the state change                  |
| State      | Color-coded health indicator with state label  |
| Value      | The metric value at the time of transition     |
| Message    | Description of what happened                   |

- Standard table styling with alternating row shading
- Empty state: prompt with "No history available"

---

## Section 6: Configuration Tab

Read-only display of the monitor's configuration, organized in collapsible accordion sections.

### Query Definition (expanded by default)

- Code block showing the query (JSON for OpenSearch, PromQL for Prometheus)
- Below the code block: condition text in subdued small text (e.g. `ctx.results[0].hits.total.value > 100`)

### Conditions & Evaluation (expanded by default)

| Field                | Value Example        |
|----------------------|----------------------|
| Evaluation Interval  | `1 minutes`          |
| Pending Period       | `5 minutes`          |
| Firing Period        | `5 minutes`          |
| Lookback Period      | `15 minutes`         |
| Threshold            | `> 5%`               |

### Labels (expanded by default)

- Each label rendered as a hollow badge: `key: value`
- If no labels: subdued text "No labels"

### Notification Routing (collapsed by default)

| Column       | Description                          |
|--------------|--------------------------------------|
| Channel      | e.g. `Slack`, `Email`, `Webhook`     |
| Destination  | e.g. `#ops-alerts`                   |
| Severities   | Badges for each severity level       |
| Throttle     | e.g. `10 minutes` or `—`            |

### Suppression Rules (collapsed by default)

- Each rule displayed as a panel showing:
  - Name (bold)
  - Reason (subdued text)
  - Schedule (if applicable)
  - Active/Inactive badge

---

## Section 7: Related Resources Tab

A list of related resource panels:

- Associated monitor — link to open monitor detail flyout
- Datasource info — name, type, ID
- Runbook URL — external link (if present in annotations)
- Dashboard links — external links (if present in annotations)

- Empty state: prompt with "No related resources found"

---

## Interactions

| Action                    | Behavior                                                         |
|---------------------------|------------------------------------------------------------------|
| Click "Acknowledge"       | Calls API to acknowledge alert, updates state badge, stays in the flyout.              |
| Click "Mute"             | Calls API to silence alert, toggles button label to "Unmute", stays in the flyout.     |
| Click breadcrumb "Alarms" | Navigates back to alarms list                                   |
| Change time range         | Re-renders the echarts signal chart with the selected range      |
| Click correlated signal   | Navigates to that alert's detail page                            |
| Click "View all >"       | Navigates to alerts list filtered by shared labels               |
