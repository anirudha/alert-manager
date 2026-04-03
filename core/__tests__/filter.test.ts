/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { emptyFilters, matchesSearch, matchesFilters, sortRules, filterAlerts } from '../filter';

describe('emptyFilters', () => {
  it('returns all empty arrays and empty labels', () => {
    const f = emptyFilters();
    expect(f.status).toEqual([]);
    expect(f.severity).toEqual([]);
    expect(f.monitorType).toEqual([]);
    expect(f.labels).toEqual({});
    expect(f.backend).toEqual([]);
  });
});

describe('matchesSearch', () => {
  const rule = {
    name: 'HighCpuUsage',
    labels: { severity: 'critical', team: 'platform' },
    annotations: { summary: 'CPU usage is too high', runbook: 'https://wiki/cpu' },
  };

  it('matches everything when query is empty', () => {
    expect(matchesSearch(rule, '')).toBe(true);
  });

  it('matches by name (case-insensitive)', () => {
    expect(matchesSearch(rule, 'highcpu')).toBe(true);
    expect(matchesSearch(rule, 'HIGHCPU')).toBe(true);
  });

  it('matches by label value', () => {
    expect(matchesSearch(rule, 'critical')).toBe(true);
    expect(matchesSearch(rule, 'platform')).toBe(true);
  });

  it('matches by annotation value', () => {
    expect(matchesSearch(rule, 'too high')).toBe(true);
  });

  it('supports label:value search syntax', () => {
    expect(matchesSearch(rule, 'severity:critical')).toBe(true);
    expect(matchesSearch(rule, 'severity:warning')).toBe(false);
  });

  it('supports annotation:value search syntax', () => {
    expect(matchesSearch(rule, 'summary:cpu')).toBe(true);
  });

  it('requires all terms to match (AND logic)', () => {
    expect(matchesSearch(rule, 'high platform')).toBe(true);
    expect(matchesSearch(rule, 'high nonexistent')).toBe(false);
  });

  it('does not match when nothing matches', () => {
    expect(matchesSearch(rule, 'zzz_no_match')).toBe(false);
  });
});

describe('matchesFilters', () => {
  const rule = {
    status: 'active',
    severity: 'critical',
    monitorType: 'query',
    healthStatus: 'healthy',
    labels: { team: 'platform', env: 'prod' },
    createdBy: 'admin',
    datasourceType: 'opensearch',
    notificationDestinations: ['slack-channel', 'email-oncall'],
  };

  it('matches when all filters are empty', () => {
    expect(matchesFilters(rule, emptyFilters())).toBe(true);
  });

  it('filters by status', () => {
    expect(matchesFilters(rule, { ...emptyFilters(), status: ['active'] })).toBe(true);
    expect(matchesFilters(rule, { ...emptyFilters(), status: ['disabled'] })).toBe(false);
  });

  it('filters by severity', () => {
    expect(matchesFilters(rule, { ...emptyFilters(), severity: ['critical', 'warning'] })).toBe(true);
    expect(matchesFilters(rule, { ...emptyFilters(), severity: ['info'] })).toBe(false);
  });

  it('filters by backend', () => {
    expect(matchesFilters(rule, { ...emptyFilters(), backend: ['opensearch'] })).toBe(true);
    expect(matchesFilters(rule, { ...emptyFilters(), backend: ['prometheus'] })).toBe(false);
  });

  it('filters by destination', () => {
    expect(matchesFilters(rule, { ...emptyFilters(), destinations: ['slack-channel'] })).toBe(true);
    expect(matchesFilters(rule, { ...emptyFilters(), destinations: ['pagerduty'] })).toBe(false);
  });

  it('filters by label key-value', () => {
    expect(matchesFilters(rule, { ...emptyFilters(), labels: { team: ['platform'] } })).toBe(true);
    expect(matchesFilters(rule, { ...emptyFilters(), labels: { team: ['backend'] } })).toBe(false);
  });

  it('requires all active filters to match', () => {
    const filters = { ...emptyFilters(), status: ['active'], severity: ['warning'] };
    expect(matchesFilters(rule, filters)).toBe(false);
  });
});

describe('sortRules', () => {
  const items = [
    { name: 'Charlie', score: 3 },
    { name: 'Alice', score: 1 },
    { name: 'Bob', score: 2 },
  ];

  it('sorts ascending by string field', () => {
    const sorted = sortRules(items, 'name', 'asc');
    expect(sorted.map(i => i.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('sorts descending by string field', () => {
    const sorted = sortRules(items, 'name', 'desc');
    expect(sorted.map(i => i.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts by numeric field', () => {
    const sorted = sortRules(items, 'score', 'asc');
    expect(sorted.map(i => i.score)).toEqual([1, 2, 3]);
  });

  it('supports custom accessor', () => {
    const sorted = sortRules(items, 'name', 'asc', (item, field) => (item as any)[field].length);
    expect(sorted.map(i => i.name)).toEqual(['Bob', 'Alice', 'Charlie']);
  });

  it('does not mutate the original array', () => {
    const original = [...items];
    sortRules(items, 'name', 'asc');
    expect(items).toEqual(original);
  });
});

describe('filterAlerts', () => {
  const alerts = [
    { name: 'CPUHigh', severity: 'critical', state: 'firing', labels: { team: 'infra' }, message: 'CPU at 95%' },
    { name: 'MemLow', severity: 'warning', state: 'pending', labels: { team: 'app' }, message: 'Memory low' },
    { name: 'DiskFull', severity: 'critical', state: 'firing', labels: { team: 'infra' }, message: 'Disk full' },
  ];

  it('returns all when no filters', () => {
    expect(filterAlerts(alerts, {})).toHaveLength(3);
  });

  it('filters by severity', () => {
    expect(filterAlerts(alerts, { severity: ['critical'] })).toHaveLength(2);
  });

  it('filters by state', () => {
    expect(filterAlerts(alerts, { state: ['pending'] })).toHaveLength(1);
  });

  it('filters by label', () => {
    expect(filterAlerts(alerts, { labels: { team: ['app'] } })).toHaveLength(1);
  });

  it('filters by search term', () => {
    expect(filterAlerts(alerts, { search: 'disk' })).toHaveLength(1);
  });

  it('search matches message text', () => {
    expect(filterAlerts(alerts, { search: '95%' })).toHaveLength(1);
  });

  it('combines multiple filters', () => {
    expect(filterAlerts(alerts, { severity: ['critical'], search: 'disk' })).toHaveLength(1);
  });
});
