/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAlertManagerError, errorToStatus } from '../../common';
import type { Logger } from '../../common/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerResult = { status: number; body: Record<string, any> };

/**
 * Convert any caught error into a framework-agnostic handler result.
 * Uses the typed error system (AlertManagerError) when available,
 * falls back to message-based classification for legacy errors.
 */
export function toHandlerResult(e: unknown, logger?: Logger): HandlerResult {
  if (isAlertManagerError(e)) {
    return { status: errorToStatus(e), body: { error: e.message } };
  }
  // Guard against null/undefined being thrown — String(null) → "null" is unhelpful
  if (e == null) {
    if (logger) logger.error('Unknown error (null/undefined thrown)');
    return { status: 500, body: { error: 'An internal error occurred' } };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (logger) logger.error(msg);
  if (msg.toLowerCase().includes('not found')) {
    return { status: 404, body: { error: msg } };
  }
  if (
    msg.toLowerCase().includes('validation') ||
    msg.includes('required') ||
    msg.includes('must be')
  ) {
    return { status: 400, body: { error: msg } };
  }
  return { status: 500, body: { error: 'An internal error occurred' } };
}
