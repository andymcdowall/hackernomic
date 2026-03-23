/**
 * Maps engine errors to HTTP status codes and response bodies.
 */

export interface HttpError {
  status: number;
  error: string;
}

export function toHttpError(err: unknown): HttpError {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('not found') || message.includes('Not found')) {
    return { status: 404, error: message };
  }

  if (
    message.includes('already voted') ||
    message.includes('already') ||
    message.includes('cannot vote') ||
    message.includes('Only one proposal per turn')
  ) {
    return { status: 409, error: message };
  }

  if (
    message.includes('only be added during setup') ||
    message.includes('already initialized') ||
    message.includes('Cannot') ||
    message.includes('invalid') ||
    message.includes('Invalid') ||
    message.includes('No active turn') ||
    message.includes('is not active')
  ) {
    return { status: 400, error: message };
  }

  if (message.includes('Rule execution failed')) {
    return { status: 422, error: message };
  }

  return { status: 500, error: message };
}
