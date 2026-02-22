# Requirements Document

## Introduction

This feature extends the existing Alert Manager standalone application to support full Prometheus alerting capabilities. The current codebase has a multi-backend architecture with OpenSearch and Prometheus backends, a unified UI with progressive loading, and mock data. This spec focuses on making the Prometheus metric monitor creation, alert management, notification routing, and suppression rules fully functional — moving beyond mock data to real backend interactions and completing the end-to-end alerting workflow.

## Glossary

- **Alert_Manager**: The standalone alerting application that monitors metrics, logs, and traces across OpenSearch and Prometheus backends
- **Monitor**: A definition of conditions (PromQL query + thresholds + evaluation settings) that triggers an alert when breached
- **Alert**: An event created when a monitor's alert condition is breached, with severity, state, and contextual metadata
- **Unified_Rule**: The normalized monitor representation consumed by the UI, abstracting over OpenSearch and Prometheus backends
- **Unified_Alert**: The normalized alert representation consumed by the UI, with state (active/pending/acknowledged/resolved/error) and severity (critical/high/medium/low/info)
- **PromQL_Editor**: The query editor component providing syntax highlighting, autocomplete, validation, and function hints for PromQL queries
- **Notification_Routing**: Rules that determine where alerts are sent (Slack, PagerDuty, SNS, webhooks) based on labels, severity, and time windows
- **Suppression_Rule**: Criteria for muting alerts during maintenance windows, known incidents, or based on dependency relationships
- **Pending_Period**: The duration a monitor condition must persist before triggering an alert
- **Firing_Period**: The duration a monitor condition must return to normal before an alert is considered resolved
- **Evaluation_Interval**: How frequently the monitor evaluates its query condition
- **Alert_Service**: The MultiBackendAlertService that orchestrates OpenSearch and Prometheus backends and provides unified views
- **Datasource**: A configured connection to an OpenSearch cluster or Prometheus-compatible endpoint
- **Progressive_Response**: A response structure that tracks per-datasource fetch status, enabling partial results and scoped refresh

## Requirements

### Requirement 1: Create Metric Monitors with PromQL

**User Story:** As an SRE, I want to create metric monitors using PromQL queries with threshold conditions and evaluation settings, so that I can detect anomalies in my Prometheus metrics.

#### Acceptance Criteria

1. WHEN a user submits a valid monitor form with name, PromQL query, threshold, and evaluation settings, THE Alert_Manager SHALL persist the monitor configuration and return a confirmation with the monitor ID
2. WHEN a user provides a PromQL query in the editor, THE PromQL_Editor SHALL validate the query syntax and display errors inline before submission
3. WHEN a user configures threshold conditions (operator, value, for-duration), THE Alert_Manager SHALL store the complete condition alongside the query
4. WHEN a user sets evaluation settings (interval, pending period, firing period), THE Alert_Manager SHALL validate that all durations are positive and the pending period does not exceed a reasonable bound
5. WHEN a user adds labels to a monitor, THE Alert_Manager SHALL store both static and dynamic label entries and associate them with the monitor
6. WHEN a user adds annotations (summary, description, runbook URL, dashboard URL), THE Alert_Manager SHALL store the annotations and associate them with the monitor
7. IF a user submits a monitor form with a missing name or empty query, THEN THE Alert_Manager SHALL reject the submission and display specific validation errors

### Requirement 2: List and Search Monitors

**User Story:** As an SRE, I want to view, search, and filter all monitors across my datasources, so that I can understand and maintain my monitoring coverage.

#### Acceptance Criteria

1. THE Alert_Manager SHALL display all monitors from all configured datasources in a unified table with name, status, severity, type, health, and last-triggered columns
2. WHEN a user types a search query, THE Alert_Manager SHALL filter monitors by name, label values, and annotations matching the query text
3. WHEN a user applies filters (status, severity, monitor type, health status, backend), THE Alert_Manager SHALL display only monitors matching all active filter criteria
4. WHEN a user sorts by a column header, THE Alert_Manager SHALL reorder the monitor list by that column in ascending or descending order
5. WHEN a user selects multiple monitors and clicks bulk delete, THE Alert_Manager SHALL remove all selected monitors after confirmation
6. WHEN a user clicks export JSON, THE Alert_Manager SHALL generate a JSON file containing the configurations of all currently filtered monitors

### Requirement 3: View and Manage Alerts

**User Story:** As an SRE, I want to view all active alerts across my services with filtering and detail views, so that I can assess current issues and prioritize responses.

#### Acceptance Criteria

1. THE Alert_Manager SHALL display all active alerts from all configured datasources with severity, state, monitor name, start time, and duration columns
2. WHEN a user filters alerts by severity, state, duration, or labels, THE Alert_Manager SHALL display only alerts matching all active filter criteria
3. WHEN a user selects an alert, THE Alert_Manager SHALL display a detail flyout with alert metadata, labels, annotations, AI analysis summary, and suggested actions
4. WHEN a user acknowledges an alert, THE Alert_Manager SHALL update the alert state to acknowledged and record the acknowledgment timestamp
5. WHEN a user silences an alert, THE Alert_Manager SHALL suppress notifications for that alert for the specified duration while keeping the alert visible

### Requirement 4: PromQL Query Validation and Autocomplete

**User Story:** As an SRE, I want the PromQL editor to validate my queries and suggest completions, so that I can write correct queries efficiently.

#### Acceptance Criteria

1. WHEN a user types in the PromQL editor, THE PromQL_Editor SHALL provide autocomplete suggestions for function names, metric names, label names, and label values
2. WHEN a user enters a PromQL query with mismatched brackets or parentheses, THE PromQL_Editor SHALL highlight the error position and display a descriptive message
3. WHEN a user hovers over a PromQL function, THE PromQL_Editor SHALL display the function signature, description, and parameter hints
4. WHEN a user clicks the prettify button, THE PromQL_Editor SHALL reformat the query with consistent indentation and spacing
5. THE PromQL_Editor SHALL apply syntax highlighting to distinguish functions, metrics, labels, strings, numbers, operators, and duration literals

### Requirement 5: Monitor Detail View

**User Story:** As an SRE, I want to view comprehensive details about a specific monitor, so that I can understand its configuration, behavior, and impact.

#### Acceptance Criteria

1. WHEN a user selects a monitor, THE Alert_Manager SHALL display a detail flyout with monitor name, status, severity, health, description, and AI summary
2. WHEN displaying monitor details, THE Alert_Manager SHALL show the query definition with syntax highlighting and the threshold conditions
3. WHEN displaying monitor details, THE Alert_Manager SHALL render a condition preview graph showing recent metric values against the threshold line
4. WHEN displaying monitor details, THE Alert_Manager SHALL show the alert history as a table with timestamp, state, value, and message columns
5. WHEN displaying monitor details, THE Alert_Manager SHALL show notification routing configuration and active suppression rules

### Requirement 6: Notification Routing Configuration

**User Story:** As an SRE, I want to define routing rules that send alerts to appropriate channels based on labels and severity, so that the right teams are notified.

#### Acceptance Criteria

1. WHEN a user creates a routing rule with match conditions (labels, severity, time windows) and destinations, THE Alert_Manager SHALL persist the rule and apply it to matching alerts
2. WHEN multiple routing rules match an alert, THE Alert_Manager SHALL evaluate rules sequentially and route to all matching destinations
3. WHEN a user configures alert grouping (group_by labels, group_window, group_limit), THE Alert_Manager SHALL bundle related alerts into single notifications according to the grouping configuration
4. WHEN a user defines a default routing rule, THE Alert_Manager SHALL apply the default to all alerts that do not match any specific routing rule
5. IF a notification delivery fails, THEN THE Alert_Manager SHALL retry delivery and log the failure status

### Requirement 7: Suppression Rules

**User Story:** As an SRE, I want to create suppression rules based on time windows and alert labels, so that I can prevent unnecessary notifications during maintenance or known scenarios.

#### Acceptance Criteria

1. WHEN a user creates a time-based suppression rule with a schedule and label matchers, THE Alert_Manager SHALL suppress matching alerts during the defined time windows
2. WHEN a suppression rule is active, THE Alert_Manager SHALL mark suppressed alerts as muted in the alerts view while keeping them visible
3. WHEN a suppression rule expires or is disabled, THE Alert_Manager SHALL resume normal notification delivery for previously suppressed alerts
4. WHEN a user views the suppression rules list, THE Alert_Manager SHALL display each rule with its status (active, scheduled, expired), affected monitors count, and suppressed alert count
5. IF a user creates a suppression rule that conflicts with an existing rule, THEN THE Alert_Manager SHALL highlight the conflict and display the overlapping scope

### Requirement 8: Progressive Loading and Datasource Health

**User Story:** As an SRE, I want the alert manager to load data progressively from multiple datasources with clear status indicators, so that I can see partial results quickly even when some backends are slow.

#### Acceptance Criteria

1. WHEN fetching alerts or rules from multiple datasources, THE Alert_Manager SHALL fetch from each datasource concurrently and display results as they arrive
2. WHEN a datasource fetch times out, THE Alert_Manager SHALL display the partial results from successful datasources and show a warning for the timed-out datasource
3. WHEN a user clicks retry on a failed datasource, THE Alert_Manager SHALL re-fetch only from that specific datasource without refreshing successful results
4. THE Alert_Manager SHALL cache responses client-side for 30 seconds and serve cached data for subsequent requests within the TTL
5. WHEN displaying datasource status, THE Alert_Manager SHALL show a health badge (pending, loading, success, error, timeout) for each configured datasource

### Requirement 9: Monitor Configuration Serialization

**User Story:** As an SRE, I want to export and import monitor configurations as JSON, so that I can version control them and deploy through Infrastructure as Code pipelines.

#### Acceptance Criteria

1. WHEN a user exports a monitor, THE Alert_Manager SHALL serialize the complete monitor configuration (name, query, thresholds, evaluation settings, labels, annotations, routing) into a valid JSON document
2. WHEN a user exports filtered monitors, THE Alert_Manager SHALL serialize all currently visible monitors into a single JSON array
3. THE Serializer SHALL produce JSON that, when parsed back, yields an equivalent monitor configuration (round-trip property)
4. WHEN a user imports a JSON monitor configuration, THE Alert_Manager SHALL validate the structure and create the monitor if valid
5. IF a user imports an invalid JSON configuration, THEN THE Alert_Manager SHALL return descriptive validation errors identifying the invalid fields
