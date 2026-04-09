/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleGetAlertmanagerAlerts,
  handleGetAlertmanagerSilences,
  handleCreateAlertmanagerSilence,
  handleDeleteAlertmanagerSilence,
  handleGetAlertmanagerStatus,
  handleGetAlertmanagerReceivers,
  handleGetAlertmanagerAlertGroups,
  handleGetAlertmanagerConfig,
  extractReceiverIntegrations,
} from '../alertmanager_handlers';
import { PrometheusBackend } from '../../../common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal PrometheusBackend stub — no optional alertmanager methods. */
function minimalBackend(): PrometheusBackend {
  return {
    type: 'prometheus',
    getRuleGroups: jest.fn().mockResolvedValue([]),
    getAlerts: jest.fn().mockResolvedValue([]),
    listWorkspaces: jest.fn().mockResolvedValue([]),
  };
}

/** Full PrometheusBackend stub — all alertmanager methods present. */
function fullBackend() {
  return {
    ...minimalBackend(),
    getAlertmanagerAlerts: jest.fn().mockResolvedValue([{ labels: { alertname: 'HighCPU' } }]),
    getSilences: jest.fn().mockResolvedValue([{ id: 'sil-1' }]),
    createSilence: jest.fn().mockResolvedValue('sil-new'),
    deleteSilence: jest.fn().mockResolvedValue(true),
    getAlertmanagerStatus: jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [{ name: 'peer-1' }] },
      uptime: '2h',
      versionInfo: { version: '0.27.0' },
      config: { original: '' },
    }),
    getAlertmanagerReceivers: jest.fn().mockResolvedValue([{ name: 'slack-team' }]),
    getAlertmanagerAlertGroups: jest.fn().mockResolvedValue([{ labels: {}, alerts: [] }]),
  };
}

// ---------------------------------------------------------------------------
// handleGetAlertmanagerAlerts
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerAlerts', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleGetAlertmanagerAlerts(minimalBackend());
    expect(r.status).toBe(501);
    expect(r.body.error).toContain('not configured');
  });

  it('returns 200 with alerts', async () => {
    const r = await handleGetAlertmanagerAlerts(fullBackend());
    expect(r.status).toBe(200);
    expect(r.body.alerts).toHaveLength(1);
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.getAlertmanagerAlerts = jest.fn().mockRejectedValue(new Error('network'));
    const r = await handleGetAlertmanagerAlerts(b);
    expect(r.status).toBe(500);
    expect(r.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleGetAlertmanagerSilences
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerSilences', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleGetAlertmanagerSilences(minimalBackend());
    expect(r.status).toBe(501);
  });

  it('returns 200 with silences', async () => {
    const r = await handleGetAlertmanagerSilences(fullBackend());
    expect(r.status).toBe(200);
    expect(r.body.silences).toHaveLength(1);
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.getSilences = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleGetAlertmanagerSilences(b);
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleCreateAlertmanagerSilence
// ---------------------------------------------------------------------------

describe('handleCreateAlertmanagerSilence', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleCreateAlertmanagerSilence(minimalBackend(), {});
    expect(r.status).toBe(501);
  });

  it('returns 200 with silenceID', async () => {
    const r = await handleCreateAlertmanagerSilence(fullBackend(), { matchers: [] });
    expect(r.status).toBe(200);
    expect(r.body.silenceID).toBe('sil-new');
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.createSilence = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleCreateAlertmanagerSilence(b, {});
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteAlertmanagerSilence
// ---------------------------------------------------------------------------

describe('handleDeleteAlertmanagerSilence', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleDeleteAlertmanagerSilence(minimalBackend(), 'sil-1');
    expect(r.status).toBe(501);
  });

  it('returns 200 with success', async () => {
    const r = await handleDeleteAlertmanagerSilence(fullBackend(), 'sil-1');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.deleteSilence = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleDeleteAlertmanagerSilence(b, 'sil-1');
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetAlertmanagerStatus
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerStatus', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleGetAlertmanagerStatus(minimalBackend());
    expect(r.status).toBe(501);
  });

  it('returns 200 with status', async () => {
    const r = await handleGetAlertmanagerStatus(fullBackend());
    expect(r.status).toBe(200);
    expect(r.body.cluster.status).toBe('ready');
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleGetAlertmanagerStatus(b);
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetAlertmanagerReceivers
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerReceivers', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleGetAlertmanagerReceivers(minimalBackend());
    expect(r.status).toBe(501);
  });

  it('returns 200 with receivers', async () => {
    const r = await handleGetAlertmanagerReceivers(fullBackend());
    expect(r.status).toBe(200);
    expect(r.body.receivers).toHaveLength(1);
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.getAlertmanagerReceivers = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleGetAlertmanagerReceivers(b);
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetAlertmanagerAlertGroups
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerAlertGroups', () => {
  it('returns 501 when method not available', async () => {
    const r = await handleGetAlertmanagerAlertGroups(minimalBackend());
    expect(r.status).toBe(501);
  });

  it('returns 200 with groups', async () => {
    const r = await handleGetAlertmanagerAlertGroups(fullBackend());
    expect(r.status).toBe(200);
    expect(r.body.groups).toHaveLength(1);
  });

  it('returns 500 on error', async () => {
    const b = fullBackend();
    b.getAlertmanagerAlertGroups = jest.fn().mockRejectedValue(new Error('fail'));
    const r = await handleGetAlertmanagerAlertGroups(b);
    expect(r.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// extractReceiverIntegrations
// ---------------------------------------------------------------------------

describe('extractReceiverIntegrations', () => {
  it('returns none for receiver with no configs', () => {
    const result = extractReceiverIntegrations({ name: 'empty' });
    expect(result).toEqual([{ type: 'none', summary: 'No integrations' }]);
  });

  it('extracts webhook integration', () => {
    const result = extractReceiverIntegrations({
      name: 'webhooks',
      webhook_configs: [{ url: 'https://hook.example.com' }],
    });
    expect(result).toEqual([{ type: 'webhook', summary: 'https://hook.example.com' }]);
  });

  it('extracts slack integration with channel', () => {
    const result = extractReceiverIntegrations({
      name: 'slack',
      slack_configs: [{ channel: '#alerts' }],
    });
    expect(result).toEqual([{ type: 'slack', summary: '#alerts' }]);
  });

  it('extracts email integration', () => {
    const result = extractReceiverIntegrations({
      name: 'email',
      email_configs: [{ to: 'team@example.com' }],
    });
    expect(result).toEqual([{ type: 'email', summary: 'team@example.com' }]);
  });

  it('extracts pagerduty integration', () => {
    const result = extractReceiverIntegrations({
      name: 'pd',
      pagerduty_configs: [{ service_key: 'key-123' }],
    });
    expect(result).toEqual([{ type: 'pagerduty', summary: 'key-123' }]);
  });

  it('extracts multiple integrations from one receiver', () => {
    const result = extractReceiverIntegrations({
      name: 'multi',
      webhook_configs: [{ url: 'https://a.com' }],
      slack_configs: [{ channel: '#ops' }],
    });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('webhook');
    expect(result[1].type).toBe('slack');
  });

  it('handles generic integration type with url fallback', () => {
    const result = extractReceiverIntegrations({
      name: 'opsgenie',
      opsgenie_configs: [{ api_url: 'https://api.opsgenie.com' }],
    });
    expect(result).toEqual([{ type: 'opsgenie', summary: 'https://api.opsgenie.com' }]);
  });

  it('falls back to url_file for webhook without url', () => {
    const result = extractReceiverIntegrations({
      name: 'wh',
      webhook_configs: [{ url_file: '/path/to/url' }],
    });
    expect(result).toEqual([{ type: 'webhook', summary: '/path/to/url' }]);
  });

  it('falls back to "webhook" when no url or url_file', () => {
    const result = extractReceiverIntegrations({
      name: 'wh',
      webhook_configs: [{}],
    });
    expect(result).toEqual([{ type: 'webhook', summary: 'webhook' }]);
  });

  it('falls back to "slack" when no channel', () => {
    const result = extractReceiverIntegrations({
      name: 's',
      slack_configs: [{}],
    });
    expect(result).toEqual([{ type: 'slack', summary: 'slack' }]);
  });

  it('falls back to "email" when no to', () => {
    const result = extractReceiverIntegrations({
      name: 'e',
      email_configs: [{}],
    });
    expect(result).toEqual([{ type: 'email', summary: 'email' }]);
  });

  it('pagerduty falls back to api_url then "pagerduty"', () => {
    const r1 = extractReceiverIntegrations({
      name: 'pd',
      pagerduty_configs: [{ api_url: 'https://pd.com' }],
    });
    expect(r1).toEqual([{ type: 'pagerduty', summary: 'https://pd.com' }]);

    const r2 = extractReceiverIntegrations({
      name: 'pd',
      pagerduty_configs: [{}],
    });
    expect(r2).toEqual([{ type: 'pagerduty', summary: 'pagerduty' }]);
  });

  it('generic type falls back to typeName when no url or api_url', () => {
    const result = extractReceiverIntegrations({
      name: 'v',
      victorops_configs: [{}],
    });
    expect(result).toEqual([{ type: 'victorops', summary: 'victorops' }]);
  });
});

// ---------------------------------------------------------------------------
// handleGetAlertmanagerConfig
// ---------------------------------------------------------------------------

describe('handleGetAlertmanagerConfig', () => {
  it('returns available: false when getAlertmanagerStatus not present', async () => {
    const r = await handleGetAlertmanagerConfig(minimalBackend());
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(false);
  });

  it('returns structured config when YAML is valid', async () => {
    const b = fullBackend();
    const yamlConfig = [
      'global:',
      '  resolve_timeout: 5m',
      'route:',
      '  receiver: default',
      'receivers:',
      '  - name: default',
      '    webhook_configs:',
      '      - url: https://hook.example.com',
      'inhibit_rules:',
      '  - equal: [alertname]',
    ].join('\n');
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [] },
      uptime: '1h',
      versionInfo: { version: '0.27.0' },
      config: { original: yamlConfig },
    });

    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(true);
    expect(r.body.config.global.resolve_timeout).toBe('5m');
    expect(r.body.config.route.receiver).toBe('default');
    expect(r.body.config.receivers).toHaveLength(1);
    expect(r.body.config.receivers[0].name).toBe('default');
    expect(r.body.config.receivers[0].integrations[0].type).toBe('webhook');
    expect(r.body.config.inhibitRules).toHaveLength(1);
    expect(r.body.raw).toBe(yamlConfig);
  });

  it('returns configParseError for invalid YAML', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [] },
      config: { original: '{{invalid yaml' },
    });

    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(true);
    expect(r.body.configParseError).toContain('Failed to parse YAML');
  });

  it('returns available: true with empty config when YAML is empty', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [] },
      config: { original: '' },
    });

    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(true);
    expect(r.body.config).toBeUndefined();
  });

  it('returns available: false when getAlertmanagerStatus throws', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockRejectedValue(new Error('connection refused'));

    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(false);
    expect(r.body.error).toContain('connection refused');
  });

  it('populates cluster info and versionInfo', async () => {
    const b = fullBackend();
    // Uses default mock which has cluster.status=ready, peers=[peer-1], uptime=2h
    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.cluster.status).toBe('ready');
    expect(r.body.cluster.peerCount).toBe(1);
    expect(r.body.uptime).toBe('2h');
    expect(r.body.versionInfo.version).toBe('0.27.0');
  });

  it('handles status response with missing optional fields', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      config: { original: '' },
    });
    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(true);
    expect(r.body.cluster.status).toBe('unknown');
    expect(r.body.cluster.peers).toEqual([]);
    expect(r.body.cluster.peerCount).toBe(0);
    expect(r.body.uptime).toBeUndefined();
    expect(r.body.versionInfo).toEqual({});
  });

  it('handles config YAML with missing sections (no receivers, route, global)', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [] },
      config: { original: 'some_key: some_value' },
    });
    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.config.global).toEqual({});
    expect(r.body.config.route).toBeNull();
    expect(r.body.config.receivers).toEqual([]);
    expect(r.body.config.inhibitRules).toEqual([]);
  });

  it('handles YAML that parses to non-object', async () => {
    const b = fullBackend();
    b.getAlertmanagerStatus = jest.fn().mockResolvedValue({
      cluster: { status: 'ready', peers: [] },
      config: { original: '"just a string"' },
    });
    const r = await handleGetAlertmanagerConfig(b);
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(true);
    // YAML parsed to a string, not an object — config should be undefined
    expect(r.body.config).toBeUndefined();
  });
});
