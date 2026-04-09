/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  formatRelativeTime,
  formatDatasourceType,
  formatPercentage,
  formatErrorBudget,
  errorBudgetColor,
  attainmentColor,
  formatLatency,
  escapeHtml,
  countBy,
} from '../shared_constants';

// ============================================================================
// formatRelativeTime
// ============================================================================

describe('formatRelativeTime', () => {
  it('returns dash for empty input', () => {
    expect(formatRelativeTime('')).toBe('—');
  });

  it('returns dash for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('—');
  });

  it('returns "just now" for future timestamps', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatRelativeTime(future)).toBe('just now');
  });

  it('returns seconds ago for recent timestamps', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const result = formatRelativeTime(recent);
    expect(result).toMatch(/^\d+s ago$/);
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = formatRelativeTime(fiveMinAgo);
    expect(result).toMatch(/^\d+m ago$/);
  });

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(twoHoursAgo);
    expect(result).toMatch(/^\d+h ago$/);
  });

  it('returns days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(threeDaysAgo);
    expect(result).toMatch(/^\d+d ago$/);
  });
});

// ============================================================================
// formatDatasourceType
// ============================================================================

describe('formatDatasourceType', () => {
  it('formats opensearch', () => {
    expect(formatDatasourceType('opensearch')).toBe('OpenSearch');
  });

  it('formats prometheus', () => {
    expect(formatDatasourceType('prometheus')).toBe('Prometheus');
  });

  it('capitalizes unknown types', () => {
    expect(formatDatasourceType('grafana')).toBe('Grafana');
    expect(formatDatasourceType('custom')).toBe('Custom');
  });
});

// ============================================================================
// formatPercentage
// ============================================================================

describe('formatPercentage', () => {
  it('returns dash for 0', () => {
    expect(formatPercentage(0)).toBe('—');
  });

  it('returns dash for NaN', () => {
    expect(formatPercentage(NaN)).toBe('—');
  });

  it('formats normal values', () => {
    expect(formatPercentage(0.999)).toBe('99.9%');
    expect(formatPercentage(0.5)).toBe('50%');
  });

  it('formats 1.0 as 100%', () => {
    expect(formatPercentage(1.0)).toBe('100%');
  });

  it('respects decimals parameter', () => {
    const result = formatPercentage(0.99987, 3);
    expect(result).toContain('%');
  });
});

// ============================================================================
// formatErrorBudget
// ============================================================================

describe('formatErrorBudget', () => {
  it('returns "No data" for NaN', () => {
    expect(formatErrorBudget(NaN)).toBe('No data');
  });

  it('formats negative values (exhausted budget)', () => {
    const result = formatErrorBudget(-0.15);
    expect(result).toBe('-15%');
  });

  it('formats positive values', () => {
    const result = formatErrorBudget(0.75);
    expect(result).toBe('75%');
  });
});

// ============================================================================
// errorBudgetColor
// ============================================================================

describe('errorBudgetColor', () => {
  it('returns danger color when remaining <= 0', () => {
    expect(errorBudgetColor(0)).toBe('#BD271E');
    expect(errorBudgetColor(-0.1)).toBe('#BD271E');
  });

  it('returns warning color when remaining < 0.3', () => {
    expect(errorBudgetColor(0.1)).toBe('#F5A700');
    expect(errorBudgetColor(0.29)).toBe('#F5A700');
  });

  it('returns success color when remaining >= 0.3', () => {
    expect(errorBudgetColor(0.3)).toBe('#017D73');
    expect(errorBudgetColor(0.9)).toBe('#017D73');
  });
});

// ============================================================================
// attainmentColor
// ============================================================================

describe('attainmentColor', () => {
  it('returns no-data color when attainment is 0', () => {
    expect(attainmentColor(0, 0.999)).toBe('#98A2B3');
  });

  it('returns danger color when below target', () => {
    expect(attainmentColor(0.99, 0.999)).toBe('#BD271E');
  });

  it('returns warning color when close to target', () => {
    // For target=0.999, the threshold is 0.999 + (1-0.999)*0.3 = 0.9993
    expect(attainmentColor(0.9991, 0.999)).toBe('#F5A700');
  });

  it('returns success color when healthy', () => {
    expect(attainmentColor(0.9999, 0.999)).toBe('#017D73');
  });
});

// ============================================================================
// formatLatency
// ============================================================================

describe('formatLatency', () => {
  it('returns dash for 0', () => {
    expect(formatLatency(0)).toBe('—');
  });

  it('returns dash for NaN', () => {
    expect(formatLatency(NaN)).toBe('—');
  });

  it('formats sub-second values in milliseconds', () => {
    expect(formatLatency(0.5)).toBe('500ms');
    expect(formatLatency(0.123)).toBe('123ms');
  });

  it('formats multi-second values in seconds', () => {
    expect(formatLatency(2.5)).toBe('2.50s');
    expect(formatLatency(10)).toBe('10.00s');
  });
});

// ============================================================================
// escapeHtml
// ============================================================================

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('a "quoted" value')).toBe('a &quot;quoted&quot; value');
  });

  it('returns the same string when no special characters are present', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
});

// ============================================================================
// countBy
// ============================================================================

describe('countBy', () => {
  it('counts occurrences by key function', () => {
    const items = [
      { severity: 'critical' },
      { severity: 'high' },
      { severity: 'critical' },
      { severity: 'low' },
    ];
    expect(countBy(items, (i) => i.severity)).toEqual({
      critical: 2,
      high: 1,
      low: 1,
    });
  });

  it('returns empty object for empty array', () => {
    expect(countBy([], () => 'x')).toEqual({});
  });

  it('handles single-item arrays', () => {
    expect(countBy(['a'], (s) => s)).toEqual({ a: 1 });
  });

  it('handles all items with the same key', () => {
    expect(countBy([1, 2, 3], () => 'same')).toEqual({ same: 3 });
  });
});
