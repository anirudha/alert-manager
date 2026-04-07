# SLO/SLI Feature Gap Roadmap

This document tracks advanced SLO/SLI features identified during domain review
against the Google SRE Workbook standard. The current implementation covers the
core MWMBR burn-rate pattern, PromQL generation, error-budget math, and four SLI
types. The items below are incremental enhancements ordered by priority.

---

## High Priority

### 1. Error Budget Burn Prediction

**What:** An additional alerting rule that predicts *time to error budget
exhaustion* based on the current consumption rate:

```
# burn_rate_multiplier = current_error_ratio / error_budget
# time_to_exhaustion  = (error_budget_remaining * window_duration) / burn_rate_multiplier

# Possible PromQL sketch using linear prediction:
predict_linear(slo:sli_error:ratio_rate_1h[6h], 3600 * N)
```

`burn_rate` here means the observed burn-rate multiplier (how many times faster
than 1x the budget is being consumed). Alert when `time_to_exhaustion < N hours`.

**Why:** Current burn-rate alerts tell operators *how fast* budget is burning,
but not *when* it will run out. A "budget exhausted in 2 hours" alert is more
actionable than "burning at 6x."

**Scope:** New alerting rule type in `slo_promql_generator.ts`; new toggle in
`SloAlarmConfig`.

---

### 2. Composite SLOs

**What:** Combine multiple SLIs into a single SLO with AND/OR semantics.
For example: "Checkout SLO is met when availability > 99.9% AND p99 latency
< 500 ms."

**Why:** Real services have multiple quality dimensions. Tracking them as
independent SLOs hides correlated failures.

**Scope:** New `CompositeSloDefinition` type; updated generator to emit
multi-expression alerts; updated UI wizard step.

**Open design question:** How does error budgeting work for composite SLOs?
Industry approaches vary — Datadog uses a "worst of" model, Nobl9 uses weighted
composites. This needs a design decision before implementation.

---

## Medium Priority

### 3. Calendar-Aligned Windows

**What:** Support monthly and quarterly SLO windows that reset on calendar
boundaries (e.g., "99.9 % availability per calendar month").

**Why:** Many SLA contracts use calendar months, not rolling windows.

**Scope:** Calendar-aware recording rules (e.g.,
`resets(metric[1M offset ...])`) or server-side stitching of rolling windows.
Prometheus has limited native support, so this may require external
aggregation.

---

### 4. SLO History Tracking

**What:** Periodically snapshot attainment and error-budget values so users
can view trend charts ("How has this SLO performed over the last 90 days?").

**Why:** Current implementation only shows live status. Historical trends help
with capacity planning and SLO target tuning.

**Scope:** Scheduled job that persists `SloLiveStatus` snapshots; new API
endpoint `/api/slos/:id/history`; chart component in the detail flyout.

---

### 5. Metric Pattern Presets

**What:** Pre-built metric templates for common non-HTTP protocols:

| Protocol | Total Metric | Good Events Filter |
|----------|-------------|-------------------|
| gRPC | `grpc_server_handled_total` | `grpc_code="OK"` |
| Database | `db_query_duration_seconds_count` | `status="success"` |
| Message Queue | `queue_messages_processed_total` | `result="success"` |

**Why:** The wizard currently pre-populates HTTP patterns only. Users working
with gRPC, databases, or queues must manually enter metric names and filters.

**Scope:** Preset registry in the wizard; `goodEventsFilter` field already
supports custom filters — this is UI-only.

---

## Low Priority

### 6. Exclusion Window SLI Calculation

**What:** Exclude maintenance periods from the SLI numerator and denominator
so planned downtime doesn't consume error budget.

**Why:** Current exclusion windows suppress *alert notifications* but the
underlying data still counts against the SLO. Organizations with regular
maintenance windows see artificially reduced attainment.

**Scope:** Requires either PromQL `unless` clauses with time-range matchers
(limited support) or post-query adjustment in the status computation layer.

---

### 7. Automatic Threshold Tuning

**What:** ML-based adjustment of burn-rate multipliers and window durations
using historical false-positive and false-negative data.

**Why:** Default MWMBR thresholds are a good starting point but may be too
noisy or too slow for specific services. Automated tuning reduces alert fatigue.

**Scope:** Data collection pipeline for alert outcomes; offline analysis job;
recommendation API that suggests updated `BurnRateConfig` values; UI
integration for "Apply recommendations."

---

### 8. SLO-Based Deployment Gating

**What:** Use SLO error budget status to gate deployments (e.g., "do not
deploy if error budget < 20%"). Integrates with CI/CD pipelines.

**Why:** Described in Google SRE Workbook Chapter 2 (Implementing SLOs). A
key differentiator for mature SLO platforms — prevents deploying new changes
when the service is already degraded.

**Scope:** New API endpoint `/api/slos/:id/deploy-gate`; webhook/CI
integration; configurable budget threshold for gating.

---

### 9. Multi-Signal SLIs (Logs and Traces)

**What:** Support log-based SLIs (error rate from OpenSearch log queries)
and trace-based SLIs (span error rate or latency from Jaeger/OTLP).

**Why:** Not all services expose Prometheus metrics. The multi-backend
architecture already supports multiple datasource types — extending SLI
sources to logs and traces broadens coverage.

**Scope:** New `SliSourceBackend` abstraction; OpenSearch log query adapter;
trace query adapter; updated wizard with source type selector.

---

## References

- [Google SRE Workbook — Alerting on SLOs (Chapter 5)](https://sre.google/workbook/alerting-on-slos/)
- [Google SRE Workbook — Implementing SLOs (Chapter 2)](https://sre.google/workbook/implementing-slos/)
- [Sloth — Prometheus SLO generator](https://github.com/slok/sloth)
