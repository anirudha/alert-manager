/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zero-dependency HTTP client wrapping Node.js built-in http/https modules.
 * Handles basic auth, self-signed TLS certs, timeouts, and JSON parsing.
 */
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Datasource, Logger } from './types';

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  body?: any;
  headers?: Record<string, string>;
  auth?: { username: string; password: string };
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
}

export interface HttpResponse<T = any> {
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
  constructor(private readonly logger: Logger) {}

  async request<T = any>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
    const url = new URL(opts.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...opts.headers,
    };

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
      ...(isHttps ? { rejectUnauthorized: opts.rejectUnauthorized ?? true } : {}),
    };

    return new Promise<HttpResponse<T>>((resolve, reject) => {
      const req = lib.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          let body: any;
          try {
            body = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            body = raw;
          }

          this.logger.debug(`[HTTP] ${opts.method} ${opts.url} -> ${status}`);

          if (status >= 200 && status < 300) {
            resolve({ status, body, headers: res.headers as any });
          } else {
            const msg = typeof body === 'object' ? JSON.stringify(body) : body;
            reject(new Error(`HTTP ${status} from ${opts.method} ${opts.url}: ${msg}`));
          }
        });
      });

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
}
