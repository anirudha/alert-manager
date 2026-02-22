# Implementation Tasks: Prometheus Alerting

## Task 1: Core Validation Utilities

Implement `MonitorFormValidator`, duration parser, and extend PromQL validation in `core/`.

### Subtasks

- [ ] 1.1 Create `core/validators.ts` with `parseDuration(input: string): { valid: boolean; seconds: number; error?: string }` and `formatDuration(seconds: number): string`. Duration format: `<positive-integer><unit>` where unit ∈ {s, m, h, d}.
- [ ] 1.2 Create `validateMonitorForm(form: MonitorFormState): ValidationResult` in `core/validators.ts`. Validation rules: name non-empty (max 256 chars, no control chars), query non-empty, threshold value is finite, all durations valid and positive, label keys non-empty with no duplicates, annotation keys non-empty.
- [ ] 1.3 Create `core/promql_validator.ts` with `validatePromQL(query: string): PromQLValidationResult` returning structured `PromQLError[]` and `PromQLWarning[]` with position, message, and type fields. Extend the existing bracket-matching and range-vector checks from `promql_editor.tsx` into this standalone module.
- [ ] 1.4* Create `core/validators.test.ts` with property tests for Properties 2 and 3 (monitor form validation rejects invalid inputs, duration string validation). Use fast-check arbitraries for random form states and duration strings.
- [ ] 1.5* Create `core/promql_validator.test.ts` with property tests for Property 4 (bracket validation) and unit tests for known valid/invalid PromQL queries.

### Checkpoint
After this task, `parseDuration`, `formatDuration`, `validateMonitorForm`, and the standalone `validatePromQL` are importable from `core/` and pass all tests. The `CreateMonitor` component can import `validateMonitorForm` for pre-submission validation.

---

## Task 2: Monitor Serialization (JSON Export/Import)

Implement `MonitorSerializer` for round-trip JSON serialization of monitor configurations.

### Subtasks

- [ ] 2.1 Create `core/serializer.ts` with `serializeMonitor(rule: UnifiedRule): MonitorConfig`, `deserializeMonitor(json: unknown): { config: MonitorConfig | null; errors: string[] }`, and `serializeMonitors(rules: UnifiedRule[]): MonitorConfig[]`. The `MonitorConfig` schema includes `version: '1.0'`, name, query, threshold, evaluation, labels, annotations, severity, and optional routing.
- [ ] 2.2 Implement field-level validation in `deserializeMonitor`: check required fields (name, query, threshold, evaluation), validate types, validate nested duration strings using `parseDuration`, and return descriptive errors per invalid field.
- [ ] 2.3* Create `core/serializer.test.ts` with property tests for Properties 21 and 22 (serialization round-trip, invalid config import errors). Use `arbitraryMonitorConfig()` and `arbitraryUnifiedRule()` generators.

### Checkpoint
After this task, monitors can be serialized to JSON and deserialized back with round-trip equivalence. Invalid JSON imports return field-level errors. The existing `exportJson` function in `MonitorsTable` can be updated to use `serializeMonitors`.

---

## Task 3: Notification Routing Service

Implement `NotificationRoutingService` with rule matching, alert grouping, and CRUD.

### Subtasks

- [ ] 3.1 Create `core/routing.ts` with the `NotificationRoutingService` class implementing `list`, `get`, `create`, `update`, `delete`, `findMatchingRules(alert)`, and `groupAlerts(alerts, groupBy)`. Use in-memory storage. Rules are evaluated sequentially by priority; all matching rules apply. Default rule (lowest priority, no matchers) catches unmatched alerts.
- [ ] 3.2 Implement `groupAlerts(alerts: UnifiedAlert[], config: { groupBy: string[]; groupWindow?: string; groupLimit?: number }): Map<string, UnifiedAlert[]>`. Alerts sharing the same values for all `groupBy` labels go in the same group.
- [ ] 3.3* Create `core/routing.test.ts` with property tests for Properties 13 and 14 (routing rule matching, alert grouping by labels). Use `arbitraryRoutingRule()` and `arbitraryUnifiedAlert()` generators.

### Checkpoint
After this task, `NotificationRoutingService` is functional with in-memory CRUD, rule matching, and alert grouping. Ready to be wired into API routes and UI.

---

## Task 4: Suppression Rule Service

Implement `SuppressionRuleService` with schedule-based suppression, conflict detection, and CRUD.

### Subtasks

- [ ] 4.1 Create `core/suppression.ts` with the `SuppressionRuleService` class implementing `list`, `get`, `create`, `update`, `delete`, `isAlertSuppressed(alert)`, `getActiveRules()`, and `detectConflicts(rule): SuppressionRuleConfig[]`. Support `one_time` and `recurring` schedules. Status is computed: active if schedule includes current time, scheduled if start is in the future, expired if end is in the past.
- [ ] 4.2 Implement conflict detection: two rules conflict if their label matchers overlap (one is a subset of the other) AND their schedules overlap in time.
- [ ] 4.3* Create `core/suppression.test.ts` with property tests for Properties 15, 16, and 17 (suppression matching, expiry restores state, conflict detection). Use `arbitrarySuppressionRule()` generators.

### Checkpoint
After this task, `SuppressionRuleService` is functional with in-memory CRUD, alert suppression checks, and conflict detection. Ready to be wired into API routes and UI.

---

## Task 5: Monitor Filtering and Sorting Utilities

Extract filtering and sorting logic from `MonitorsTable` into testable pure functions in `core/`.

### Subtasks

- [ ] 5.1 Create `core/filter.ts` with `matchesSearch(rule: UnifiedRule, query: string): boolean` (case-insensitive search across name, label values, annotation values), `matchesFilters(rule: UnifiedRule, filters: FilterState): boolean` (all active filters must match), and `sortRules(rules: UnifiedRule[], field: string, direction: 'asc' | 'desc'): UnifiedRule[]`.
- [ ] 5.2 Add `filterAlerts(alerts: UnifiedAlert[], filters: { severity?: string[]; state?: string[]; labels?: Record<string, string[]> }): UnifiedAlert[]` for alert filtering.
- [ ] 5.3 Update `MonitorsTable` and `AlertsDashboard` to import and use these extracted functions instead of inline implementations.
- [ ] 5.4* Create `core/filter.test.ts` with property tests for Properties 5, 6, 7, and 9 (text search, faceted filtering, sorting, alert filtering). Use `arbitraryUnifiedRule()` and `arbitraryUnifiedAlert()` generators.

### Checkpoint
After this task, all filtering/sorting logic is in `core/filter.ts`, fully tested, and the UI components delegate to these functions. Property tests confirm correctness across random inputs.

---

## Task 6: Server API Routes for Monitors, Routing, and Suppression

Add Express routes for monitor CRUD, import/export, routing rules, suppression rules, and alert actions.

### Subtasks

- [ ] 6.1 Add monitor CRUD routes to `standalone/server.ts`: `POST /api/monitors` (create, validates with `validateMonitorForm`), `PUT /api/monitors/:id` (update), `DELETE /api/monitors/:id` (delete). Wire to `MultiBackendAlertService`.
- [ ] 6.2 Add import/export routes: `POST /api/monitors/import` (validates with `deserializeMonitor`, creates monitors), `GET /api/monitors/export` (serializes filtered monitors with `serializeMonitors`).
- [ ] 6.3 Add routing rule CRUD routes: `GET/POST /api/routing-rules`, `PUT/DELETE /api/routing-rules/:id`. Wire to `NotificationRoutingService`.
- [ ] 6.4 Add suppression rule CRUD routes: `GET/POST /api/suppression-rules`, `PUT/DELETE /api/suppression-rules/:id`. Wire to `SuppressionRuleService`.
- [ ] 6.5 Add alert action routes: `POST /api/alerts/:id/acknowledge` (validates state transition, updates to acknowledged), `POST /api/alerts/:id/silence` (creates temporary suppression).
- [ ] 6.6 Create route handler functions in `server/routes/` following the existing pattern (return `{ status, body }` objects).

### Checkpoint
After this task, all API endpoints from the design document are functional. The server can create/update/delete monitors, import/export JSON, manage routing and suppression rules, and handle alert acknowledgment/silencing.

---

## Task 7: API Client Extensions

Extend `AlarmsApiClient` in `alarms_page.tsx` to call the new API routes.

### Subtasks

- [ ] 7.1 Add methods to `AlarmsApiClient`: `createMonitor(data)`, `updateMonitor(id, data)`, `deleteMonitor(id)`, `importMonitors(json)`, `exportMonitors(filters?)`.
- [ ] 7.2 Add methods: `listRoutingRules()`, `createRoutingRule(data)`, `updateRoutingRule(id, data)`, `deleteRoutingRule(id)`.
- [ ] 7.3 Add methods: `listSuppressionRules()`, `createSuppressionRule(data)`, `updateSuppressionRule(id, data)`, `deleteSuppressionRule(id)`.
- [ ] 7.4 Add methods: `acknowledgeAlert(id)`, `silenceAlert(id, duration)`.
- [ ] 7.5 Add `put` and `patch` methods to the `HttpClient` interface.

### Checkpoint
After this task, the API client has full coverage of all new endpoints. UI components can call these methods to interact with the server.

---

## Task 8: Monitor CRUD UI Integration

Wire the `CreateMonitor` flyout to use real API calls and add edit/delete flows.

### Subtasks

- [ ] 8.1 Update `CreateMonitor` to use `validateMonitorForm` from `core/validators.ts` for pre-submission validation, showing field-level errors.
- [ ] 8.2 Update `AlarmsPage.handleCreateMonitor` to call `apiClient.createMonitor()` instead of creating a local-only `UnifiedRule`. Handle success (refresh rules list) and error (show toast).
- [ ] 8.3 Update `MonitorsTable` bulk delete to call `apiClient.deleteMonitor()` for each selected ID. Show progress and handle partial failures.
- [ ] 8.4 Update `MonitorsTable` export to use `serializeMonitors()` from `core/serializer.ts`.
- [ ] 8.5 Add JSON import UI: file upload button in `MonitorsTable` toolbar that reads a JSON file, calls `apiClient.importMonitors()`, and shows validation errors or success count.

### Checkpoint
After this task, monitor creation, deletion, export, and import are fully functional end-to-end through the API. The `CreateMonitor` form shows structured validation errors before submission.

---

## Task 9: Alert Management UI Integration

Wire alert acknowledgment, silencing, and filtering to real API calls.

### Subtasks

- [ ] 9.1 Update `AlarmsPage.handleAcknowledgeAlert` to call `apiClient.acknowledgeAlert(id)` and refresh the alert on success. Show error toast on failure.
- [ ] 9.2 Update `AlarmsPage.handleSilenceAlert` to call `apiClient.silenceAlert(id, duration)` with a duration picker. Update alert state to `muted` in the UI.
- [ ] 9.3 Update `AlertsDashboard` to use `filterAlerts` from `core/filter.ts` for consistent filtering logic.
- [ ] 9.4 Update `AlertDetailFlyout` to show suppression status and routing information from the alert's associated monitor.

### Checkpoint
After this task, alert acknowledgment and silencing work end-to-end. Alert filtering uses the shared `core/filter.ts` logic.

---

## Task 10: Notification Routing UI Panel

Create the `NotificationRoutingPanel` component for managing routing rules.

### Subtasks

- [ ] 10.1 Create `standalone/components/notification_routing_panel.tsx` with a table listing routing rules (name, match conditions, destinations, priority, enabled status) and CRUD actions.
- [ ] 10.2 Add a create/edit flyout for routing rules with fields: name, label matchers, severity filter, time window, destinations (type + target), group_by labels, group_window, priority, enabled toggle.
- [ ] 10.3 Wire to `apiClient.listRoutingRules()`, `createRoutingRule()`, `updateRoutingRule()`, `deleteRoutingRule()`.
- [ ] 10.4 Add a "Routing" tab or section in `AlarmsPage` to host the panel.

### Checkpoint
After this task, users can create, view, edit, and delete notification routing rules through the UI.

---

## Task 11: Suppression Rules UI Panel

Create the `SuppressionRulesPanel` component for managing suppression rules.

### Subtasks

- [ ] 11.1 Create `standalone/components/suppression_rules_panel.tsx` with a table listing suppression rules (name, status badge, schedule, affected monitors count, suppressed alerts count) and CRUD actions.
- [ ] 11.2 Add a create/edit flyout for suppression rules with fields: name, description, label matchers, schedule type (one-time/recurring), start/end time, recurrence (days, timezone), and a conflict warning callout.
- [ ] 11.3 Wire to `apiClient.listSuppressionRules()`, `createSuppressionRule()`, `updateSuppressionRule()`, `deleteSuppressionRule()`. Call conflict detection on save and display warnings.
- [ ] 11.4 Add a "Suppression" tab or section in `AlarmsPage` to host the panel.

### Checkpoint
After this task, users can create, view, edit, and delete suppression rules with conflict detection through the UI.

---

## Task 12: PromQL Editor Enhancements

Refactor the PromQL editor to use the standalone validator and add prettify idempotence.

### Subtasks

- [ ] 12.1 Update `promql_editor.tsx` to import and use `validatePromQL` from `core/promql_validator.ts` instead of the inline implementation. Map `PromQLError[]` to the existing `ValidationError[]` UI format.
- [ ] 12.2 Extract `prettifyPromQL` to `core/promql_validator.ts` and ensure idempotence: `prettify(prettify(q)) === prettify(q)`.
- [ ] 12.3 Update autocomplete `getSuggestions` to filter results so every suggestion contains the input prefix as a substring (case-insensitive), satisfying Property 11.
- [ ] 12.4* Add property test for Property 12 (prettify idempotence) to `core/promql_validator.test.ts`.

### Checkpoint
After this task, the PromQL editor uses the shared standalone validator, prettify is idempotent, and autocomplete suggestions are guaranteed relevant.

---

## Task 13: Progressive Loading and Caching Enhancements

Ensure progressive loading, timeout handling, and client-side caching satisfy the design properties.

### Subtasks

- [ ] 13.1 Review and verify that `MultiBackendAlertService.getUnifiedAlerts/Rules` correctly aggregates results from all datasources (Property 18) and preserves partial results on timeout (Property 19). Add any missing edge case handling.
- [ ] 13.2 Verify client-side cache in `AlarmsPage` serves data within 30s TTL and triggers fresh fetch after TTL (Property 20). Ensure `isCacheFresh` uses the correct comparison.
- [ ] 13.3 Ensure scoped refresh (`handleRefreshDatasource`) only re-fetches the target datasource without clearing successful results from other datasources.
- [ ] 13.4* Create `core/alert_service.test.ts` with property tests for Properties 18, 19, and 20 (progressive loading, timeout handling, cache TTL). Mock datasource backends with configurable delays and failures.

### Checkpoint
After this task, progressive loading, timeout handling, and caching are verified correct with property tests.

---

## Task 14: Monitor Detail View Enhancements

Update `MonitorDetailFlyout` to show routing and suppression information.

### Subtasks

- [ ] 14.1 Update `MonitorDetailFlyout` to display notification routing configuration from the monitor's `notificationRouting` array, showing channel, destination, severity filter, and throttle.
- [ ] 14.2 Update `MonitorDetailFlyout` to display active suppression rules from the monitor's `suppressionRules` array, showing name, schedule, and active status.
- [ ] 14.3 Ensure the condition preview graph and alert history table render correctly with the existing mock data generators.

### Checkpoint
After this task, the monitor detail flyout shows complete information including routing and suppression rules, satisfying Requirement 5.

---

## Task 15: End-to-End Integration and Bulk Operations

Wire remaining bulk operations and verify the full workflow.

### Subtasks

- [ ] 15.1 Implement bulk delete in `MonitorsTable`: call `apiClient.deleteMonitor(id)` for each selected monitor, show progress, handle partial failures, and refresh the list on completion. Verify Property 8 (bulk delete removes all selected, keeps unselected).
- [ ] 15.2 Wire `MonitorsTable` clone action to call `apiClient.createMonitor()` with the cloned configuration.
- [ ] 15.3 Wire `MonitorsTable` silence/unsile action to call the appropriate API (create/delete suppression rule for the monitor).
- [ ] 15.4 Verify the full create → list → filter → detail → acknowledge → silence → export workflow works end-to-end in the standalone app.
- [ ] 15.5* Add property test for Property 8 (bulk delete) and Property 10 (alert acknowledgment state transition) to `core/filter.test.ts` and `core/alert_service.test.ts` respectively.

### Checkpoint
After this task, all CRUD operations, bulk actions, and the complete alerting workflow are functional end-to-end. All 22 correctness properties from the design document are covered by implementation and optional property tests.
