# SLO/SLI Support for Prometheus Alert Rules

## Mapping the CloudWatch Create SLO Experience to Prometheus

**Date:** 2026-03-12
**Status:** Proposal
**Based on:** APM-Over-OpenSearch Figma (node 5327-101586) — CloudWatch SLO creation flow

---

## 1. Executive Summary

The current Create SLO mockup is based on the **Amazon CloudWatch Application Signals** SLO experience. This report maps every UI section of that experience to the Prometheus alerting model, identifies gaps, required UI modifications, and new backend capabilities needed to support SLO/SLI creation backed by Prometheus alert rules.

**Key architectural difference:** CloudWatch manages SLOs as first-class objects with built-in error budget tracking. Prometheus has no native SLO primitive — SLOs must be decomposed into a combination of **recording rules** (for pre-computed SLI metrics) and **alerting rules** (for burn-rate and threshold-based alarms). A single SLO defined through this UI will generate **2–5 Prometheus rules** that work together.

---

## 2. Current Figma Design — Section-by-Section Breakdown

The Create SLO form is a single-page accordion with five sections, a right-side preview panel, and a final "Create SLO" / "Cancel" action bar.

### 2.1 SLO Listing Page

| Element | Description |
|---------|-------------|
| Status cards | Breached (1), Warning (–), Ok (2), No data (4), Total (7), Services with SLOs (6/10) |
| Table columns | Type, Name, Interval, Attainment, Goal, Error budget, Target, Service, Tags |
| Filters sidebar | Platform (EKS/ECS/EC2/Lambda/Kubernetes/Custom), Business Unit, Type (CloudWatch Metric/Service operation/Service dependency), Status (Breached/Warning/Ok/No data/Services with SLOs), Env, Service, Tags |
| Actions | "Create SLO" button, per-row "..." menu, pagination |

### 2.2 Section 1 — Set Service Level Indicator (SLI)

| Field | Options | Behavior |
|-------|---------|----------|
| **Source type** (radio) | Service operation / Service dependency | "Service dependency" adds a `dependency` dropdown to "From metric" |
| **Calculate** | `Number of good [requests \| periods]` | "requests" = request-based SLI; "periods" = time-window-based SLI |
| **For** (SLI type) | `availability` / `latency` (when "requests"); `availability` / `p99 latency` / `p90 latency` / `p50 latency` (when "periods") | Determines the PromQL pattern and "Must be" operator |
| **Per** (period length) | `1 minute` (only shown when "periods" selected) | Defines the evaluation granularity for period-based SLIs |
| **From metric: Service** | Dropdown (e.g. `pet-clinic-frontend-ec2`) | Becomes a Prometheus label matcher |
| **From metric: Operation** | Dropdown (e.g. `POST /api/customer/owners`) | Becomes a Prometheus label matcher |
| **From metric: Dependency** | Dropdown (only when "Service dependency" selected) | Additional label matcher |
| **Must be** | `Greater or equal to [99.9] [%]` (availability) or `Lower or equal to [99] [ms]` (latency) | Defines the SLI threshold — the boundary of "good" |

**Preview panel** (right side): SLI CloudWatch metric chart, SLO attainment goal chart, Error budget chart — all based on historical data from the last 3 hours.

### 2.3 Section 2 — Set Service Level Objective (SLO)

| Field | Options | Behavior |
|-------|---------|----------|
| **Attainment goal** | Number input (e.g. `99.9`) + `%` | The SLO target percentage |
| **Warn when error budget falls below** | Number input (e.g. `30`) + `%` | Triggers the SLO warning alarm |
| **Measure for** | `Rolling` / `Calendar` dropdown | Rolling = sliding window; Calendar = fixed month boundary |
| **Interval** | Number + `day(s)` / `month(s)` | Window duration (e.g. "Rolling interval of 1 day(s)") |
| **Starting** (calendar only) | Date picker (e.g. `2025-07-29`) | Calendar window start date |
| **Exclusion windows** | "Add window" button, up to 10 | Optional maintenance windows excluded from SLO calculation |

**Exclusion window sub-form:**

| Field | Description |
|-------|-------------|
| Time window name | Expandable/collapsible accordion |
| Define using CRON expression | Toggle — switches between simple datetime and CRON |
| **Simple mode**: Start at, For (duration), Repeat | e.g. `2025-07-29 03:00 UTC` for `1 Hour(s)`, repeat `None` |
| **CRON mode**: Cron expression, For (duration) | e.g. `0 00 * * *` UTC for `1 Hour(s)` |
| Reason | Optional text (e.g. "Scheduled maintenance") |

### 2.4 Section 3 — Set SLO Name

| Field | Description |
|-------|-------------|
| SLO name | Auto-generated from service + operation (e.g. "Availability for pet clinic frontend ec2 POST"). Editable. |

### 2.5 Section 4 — Set Expected Burn Rate and Alarms *(optional)*

**Burn rate configuration:**

| Field | Options | Behavior |
|-------|---------|----------|
| **Set look-back window for** | Number + `Minute(s)` (e.g. `60`) | The time window for burn rate calculation |
| **And** | `create alarm` / `do not create alarm` | Whether to create a burn rate alarm |
| **Fire alarm when** | `error budget` / `burn rate threshold` dropdown | Two modes for burn rate alerting |
| **Condition** (error budget mode) | `is consumed more than [70] %` | Fires when error budget consumption exceeds threshold |
| **Condition** (burn rate mode) | `is larger than [10]` | Fires when burn rate multiplier exceeds threshold |
| **Notify with SNS topic** | Dropdown: "Select existing SNS topic" + "Create topic" button | Notification destination |
| **Add more burn rate** | Button — adds another burn rate row | Supports multi-window burn rate strategies |

**SLO alarm checkboxes:**

| Alarm | Description |
|-------|-------------|
| **SLI health alarm** | Fires every time the ratio of good requests to total requests is less than the goal |
| **SLO attainment goal alarm** / **SLO error budget alarm** | Fires every time the SLO breaches the attainment goal |
| **SLO warning alarm** / **SLO error budget warning alarm** | Fires every time the SLO breaches the warning threshold |

Each alarm has: `Notify with SNS topic` dropdown + "Create topic" button.

**Create SNS topic modal:** Topic name (unique, validated), Send notifications to email endpoints (comma-separated, validated).

### 2.6 Section 5 — Add Tags *(optional)*

Key-value pairs attached to the SLO as AWS resource tags.

---

## 3. Mapping Each Section to Prometheus

### 3.1 Section 1 (Set SLI) → PromQL Expression + Recording Rules

#### 3.1.1 Source Type

| CW Concept | Prometheus Equivalent | UI Change Required |
|------------|----------------------|-------------------|
| Service operation | Label matchers: `{service="X", endpoint="Y"}` on Prometheus metrics | **Replace dropdowns** with label-value pickers populated from `/api/v1/label/<label>/values` |
| Service dependency | Label matchers: `{service="X", dependency="Y"}` | Same as above, with an additional dependency label picker |

**Key difference:** CloudWatch auto-discovers services and operations from Application Signals instrumentation. Prometheus does not have this discovery mechanism. The UI must instead:

1. Let users **select a Prometheus metric** (e.g. `http_server_request_duration_seconds_count`)
2. Then dynamically load the available **label names and values** for that metric
3. Map well-known OTEL semantic convention labels (`service.name`, `http.method`, `http.route`) to the "Service" and "Operation" dropdowns

**Proposed UI for Prometheus datasources:**

```
Source type:  (●) Service operation   ( ) Service dependency

Metric:       [http_server_request_duration_seconds_count  ▼]
              ↳ auto-complete from /api/v1/label/__name__/values

Service:      [pet-clinic-frontend  ▼]
              ↳ populated from /api/v1/label/service/values?match[]=<metric>

Operation:    [POST /api/customer/owners  ▼]
              ↳ populated from /api/v1/label/endpoint/values?match[]=<metric>{service="X"}
```

#### 3.1.2 Calculate: Good Requests vs Good Periods

**Request-based SLI ("Number of good requests")**

This maps to a ratio of two `rate()` queries over the SLO window:

| SLI Type | Generated PromQL |
|----------|-----------------|
| Availability | `sum(rate(http_requests_total{service="X", status!~"5.."}[<window>])) / sum(rate(http_requests_total{service="X"}[<window>]))` |
| Latency (p99) | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="X"}[<window>])) by (le))` |
| Latency (p90) | Same with `0.90` quantile |
| Latency (p50) | Same with `0.50` quantile |

**UI change:** For availability, the user must identify which metric represents **good** events vs **total** events. Two approaches:

- **Auto-infer**: If the selected metric has a `status` label, assume `status!~"5.."` filters good events (follows HTTP semantic conventions). Show the inferred filter and let users edit.
- **Explicit**: Add a "Good events filter" field where users define the label matcher that identifies successful requests.

**Period-based SLI ("Number of good periods")**

This is more complex for Prometheus. It requires a **recording rule** that computes a per-period boolean (good/bad) and then aggregates:

```yaml
# Recording rule: was this minute "good"?
- record: slo:good_period:pet_clinic_availability
  expr: |
    (
      sum(rate(http_requests_total{service="pet-clinic", status!~"5.."}[1m]))
      / sum(rate(http_requests_total{service="pet-clinic"}[1m]))
    ) >= 0.999

# Alert based on good periods over window
- alert: SLO_PetClinic_Availability_PeriodBreach
  expr: |
    avg_over_time(slo:good_period:pet_clinic_availability[1d]) < 0.999
```

**UI change:** When "Number of good periods" is selected and the datasource is Prometheus, display an info callout:

> "Period-based SLIs for Prometheus require a recording rule to pre-compute per-period results. This will create an additional recording rule in your rule group."

#### 3.1.3 "From metric" Fields

| CW Field | Prometheus Replacement |
|----------|----------------------|
| Service dropdown | **Metric picker** → then label-value picker for `service` label |
| Operation dropdown | Label-value picker for `endpoint` / `http.route` / `operation` label |
| Dependency dropdown | Label-value picker for `dependency` / `peer.service` label |

The UI should use the existing `MetricBrowser` component (already built in `standalone/components/metric_browser.tsx`) adapted to a picker mode, plus cascading label-value selectors.

#### 3.1.4 "Must be" Threshold

| CW Condition | Prometheus Alert Expression |
|-------------|---------------------------|
| `Greater or equal to 99.9 %` (availability) | Alert fires when ratio `< 0.999` |
| `Lower or equal to 99 ms` (latency) | Alert fires when `histogram_quantile(...) > 0.099` |

**Note:** The operator is **inverted** for the alert rule because the alert fires on *violation*, not on *compliance*. The UI should keep the CW-style "Must be" phrasing (positive condition) and invert automatically when generating the PromQL.

### 3.2 Section 2 (Set SLO) → Alert `for` Duration + Rule Windows

#### 3.2.1 Attainment Goal and Error Budget Warning

| CW Field | Prometheus Mapping |
|----------|-------------------|
| Attainment goal: `99.9 %` | Stored in alert labels: `slo_target: "99.9"`. Used to compute error budget: `1 - 0.999 = 0.001` (0.1%) |
| Warn when error budget falls below: `30 %` | Generates a warning alert: `slo_error_budget_remaining < 0.30` |

These values are used when generating the alert rules in Section 4.

#### 3.2.2 Measurement Window

| CW Option | Prometheus Mapping | Feasibility |
|-----------|-------------------|-------------|
| **Rolling** interval of `1 day(s)` | PromQL range vector: `[1d]` in rate/avg_over_time calls | Fully supported |
| **Rolling** interval of `7 day(s)` | PromQL range vector: `[7d]` | Supported (requires sufficient retention) |
| **Rolling** interval of `30 day(s)` | PromQL range vector: `[30d]` | Supported (requires 30d+ retention) |
| **Calendar** interval of `1 month(s)` | **Not natively supported in PromQL** | See below |

**Calendar window limitation:** PromQL range vectors are fixed durations, not calendar-aligned. To support calendar months:

- **Option A (recommended):** Show a callout when Calendar is selected with a Prometheus datasource: *"Calendar intervals are approximated as 30-day rolling windows for Prometheus datasources. For exact calendar-month alignment, use CloudWatch."*
- **Option B:** Generate a recording rule that resets at month boundaries using `timestamp()` math. This is fragile and not recommended for v1.

**UI change:** When datasource is Prometheus, either disable the Calendar option or show a warning that it will be approximated.

#### 3.2.3 Exclusion Windows

| CW Concept | Prometheus Mapping |
|------------|-------------------|
| Exclusion time windows | **Alertmanager silences** (auto-created) + **Suppression rules** (existing `SuppressionRule` type in codebase) |

CloudWatch excludes maintenance window data from the SLI calculation itself. Prometheus cannot retroactively exclude data from `rate()` computations. Instead:

- **Approach:** Auto-create Alertmanager silences or suppression rules (via existing `SuppressionRuleService`) that mute the SLO alerts during exclusion windows. The SLI data still includes the window, but alerts are suppressed.
- **UI change:** Add a callout under the exclusion windows section for Prometheus datasources: *"For Prometheus, exclusion windows suppress alert notifications during the configured periods. The SLI metric data is not excluded from the underlying calculation."*

The existing `SuppressionRule` interface already supports this:

```typescript
// core/types.ts — already exists
interface SuppressionRule {
  id: string;
  name: string;
  reason: string;
  schedule?: string;  // e.g. "Sat 02:00-06:00 UTC" or CRON
  matchLabels?: Record<string, string>;
  active: boolean;
}
```

CRON-based exclusion windows from the Figma map directly to the `schedule` field. The `matchLabels` would be set to `{ slo_id: "<generated-slo-id>" }` to scope suppression to the SLO's alerts.

### 3.3 Section 3 (Set SLO Name) → Alert Name Prefix + Labels

| CW Field | Prometheus Mapping |
|----------|-------------------|
| SLO name: "Availability for pet clinic frontend ec2 POST" | Used as prefix for generated alert rule names and stored in `labels.slo_name` and `annotations.slo_name` |

Generated alert names would follow the pattern:
- `SLO_BurnRate_<sanitized_name>` for burn rate alerts
- `SLO_SLIHealth_<sanitized_name>` for SLI health alerts
- `SLO_Attainment_<sanitized_name>` for attainment breach alerts
- `SLO_Warning_<sanitized_name>` for error budget warning alerts

All generated rules are placed in a single `PromRuleGroup` named `slo:<sanitized_name>`.

### 3.4 Section 4 (Burn Rate and Alarms) → Multiple Prometheus Alert Rules

This is the most critical mapping. The CW design offers two burn rate modes and three SLO alarm types. Here's how each generates Prometheus alert rules.

#### 3.4.1 Burn Rate Alarm — Error Budget Mode

**CW config:** Look-back window: `60 Minutes`, fire when error budget is consumed more than `70 %`

**Generated Prometheus alert rule:**

```yaml
- alert: SLO_BurnRate_PetClinicAvailability
  expr: |
    (
      1 - (
        sum(rate(http_requests_total{service="pet-clinic", status!~"5.."}[1h]))
        / sum(rate(http_requests_total{service="pet-clinic"}[1h]))
      )
    ) / 0.001 > 0.70
  # Explanation: (current error rate over 1h window) / (total error budget)
  # If this exceeds 0.70, it means 70% of the budget was consumed in 1h
  for: 5m
  labels:
    severity: critical
    slo_name: "Availability for pet clinic frontend ec2 POST"
    slo_id: "<generated-uuid>"
    alarm_type: burn_rate
    burn_rate_window: "1h"
  annotations:
    summary: "SLO burn rate alert — 70% of error budget consumed in 1h"
    description: >
      The service pet-clinic is consuming error budget at an alarming rate.
      70% of the 0.1% error budget has been consumed in the last 1 hour.
```

#### 3.4.2 Burn Rate Alarm — Burn Rate Threshold Mode

**CW config:** Look-back window: `60 Minutes`, fire when burn rate threshold is larger than `10`

**Generated Prometheus alert rule:**

```yaml
- alert: SLO_BurnRate_PetClinicAvailability
  expr: |
    (
      1 - (
        sum(rate(http_requests_total{service="pet-clinic", status!~"5.."}[1h]))
        / sum(rate(http_requests_total{service="pet-clinic"}[1h]))
      )
    ) / 0.001 > 10
  # Explanation: (current error rate over 1h) / (error budget rate for full window)
  # burn_rate > 10 means errors are accumulating 10x faster than budget allows
  for: 5m
  labels:
    severity: critical
    slo_name: "Availability for pet clinic frontend ec2 POST"
    slo_id: "<generated-uuid>"
    alarm_type: burn_rate
    burn_rate_factor: "10"
```

#### 3.4.3 Multiple Burn Rates (via "Add more burn rate")

The CW design allows adding multiple burn rate rows. For Prometheus, this generates **one alert rule per burn rate row**, all within the same rule group. A recommended multi-window strategy:

| Row | Window | Condition | Severity | Purpose |
|-----|--------|-----------|----------|---------|
| 1 | 5m + 1h | burn rate > 14.4 | critical | Catches fast outages — pages on-call immediately |
| 2 | 30m + 6h | burn rate > 6 | warning | Catches sustained degradation — creates ticket |

Each row generates a separate `PromAlertingRule` with the corresponding window and threshold.

#### 3.4.4 SLO Alarm Checkboxes

| CW Alarm Checkbox | Generated Prometheus Alert Rule |
|-------------------|-------------------------------|
| **SLI health alarm** | `alert: SLO_SLIHealth_PetClinicAvailability`<br>`expr: (sum(rate(good[5m])) / sum(rate(total[5m]))) < 0.999`<br>`for: 0s`<br>`labels: { severity: warning, alarm_type: sli_health }` |
| **SLO attainment goal alarm** (or SLO error budget alarm) | `alert: SLO_Attainment_PetClinicAvailability`<br>`expr: (sum(rate(good[1d])) / sum(rate(total[1d]))) < 0.999`<br>`for: 5m`<br>`labels: { severity: critical, alarm_type: attainment }` |
| **SLO warning alarm** (or SLO error budget warning alarm) | `alert: SLO_Warning_PetClinicAvailability`<br>`expr: (1 - (1 - (sum(rate(good[1d])) / sum(rate(total[1d]))))) / 0.001) < 0.30`<br>Simplified: error budget remaining < 30%<br>`for: 15m`<br>`labels: { severity: warning, alarm_type: error_budget_warning }` |

#### 3.4.5 Notification — SNS Topic → Alertmanager Receiver / Notification Routing

| CW Concept | Prometheus Mapping |
|------------|-------------------|
| Select existing SNS topic | **Select existing Alertmanager receiver** or select from existing `NotificationRouting` destinations |
| Create SNS topic (modal: topic name + email endpoints) | **Create notification destination** — use existing destination CRUD (`NotificationRoutingPanel` component). For Alertmanager, this maps to configuring a receiver in the Alertmanager config. |

**UI change:** Replace "SNS topic" label with "Notification channel". The "Create topic" modal becomes "Create notification destination" with fields for channel type (Slack/Email/PagerDuty/Webhook) and destination details. This aligns with the existing `NotificationRouting` interface:

```typescript
// Already exists in core/types.ts
interface NotificationRouting {
  channel: string;      // "Slack", "Email", "PagerDuty"
  destination: string;  // "#ops-alerts", "oncall@example.com"
  severity?: UnifiedAlertSeverity[];
  throttle?: string;
}
```

### 3.5 Section 5 (Tags) → Prometheus Labels

| CW Concept | Prometheus Mapping |
|------------|-------------------|
| AWS resource tags (key-value) | Additional `labels` on all generated alert rules + stored in SLO metadata |

All user-defined tags are added to every generated Prometheus alert rule's `labels` block, prefixed with `tag_` to avoid collision with system labels:

```yaml
labels:
  tag_team: "platform"
  tag_environment: "production"
  tag_cost_center: "eng-123"
```

---

## 4. Complete Example: One SLO → Generated Prometheus Rules

**User input:**
- SLI: Availability, service operation, good requests
- Service: `pet-clinic-frontend`, Operation: `POST /api/customer/owners`
- Must be: >= 99.9%
- SLO: Attainment 99.9%, warn at 30% budget, rolling 1 day
- Burn rate: 60 min window, error budget consumed > 70%, with alarm
- Alarms: SLI health + attainment goal + warning
- Tags: team=platform, env=prod

**Generated PromRuleGroup:**

```yaml
name: slo:availability_pet_clinic_frontend_post_api_customer_owners
interval: 60  # 1 minute evaluation
rules:

  # ---- Recording rule: pre-compute error ratio for efficiency ----
  - record: slo:error_ratio:pet_clinic_post_owners
    expr: |
      1 - (
        sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners", status!~"5.."}[5m]))
        / sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners"}[5m]))
      )
    labels:
      slo_id: "slo-abc123"
      slo_name: "Availability for pet-clinic-frontend POST /api/customer/owners"

  # ---- Alert 1: SLI Health (fires on every bad evaluation) ----
  - alert: SLO_SLIHealth_PetClinicAvailability
    expr: |
      (
        sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners", status!~"5.."}[5m]))
        / sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners"}[5m]))
      ) < 0.999
    for: 0s
    labels:
      severity: warning
      slo_id: "slo-abc123"
      slo_name: "Availability for pet-clinic-frontend POST /api/customer/owners"
      alarm_type: sli_health
      tag_team: "platform"
      tag_env: "prod"
    annotations:
      summary: "SLI health degraded — availability below 99.9% target"
      description: "The ratio of good requests to total requests for pet-clinic-frontend POST /api/customer/owners is below the 99.9% goal."

  # ---- Alert 2: Burn Rate (70% budget consumed in 1h) ----
  - alert: SLO_BurnRate_PetClinicAvailability
    expr: |
      (
        1 - (
          sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners", status!~"5.."}[1h]))
          / sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners"}[1h]))
        )
      ) / 0.001 > 0.70
    for: 5m
    labels:
      severity: critical
      slo_id: "slo-abc123"
      slo_name: "Availability for pet-clinic-frontend POST /api/customer/owners"
      alarm_type: burn_rate
      burn_rate_window: "1h"
      tag_team: "platform"
      tag_env: "prod"
    annotations:
      summary: "SLO burn rate critical — 70%+ of error budget consumed in 1h"
      description: "Error budget is being consumed at a dangerous rate. At this pace, the full budget will be exhausted well before the 1-day window ends."

  # ---- Alert 3: Attainment Goal Breach ----
  - alert: SLO_Attainment_PetClinicAvailability
    expr: |
      (
        sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners", status!~"5.."}[1d]))
        / sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners"}[1d]))
      ) < 0.999
    for: 5m
    labels:
      severity: critical
      slo_id: "slo-abc123"
      slo_name: "Availability for pet-clinic-frontend POST /api/customer/owners"
      alarm_type: attainment
      slo_target: "99.9"
      tag_team: "platform"
      tag_env: "prod"
    annotations:
      summary: "SLO attainment breached — availability below 99.9% over 1d window"
      description: "The 1-day rolling attainment for pet-clinic-frontend POST /api/customer/owners has fallen below the 99.9% target."

  # ---- Alert 4: Error Budget Warning (below 30% remaining) ----
  - alert: SLO_Warning_PetClinicAvailability
    expr: |
      1 - (
        (
          1 - (
            sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners", status!~"5.."}[1d]))
            / sum(rate(http_requests_total{service="pet-clinic-frontend", endpoint="POST /api/customer/owners"}[1d]))
          )
        ) / 0.001
      ) < 0.30
    for: 15m
    labels:
      severity: warning
      slo_id: "slo-abc123"
      slo_name: "Availability for pet-clinic-frontend POST /api/customer/owners"
      alarm_type: error_budget_warning
      budget_threshold: "30"
      tag_team: "platform"
      tag_env: "prod"
    annotations:
      summary: "SLO warning — less than 30% error budget remaining"
      description: "The error budget for pet-clinic-frontend POST /api/customer/owners is running low. Less than 30% of the 0.1% budget remains in the current 1-day window."
```

---

## 5. UI Modifications Required

### 5.1 Changes Conditioned on Datasource Type

The form should remain structurally identical to the CW mockup but **adapt specific fields** when the selected datasource is Prometheus. This is similar to how `create_monitor.tsx` already switches between Prometheus and OpenSearch form variants.

| Section | Field | CW Behavior | Prometheus Adaptation |
|---------|-------|-------------|----------------------|
| 1 - SLI | Service / Operation dropdowns | Auto-populated from Application Signals | Populated from Prometheus label values via API; add a **Metric** picker above them |
| 1 - SLI | Calculate → "for" dropdown | `availability` / `latency` | Add `p99 latency` / `p90 latency` / `p50 latency` options (already in CW for "periods" mode — expose for "requests" mode too) |
| 1 - SLI | (new) Good events filter | Not needed (CW infers) | Add editable label filter: `status!~"5.."` — pre-populated, user can customize |
| 2 - SLO | Measure for: Calendar | Fully supported | Show warning callout: "Approximated as rolling window for Prometheus" |
| 2 - SLO | Exclusion windows | Excludes data from calculation | Show info callout: "For Prometheus, exclusion windows suppress alerts (data not excluded from metric)" |
| 4 - Alarms | Notify with SNS topic | SNS topic picker + create | Replace with "Notification channel" picker using existing `NotificationRouting` UI |
| 4 - Alarms | Create topic modal | Topic name + email | Replace with "Create destination" using existing destination types (Slack/Email/Webhook/PagerDuty) |
| 5 - Tags | AWS resource tags | Key-value | Keep as-is — maps to Prometheus labels |
| Preview | CW metric charts | CloudWatch GetMetricData | Replace with live PromQL query results rendered as time-series charts |

### 5.2 New Components Needed

| Component | Purpose |
|-----------|---------|
| `CreateSloWizard` | Accordion-based SLO form matching Figma layout, with datasource-conditional rendering |
| `MetricLabelPicker` | Cascading picker: select metric → select label values (reuses `MetricBrowser` internals) |
| `SloPreviewPanel` | Right-side panel showing SLI metric chart, attainment chart, error budget chart — queries Prometheus `/api/v1/query_range` |
| `PromQLPreview` | Shows the generated PromQL for each alarm as a read-only code block (like existing YAML preview) |
| `BurnRateConfigurator` | Multi-row burn rate editor matching the Figma "Add more burn rate" pattern |

### 5.3 Listing Page Modifications

The SLO listing table needs a new data source. Since Prometheus has no native SLO object, the listing must:

1. **Read all rule groups** and identify SLO-generated rules by the `slo_id` label
2. **Aggregate** rules sharing the same `slo_id` into a single SLO row
3. **Compute** attainment and error budget by executing the SLI PromQL query at read time
4. **Display** the same columns as the CW mockup: Type, Name, Interval, Attainment, Goal, Error budget, Target, Service, Tags

The "Type" column icon should distinguish between CW SLOs and Prometheus SLOs.

Filter sidebar adaptations:
- **Platform**: Replace EKS/ECS/EC2/Lambda with Prometheus workspace or label-based grouping
- **Type**: Replace "CloudWatch Metric / Service operation / Service dependency" with "Availability / Latency" SLI type filter
- **Status**: Keep Breached/Warning/Ok/No data (computed from live query)

---

## 6. Backend Modifications Required

### 6.1 New Files

| File | Purpose |
|------|---------|
| `core/slo_types.ts` | SLO domain types (`SloDefinition`, `SliDefinition`, `BurnRateConfig`, etc.) |
| `core/slo_service.ts` | SLO lifecycle: create/read/update/delete. Converts `SloDefinition` → `PromAlertingRule[]` + `PromRecordingRule[]`. Stores SLO metadata. |
| `core/slo_promql_generator.ts` | Pure function: `SloDefinition` → PromQL expressions for each alarm type. Unit-testable. |
| `standalone/components/create_slo_wizard.tsx` | The Create SLO form UI |
| `standalone/components/slo_listing.tsx` | SLO listing table with aggregation |
| `standalone/components/slo_preview_panel.tsx` | Right-side preview charts |
| `server/routes/slo_handlers.ts` | REST API handlers for SLO CRUD |

### 6.2 Modified Files

| File | Change |
|------|--------|
| `core/types.ts` | Add SLO-related types; extend `UnifiedRule` with `sloMetadata` |
| `core/alert_service.ts` | Add SLO-aware rule grouping in `getUnifiedRules()`; add `createSloRuleGroup()` method |
| `core/prometheus_backend.ts` | Add ruler API support for writing rule groups (required for creating alert rules programmatically via AMP or Cortex ruler API) |
| `core/validators.ts` | Add SLO form validation (attainment 0–100, window bounds, burn rate config) |
| `standalone/components/alarms_page.tsx` | Add "SLO" tab; integrate `CreateSloWizard` and `SloListing` |
| `standalone/components/monitors_table.tsx` | Group SLO-generated rules under collapsible SLO headers |

### 6.3 API Surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/slos` | Create an SLO (generates and deploys Prometheus rules) |
| GET | `/api/slos` | List all SLOs (aggregates from rule groups by `slo_id` label) |
| GET | `/api/slos/:id` | Get SLO detail (includes live attainment + error budget) |
| PUT | `/api/slos/:id` | Update SLO (regenerates and redeploys all rules atomically) |
| DELETE | `/api/slos/:id` | Delete SLO (removes all generated rules + suppression rules) |
| GET | `/api/slos/:id/status` | Live SLO status — queries Prometheus for current attainment and error budget |

### 6.4 Rule Deployment

Creating Prometheus alert rules requires write access to the rule configuration. Supported paths:

| Prometheus Variant | Write Mechanism |
|-------------------|-----------------|
| **Amazon Managed Prometheus (AMP)** | `PUT /api/v1/rules` (AMP Ruler API) — already accessible via the configured datasource URL |
| **Cortex / Mimir** | `POST /api/v1/rules/{namespace}` (Ruler API) |
| **Standalone Prometheus** | Write YAML rule files to disk + signal reload via `POST /-/reload` or SIGHUP. Requires file system access. |

The `PrometheusBackend` interface needs a new method:

```typescript
interface PrometheusBackend {
  // ... existing methods ...

  /** Write a rule group via the ruler API (AMP/Cortex/Mimir) */
  putRuleGroup?(ds: Datasource, namespace: string, group: PromRuleGroup): Promise<void>;

  /** Delete a rule group by name */
  deleteRuleGroup?(ds: Datasource, namespace: string, groupName: string): Promise<boolean>;
}
```

---

## 7. Gaps and Limitations

| CW Capability | Prometheus Gap | Mitigation |
|--------------|----------------|------------|
| Calendar-month windows | PromQL only supports fixed-duration ranges | Approximate as rolling window; document limitation |
| Exclusion windows exclude data from SLI | PromQL cannot retroactively filter data by time | Suppress alerts during windows instead; document difference |
| Auto-discovered services/operations | No built-in service discovery | Query Prometheus label values dynamically; leverage OTEL conventions |
| Native SLO object with lifecycle | No SLO primitive in Prometheus | Store SLO metadata in rule labels + external store (local JSON or OpenSearch index) |
| Error budget visualization (real-time) | Must be computed on read | Execute PromQL at query time via `/api/v1/query`; cache briefly |
| SNS notification topics | Not applicable | Map to Alertmanager receivers or existing notification routing |
| Single-click SLO status | CW provides it natively | Compute by querying all rules with matching `slo_id` label |

---

## 8. Recommended Phasing

### Phase 1 — Core SLO Creation (MVP)

- Implement `CreateSloWizard` with Sections 1–3
- Support request-based availability SLI only
- Generate burn rate + attainment alert rules (Section 4, excluding SLO alarm checkboxes)
- Rolling windows only
- Deploy via AMP Ruler API
- Basic SLO listing aggregated from rule labels

### Phase 2 — Full Alarm Suite + Notifications

- SLI health, attainment, and warning alarm checkboxes
- Notification channel integration (reuse existing `NotificationRouting`)
- Multi-window burn rate ("Add more burn rate")
- Exclusion windows → suppression rule auto-creation

### Phase 3 — Advanced SLI Types + UX Polish

- Latency SLI (histogram_quantile)
- Period-based SLIs (recording rule generation)
- Service dependency SLIs
- Calendar window approximation
- Live preview panel with SLI/attainment/error budget charts
- SLO edit and delete (atomic rule group updates)

### Phase 4 — Listing + Observability

- Full SLO listing page matching Figma mockup
- Real-time attainment and error budget computation
- Filter sidebar (by service, SLI type, status, tags)
- SLO detail page with historical attainment trend
