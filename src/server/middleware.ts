/**
 * Express middleware: JSON body parsing and error handling.
 */

import type { Request, Response, NextFunction, Application } from 'express';
import express from 'express';
import { toHttpError } from './errors.js';

export function applyMiddleware(app: Application): void {
  app.use(express.json());
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { status, error } = toHttpError(err);
  res.status(status).json({ error });
}
