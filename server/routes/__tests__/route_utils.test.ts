/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { toHandlerResult } from '../route_utils';
import { createNotFoundError, createValidationError, createInternalError } from '../../../common';

describe('toHandlerResult', () => {
  it('returns 404 for NotFoundError', () => {
    const result = toHandlerResult(createNotFoundError('SLO not found', 'slo-123'));
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: 'SLO not found' });
  });

  it('returns 400 for ValidationError', () => {
    const result = toHandlerResult(createValidationError('Name is required', 'name'));
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'Name is required' });
  });

  it('masks internal error messages', () => {
    const result = toHandlerResult(
      createInternalError('DB connection string: postgres://secret@host')
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'An internal error occurred' });
  });

  it('returns 500 for null/undefined thrown', () => {
    expect(toHandlerResult(null).status).toBe(500);
    expect(toHandlerResult(undefined).status).toBe(500);
  });

  it('classifies "not found" messages as 404', () => {
    const result = toHandlerResult(new Error('Resource not found'));
    expect(result.status).toBe(404);
  });

  it('classifies "validation" messages as 400', () => {
    const result = toHandlerResult(new Error('Validation failed: name required'));
    expect(result.status).toBe(400);
  });

  it('masks unclassified errors as 500', () => {
    const result = toHandlerResult(new Error('ECONNREFUSED'));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'An internal error occurred' });
  });

  it('logs error when logger is provided', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    toHandlerResult(new Error('test error'), logger);
    expect(logger.error).toHaveBeenCalledWith('test error');
  });

  it('logs AlertManagerError when logger provided', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    toHandlerResult(createNotFoundError('missing'), logger);
    expect(logger.error).toHaveBeenCalledWith('missing');
  });
});
