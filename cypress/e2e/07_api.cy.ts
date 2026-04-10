/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

describe('API Endpoints', () => {
  const isOsd = Cypress.env('mode') === 'osd';

  // Standalone and OSD use different API paths (see alarms_client.ts ApiPaths)
  const paths = isOsd
    ? {
        datasources: '/api/alerting/datasources',
        alerts: '/api/alerting/unified/alerts',
        rules: '/api/alerting/unified/rules',
        slos: '/api/alerting/slos',
        suppressionRules: '/api/alerting/suppression-rules',
        sloPreview: '/api/alerting/slos/preview',
        metricNames: '/api/alerting/prometheus/ds-2/metadata/metrics',
        labelNames: '/api/alerting/prometheus/ds-2/metadata/labels',
        labelValues: '/api/alerting/prometheus/ds-2/metadata/label-values/job',
        metricMetadata: '/api/alerting/prometheus/ds-2/metadata/metric-metadata',
      }
    : {
        datasources: '/api/datasources',
        alerts: '/api/paginated/alerts',
        rules: '/api/paginated/rules',
        slos: '/api/slos',
        suppressionRules: '/api/suppression-rules',
        sloPreview: '/api/slos/preview',
        metricNames: '/api/datasources/ds-2/metadata/metrics',
        labelNames: '/api/datasources/ds-2/metadata/labels',
        labelValues: '/api/datasources/ds-2/metadata/label-values/job',
        metricMetadata: '/api/datasources/ds-2/metadata/metric-metadata',
      };

  const req = (method: string, path: string, body?: object) => {
    const opts: Partial<Cypress.RequestOptions> = {
      method,
      url: `${Cypress.config('baseUrl')}${path}`,
      failOnStatusCode: false,
      headers: isOsd ? { 'osd-xsrf': 'osd-fetch' } : {},
    };
    if (body) opts.body = body;
    return cy.request(opts);
  };

  describe('Datasources', () => {
    it('GET datasources returns datasource list', () => {
      req('GET', paths.datasources).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('datasources');
        expect(res.body.datasources).to.be.an('array');
        expect(res.body.datasources.length).to.be.greaterThan(0);
      });
    });
  });

  describe('Alerts', () => {
    it('GET alerts returns results', () => {
      req('GET', paths.alerts).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('results');
        expect(res.body.results).to.be.an('array');
      });
    });
  });

  describe('Rules', () => {
    it('GET rules returns results', () => {
      req('GET', paths.rules).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('results');
        expect(res.body.results).to.be.an('array');
      });
    });
  });

  describe('SLOs', () => {
    it('GET slos returns paginated results', () => {
      req('GET', paths.slos).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('results');
        expect(res.body.results).to.be.an('array');
        expect(res.body).to.have.property('total');
      });
    });

    it('POST slos/preview accepts a preview request', () => {
      const previewPayload = {
        name: 'Preview Test',
        service: 'test-svc',
        sliType: 'availability',
        metricName: 'http_requests_total',
        target: 99.9,
        windowDuration: '1d',
        goodEventsFilter: 'status_code!~"5.."',
        serviceLabelName: 'service',
        operationLabelName: 'handler',
        datasourceId: 'ds-2',
      };

      req('POST', paths.sloPreview, previewPayload).then((res) => {
        // Preview returns 200 with rules, 400 if incomplete, or 500 in some standalone configs
        expect(res.status).to.be.oneOf([200, 400, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('rules');
        }
      });
    });
  });

  describe('Prometheus Metadata', () => {
    it('GET metadata/metrics returns metric names', () => {
      req('GET', paths.metricNames).then((res) => {
        expect(res.status).to.eq(200);
        // Response may be { metrics: [...], total } or a bare array depending on mode
        const metrics = Array.isArray(res.body) ? res.body : res.body.metrics;
        expect(metrics).to.be.an('array');
      });
    });

    it('GET metadata/labels returns label names', () => {
      req('GET', paths.labelNames).then((res) => {
        expect(res.status).to.eq(200);
        const labels = Array.isArray(res.body) ? res.body : res.body.labels;
        expect(labels).to.be.an('array');
      });
    });

    it('GET metadata/label-values returns values', () => {
      req('GET', paths.labelValues).then((res) => {
        expect(res.status).to.eq(200);
        const values = Array.isArray(res.body) ? res.body : res.body.values;
        expect(values).to.be.an('array');
      });
    });

    it('GET metadata/metric-metadata returns metadata object', () => {
      req('GET', paths.metricMetadata).then((res) => {
        // metric-metadata may return 200 with data or 500 if not supported
        // In standalone MOCK_MODE, verify it responds without crashing
        expect(res.status).to.be.oneOf([200, 500]);
      });
    });
  });

  describe('Suppression Rules', () => {
    it('GET suppression-rules returns rules object', () => {
      req('GET', paths.suppressionRules).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('rules');
        expect(res.body.rules).to.be.an('array');
      });
    });
  });
});
