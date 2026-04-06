/**
 * Unit tests for the Express app factory (Ticket 01 — Server bootstrap).
 *
 * Tests that the app factory produces a valid Express app that responds
 * correctly to GET /state with a minimal injected engine.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { NomicEngine } from '../core/engine.js';
import type { GameState } from '../core/types.js';

// ---------------------------------------------------------------------------
// Minimal engine stub
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game-id',
    status: 'setup',
    players: [],
    rules: [],
    proposals: [],
    voting: { activeProposals: [], resolvedProposals: [] },
    turns: {
      currentTurn: 0,
      currentPlayerId: null,
      turnOrder: [],
      history: [],
    },
    points: new Map(),
    history: [],
    events: [],
    ...overrides,
  } as unknown as GameState;
}

function makeEngineStub(state: GameState): NomicEngine {
  return {
    getState: vi.fn(() => state),
  } as unknown as NomicEngine;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createApp', () => {
  describe('GET /state', () => {
    it('returns 200 with the engine state as JSON', async () => {
      const state = makeMinimalState();
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/state');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('includes the gameId from the injected engine state', async () => {
      const state = makeMinimalState({ gameId: 'unique-game-xyz' });
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/state');

      expect(res.status).toBe(200);
      expect(res.body.gameId).toBe('unique-game-xyz');
    });

    it('includes the game status from the injected engine state', async () => {
      const state = makeMinimalState({ status: 'active' });
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/state');

      expect(res.body.status).toBe('active');
    });

    it('calls engine.getState() on each request', async () => {
      const state = makeMinimalState();
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      await request(app).get('/state');
      await request(app).get('/state');

      expect(engine.getState).toHaveBeenCalledTimes(2);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for an unregistered route', async () => {
      const engine = makeEngineStub(makeMinimalState());
      const app = createApp(engine);

      const res = await request(app).get('/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
