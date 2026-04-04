# Alert Manager -- Supplementary UX Audit Report

**Date:** 2026-04-04
**Auditor:** Maya (Senior UX Designer -- Observability & DevOps Tooling)
**Build:** `46a8636` on `code-improvements`
**Supplements:** `UX_AUDIT_REPORT.md` (C1-C3, M1-M8, m1-m10, E1-E7)

---

## Methodology

This supplementary audit was conducted by reviewing all component source code, core types, and every available screenshot. Each finding below is NEW -- not duplicated from the existing `UX_AUDIT_REPORT.md`. Findings are assessed from the perspective of a 3am on-call engineer triaging a production incident on a 1200px laptop screen.

**New findings:** 6 Critical | 9 Major | 12 Minor | 8 Enhancements

---

## 1. Critical Issues

### S-C1. Silence action on alerts changes state to "resolved" instead of "silenced"
- **Severity:** Critical
- **Where:** Alerts tab > table > Silence button; also Alert Detail Flyout > Silence button
- **Observed:** When the user clicks "Silence" on an alert, `handleSilenceAlert` in `alarms_page.tsx` adds a `_silenced: 'true'` label to the alert but does NOT change the alert's state. However, the Suppression Status accordion in the alert detail flyout checks `alert.state === 'resolved'` to show "Silenced" status. Additionally, the silence action in `test-16-silence-result.png` shows alerts whose state flipped to "resolved" -- yet the underlying backend call is `POST /api/alerts/{id}/silence` which creates a suppression rule, not a resolution. There is a semantic mismatch between "silenced" (still firing but notifications suppressed) and "resolved" (issue gone).
- **Impact:** On-call engineers will see a silenced alert appear as "resolved" in the table, losing visibility into an issue that is still active. This can cause missed incidents.
- **Recommendation:** Introduce a distinct `silenced` state in the `UnifiedAlertState` type (or add a visual overlay/badge like Grafana's "Silenced" indicator). The Suppression Status accordion should check for the `_silenced` label rather than `state === 'resolved'`. The state filter facet should include "Silenced" as a filterable option.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/core/types.ts`

### S-C2. Alert detail flyout closes on Acknowledge/Silence -- user loses context
- **Severity:** Critical
- **Where:** Alerts tab > Alert Detail Flyout > footer action buttons
- **Observed:** In `alarms_page.tsx`, both `onAcknowledge` and `onSilence` callbacks include `setSelectedAlert(null)`, which closes the flyout immediately after the action. The on-call engineer who opened the flyout to read AI Analysis, Labels, Annotations, and Suggested Actions suddenly loses all that context the moment they act on the alert.
- **Impact:** During triage, engineers often acknowledge an alert and then continue reading its details to decide next steps. Closing the flyout forces them to re-find and re-open the alert, losing their scroll position and mental context. This is a severe workflow interruption at 3am.
- **Recommendation:** Do NOT close the flyout on action. Instead, update the alert state inline (change the badge from "active" to "acknowledged"), show a brief `EuiToast` confirmation, and let the user close the flyout when they are done. Only the "Close" button should dismiss the flyout.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`

### S-C3. Error handling in API calls silently swallows failures with empty catch blocks
- **Severity:** Critical
- **Where:** All tabs > any API interaction (acknowledge, silence, delete, create, clone, import)
- **Observed:** Nearly every API call in `alarms_page.tsx` has `catch (_e) { /* fallback */ }` or `catch (_e) { /* silently handle */ }`. The monitor detail flyout has `.catch(() => {})`. The suppression panel has `catch (_e) { /* empty */ }`. Zero error feedback reaches the user for any failed operation.
- **Impact:** If the backend is unreachable, the user clicks "Acknowledge" and the optimistic update shows success, but the actual state was never changed. The alert will re-appear as active on next refresh. For delete operations, the user thinks a monitor was deleted but it persists. This creates a false sense of control during incidents.
- **Recommendation:** Wrap each API call with error handling that shows an `EuiToast` with `color="danger"` on failure. For optimistic updates (acknowledge, silence), roll back the optimistic state change on error. For destructive actions (delete), do NOT apply the local state change until the API confirms success.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-C4. Acknowledge button shows for Prometheus alerts in detail flyout but backend does not support it
- **Severity:** Critical
- **Where:** Alerts tab > click Prometheus alert > Alert Detail Flyout > footer
- **Observed:** The `AlertDetailFlyout` component shows the "Acknowledge" button for ALL alerts where `alert.state === 'active'`, regardless of datasource type. However, Prometheus/Alertmanager has no acknowledge concept -- only silencing is supported. The backend `acknowledgeAlert` call sends a request to an endpoint that will fail or no-op for Prometheus alerts. Screenshots `test-04-prom-alert-detail.png` and `test-05-prom-alert-bottom.png` confirm the Acknowledge button is visible for a Prometheus alert ("HighRequestErrorRate").
- **Impact:** Engineer clicks Acknowledge on a Prometheus alert, gets optimistic UI feedback suggesting success, but the alert was never actually acknowledged. On next data refresh, it reverts to "active", causing confusion and eroding trust in the tool.
- **Recommendation:** Check `alert.datasourceType` before rendering the Acknowledge button. For Prometheus alerts, either hide the button or show it disabled with a tooltip: "Acknowledgement is not supported for Prometheus alerts. Use Silence instead." In the Suggested Actions section, replace "Acknowledge this alert" with "Silence this alert" for Prometheus alerts.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`

### S-C5. No loading indicator during monitor detail flyout API fetch
- **Severity:** Critical
- **Where:** Rules tab > click monitor name > Monitor Detail Flyout
- **Observed:** The `MonitorDetailFlyout` component fetches detail data via `fetch(/api/rules/...)` on mount, with `detailLoading` state tracked but never rendered. The flyout body shows immediately with whatever partial data the summary `monitor` prop has. The user sees "No AI summary available", "No preview data available", and empty accordion counts (0) while the API is still loading. There is no spinner, skeleton, or loading indicator.
- **Impact:** Users see incomplete data and may conclude the monitor has no history, no routing, and no suppression rules -- when in fact the data simply has not loaded yet. This is visible in `test-09-rule-detail-top.png` where "No AI summary available" displays before the API response arrives.
- **Recommendation:** Show an `EuiLoadingContent` skeleton or `EuiProgress` bar in the flyout body while `detailLoading` is true. Display the full content only after the API response is received. Use the summary `monitor` prop for the header immediately, but gate the body sections behind the loading state.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-C6. Suppression rule form uses raw ISO string input for datetime -- unusable under stress
- **Severity:** Critical
- **Where:** Suppression tab > Create Rule flyout > Start Time / End Time fields
- **Observed:** Screenshot `test-14-create-suppression.png` shows "Start Time (ISO)" and "End Time (ISO)" as plain text fields with placeholder "2025-01-01T00:00:00Z". The component imports `EuiDatePicker` but never uses it. An on-call engineer at 3am is expected to manually type ISO 8601 timestamps to silence an alert. The default values shown in the screenshot are from 2025, suggesting the date initialization logic is wrong (the `resetForm` function computes current time, but the screenshot shows stale placeholders).
- **Impact:** This is a critical usability failure for the most time-sensitive workflow in the entire application. Engineers under stress will misformat timestamps, accidentally create past-dated suppressions, or give up and not suppress alerts at all.
- **Recommendation:** Replace the `EuiFieldText` inputs with `EuiDatePicker` (already imported). Add quick-select presets: "1 hour", "6 hours", "Until tomorrow morning", "Custom". Default the start to NOW and end to NOW + 1h. Show a human-readable summary: "Silences alerts from now until 4:00 AM (1 hour)".
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`

---

## 2. Major Issues

### S-M1. Color maps duplicated across 5 files with subtle inconsistencies
- **Severity:** Major
- **Where:** Global -- affects all tabs
- **Observed:** `SEVERITY_COLORS`, `STATE_COLORS`, `STATUS_COLORS`, and `HEALTH_COLORS` are independently defined in `alerts_dashboard.tsx`, `monitors_table.tsx`, `monitor_detail_flyout.tsx`, `alert_detail_flyout.tsx`, and potentially more files. In `alerts_dashboard.tsx`, severity colors use hex values (`'#BD271E'`), while in `monitors_table.tsx` and `monitor_detail_flyout.tsx`, they use OUI semantic names (`'danger'`). The `active` state is mapped to `'#BD271E'` (hex red) in one file and `'danger'` (semantic) in another. If OUI's `danger` token ever changes, half the UI updates and half does not.
- **Impact:** Visual inconsistency between components. Maintenance burden -- changing a color requires editing 5 files. Risk of divergence over time.
- **Recommendation:** Extract all color maps into a single shared module (e.g., `core/colors.ts`) with both hex and OUI semantic variants. Import from one source of truth everywhere.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitors_table.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`

### S-M2. Alert table "Actions" column icons have no text labels -- rely solely on iconography
- **Severity:** Major
- **Where:** Alerts tab > table > Actions column
- **Observed:** Each alert row has 2-3 icon buttons: a magnifying glass (inspect), a checkmark (acknowledge), and a crossed bell (silence). These are `EuiButtonIcon` components with only `aria-label` for identification. In the screenshots, tooltip text appears on hover ("Silence") but the base state shows three identical-sized monochrome icons with no labels.
- **Impact:** Under the stress of incident response, icon-only actions increase cognitive load. The "check" icon for Acknowledge is easily confused with a "complete/done" action. New team members or infrequent users must hover each icon to learn what it does. At 3am, hover-to-discover is too slow.
- **Recommendation:** For the primary action (Acknowledge), use an `EuiButton` with visible text label ("Ack") instead of icon-only. Keep secondary actions (View, Silence) as icon buttons but add a short visible label below or beside the icon group. Alternatively, use an `EuiContextMenu` dropdown for secondary actions, keeping only the primary action as a visible button. Consider the PagerDuty pattern: a single "Ack" button per row, with overflow menu for other actions.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-M3. Alert table "Source" column badges are truncated -- "opensear..." and "promethe..."
- **Severity:** Major
- **Where:** Alerts tab > table > Source column
- **Observed:** Screenshots `alerts-table-bottom.png` and `test-15-acknowledge-result.png` show the Source column rendering `EuiBadge` components with text "opensear..." and "promethe..." -- the full text is truncated because the column width is 100px and badges have padding. The user cannot distinguish between multiple OpenSearch datasources or multiple Prometheus workspaces.
- **Impact:** During multi-datasource triage, the source column -- which is critical for routing an alert to the right team -- is unreadable. Engineers cannot tell which cluster or workspace the alert is from.
- **Recommendation:** Widen the Source column to at least 130px, or use short display names ("OS" / "Prom") with a tooltip showing the full datasource name. Better yet, show the datasource name (e.g., "OpenSearch Production") rather than the backend type, since multiple datasources of the same type may be configured.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-M4. "By Service" and "By Team" charts show "unknown" for all alerts
- **Severity:** Major
- **Where:** Alerts tab > dashboard charts > "By Service" and "By Team" panels
- **Observed:** Screenshots `alerts-dashboard.png` and `echarts-dashboard.png` show "By Service: unknown 14" and "By Team: unknown 14". The `AlertsByGroup` component groups alerts by `a.labels[groupKey]` with a fallback of `'unknown'` when the label is missing. Since not all alerts have `service` or `team` labels, these charts are dominated by "unknown" entries that provide zero value.
- **Impact:** These charts consume valuable above-the-fold dashboard space while providing no actionable information. The on-call engineer's most important question -- "which service is affected?" -- goes unanswered.
- **Recommendation:** If more than 80% of alerts lack the grouping label, hide that chart panel entirely and show a more useful alternative (e.g., "By Monitor" which always has data). Show a small info callout: "Add `service` and `team` labels to your alerts for richer grouping." When the label is present for some alerts, show "unknown" as a subdued entry at the bottom rather than the dominant bar.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-M5. Monitor detail flyout footer only shows "Silence Monitor" -- no "Enable" action for disabled monitors
- **Severity:** Major
- **Where:** Rules tab > Monitor Detail Flyout > footer
- **Observed:** The flyout footer always shows "Close" and "Silence Monitor" (or "Unmute Monitor" if already muted). For monitors that have `status: 'disabled'`, the footer still shows "Silence Monitor", which makes no sense for a disabled monitor. There is no "Enable" or "Disable" toggle.
- **Impact:** Common monitor management workflows (disable a noisy monitor during deployment, re-enable after) require leaving the flyout and finding the monitor in the table. The flyout, which is meant to be the comprehensive management surface, lacks this fundamental action.
- **Recommendation:** Add an "Enable/Disable" toggle button to the flyout footer. When the monitor is disabled, the primary footer action should be "Enable Monitor". When active, show both "Silence" and "Disable" options. Also add the enable/disable toggle to the quick actions bar in the flyout header (where Edit, Silence, Clone, Delete already exist).
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-M6. Rules tab filter panel and Alerts tab filter panel have different facet structures
- **Severity:** Major
- **Where:** Alerts tab vs Rules tab > left filter panels
- **Observed:** The Alerts tab filter panel shows: Datasource, Severity, State, Backend, Labels. The Rules tab filter panel shows: Datasource, Status, Severity, Type, Health, Backend, Labels. The facet ordering is different (Severity is second in Alerts but third in Rules). The "State" facet in Alerts (active/resolved/acknowledged) maps conceptually to "Status" in Rules (active/muted) but uses different terminology. The "Backend" label in Alerts corresponds to "Backend" in Rules, but one shows "Opensearch (14)" and the other shows "opensearch (13)" with different capitalization.
- **Impact:** Inconsistent mental model between tabs. Users who learn the filter structure in one tab must re-learn it in the other. Capitalization inconsistencies ("Opensearch" vs "opensearch") look unpolished.
- **Recommendation:** Standardize the filter panel structure across both tabs. Use identical ordering: Datasource, Status/State, Severity, Type (if applicable), Health (if applicable), Backend, Labels. Capitalize backend names consistently (always "OpenSearch" and "Prometheus"). Use the same facet component implementation shared between both views.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitors_table.tsx`

### S-M7. Datasource checkboxes in filter panel trigger data re-fetch but have no loading indicator on the panel
- **Severity:** Major
- **Where:** Alerts tab / Rules tab > Filter panel > Datasource checkboxes
- **Observed:** When a user checks/unchecks a datasource in the filter panel, `onDatasourceChange` is called which triggers `handleDatasourceChange` in `alarms_page.tsx`, resetting pages and initiating new API calls (`fetchAlerts`/`fetchRules`). The `dataLoading` state is set, but the filter panel itself shows no loading indicator. The table may briefly show stale data before the new data arrives.
- **Impact:** Users may rapidly toggle datasource checkboxes without realizing each toggle fires a network request. No visual feedback that the panel change has triggered a reload -- the user may think the filter is purely client-side.
- **Recommendation:** Show an `EuiLoadingSpinner` next to the Datasource section header while `dataLoading` is true. Alternatively, debounce datasource changes by 300ms to batch rapid toggles into a single API call.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitors_table.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`

### S-M8. Suppression rule form has no validation beyond "name is required"
- **Severity:** Major
- **Where:** Suppression tab > Create/Edit Rule flyout
- **Observed:** The form's only validation is `isDisabled={!formName}` on the Save button. No validation exists for: end time being after start time, start time being in the past for one-time rules, matchers being non-empty (a rule with no matchers suppresses ALL alerts), recurrence days format, or timezone validity.
- **Impact:** Users can create a suppression rule that matches all alerts (empty matchers), create rules with end time before start time, or enter invalid timezone strings. A broad suppression rule silently hiding all alerts during an incident is catastrophic.
- **Recommendation:** Add validation: (1) At least one matcher is required, with a warning if the matcher is very broad. (2) End time must be after start time. (3) Start time must be in the future for one-time rules (or show warning). (4) Show a preview: "This rule will suppress N alerts matching these matchers." (5) Use `EuiFormRow` with `isInvalid` and `error` props for inline validation.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`

### S-M9. No way to navigate from alert detail to its parent monitor/rule
- **Severity:** Major
- **Where:** Alerts tab > Alert Detail Flyout
- **Observed:** The alert detail flyout shows the alert's name, labels, and annotations, but provides no link or button to navigate to the associated monitor/rule in the Rules tab. The `monitor_id` label is present in the labels section (visible in OpenSearch alerts), but it is not clickable. The Notification Routing section says "Check the associated monitor's detail view for full routing setup" but provides no way to get there.
- **Impact:** During triage, engineers need to understand the monitor configuration (threshold, query, routing) that generated the alert. Currently they must close the alert flyout, switch to the Rules tab, and search for the monitor by name. This breaks the triage flow.
- **Recommendation:** Add a "View Monitor" link/button in the alert detail flyout header or in the Alert Details section. When clicked, it should switch to the Rules tab and open the monitor detail flyout for the associated monitor. The `monitor_id` label should be rendered as a clickable link.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`

---

## 3. Minor Issues

### S-m1. Flyout sizes are inconsistent -- Alert detail uses "m", Suppression uses "s"
- **Severity:** Minor
- **Where:** Alert Detail Flyout, Monitor Detail Flyout, Create Monitor Flyout, Suppression Rule Flyout
- **Observed:** `AlertDetailFlyout` and `MonitorDetailFlyout` use `size="m"`. `SuppressionRulesPanel` flyout uses `size="s"`. `CreateMonitor` flyout has no explicit size. This means different flyouts occupy different widths, creating an inconsistent spatial experience.
- **Impact:** Users develop an expectation of flyout width. Inconsistent sizes feel jarring and can cause layout shift in the background content.
- **Recommendation:** Standardize on `size="m"` for all detail/edit flyouts. Use `size="s"` only for simple forms with fewer than 5 fields.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/create_monitor.tsx`

### S-m2. Alert table shows "No message available" as "---" (em dash) -- inconsistent empty value indicators
- **Severity:** Minor
- **Where:** Alerts tab > table > Message column; Alert Detail Flyout header
- **Observed:** The Message column renders `msg || '---'` (em dash) for empty messages. The alert detail flyout header shows "No message available" as its subtitle text. The monitor detail flyout uses `'---'` for missing values in description lists. The suppression panel uses `'?'` for missing schedule times. There are at least four different conventions for "no data."
- **Impact:** Inconsistent empty-state indicators look unpolished and can confuse users about whether data is missing or intentionally blank.
- **Recommendation:** Standardize on a single empty-value indicator. Use an em dash (`---`) for inline table cells and `<EuiText size="s" color="subdued">Not configured</EuiText>` for section-level empty states.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`

### S-m3. Accordion IDs in flyouts are not unique when multiple flyouts could theoretically co-exist
- **Severity:** Minor
- **Where:** Alert Detail Flyout, Monitor Detail Flyout
- **Observed:** Accordion IDs use hardcoded strings like `"aiSummary"`, `"alertDetails"`, `"queryDef"`. While only one flyout is open at a time currently, these IDs could collide if the architecture changes. More importantly, React's reconciliation may produce unexpected behavior if a user rapidly switches between alerts of different types, since the accordion state (open/closed) may carry over.
- **Impact:** Potential accessibility issues (duplicate IDs) and stale accordion state when rapidly switching between items.
- **Recommendation:** Prefix accordion IDs with the item ID: `id={`aiSummary-${alert.id}`}`. This ensures uniqueness and proper state isolation.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-m4. "Suggested Actions" in alert flyout are static text -- none are clickable
- **Severity:** Minor
- **Where:** Alerts tab > Alert Detail Flyout > Suggested Actions accordion
- **Observed:** The Suggested Actions section renders a list of actions like "Acknowledge this alert", "Check related runbook", "Investigate host i-0abc123", "Review api-gateway service health". Each shows a title and description, but none are interactive. They are rendered as `EuiPanel` elements with no click handlers, no buttons, no links.
- **Impact:** The actions section sets an expectation that clicking will perform the action, but nothing happens. "Acknowledge this alert" as a suggestion is redundant when there is already an Acknowledge button in the footer. The runbook suggestion shows a URL in the description but it is not a clickable link.
- **Recommendation:** Make each suggested action clickable: "Acknowledge" should call the acknowledge handler, "Check related runbook" should open the runbook URL in a new tab (wrap in `<a href>`), "Investigate host" should deep-link to the host metrics dashboard. Use `EuiLink` or `EuiButton` wrappers to provide clear interactive affordance.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`

### S-m5. Rules tab "Type" column always shows "Metric" for all monitors
- **Severity:** Minor
- **Where:** Rules tab > table > Type column
- **Observed:** In `rules-tab.png`, every monitor in the table shows "Metric" in the Type column, regardless of actual monitor type. The `MonitorType` type defines `'metric' | 'log' | 'apm' | 'composite' | 'infrastructure' | 'synthetics' | 'cluster_metrics'`, but the normalization logic appears to map most OpenSearch monitor types to "metric" and most Prometheus rules to "metric".
- **Impact:** The Type column provides no differentiating value when all values are identical. It wastes horizontal table space that could show more useful information.
- **Recommendation:** Either fix the type normalization to correctly distinguish monitor types (query_level -> Metric, bucket_level -> Infrastructure, doc_level -> Log, cluster_metrics -> Cluster), or hide the Type column by default and replace it with a more useful column like "Last Triggered" or "Alert Count."
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitors_table.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/core/alert_service.ts`

### S-m6. Monitor detail flyout "Edit" button is permanently disabled with tooltip "Edit monitor (placeholder)"
- **Severity:** Minor
- **Where:** Rules tab > Monitor Detail Flyout > header quick actions
- **Observed:** The Edit button in the flyout header is rendered as `<EuiButtonEmpty size="s" iconType="pencil" isDisabled>Edit</EuiButtonEmpty>` with a tooltip "(placeholder)". This placeholder text is visible to end users.
- **Impact:** Users see a permanently disabled button with developer-facing tooltip text, which is confusing and unprofessional. It is unclear whether editing is "coming soon" or intentionally unsupported.
- **Recommendation:** Either implement the edit functionality (opening the CreateMonitor flyout in edit mode), or remove the button entirely. If keeping it disabled, change the tooltip to "Editing is not yet available" and add a visual indicator like a "Coming soon" badge.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-m7. Create Monitor form shows validation errors immediately on open before user interaction
- **Severity:** Minor
- **Where:** Rules tab > Create Monitor flyout
- **Observed:** In `create-monitor.png`, the form opens with "Monitor Name" label already in red with "Name is required" error text visible. The user has not attempted to submit or interact with the form yet. This is an eager validation pattern that violates the principle of validating on blur or submit, not on mount.
- **Impact:** Red error text on form open creates a negative first impression and increases anxiety, especially for infrequent users.
- **Recommendation:** Only show validation errors after the user has interacted with a field (on blur) or attempted to submit the form. Track a `touched` state per field and only display errors for touched fields.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/create_monitor.tsx`

### S-m8. Routing tab and Suppression tab have no datasource scoping
- **Severity:** Minor
- **Where:** Routing tab, Suppression tab
- **Observed:** The Routing tab fetches Alertmanager config globally via `GET /api/alertmanager/config` regardless of which datasource is selected. The Suppression tab similarly fetches all suppression rules globally. Neither tab reflects the datasource selection that is active in the Alerts and Rules tabs.
- **Impact:** Users may select a specific Prometheus workspace or OpenSearch datasource, then switch to Routing/Suppression expecting to see configuration scoped to that datasource. Instead they see global configuration, creating confusion about which alerts the routing/suppression applies to.
- **Recommendation:** At minimum, show a banner on Routing and Suppression tabs indicating they display global configuration: "Showing Alertmanager configuration for all Prometheus datasources." Ideally, scope the routing view to the selected datasource's Alertmanager instance.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/notification_routing_panel.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/suppression_rules_panel.tsx`

### S-m9. Alert duration not shown in the alerts table
- **Severity:** Minor
- **Where:** Alerts tab > table
- **Observed:** The table shows "Started" timestamp but not how long the alert has been active. The `getAlertDuration` helper function exists in `alert_detail_flyout.tsx` and computes duration strings like "5h 23m", but this is only visible inside the flyout. Engineers scanning the table cannot quickly identify long-running alerts.
- **Impact:** Duration is one of the most important triage signals -- a 5-minute alert has very different urgency than a 3-day alert. Requiring a flyout drill-down to see duration slows triage.
- **Recommendation:** Add a "Duration" column to the alerts table (can be hidden by default but shown by default for "active" alerts). Use relative time formatting: "5m", "2h 15m", "3d". Color-code long durations (>24h) with a warning indicator.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-m10. Label filter values in the Alerts filter panel show raw internal identifiers
- **Severity:** Minor
- **Where:** Alerts tab > Filter panel > Labels section > monitor_id
- **Observed:** In `alerts-dashboard.png`, the Labels section shows `monitor_id` as a facet group with values like "TlKqT50B4e5a7PlEck0", "UVKqT50B4e5a7PlEc0", etc. These are opaque internal IDs that mean nothing to the user.
- **Impact:** The filter panel Labels section becomes a wall of unreadable identifiers. Users cannot filter by monitor using this facet because they cannot identify which ID corresponds to which monitor.
- **Recommendation:** For known internal label keys like `monitor_id`, `datasource_id`, resolve the ID to a human-readable name before display (e.g., show "High Trace Error Rate" instead of "TlKqT50B4e5a7PlEck0"). Alternatively, hide these internal ID labels from the facet panel entirely (as noted in existing M2, but this supplements it with the specific alert-side manifestation).
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-m11. Dashboard stat cards show different alert count depending on datasource selection state
- **Severity:** Minor
- **Where:** Alerts tab > stat cards
- **Observed:** One screenshot shows "Total Alerts: 14" and another shows "Total Alerts: 18", depending on which datasources were selected. The stat cards use `filteredAlerts` which depends on both datasource selection AND client-side filters. When a severity filter is active (e.g., clicking the "Active" card), the "Total Alerts" card still shows the post-filter count, not the overall total.
- **Impact:** "Total Alerts" is ambiguous -- does it mean "total across all datasources" or "total after filters"? When filters are active, the Total card becoming a filtered count is misleading.
- **Recommendation:** Show two numbers: "18 total / 11 shown" or keep "Total Alerts" as always-unfiltered and add a subtitle "(filtered)" when filters are active. The "Active" and severity cards should clearly indicate they are computed from the currently visible set.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-m12. Routing tab tables have no responsive behavior -- will overflow on narrow viewports
- **Severity:** Minor
- **Where:** Routing tab > Route Tree table, Receivers table, Inhibit Rules table
- **Observed:** The Route Tree table has 7 columns (Receiver, Matchers, Group By, Wait, Interval, Repeat, Continue) rendered at full width. On viewports narrower than ~1000px, this table will horizontally overflow. The component uses `responsive={false}` on `EuiFlexGroup` elements, and the tables use `EuiBasicTable` without any responsive configuration.
- **Impact:** Users on smaller screens or split-screen setups cannot see all routing information without horizontal scrolling.
- **Recommendation:** For the Route Tree table, hide the "Wait", "Interval", "Repeat", and "Continue" columns on narrow viewports using `EuiBasicTable`'s responsive options, or collapse them into a tooltip on the receiver name. Alternatively, render the route tree as a visual tree diagram (indented cards) rather than a table.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/notification_routing_panel.tsx`

---

## 4. Enhancement Suggestions

### S-E1. Add relative timestamps with hover-for-absolute pattern
- **Where:** All tables showing timestamps
- **Current:** Timestamps display as absolute locale strings: "4/3/2026, 10:55:06 PM"
- **Proposal:** Show relative time as the primary display ("5m ago", "2h ago", "3d ago") with the absolute timestamp in a tooltip on hover. This is the standard pattern in Grafana, PagerDuty, and Datadog. Relative time is far faster to parse during triage.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitors_table.tsx`

### S-E2. Add alert sound / browser notification for new critical alerts
- **Where:** Global -- Alerts tab
- **Proposal:** When new critical alerts arrive (via polling or refresh), play an optional audio chime and show a browser notification via the Notifications API. Include a settings toggle to enable/disable. This is standard in NOC (Network Operations Center) dashboards and PagerDuty's web app.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`

### S-E3. Add auto-refresh with configurable interval
- **Where:** Global -- all tabs
- **Proposal:** Add an auto-refresh toggle in the page header with configurable intervals (10s, 30s, 1m, 5m, Off). Show a countdown ring or progress bar indicating time until next refresh. This is critical for dashboards displayed on wall screens in NOCs.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`

### S-E4. Add "Bulk Acknowledge" for alerts table
- **Where:** Alerts tab > table
- **Proposal:** Add row selection checkboxes (like the Rules tab has) and a "Bulk Acknowledge" action. During incident response, an engineer may need to acknowledge multiple related alerts simultaneously. Currently they must click Acknowledge on each row individually.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-E5. Add sparkline / mini-chart in the alerts table for alert activity
- **Where:** Alerts tab > table > new column
- **Proposal:** Add an optional "Activity" column showing a tiny sparkline of the alert's firing history over the last 24h (similar to GitHub's commit activity graphs). This helps identify flapping alerts at a glance without opening the detail flyout.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

### S-E6. Add "Copy as..." actions in alert and monitor detail flyouts
- **Where:** Alert Detail Flyout, Monitor Detail Flyout
- **Proposal:** Add a "Copy" dropdown in the flyout header with options: "Copy alert name", "Copy as JSON", "Copy as Slack message", "Copy link". On-call engineers frequently need to paste alert information into Slack, Jira tickets, or runbook entries. The current "Raw Data" accordion with "Copy" button on the code block is too many clicks deep.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/monitor_detail_flyout.tsx`

### S-E7. Add "Similar Alerts" section in alert detail flyout
- **Where:** Alert Detail Flyout
- **Proposal:** Show a "Similar Alerts" section that lists other alerts with matching labels (same `service`, `team`, `instance`, or `alertname`). This helps the on-call engineer understand if the current alert is part of a broader incident or an isolated event. Group by shared labels and show count: "3 other alerts on service=api-gateway".
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alert_detail_flyout.tsx`

### S-E8. Add onboarding empty state for first-time users
- **Where:** Alerts tab, Rules tab -- when no datasources are configured
- **Proposal:** When the application loads and no datasources are available, show a guided empty state with steps: (1) Configure a datasource, (2) Create your first monitor, (3) Set up notification routing. Include links to documentation. The current empty state simply says "No Active Alerts / All systems operating normally" which is misleading when no datasources are configured.
- **Files:** `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alarms_page.tsx`, `/Users/ashisagr/Documents/workspace/alert-manager/standalone/components/alerts_dashboard.tsx`

---

## Accessibility Supplement

| Check | Status | Detail |
|-------|--------|--------|
| Flyout focus management | Pass | `ownFocus` prop is set on all flyouts |
| Custom pagination buttons lack focus ring | Fail | The inline-styled `<button>` elements in `TablePagination` have no `:focus-visible` styling |
| Color-only severity indicator in alerts table | Fail | The "Sev" column is a colored dot with no text -- color is the only differentiator (WCAG 1.4.1) |
| Suppression form ISO input has no format hint | Fail | Screen reader users get a plain text input with no described format |
| Accordion keyboard navigation | Pass | EuiAccordion handles Enter/Space correctly |
| Filter panel checkbox grouping | Partial | Checkboxes have labels but no `fieldset`/`legend` grouping for screen reader context |

---

## Priority Matrix (ICE Scoring)

| ID | Title | Impact | Confidence | Ease | ICE Score |
|----|-------|--------|------------|------|-----------|
| S-C2 | Flyout closes on Acknowledge/Silence | 5 | 5 | 5 | **125** |
| S-C6 | ISO string datetime input in suppression form | 5 | 5 | 4 | **100** |
| S-C3 | Silent error swallowing in API calls | 5 | 5 | 4 | **100** |
| S-C4 | Acknowledge shown for Prometheus alerts | 5 | 5 | 4 | **100** |
| S-C1 | Silence/resolved semantic mismatch | 5 | 4 | 3 | **60** |
| S-C5 | No loading state in monitor detail flyout | 4 | 5 | 5 | **100** |
| S-M9 | No alert-to-monitor navigation | 5 | 5 | 3 | **75** |
| S-M2 | Icon-only action buttons in alert table | 4 | 5 | 4 | **80** |
| S-M3 | Truncated source badges in alert table | 4 | 5 | 5 | **100** |
| S-M8 | Suppression form lacks validation | 4 | 5 | 4 | **80** |
| S-M4 | "unknown" service/team charts | 3 | 5 | 4 | **60** |
| S-M1 | Duplicated color maps | 3 | 5 | 4 | **60** |
| S-m9 | No duration column in alerts table | 4 | 5 | 5 | **100** |
| S-E1 | Relative timestamps | 4 | 5 | 5 | **100** |
| S-E3 | Auto-refresh | 5 | 4 | 3 | **60** |

**Recommended implementation order (based on ICE score and dependency chains):**
1. S-C2 (flyout stays open on action) -- highest impact, trivial fix
2. S-C5 (loading state in monitor flyout) -- trivial fix, big polish gain
3. S-M3 (truncated source badges) -- trivial fix, high visibility
4. S-m9 + S-E1 (duration column + relative timestamps) -- same work area
5. S-C3 (error handling) -- systematic fix, prevents silent failures
6. S-C4 (Prometheus acknowledge guard) -- prevents false positive actions
7. S-C6 (date picker in suppression form) -- critical workflow fix
8. S-M8 (suppression validation) -- pair with S-C6
9. S-C1 (silence vs resolved semantics) -- requires type system change
10. S-M9 (alert-to-monitor navigation) -- cross-tab workflow improvement

---

## Test Environment

- **Viewport:** 1200x684
- **Mode:** Mock (MOCK_MODE=true)
- **Data:** 14-22 alerts, 20-54 rules across 2-3 datasources (varies by screenshot)
- **Screenshots reviewed:** 30 PNG files in project root
- **Source files reviewed:** 8 component files, 1 types file, 1 agent definition
