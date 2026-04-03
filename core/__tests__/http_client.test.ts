/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { HttpClient, buildAuthFromDatasource, HttpRequestOptions } from '../http_client';
import { Datasource, Logger } from '../types';

// ---------------------------------------------------------------------------
// Noop logger (matches project convention)
// ---------------------------------------------------------------------------
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// ---------------------------------------------------------------------------
// Mock helpers – fake ClientRequest & IncomingMessage
// ---------------------------------------------------------------------------

/** Minimal mock of http.ClientRequest (writable + events). */
class MockClientRequest extends EventEmitter {
  destroyed = false;
  writtenData = '';
  ended = false;
  private timeoutCb?: () => void;

  write(data: string) {
    this.writtenData += data;
  }
  end() {
    this.ended = true;
  }
  destroy() {
    this.destroyed = true;
  }
  setTimeout(ms: number, cb: () => void) {
    this.timeoutCb = cb;
  }

  /** Test helper – fire the timeout callback that was registered via setTimeout. */
  simulateTimeout() {
    if (this.timeoutCb) this.timeoutCb();
  }
}

/** Minimal mock of http.IncomingMessage (readable + events). */
class MockIncomingMessage extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;

  constructor(statusCode: number, headers: Record<string, string> = {}) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
  }

  /** Test helper – push chunks then end. */
  sendBody(body: string) {
    const buf = Buffer.from(body, 'utf8');
    this.emit('data', buf);
    this.emit('end');
  }

  /** Test helper – push data in multiple chunks then end. */
  sendChunks(chunks: string[]) {
    for (const c of chunks) {
      this.emit('data', Buffer.from(c, 'utf8'));
    }
    this.emit('end');
  }
}

// ---------------------------------------------------------------------------
// Module-level mocks for http & https
// ---------------------------------------------------------------------------
jest.mock('http', () => {
  const actual = jest.requireActual('http');
  return {
    ...actual,
    Agent: jest.fn().mockImplementation(() => ({
      destroy: jest.fn(),
    })),
    request: jest.fn(),
  };
});

jest.mock('https', () => {
  const actual = jest.requireActual('https');
  return {
    ...actual,
    Agent: jest.fn().mockImplementation(() => ({
      destroy: jest.fn(),
    })),
    request: jest.fn(),
  };
});

import http from 'http';
import https from 'https';

// ---------------------------------------------------------------------------
// Utility: wire up a mocked http.request / https.request call
// ---------------------------------------------------------------------------

/**
 * Set up the next call to `http.request` (or `https.request`) so it returns
 * a MockClientRequest and invokes the response callback with a
 * MockIncomingMessage.
 *
 * Returns the MockClientRequest and MockIncomingMessage for further control.
 */
function setupMockRequest(
  lib: typeof http | typeof https,
  statusCode: number,
  responseBody: string,
  responseHeaders: Record<string, string> = {}
): { req: MockClientRequest; res: MockIncomingMessage } {
  const req = new MockClientRequest();
  const res = new MockIncomingMessage(statusCode, responseHeaders);

  (lib.request as jest.Mock).mockImplementationOnce(
    (_opts: unknown, cb: (r: MockIncomingMessage) => void) => {
      // Invoke the response callback on next tick to simulate async I/O
      process.nextTick(() => {
        cb(res);
        process.nextTick(() => res.sendBody(responseBody));
      });
      return req;
    }
  );

  return { req, res };
}

/**
 * Variant that gives the caller full control over when the response fires.
 * The response callback is NOT invoked automatically.
 */
function setupMockRequestManual(lib: typeof http | typeof https): {
  req: MockClientRequest;
  triggerResponse: (res: MockIncomingMessage) => void;
} {
  const req = new MockClientRequest();
  let responseCb: ((r: MockIncomingMessage) => void) | undefined;

  (lib.request as jest.Mock).mockImplementationOnce(
    (_opts: unknown, cb: (r: MockIncomingMessage) => void) => {
      responseCb = cb;
      return req;
    }
  );

  return {
    req,
    triggerResponse: (res: MockIncomingMessage) => {
      if (responseCb) responseCb(res);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    jest.clearAllMocks();
    // Fast-forward timers so retry delays don't slow tests
    // jest.useFakeTimers(); -- disabled, interferes with async retry
    client = new HttpClient(noopLogger);
  });

  afterEach(() => {
    // jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. Successful JSON GET
  // -----------------------------------------------------------------------
  it('returns parsed JSON body on a successful GET', async () => {
    const payload = { message: 'hello' };
    setupMockRequest(http, 200, JSON.stringify(payload));

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost:9200/_cluster/health',
    });
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(payload);
  });

  // -----------------------------------------------------------------------
  // 2. HTTPS request uses https module
  // -----------------------------------------------------------------------
  it('uses the https module for https:// URLs', async () => {
    const payload = { secure: true };
    setupMockRequest(https, 200, JSON.stringify(payload));

    const promise = client.request({
      method: 'GET',
      url: 'https://secure.example.com/api',
    });
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(payload);
    expect(https.request).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. Non-JSON response falls back to raw string
  // -----------------------------------------------------------------------
  it('returns raw string when response is not valid JSON', async () => {
    setupMockRequest(http, 200, 'plain text response');

    const promise = client.request({ method: 'GET', url: 'http://localhost/text' });
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.status).toBe(200);
    expect(resp.body).toBe('plain text response');
  });

  // -----------------------------------------------------------------------
  // 4. Empty body returns empty object
  // -----------------------------------------------------------------------
  it('returns empty object for empty response body', async () => {
    setupMockRequest(http, 204, '');

    const promise = client.request({ method: 'DELETE', url: 'http://localhost/resource' });
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.status).toBe(204);
    expect(resp.body).toEqual({});
  });

  // -----------------------------------------------------------------------
  // 5. POST sends JSON body with correct headers
  // -----------------------------------------------------------------------
  it('sends JSON body with Content-Type and Content-Length on POST', async () => {
    const body = { name: 'test-monitor' };
    const { req } = setupMockRequest(http, 201, JSON.stringify({ id: '123' }));

    const promise = client.request({
      method: 'POST',
      url: 'http://localhost:9200/_plugins/_alerting/monitors',
      body,
    });
    // jest.runAllTimers();
    await promise;

    expect(req.writtenData).toBe(JSON.stringify(body));
    expect(req.ended).toBe(true);

    // Verify Content-Type was set via the requestOptions passed to http.request
    const callArgs = (http.request as jest.Mock).mock.calls[0][0];
    expect(callArgs.headers['Content-Type']).toBe('application/json');
    expect(callArgs.headers['Content-Length']).toBe(
      Buffer.byteLength(JSON.stringify(body)).toString()
    );
  });

  // -----------------------------------------------------------------------
  // 6. Auth header construction (Basic base64)
  // -----------------------------------------------------------------------
  it('sets Basic Authorization header when auth is provided', async () => {
    setupMockRequest(http, 200, '{}');

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/secure',
      auth: { username: 'admin', password: 'secret' },
    });
    // jest.runAllTimers();
    await promise;

    const callArgs = (http.request as jest.Mock).mock.calls[0][0];
    const expected = Buffer.from('admin:secret').toString('base64');
    expect(callArgs.headers['Authorization']).toBe(`Basic ${expected}`);
  });

  // -----------------------------------------------------------------------
  // 7. HTTP error (4xx) throws HttpError with status
  // -----------------------------------------------------------------------
  it('throws HttpError for 4xx responses', async () => {
    setupMockRequest(http, 404, JSON.stringify({ error: 'not found' }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/missing' });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/HTTP 404/);
  });

  // -----------------------------------------------------------------------
  // 8. No retry on 400 (only 502-504 are retryable)
  // -----------------------------------------------------------------------
  it('does NOT retry on 400 Bad Request', async () => {
    setupMockRequest(http, 400, JSON.stringify({ error: 'bad request' }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/bad' });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/HTTP 400/);
    // http.request should only have been called once (no retries)
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 9. No retry on 500 (only 502-504 are retryable)
  // -----------------------------------------------------------------------
  it('does NOT retry on 500 Internal Server Error', async () => {
    setupMockRequest(http, 500, JSON.stringify({ error: 'server error' }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/err' });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/HTTP 500/);
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 10. Retry on 502 Bad Gateway (up to maxRetries)
  // -----------------------------------------------------------------------
  it('retries on 502 and succeeds on second attempt', async () => {
    // First call: 502
    setupMockRequest(http, 502, 'bad gateway');
    // Second call: 200
    setupMockRequest(http, 200, JSON.stringify({ ok: true }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/retry' });
    // Advance past the first retry delay
    // jest.runAllTimers();
    // Give ticks for async work
    await Promise.resolve();
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.status).toBe(200);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 11. Retry on 503 exhausts retries and throws
  // -----------------------------------------------------------------------
  it('exhausts retries on repeated 503 and throws', async () => {
    // 3 calls total: initial + 2 retries, all returning 503
    setupMockRequest(http, 503, 'unavailable');
    setupMockRequest(http, 503, 'unavailable');
    setupMockRequest(http, 503, 'unavailable');

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/down',
      maxRetries: 2,
    });

    // Advance through all retry delays
    for (let i = 0; i < 10; i++) {
      // jest.runAllTimers();
      await Promise.resolve();
    }

    await expect(promise).rejects.toThrow(/HTTP 503/);
    expect(http.request).toHaveBeenCalledTimes(3);
  });

  // -----------------------------------------------------------------------
  // 12. Retry on network error (ECONNRESET)
  // -----------------------------------------------------------------------
  it('retries on network errors like ECONNRESET', async () => {
    // First call: network error
    const req1 = new MockClientRequest();
    (http.request as jest.Mock).mockImplementationOnce((_opts: unknown, _cb: unknown) => {
      process.nextTick(() => req1.emit('error', new Error('ECONNRESET')));
      return req1;
    });
    // Second call: success
    setupMockRequest(http, 200, JSON.stringify({ recovered: true }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/flaky' });

    for (let i = 0; i < 10; i++) {
      // jest.runAllTimers();
      await Promise.resolve();
    }

    const resp = await promise;
    expect(resp.status).toBe(200);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 13. Timeout destroys request and rejects
  // -----------------------------------------------------------------------
  it('rejects with timeout error when request exceeds timeoutMs', async () => {
    const { req } = setupMockRequestManual(http);

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/slow',
      timeoutMs: 5000,
    });

    // The req was created; simulate the timeout firing
    process.nextTick(() => req.simulateTimeout());
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/timed out after 5000ms/);
    expect(req.destroyed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 14. Response size limit
  // -----------------------------------------------------------------------
  it('rejects when response exceeds maxResponseBytes', async () => {
    const req = new MockClientRequest();
    const res = new MockIncomingMessage(200);

    (http.request as jest.Mock).mockImplementationOnce(
      (_opts: unknown, cb: (r: MockIncomingMessage) => void) => {
        process.nextTick(() => {
          cb(res);
          process.nextTick(() => {
            // Send a chunk that exceeds the limit
            const bigChunk = Buffer.alloc(200, 'x');
            res.emit('data', bigChunk);
          });
        });
        return req;
      }
    );

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/big',
      maxResponseBytes: 100,
    });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/exceeded 100 bytes/);
    expect(req.destroyed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 15. AbortController – already aborted signal
  // -----------------------------------------------------------------------
  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/aborted',
      signal: controller.signal,
    });

    await expect(promise).rejects.toThrow(/Request aborted/);
    // http.request should never be called since signal was already aborted
    expect(http.request).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 16. AbortController – abort during request
  // -----------------------------------------------------------------------
  it('rejects when signal is aborted during a pending request', async () => {
    const controller = new AbortController();
    const { req } = setupMockRequestManual(http);

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/cancel-me',
      signal: controller.signal,
    });

    // Abort after the request is in flight
    process.nextTick(() => controller.abort());
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/Request aborted/);
    expect(req.destroyed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 17. Connection pool agents are created with keepAlive
  // -----------------------------------------------------------------------
  it('creates http and https agents with keepAlive', () => {
    // The agents are created in the constructor. Verify Agent was called with keepAlive.
    expect(http.Agent).toHaveBeenCalledWith(
      expect.objectContaining({ keepAlive: true, maxSockets: 10 })
    );
    expect(https.Agent).toHaveBeenCalledWith(
      expect.objectContaining({ keepAlive: true, maxSockets: 10 })
    );
  });

  // -----------------------------------------------------------------------
  // 18. destroy() cleans up agents
  // -----------------------------------------------------------------------
  it('calls destroy on both agents when destroy() is invoked', () => {
    client.destroy();

    // Access the agents via the mock constructor instances
    const httpAgentInstance = (http.Agent as unknown as jest.Mock).mock.results[0].value;
    const httpsAgentInstance = (https.Agent as unknown as jest.Mock).mock.results[0].value;

    expect(httpAgentInstance.destroy).toHaveBeenCalled();
    expect(httpsAgentInstance.destroy).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 19. Request error (not retryable) propagates
  // -----------------------------------------------------------------------
  it('propagates non-retryable network errors without retry', async () => {
    const req1 = new MockClientRequest();
    (http.request as jest.Mock).mockImplementationOnce((_opts: unknown, _cb: unknown) => {
      process.nextTick(() => req1.emit('error', new Error('some random error')));
      return req1;
    });

    const promise = client.request({ method: 'GET', url: 'http://localhost/fail' });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/HTTP request failed/);
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 20. maxRetries: 0 disables retries
  // -----------------------------------------------------------------------
  it('does not retry when maxRetries is 0', async () => {
    setupMockRequest(http, 502, 'bad gateway');

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/no-retry',
      maxRetries: 0,
    });
    // jest.runAllTimers();

    await expect(promise).rejects.toThrow(/HTTP 502/);
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 21. Custom headers are forwarded
  // -----------------------------------------------------------------------
  it('forwards custom headers along with default Accept header', async () => {
    setupMockRequest(http, 200, '{}');

    const promise = client.request({
      method: 'GET',
      url: 'http://localhost/custom',
      headers: { 'X-Custom': 'value123' },
    });
    // jest.runAllTimers();
    await promise;

    const callArgs = (http.request as jest.Mock).mock.calls[0][0];
    expect(callArgs.headers['Accept']).toBe('application/json');
    expect(callArgs.headers['X-Custom']).toBe('value123');
  });

  // -----------------------------------------------------------------------
  // 22. Response headers are returned
  // -----------------------------------------------------------------------
  it('includes response headers in the result', async () => {
    const resHeaders = { 'x-request-id': 'abc-123' };
    setupMockRequest(http, 200, '{}', resHeaders);

    const promise = client.request({ method: 'GET', url: 'http://localhost/headers' });
    // jest.runAllTimers();
    const resp = await promise;

    expect(resp.headers).toEqual(expect.objectContaining({ 'x-request-id': 'abc-123' }));
  });

  // -----------------------------------------------------------------------
  // 23. Retry on 504 Gateway Timeout
  // -----------------------------------------------------------------------
  it('retries on 504 Gateway Timeout', async () => {
    setupMockRequest(http, 504, 'gateway timeout');
    setupMockRequest(http, 200, JSON.stringify({ ok: true }));

    const promise = client.request({ method: 'GET', url: 'http://localhost/timeout-retry' });

    for (let i = 0; i < 10; i++) {
      // jest.runAllTimers();
      await Promise.resolve();
    }

    const resp = await promise;
    expect(resp.status).toBe(200);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 24. GET request does not set Content-Type
  // -----------------------------------------------------------------------
  it('does not set Content-Type header when there is no body', async () => {
    setupMockRequest(http, 200, '{}');

    const promise = client.request({ method: 'GET', url: 'http://localhost/nobody' });
    // jest.runAllTimers();
    await promise;

    const callArgs = (http.request as jest.Mock).mock.calls[0][0];
    expect(callArgs.headers['Content-Type']).toBeUndefined();
    expect(callArgs.headers['Content-Length']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildAuthFromDatasource
// ---------------------------------------------------------------------------

describe('buildAuthFromDatasource', () => {
  it('returns undefined when datasource has no auth', () => {
    const ds: Datasource = {
      id: 'ds-1',
      name: 'Test',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
    };
    expect(buildAuthFromDatasource(ds)).toBeUndefined();
  });

  it('returns username/password for basic auth with credentials', () => {
    const ds: Datasource = {
      id: 'ds-1',
      name: 'Test',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
      auth: {
        type: 'basic',
        credentials: { username: 'admin', password: 'admin123' },
      },
    };
    expect(buildAuthFromDatasource(ds)).toEqual({
      username: 'admin',
      password: 'admin123',
    });
  });

  it('returns empty strings when credentials fields are missing', () => {
    const ds: Datasource = {
      id: 'ds-1',
      name: 'Test',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
      auth: {
        type: 'basic',
        credentials: {},
      },
    };
    expect(buildAuthFromDatasource(ds)).toEqual({
      username: '',
      password: '',
    });
  });

  it('returns undefined for non-basic auth types', () => {
    const ds: Datasource = {
      id: 'ds-1',
      name: 'Test',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
      auth: {
        type: 'sigv4',
        credentials: { region: 'us-east-1' },
      },
    };
    expect(buildAuthFromDatasource(ds)).toBeUndefined();
  });

  it('returns undefined when basic auth has no credentials object', () => {
    const ds: Datasource = {
      id: 'ds-1',
      name: 'Test',
      type: 'opensearch',
      url: 'http://localhost:9200',
      enabled: true,
      auth: {
        type: 'basic',
      },
    };
    expect(buildAuthFromDatasource(ds)).toBeUndefined();
  });
});
