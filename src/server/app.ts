/**
 * Express app factory for the Nomic HTTP game server.
 *
 * Creates and configures an Express application with the game routes.
 * Accepts a NomicEngine instance so the app can be tested in isolation.
 */

import express, { type Express } from 'express';
import type { NomicEngine } from '../core/engine.js';

/**
 * Create a configured Express app backed by the provided engine.
 */
export function createApp(engine: NomicEngine): Express {
  const app = express();

  app.use(express.json());

  // ============================================================================
  // GET /state — full game state
  // ============================================================================

  app.get('/state', (_req, res) => {
    const state = engine.getState();
    res.status(200).json(state);
  });

  // ============================================================================
  // GET /rules — all rules in the current game state
  // ============================================================================

  app.get('/rules', (_req, res) => {
    const state = engine.getState();
    res.status(200).json(state.rules);
  });

  // ============================================================================
  // GET /proposals — active (unresolved) proposals only
  //
  // "Active" means proposals whose status is 'pending'. Resolved proposals
  // (passed, failed, withdrawn) live in state.voting.proposalHistory and are
  // excluded from this endpoint.
  // ============================================================================

  app.get('/proposals', (_req, res) => {
    const state = engine.getState();
    res.status(200).json(state.voting.activeProposals);
  });

  return app;
}
