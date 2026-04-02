import { parseDuration, formatDuration, validateMonitorForm, MonitorFormState } from '../validators';

describe('parseDuration', () => {
  it('parses seconds', () => {
    expect(parseDuration('30s')).toEqual({ valid: true, seconds: 30 });
  });

  it('parses minutes', () => {
    expect(parseDuration('5m')).toEqual({ valid: true, seconds: 300 });
  });

  it('parses hours', () => {
    expect(parseDuration('2h')).toEqual({ valid: true, seconds: 7200 });
  });

  it('parses days', () => {
    expect(parseDuration('1d')).toEqual({ valid: true, seconds: 86400 });
  });

  it('trims whitespace', () => {
    expect(parseDuration('  10m  ')).toEqual({ valid: true, seconds: 600 });
  });

  it('allows space between number and unit', () => {
    expect(parseDuration('5 m')).toEqual({ valid: true, seconds: 300 });
  });

  it('rejects empty input', () => {
    const result = parseDuration('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('rejects non-string input', () => {
    const result = parseDuration(null as any);
    expect(result.valid).toBe(false);
  });

  it('rejects zero duration', () => {
    const result = parseDuration('0s');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/positive/i);
  });

  it('rejects invalid format', () => {
    const result = parseDuration('5x');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid duration/i);
  });

  it('rejects plain numbers without unit', () => {
    const result = parseDuration('30');
    expect(result.valid).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes', () => {
    expect(formatDuration(300)).toBe('5m');
  });

  it('formats hours', () => {
    expect(formatDuration(7200)).toBe('2h');
  });

  it('formats days', () => {
    expect(formatDuration(86400)).toBe('1d');
  });

  it('prefers largest unit', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('returns 0s for zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns 0s for negative', () => {
    expect(formatDuration(-10)).toBe('0s');
  });
});

describe('validateMonitorForm', () => {
  const validForm: MonitorFormState = {
    name: 'Test Monitor',
    query: 'rate(http_requests_total[5m]) > 100',
    threshold: { operator: '>', value: 100, unit: 'req/s', forDuration: '5m' },
    evaluationInterval: '1m',
    pendingPeriod: '5m',
    firingPeriod: '10m',
    labels: [{ key: 'severity', value: 'critical' }],
    annotations: [{ key: 'summary', value: 'High request rate' }],
    severity: 'critical' as any,
    enabled: true,
  };

  it('accepts a valid form', () => {
    const result = validateMonitorForm(validForm);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('requires a name', () => {
    const result = validateMonitorForm({ ...validForm, name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/required/i);
  });

  it('rejects names over 256 characters', () => {
    const result = validateMonitorForm({ ...validForm, name: 'x'.repeat(257) });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/256/);
  });

  it('rejects control characters in name', () => {
    const result = validateMonitorForm({ ...validForm, name: 'Test\x00Monitor' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/control/i);
  });

  it('requires a query', () => {
    const result = validateMonitorForm({ ...validForm, query: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.query).toMatch(/required/i);
  });

  it('validates threshold.value is finite', () => {
    const result = validateMonitorForm({
      ...validForm,
      threshold: { ...validForm.threshold, value: Infinity },
    });
    expect(result.valid).toBe(false);
    expect(result.errors['threshold.value']).toBeDefined();
  });

  it('validates threshold.forDuration', () => {
    const result = validateMonitorForm({
      ...validForm,
      threshold: { ...validForm.threshold, forDuration: 'bad' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors['threshold.forDuration']).toBeDefined();
  });

  it('validates duration fields', () => {
    const result = validateMonitorForm({ ...validForm, evaluationInterval: 'xyz' });
    expect(result.valid).toBe(false);
    expect(result.errors.evaluationInterval).toBeDefined();
  });

  it('detects duplicate label keys', () => {
    const result = validateMonitorForm({
      ...validForm,
      labels: [
        { key: 'env', value: 'prod' },
        { key: 'env', value: 'staging' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors['labels[1].key']).toMatch(/duplicate/i);
  });

  it('requires label key when value is present', () => {
    const result = validateMonitorForm({
      ...validForm,
      labels: [{ key: '', value: 'some-value' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors['labels[0].key']).toMatch(/required/i);
  });

  it('requires annotation key when value is present', () => {
    const result = validateMonitorForm({
      ...validForm,
      annotations: [{ key: '', value: 'some-value' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors['annotations[0].key']).toMatch(/required/i);
  });

  it('skips empty label rows', () => {
    const result = validateMonitorForm({
      ...validForm,
      labels: [{ key: '', value: '' }],
    });
    expect(result.valid).toBe(true);
  });
});
