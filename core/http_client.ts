/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zero-dependency HTTP client wrapping Node.js built-in http/https modules.
 * Features: connection pooling, response size limits, retry with backoff,
 * request cancellation via AbortController, and configurable TLS.
 */
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Datasource, Logger } from './types';

/** Maximum response body size in bytes (50 MB). */
const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/** Maximum number of retries for transient failures. */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay for exponential backoff in ms. */
const RETRY_BASE_DELAY_MS = 500;

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: { username: string; password: string };
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  /** Maximum response body size in bytes. Defaults to 50 MB. */
  maxResponseBytes?: number;
  /** Maximum retry attempts for 5xx and network errors. Defaults to 2. */
  maxRetries?: number;
  /** AbortController signal for external cancellation. */
  signal?: AbortSignal;
}

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Extract HTTP auth config from a Datasource's auth field.
 * Shared helper so both backends and the datasource service can reuse it.
 */
export function buildAuthFromDatasource(
  ds: Datasource
): { username: string; password: string } | undefined {
  if (!ds.auth) return undefined;
  if (ds.auth.type === 'basic' && ds.auth.credentials) {
    return {
      username: ds.auth.credentials.username || '',
      password: ds.auth.credentials.password || '',
    };
  }
  return undefined;
}

export class HttpClient {
  private readonly httpsAgent: https.Agent;
  private readonly httpAgent: http.Agent;

  constructor(private readonly logger: Logger) {
    // Connection pooling with keepAlive to reuse TCP/TLS connections
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60_000,
    });
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60_000,
    });
  }

  /** Clean up connection pools. Call on server shutdown. */
  destroy(): void {
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }

  async request<T = unknown>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.doRequest<T>(opts);
      } catch (err) {
        const isRetryable = this.isRetryableError(err);
        const isLastAttempt = attempt >= maxRetries;

        if (!isRetryable || isLastAttempt) {
          throw err;
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(
          `[HTTP] Retry ${attempt + 1}/${maxRetries} for ${opts.method} ${opts.url} after ${delay}ms`
        );
        await this.sleep(delay);
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('Exhausted retries');
  }

  private async doRequest<T>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
    const url = new URL(opts.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const maxResponseBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...opts.headers,
    };

    // Only set Content-Type for requests with a body
    if (opts.body != null) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (opts.auth) {
      const encoded = Buffer.from(`${opts.auth.username}:${opts.auth.password}`).toString('base64');
      reqHeaders['Authorization'] = `Basic ${encoded}`;
    }

    const payload = opts.body != null ? JSON.stringify(opts.body) : undefined;
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const requestOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method,
      headers: reqHeaders,
      agent: isHttps ? this.httpsAgent : this.httpAgent,
      ...(isHttps ? { rejectUnauthorized: opts.rejectUnauthorized ?? true } : {}),
    };

    return new Promise<HttpResponse<T>>((resolve, reject) => {
      // Support external cancellation via AbortController
      if (opts.signal?.aborted) {
        reject(new Error(`Request aborted for ${opts.method} ${opts.url}`));
        return;
      }

      const req = lib.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxResponseBytes) {
            req.destroy();
            reject(
              new Error(
                `Response exceeded ${maxResponseBytes} bytes for ${opts.method} ${opts.url}`
              )
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          let body: unknown;
          try {
            body = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            body = raw;
          }

          this.logger.debug(`[HTTP] ${opts.method} ${opts.url} -> ${status}`);

          if (status >= 200 && status < 300) {
            resolve({ status, body: body as T, headers: res.headers as Record<string, string> });
          } else {
            reject(new HttpError(status, opts.method, opts.url, body));
          }
        });
      });

      // Handle abort signal
      if (opts.signal) {
        const onAbort = () => {
          req.destroy();
          reject(new Error(`Request aborted for ${opts.method} ${opts.url}`));
        };
        opts.signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => opts.signal?.removeEventListener('abort', onAbort));
      }

      req.on('error', (err) => {
        reject(new Error(`HTTP request failed for ${opts.method} ${opts.url}: ${err.message}`));
      });

      if (opts.timeoutMs) {
        req.setTimeout(opts.timeoutMs, () => {
          req.destroy();
          reject(
            new Error(
              `HTTP request timed out after ${opts.timeoutMs}ms for ${opts.method} ${opts.url}`
            )
          );
        });
      }

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof HttpError) {
      // Retry on 502, 503, 504 (gateway/service unavailable)
      return err.status >= 502 && err.status <= 504;
    }
    // Retry on network errors (connection reset, DNS failure, etc.)
    const msg = String(err);
    return (
      msg.includes('ECONNRESET') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('socket hang up')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Typed HTTP error with status code for retry logic. */
class HttpError extends Error {
  constructor(
    public readonly status: number,
    method: string,
    url: string,
    public readonly body: unknown
  ) {
    const msg = typeof body === 'object' ? JSON.stringify(body) : String(body);
    super(`HTTP ${status} from ${method} ${url}: ${msg}`);
    this.name = 'HttpError';
  }
}
