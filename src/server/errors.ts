/**
 * Maps engine errors to HTTP status codes and response bodies.
 *
 * Switches on NomicEngineError.code rather than message strings so this
 * mapping remains stable if error messages are ever reworded.
 */

import { NomicEngineError } from '../core/types.js';

export interface HttpError {
  status: number;
  error: string;
}

export function toHttpError(err: unknown): HttpError {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof NomicEngineError) {
    switch (err.code) {
      case 'NOT_FOUND':
        return { status: 404, error: message };
      case 'ALREADY_VOTED':
      case 'PROPOSAL_RESOLVED':
      case 'PROPOSAL_LIMIT':
      case 'PERMISSION_DENIED':
        return { status: 409, error: message };
      case 'INVALID_STATE':
      case 'PLAYER_INACTIVE':
        return { status: 400, error: message };
      case 'RULE_EXECUTION_FAILED':
        return { status: 422, error: message };
    }
  }

  return { status: 500, error: message };
}
