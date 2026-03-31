# Create Alert Page — UI Mockup Specification for logs type monitors

## Page Layout

The page is a single-column form layout with collapsible sections, a sticky footer with Cancel and Create buttons. Each section is divided by a line. Optional fields label should be on the same line as the field label. When users open the flyout, the first input field will be focused.

---

## Section 1: Monitor Details

Collapsible section (expanded by default).

| Field              | Type        | Placeholder / Notes                  | Required |
|--------------------|-------------|---------------------------------------|----------|
| Monitor name       | Text input  | "Enter a monitor name"               | Yes      |
| Description *— optional*        | Textarea    | "Describe this monitor" | No       |

---

## Section 2: Query

Collapsible section (expanded by default). Contains a "Run preview" button in the section header (right-aligned).

### Query Editor

- The query editor is wrapped in a single container.
- Top of the container contains these items:
    - Badge that displays the current language **PPL** (use OuiBetaBadge style badge)
    - Button for picking data source, it should display and selected an OpenSearch data source by default. With OUI left icon **database** and OUI right icon **arrowDown**
    - Button for picking sample queries named **Query library** with OUI left icon **addBookmark**  and OUI right icon **arrowDown**
    - Use OUI empty buttons
- Code editor area with syntax-highlighted query text (use monospace font, show 2 lines by default)
- Code editor should show the line number
- A small copy/expand icon in the top-right corner of the editor

### Preview Results (collapsible sub-section)

- Header: **Results (34)** — shows result count
- Subtitle: light gray text showing the metric name, e.g. `EVENTS_LAST_HOUR_v2`

#### Chart
- Bar chart (vertical bars, blue fill)
- X-axis: timestamps (e.g. `04:00`, `06:00`, `08:00`, ... `17:00`)
- Y-axis: numeric values (0–10 range)
- Full-width within the section

#### Results Table

| Column     | Description                              |
|------------|------------------------------------------|
| Date       | Timestamp, e.g. `Nov 15, 2025 @ 25:59:05.883` |
| Event type | All rows show `login`                    |
| Status     | All rows show `false`                    |

- Table shows ~10 rows of sample data
- Standard table styling with alternating row shading

---

## Section 3: Schedule

Collapsible section (expanded by default).

| Field      | Type                          | Default Value       |
|------------|-------------------------------|---------------------|
| Frequency  | Dropdown (select)             | `By interval`       |
| Run every  | Number input + Unit dropdown  | `1` + `minute(s)`   |

---

## Section 4: Triggers (1)

Not collapsible. The header shows the trigger count in parentheses.

### Trigger (collapsible, expanded)

A "Delete" button (red text) is right-aligned in the trigger header.

| Field              | Type                                | Default / Value                |
|--------------------|-------------------------------------|--------------------------------|
| Trigger name       | Text input                          | `Trigger 1`                    |
| Severity level     | Dropdown                            | `Critical`                     |
| Type               | Dropdown                            | `Extraction query response`    |
| Trigger condition  | Dropdown + Operator + Number input  | `is greater than` · `8`      |

### Trigger Threshold Visualization

<!-- - Label: **Trigger**
- Two radio buttons:
  - **Visual** (selected)
  - **Per-value threshold** -->
- Chart: Same bar chart as Preview Results, but with a horizontal red dashed threshold line overlaid at the configured value
- Header above chart: **Results** with subtitle `EVENTS_LAST_HOUR_v2`

### Suppress

| Field   | Type                          | Default Value     |
|---------|-------------------------------|-------------------|
| Suppress | Checkbox (unchecked)         | —                 |
| Expires | Number input + Unit dropdown  | `24` + `hour(s)`  |

### Notification actions (2)

Shown as a sub-section within the trigger with a count in the header.

#### Action List

Each action is a collapsible accordion row with a "Delete" button (red text) on the right.

| #  | Action Name            |
|----|------------------------|
| 1  | `slack_message`        |
| 2  | `pager-duty_message`   |

Each action should contain the following

| Field                | Type             | Default Value     | Placeholder     |
|----------------------|------------------|-------------------|-------------------|
| Notification channel | Dropdown         | Oncall (Slack)    | -                 |  
| Subject              | Text input       | -                 | Enter a subject   |
| Message (Description text: Embed variables in your message using Mustache templates. Learn more)              | Textfield       | -                 | Monitor {{ctx.monitor.name}} just entered alert status. Please investigate the issue.
  - Trigger: {{ctx.trigger.name}}
  - Severity: {{ctx.trigger.severity}}
  - Period start: {{ctx.periodStart}}
  - Period end: {{ctx.periodEnd}}   |

#### Add Action

- A link-style button below the list: **Add another action** (blue text, outlined)

---

## Page Footer

Sticky footer bar at the bottom of the page, right-aligned:

| Button  | Style             |
|---------|-------------------|
| Cancel  | Secondary / ghost |
| Create  | Primary (blue)    |
