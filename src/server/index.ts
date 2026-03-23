/**
 * HTTP game server factory.
 *
 * createApp() accepts an engine + saveFile so it can be instantiated
 * in tests without touching the filesystem.
 */

import express from 'express';
import type { NomicEngine } from '../core/engine.js';
import { applyMiddleware, errorHandler } from './middleware.js';
import { createRoutes } from './routes.js';

export function createApp(engine: NomicEngine, saveFile: string): express.Application {
  const app = express();
  applyMiddleware(app);
  app.use('/', createRoutes(engine, saveFile));
  app.use(errorHandler);
  return app;
}
