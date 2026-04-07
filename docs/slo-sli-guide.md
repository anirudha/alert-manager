# SLO/SLI Guide — Alert Manager

## What Are SLOs and SLIs?

**Service Level Indicator (SLI)** is a quantitative measure of some aspect of the service being provided. Common SLIs include:

- **Availability**: The proportion of requests that succeed (e.g., return a non-5xx status code)
- **Latency**: How long requests take to complete (measured at p50, p90, or p99)

**Service Level Objective (SLO)** is a target value or range for an SLI. For example:

- "99.9% of requests to the checkout service will succeed over any rolling 1-day window"
- "The p99 latency of the auth service will be below 100ms over any rolling 7-day window"

**Error Budget** is the inverse of the SLO target — the amount of "allowed" unreliability. For a 99.9% SLO:
- Error budget = 1 - 0.999 = 0.001 (0.1%)
- Over a 30-day window with uniform traffic and total outage, this translates to ~43 minutes of allowed downtime

---

## How the Alert Manager Implements SLOs

The Alert Manager translates SLO definitions into Prometheus **recording rules** and **alerting rules**. A single SLO generates:

1. **Intermediate recording rules** at multiple time windows (5m, 30m, 1h, 2h, 6h, 1d, 3d)
2. **Multi-window multi-burn-rate (MWMBR) alerting rules** that detect when error budget is being consumed too fast
3. **SLI health alerts**, **attainment breach alerts**, and **error budget warning alerts**

### Why Recording Rules?

Prometheus `rate()` queries over large windows (e.g., `rate(metric[30d])`) load millions of raw samples on every evaluation, which degrades query performance. Instead, we pre-compute the error ratio at multiple granularities using recording rules. The alerting rules then reference these lightweight pre-computed values.

---

## SLI Calculation

### Availability SLI

For availability SLIs, the error ratio is computed as:

```
error_ratio = 1 - (good_requests_rate / total_requests_rate)
```

For a typical HTTP service with metric `http_requests_total`:

```promql
# Recording rule: error ratio over 5m window
1 - (
  sum(rate(http_requests_total{service="my-service", status_code!~"5.."}[5m]))
  /
  sum(rate(http_requests_total{service="my-service"}[5m]))
)
```

The numerator counts "good" requests (those NOT matching 5xx status codes), and the denominator counts all requests. The result is the fraction of requests that failed.

### Latency SLI

For latency SLIs, we use histogram quantiles:

```promql
# Recording rule: p99 latency over 5m window
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{service="my-service"}[5m])) by (le)
)
```

For latency-based error budget calculations, we also compute what fraction of requests exceeded the latency threshold:

```promql
# Error ratio: fraction of requests exceeding 500ms threshold
1 - (
  sum(rate(http_request_duration_seconds_bucket{service="my-service", le="0.5"}[5m]))
  /
  sum(rate(http_request_duration_seconds_bucket{service="my-service", le="+Inf"}[5m]))
)
```

---

## Attainment and Error Budget Calculation

### Attainment

Attainment is the SLI value measured over the full SLO window:

```
attainment = 1 - error_ratio_over_window
```

For a 99.9% SLO with a 1-day window:
- If the error ratio over the last 24 hours is 0.0003 (0.03%), attainment = 99.97%
- The SLO is **met** because 99.97% > 99.9%

### Error Budget Remaining

Error budget remaining tells you what fraction of your allowed errors you have left:

```
error_budget = 1 - target           # e.g., 1 - 0.999 = 0.001
budget_consumed = error_ratio / error_budget
budget_remaining = 1 - budget_consumed
```

Example:
- Target: 99.9% (error budget = 0.001)
- Current error ratio over window: 0.0003
- Budget consumed: 0.0003 / 0.001 = 30%
- Budget remaining: 70%

When budget remaining drops below 0%, the SLO is **breached**.

---

## Multi-Window Multi-Burn-Rate (MWMBR) Alerting

MWMBR is the Google SRE Workbook's recommended approach for SLO-based alerting. It uses paired short + long observation windows evaluated with an AND condition:

```
alert fires when:
  error_ratio_short_window > (burn_rate_multiplier * error_budget)
  AND
  error_ratio_long_window > (burn_rate_multiplier * error_budget)
```

### Why Two Windows?

- **Short window alone** would produce false alarms from brief spikes
- **Long window alone** would detect problems too slowly
- **Both together** ensures: the problem is real (long window) AND still happening (short window)

### Default Burn Rate Tiers

The Alert Manager uses 4 tiers following Google SRE recommendations:

| Tier | Short Window | Long Window | Burn Rate | Severity | For | Budget Exhaustion (1d window) | Budget Exhaustion (30d window) |
|------|-------------|-------------|-----------|----------|-----|-------------------------------|--------------------------------|
| 1 (Page) | 5m | 1h | 14.4x | Critical | 2m | ~1.7 hours | ~50 hours |
| 2 (Ticket) | 30m | 6h | 6x | Critical | 5m | ~4 hours | ~5 days |
| 3 (Log) | 2h | 1d | 3x | Warning | 10m | ~8 hours | ~10 days |
| 4 (Monitor) | 6h | 3d | 1x | Warning | 30m | ~1 day | ~30 days |

Time to exhaust the full error budget = `window_duration / burn_rate_multiplier`. The values above show two common window sizes; your actual exhaustion time depends on the SLO window you configure.

> **Severity mapping rationale:** The tier names (Page, Ticket, Log, Monitor) come from
> Google SRE Workbook Chapter 5 (Alerting on SLOs) and describe the *response type*,
> not a Prometheus severity label. Our mapping to Prometheus severities is:
>
> | Response Type | Severity | Why |
> |---------------|----------|-----|
> | Page (Tier 1) | `critical` | 14.4x burn rate — fastest budget consumption; immediate paging required |
> | Ticket (Tier 2) | `critical` | 6x burn rate — budget exhausted in hours (1d window) to days (30d window); still urgent enough for paging |
> | Log (Tier 3) | `warning` | 3x burn rate — slower consumption; next-business-day response |
> | Monitor (Tier 4) | `warning` | 1x burn rate — budget consumed at exactly the allowed rate; informational |
>
> Operators can adjust these severities per-tier when creating an SLO.

**Burn rate multiplier** represents how fast the error budget is being consumed:
- **14.4x** means errors are accumulating 14.4 times faster than the budget allows — at this rate, the budget would be exhausted in `window / 14.4` (e.g. ~1.7 hours for a 1-day window, ~50 hours for a 30-day window)
- **1x** means errors are accumulating exactly at the budget rate — the budget will be fully consumed by the end of the window

### Example: 99.9% SLO

Error budget = 0.001 (0.1%)

| Tier | Threshold | Meaning |
|------|-----------|---------|
| 14.4x | error_ratio > 0.0144 | More than 1.44% of requests failing |
| 6x | error_ratio > 0.006 | More than 0.6% of requests failing |
| 3x | error_ratio > 0.003 | More than 0.3% of requests failing |
| 1x | error_ratio > 0.001 | More than 0.1% of requests failing |

---

## SLO Status

Each SLO has one of four statuses:

| Status | Condition | Color |
|--------|-----------|-------|
| **Breached** | Attainment < target (error budget exhausted) | Red |
| **Warning** | Error budget remaining < warning threshold (default 30%) | Orange |
| **Ok** | Error budget remaining >= warning threshold | Green |
| **No data** | No metrics data available for computation | Gray |

---

## Generated Rules Summary

For a typical availability SLO with all alarms enabled and 4 MWMBR tiers:

| Rule | Type | Purpose |
|------|------|---------|
| `slo:sli_error:ratio_rate_5m:...` | Recording | Error ratio over 5m |
| `slo:sli_error:ratio_rate_30m:...` | Recording | Error ratio over 30m |
| `slo:sli_error:ratio_rate_1h:...` | Recording | Error ratio over 1h |
| `slo:sli_error:ratio_rate_2h:...` | Recording | Error ratio over 2h |
| `slo:sli_error:ratio_rate_6h:...` | Recording | Error ratio over 6h |
| `slo:sli_error:ratio_rate_1d:...` | Recording | Error ratio over 1d |
| `slo:sli_error:ratio_rate_3d:...` | Recording | Error ratio over 3d |
| `SLO_BurnRate_Page_...` | Alerting | 14.4x burn rate (5m/1h) |
| `SLO_BurnRate_Ticket_...` | Alerting | 6x burn rate (30m/6h) |
| `SLO_BurnRate_Log_...` | Alerting | 3x burn rate (2h/1d) |
| `SLO_BurnRate_Monitor_...` | Alerting | 1x burn rate (6h/3d) |
| `SLO_SLIHealth_...` | Alerting | SLI drops below target (for: 5m) |
| `SLO_Attainment_...` | Alerting | Attainment below target over window |
| `SLO_Warning_...` | Alerting | Error budget below warning threshold |

Total: **7 recording rules + 7 alerting rules = 14 rules**

All rules include labels:
- `slo_id`: Links rules back to the SLO definition
- `slo_name`: Human-readable SLO name
- `alarm_type`: `burn_rate`, `sli_health`, `attainment`, or `error_budget_warning`
- `slo_window_approximated`: `"true"` on attainment and budget-warning alerts when the SLO window (e.g. 7d, 30d) exceeds the largest recording window (3d). The alert uses the 3d recording rule as a conservative proxy.
- `tag_*`: User-defined tags (e.g., `tag_team: platform`)

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/slos` | List SLOs (paginated, filterable) |
| `POST` | `/api/slos` | Create a new SLO |
| `GET` | `/api/slos/:id` | Get SLO definition + live status |
| `PUT` | `/api/slos/:id` | Update SLO |
| `DELETE` | `/api/slos/:id` | Delete SLO and generated rules |
| `POST` | `/api/slos/preview` | Preview generated rules without deploying |
| `GET` | `/api/slos/statuses?ids=a,b,c` | Batch status for listing page |

### Query Parameters for Listing

```
GET /api/slos?datasourceId=ds-1&status=breached,warning&sliType=availability&service=checkout&page=1&pageSize=20
```

---

## Limitations

| Capability | Limitation | Workaround |
|------------|-----------|------------|
| Calendar-month windows | PromQL only supports fixed-duration ranges | Use rolling windows (1d, 7d, 30d) |
| Exclusion windows | PromQL cannot retroactively filter data by time | Suppresses alert notifications (data not excluded from calculation) |
| Recording rule delay | Period-based SLIs have a 1-evaluation-cycle lag | Use request-based SLIs when possible |
| Error budget visualization | Must be computed on read | Cached for 60 seconds in the service layer |
| Zero-traffic windows | Recording rules produce `NaN` when there are no requests (division by zero). Alerting rules comparing `NaN > threshold` evaluate to `false` in PromQL, so alerts do **not** spuriously fire during zero-traffic periods. | Expected behavior — no workaround needed |
| Window approximation | SLO windows > 3d (e.g. 7d, 30d) use the 3d recording rule as a proxy. This is conservative — a 3d breach may trigger the alert even if 30d attainment is still above target. | Check the `slo_window_approximated` label on alerts |

---

## References

- [Google SRE Workbook — Alerting on SLOs (Chapter 5)](https://sre.google/workbook/alerting-on-slos/)
- [Prometheus Recording Rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Sloth — SLO generator for Prometheus](https://github.com/slok/sloth)
- [OpenSearch SQL Direct Query API](https://opensearch.org/docs/latest/search-plugins/sql/direct-query/)
