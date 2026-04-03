/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validatePromQL, prettifyPromQL } from '../promql_validator';

describe('validatePromQL', () => {
  it('returns no errors for empty query', () => {
    const result = validatePromQL('');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('accepts valid simple query', () => {
    const result = validatePromQL('up == 1');
    expect(result.errors).toHaveLength(0);
  });

  it('accepts valid rate query with range vector', () => {
    const result = validatePromQL('rate(http_requests_total[5m])');
    expect(result.errors).toHaveLength(0);
  });

  it('detects unmatched opening parenthesis', () => {
    const result = validatePromQL('rate(http_requests_total[5m]');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.type === 'bracket')).toBe(true);
  });

  it('detects unmatched closing bracket', () => {
    const result = validatePromQL('up == 1)');
    expect(result.errors.some(e => e.type === 'bracket')).toBe(true);
  });

  it('detects unmatched curly brace', () => {
    const result = validatePromQL('http_requests_total{job="api"');
    expect(result.errors.some(e => e.type === 'bracket')).toBe(true);
  });

  it('detects missing range vector for rate()', () => {
    const result = validatePromQL('rate(http_requests_total)');
    expect(result.errors.some(e => e.type === 'range-vector')).toBe(true);
  });

  it('detects missing range vector for increase()', () => {
    const result = validatePromQL('increase(counter_total)');
    expect(result.errors.some(e => e.type === 'range-vector')).toBe(true);
  });

  it('detects missing range vector for avg_over_time()', () => {
    const result = validatePromQL('avg_over_time(metric)');
    expect(result.errors.some(e => e.type === 'range-vector')).toBe(true);
  });

  it('accepts rate() with proper range vector', () => {
    const result = validatePromQL('rate(http_requests_total{job="api"}[5m])');
    expect(result.errors.filter(e => e.type === 'range-vector')).toHaveLength(0);
  });

  it('warns on empty label matcher', () => {
    const result = validatePromQL('http_requests_total{}');
    expect(result.warnings.some(w => w.type === 'label-matcher')).toBe(true);
  });

  it('warns on rate without label filters', () => {
    const result = validatePromQL('rate(metric[5m])');
    expect(result.warnings.some(w => w.type === 'cardinality')).toBe(true);
  });

  it('no cardinality warning when rate has label filter', () => {
    const result = validatePromQL('rate(metric{job="api"}[5m])');
    expect(result.warnings.filter(w => w.type === 'cardinality')).toHaveLength(0);
  });
});

describe('prettifyPromQL', () => {
  it('returns empty string for empty input', () => {
    expect(prettifyPromQL('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(prettifyPromQL('  up  ')).toBe('up');
  });

  it('normalizes spaces around operators', () => {
    expect(prettifyPromQL('a+b')).toBe('a + b');
    expect(prettifyPromQL('a>1')).toBe('a > 1');
  });

  it('adds newlines for aggregation operators', () => {
    const result = prettifyPromQL('sum(rate(x[5m]))');
    expect(result).toContain('sum(');
    expect(result).toContain('\n');
  });

  it('cleans up multiple spaces', () => {
    expect(prettifyPromQL('a   +   b')).toBe('a + b');
  });
});
