# Alert Manager — UX Audit Report

**Date:** 2026-04-04
**Auditor:** AI UX Reviewer (Playwright-automated + visual inspection)
**Build:** `0f44d60` on `code-improvements`

---

## Executive Summary

The Alert Manager is a functional multi-backend alerting dashboard supporting OpenSearch and Prometheus datasources. The core workflows (view alerts, inspect rules, create monitors) are operational, but several UX issues — ranging from information architecture gaps to interaction bugs — reduce the product's polish and usability.

**Critical issues:** 3 | **Major issues:** 8 | **Minor issues:** 10 | **Enhancements:** 7

---

## 1. Critical Issues

### C1. No feedback on Acknowledge action
- **Where:** Alerts tab > table > Acknowledge button
- **Observed:** Clicking "Acknowledge" changes the alert's state in the backend but provides no visual feedback — no toast notification, no inline state change animation, no confirmation.
- **Impact:** User has no idea if the action succeeded. They must manually scroll or refresh to verify.
- **Recommendation:** Show an `EuiToast` ("Alert acknowledged") and animate the state badge change inline.

### C2. Empty state not triggered when all datasources unchecked
- **Where:** Alerts tab > uncheck all datasource checkboxes
- **Observed:** Unchecking all datasource filters still shows 10 alert rows and stat card counts (10/7/5/0/5). The table should be empty with a clear "No datasources selected" prompt.
- **Impact:** Confusing — user sees stale data after deselecting everything.
- **Recommendation:** When `selectedDsIds` is empty, show an empty state prompt: "Select at least one datasource to view alerts."

### C3. Alert rows missing "Acknowledge" button for Prometheus alerts
- **Where:** Alerts tab > table rows
- **Observed:** Only "View" and "Silence" action buttons appear on each row. The "Acknowledge" button only appears if the alert supports it (OpenSearch alerts). Prometheus alert rows show identical buttons with no visual distinction, making it unclear which alerts can be acknowledged.
- **Impact:** Users can't quickly triage Prometheus alerts vs OpenSearch alerts from the table.
- **Recommendation:** For alerts that don't support acknowledge, show a disabled button with tooltip "Not supported for Prometheus alerts" rather than hiding it silently.

---

## 2. Major Issues

### M1. Heading hierarchy skips H2
- **Where:** Global
- **Observed:** Page has H1 ("Alert Manager") then jumps directly to H3 ("Alert Timeline", "By Severity", etc.). No H2 exists.
- **Impact:** Accessibility violation (WCAG 1.3.1) — screen readers expect sequential heading levels.
- **Recommendation:** Chart section headings should be H2 or the section title ("All Alerts") should be H2 with chart titles as H3.

### M2. Filter panel labels expose internal identifiers
- **Where:** Rules tab > filter panel > Labels section
- **Observed:** Label facet groups include raw internal keys like `_workspace`, `datasource_id`, `monitor_kind`, `monitor_type`. These are implementation details, not user-facing concepts.
- **Impact:** Information overload — 21 facet groups visible (7 standard + 14 label keys). Users can't find relevant filters.
- **Recommendation:** Hide internal labels (`datasource_id`, `monitor_kind`, `monitor_type`, `_workspace`) from the facet panel. Or collapse the Labels section by default and show only the top 3-5 most useful label keys.

### M3. Stat cards don't visually indicate active filter
- **Where:** Alerts tab > stat cards
- **Observed:** Clicking "Active" card filters the table to 15 rows. But the only visual indicator is a thin 2px blue outline on the card. No background change, no "clear filter" affordance.
- **Impact:** Users don't realize a filter is active and may think the table is showing all alerts.
- **Recommendation:** Use a more prominent selected state (filled background, "x" dismiss button) and show a persistent filter chip below the cards: "Filtered: Active alerts only [x]".

### M4. Bulk delete selects ALL items across all pages
- **Where:** Rules tab > select all checkbox
- **Observed:** "Select all" checkbox selects all 54 monitors (across all pages), then shows "Delete (54)". User likely intended to select only the visible 20 rows.
- **Impact:** Dangerous — user could accidentally delete all monitors when they meant to delete a page's worth.
- **Recommendation:** Select-all should only select current page items. Add "Select all 54 monitors" link (like Gmail pattern) if user wants to extend beyond current page.

### M5. Create Monitor form auto-selects first datasource
- **Where:** Rules tab > Create Monitor flyout
- **Observed:** The form opens with "OpenSearch Production" pre-selected. If user's intent is Prometheus, they must change it. The form also shows "PPL" as the default monitor type which is OpenSearch-specific.
- **Impact:** User could accidentally create a monitor on the wrong datasource.
- **Recommendation:** Start with "Select a datasource..." placeholder (no default). Show monitor type options only after datasource selection.

### M6. Routing tab is read-only with no edit affordance
- **Where:** Routing tab
- **Observed:** Shows route tree, receivers, and inhibit rules in read-only tables. No edit buttons, no create buttons, no way to modify routing configuration.
- **Impact:** User can view but can't act. Unclear whether this is intentional or unfinished.
- **Recommendation:** Add edit/create buttons or show a callout explaining that routing configuration is managed via Alertmanager config file / API.

### M7. Suppression tab has no connection to alert context
- **Where:** Suppression tab
- **Observed:** Shows empty state with "Create Rule" button. But there's no way to create a suppression rule FROM an alert (e.g., right-click alert > "Suppress similar alerts").
- **Impact:** Creating suppression rules requires manual entry of matchers without context from the alert that triggered the need.
- **Recommendation:** Add "Create suppression rule" action to alert detail flyout and alert row context menu, pre-filling matchers from the alert's labels.

### M8. Resizable panels have poor affordance
- **Where:** Alerts tab and Rules tab — filter panel / main content split
- **Observed:** The resize handle between filter panel and main content is a thin invisible bar with only keyboard label "Press left or right to adjust panels size". No visual grip indicator visible on hover.
- **Impact:** Users don't discover they can resize the filter panel.
- **Recommendation:** Add a visible grip indicator (3 dots or a line) on the resize handle. Show cursor change on hover.

---

## 3. Minor Issues

### m1. Tab count badges inconsistent
- **Where:** Tab bar
- **Observed:** "Alerts (22)" and "Rules (54)" show counts. "Routing" and "Suppression" do not.
- **Recommendation:** Add counts to Routing (3 routes) and Suppression (0 rules) tabs.

### m2. "Medium / Low" stat card combines severity levels
- **Where:** Alerts tab > stat cards
- **Observed:** Medium, Low, and Info alerts are combined into one "Medium / Low" card with value 5.
- **Recommendation:** Either give each severity its own card, or rename to "Other" for clarity.

### m3. Alert Timeline chart is sparse with mock data
- **Where:** Alerts tab > Alert Timeline (24h)
- **Observed:** The timeline chart shows all alerts clustered at the right edge (current time) with most of the 24h timeline empty.
- **Recommendation:** Consider a shorter default timeframe (e.g., 6h) or auto-zoom to where data exists.

### m4. "By Source" chart labels use raw backend names
- **Where:** Alerts tab > By Source chart
- **Observed:** Shows "opensearch" and "prometheus" as raw strings rather than datasource names.
- **Recommendation:** Show actual datasource names or formatted labels ("OpenSearch", "Prometheus").

### m5. Column picker doesn't show column preview
- **Where:** Rules tab > Columns button
- **Observed:** 28 columns listed with checkboxes but no indication of what each column shows. Label columns are particularly cryptic (e.g., "Label: _workspace").
- **Recommendation:** Group columns into categories (Standard, Labels, Timestamps) with descriptions.

### m6. Monitor detail flyout shows internal label keys
- **Where:** Rules tab > click monitor name > flyout
- **Observed:** Labels section shows raw badges like `monitor_type: query_level_monitor`, `datasource_id: ds-1`, `monitor_kind: query`. These are internal metadata.
- **Recommendation:** Filter internal labels from the display or show them in a collapsible "Internal metadata" section.

### m7. Search placeholder text is truncated on smaller viewports
- **Where:** Rules tab > search bar
- **Observed:** Placeholder "Search monitors by name, labels (team:infra), annotations..." is very long and gets truncated.
- **Recommendation:** Shorten to "Search monitors..." and add help tooltip for advanced syntax.

### m8. No visual distinction between OpenSearch and Prometheus alert detail flyouts
- **Where:** Alert detail flyout
- **Observed:** Both types show the same accordion structure (AI Analysis, Alert Details, Labels, etc.) with no indication of which backend the alert came from.
- **Recommendation:** Add a datasource badge/icon in the flyout header.

### m9. Create Monitor form has many fields visible at once
- **Where:** Create Monitor flyout
- **Observed:** 17+ form fields visible simultaneously (name, severity, enabled, monitor type, index pattern, query, schedule, threshold, labels, annotations, actions). Very overwhelming.
- **Recommendation:** Use a stepped wizard (Step 1: Datasource & Type, Step 2: Query, Step 3: Conditions, Step 4: Actions) or collapse optional sections.

### m10. Custom pagination buttons lack hover state
- **Where:** Alerts and Rules table pagination
- **Observed:** Page number buttons have no hover state transition — they go from transparent to clicked with no visual feedback on hover.
- **Recommendation:** Add `hover` CSS state with light background highlight.

---

## 4. Enhancement Suggestions

### E1. Add quick-filter chips above the table
Show removable chips for active filters: `Severity: Critical [x]` | `Status: Active [x]` | `Clear All`

### E2. Add alert grouping
Allow grouping alerts by severity, source, or monitor name — similar to Alertmanager's group_by.

### E3. Add keyboard shortcuts
- `?` — show shortcuts help
- `j/k` — navigate between alerts
- `a` — acknowledge selected
- `/` — focus search

### E4. Add "Last refreshed" timestamp
Show when data was last fetched, with a manual refresh button. Currently there's no indication of data freshness.

### E5. Add alert count trend
Show trending arrows on stat cards (e.g., "15 Active +3 from 1h ago") to indicate direction.

### E6. Support dark mode
The app uses light theme only. OpenSearch Dashboards supports dark mode.

### E7. Add URL-based state
Currently, tab selection, filters, and pagination are not reflected in the URL. Sharing a link always opens the default view. Use URL query params or hash routing so views can be bookmarked and shared.

---

## Accessibility Summary

| Check | Status |
|-------|--------|
| Images have alt text | Pass (0 violations) |
| Buttons have labels | Pass (0 unlabeled) |
| Inputs have labels | Pass (0 unlabeled) |
| Heading hierarchy | Fail (skips H2) |
| Focusable elements | 174 elements (good) |
| Color contrast | Pass (no light-on-light text) |
| Keyboard navigation | Partial (tabs work, table rows not focusable) |

---

## Test Environment

- **Viewport:** 1200x684
- **Mode:** Mock (MOCK_MODE=true)
- **Data:** 22 alerts, 54 rules across 3 datasources
- **Browser:** Chromium (Playwright)
