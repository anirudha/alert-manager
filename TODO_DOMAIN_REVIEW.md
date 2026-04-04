# Domain Review TODOs (Jay — Observability Domain Expert)

From PR #11 review. These are strategic improvements for future PRs.

## Flow 1: Alert Triage (Current: 2.5/5)

- [ ] **[P0] Alert grouping** — Add `group_by` control above alerts table (default: `alertname`). Group alerts into expandable rows. Model after Alertmanager's grouping semantics. Transforms flat O(n) scanning to O(groups).
- [ ] **[P0] Alert-to-monitor navigation** — Add "View Monitor" button in alert detail flyout. Use `monitor_id` label for OpenSearch, derive from `alertname` + group for Prometheus.
- [ ] **[P1] Alert state history timeline** — Extend `UnifiedAlert` with `stateHistory` field. Show state transitions in alert detail flyout.
- [ ] **[P1] Auto-refresh** — Add configurable interval dropdown (Off/10s/30s/1m/5m) in page header. Show "Last refreshed: 30s ago" indicator.
- [ ] **[P2] Bulk acknowledge/silence** — Add row selection checkboxes to alerts table with bulk action buttons.

## Flow 2: Monitor Management (Current: 3/5)

- [ ] **[P0] Monitor edit flow** — Add `editMode` prop to CreateMonitor flyout that pre-populates form from existing monitor and calls `updateMonitor` on save.
- [ ] **[P0] Wire up Enable/Disable** — Connect flyout footer buttons to actual `updateMonitor` API call to toggle `enabled` field.
- [ ] **[P1] "Test Monitor" button** — Add dry-run button in create flow and detail flyout. Call `runMonitor(ds, id, true)` and show result: "Would trigger: YES/NO. Query returned: N results."
- [ ] **[P1] Folder/group organization** — Use Prometheus rule group names, allow user-defined tags for OpenSearch. Add grouped view toggle.
- [ ] **[P2] Fix `createdAt` hack** — Stop fabricating timestamps (`last_update_time - 86400000`). Use real creation time or honest "unknown".
- [ ] **[P2] Monitor-as-code export** — Support YAML export for Prometheus rules compatible with `rules.yml`.

## Flow 3: Suppression/Silence (Current: 2/5)

- [ ] **[P0] Contextual silence from alert detail** — When user clicks "Silence" in alert flyout, open form pre-filled with alert's labels as matchers. Show duration presets and impact preview.
- [ ] **[P0] Suppression impact preview** — Before saving, show "This rule will suppress N alerts matching these matchers: [list]".
- [ ] **[P1] Bridge OpenSearch suppression** — Implement suppression as monitor disable/enable for OpenSearch. Show unified "Active Suppressions" view.
- [ ] **[P2] Regex matcher support** — Extend form to support `=`, `!=`, `=~`, `!~` operators matching Alertmanager syntax.
- [ ] **[P2] Visual recurrence scheduler** — Replace free-text day input with day-of-week picker and timezone selector.

## Flow 4: Multi-Backend Unification (Current: 3/5)

- [ ] **[P0] Define deterministic sort order** — Default: severity (critical first) → state (active first) → startTime (newest first). Apply in `getUnifiedAlerts` before returning.
- [ ] **[P1] Backend context tooltips** — Add tooltips to state labels explaining backend-specific semantics (e.g., "OpenSearch: notifications paused" for acknowledged).
- [ ] **[P1] Unified notification routing view** — Show OpenSearch Destinations and Prometheus receivers side by side, grouped by type.
- [ ] **[P2] Backend capability indicators** — Show icons/badges per row indicating available actions per backend.

## Flow 5: Alert-to-Root-Cause (Current: 1.5/5)

- [ ] **[P0] Condition preview graph in alert flyout** — Fetch parent monitor's preview data and render inline.
- [ ] **[P0] Render `generatorURL`** — For Prometheus alerts, show "View in Prometheus" button linking to expression browser.
- [ ] **[P1] "Run Query" button in monitor flyout** — Execute the monitor's query and show results inline.
- [ ] **[P1] Promote runbook links** — Render `annotations.runbook_url` as a prominent `EuiButton` in alert flyout header.
- [ ] **[P2] Honestly label AI Analysis** — Replace static mock with real automated analysis or remove "Beta" badge and explain it's a placeholder.

## Data Model Changes Needed

```typescript
// UnifiedAlert extensions
stateHistory?: AlertHistoryEntry[];
relatedAlerts?: string[];
monitorId?: string;
groupKey?: string;
generatorURL?: string;
dashboardURL?: string;
conditionPreviewData?: Array<{ timestamp: number; value: number }>;

// UnifiedRuleSummary extensions
folder?: string;
version?: number;
tags?: string[];

// SuppressionRule extensions
createdBy: string;
datasourceScope?: string[];
matchLabels: Array<{ name: string; value: string; operator: '=' | '!=' | '=~' | '!~' }>;
affectedAlertCount?: number;
```

## Anti-Patterns to Address

- [ ] **Optimistic UI without rollback** — Move state updates inside `try` block, roll back on failure
- [ ] **`DEFAULT_PAGE_SIZE = 1000`** — Implement proper server-side filtering/sorting/pagination as primary path
- [ ] **No debouncing on filter changes** — Debounce datasource checkbox toggles by 300ms
- [ ] **God component** — Split `alarms_page.tsx` (983 lines) into custom hooks, action handlers, and rendering
- [ ] **Prometheus alert ID collisions** — Use proper label fingerprint hash instead of `alertname + instance`
- [ ] **`evaluationInterval` bug** — Map to `group.interval` not `rule.duration` (which is the `for` pending period)
- [ ] **Clone sends wrong type** — Implement proper clone-on-server or convert to `MonitorFormState` before API call
- [ ] **Silence-from-Rules broken for Prometheus** — `monitor_id` matcher won't match Prometheus alerts; use alert labels instead
