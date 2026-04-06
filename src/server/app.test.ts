/**
 * Unit tests for the Express app factory.
 *
 * Covers: GET /state (Ticket 01), GET /rules and GET /proposals (Ticket 02).
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { NomicEngine } from '../core/engine.js';
import type { GameState, Proposal, Rule } from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game-id',
    status: 'setup',
    players: [],
    rules: [],
    voting: { activeProposals: [], proposalHistory: [] },
    turns: {
      currentTurn: 0,
      currentPlayerId: null,
      turnOrder: [],
      turnHistory: [],
      turnStartedAt: null,
    },
    points: new Map(),
    history: [],
    pendingEvents: [],
    extensions: new Map(),
    ...overrides,
  } as unknown as GameState;
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    number: 101,
    name: 'Test Rule',
    description: 'A test rule',
    code: 'function rule(state) { return state; }',
    isActive: true,
    isMutable: true,
    proposedBy: 'player-1',
    createdAt: 0,
    triggers: [],
    ...overrides,
  } as unknown as Rule;
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal-1',
    type: 'add-rule',
    proposedBy: 'player-1',
    proposedAt: 0,
    description: 'A test proposal',
    votes: new Map(),
    status: 'pending',
    resolvedAt: null,
    ...overrides,
  } as unknown as Proposal;
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

  // --------------------------------------------------------------------------
  // GET /rules
  // --------------------------------------------------------------------------

  describe('GET /rules', () => {
    it('returns 200 with JSON content-type', async () => {
      const engine = makeEngineStub(makeMinimalState());
      const app = createApp(engine);

      const res = await request(app).get('/rules');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('returns an empty array when there are no rules', async () => {
      const engine = makeEngineStub(makeMinimalState({ rules: [] }));
      const app = createApp(engine);

      const res = await request(app).get('/rules');

      expect(res.body).toEqual([]);
    });

    it('returns all rules from the engine state', async () => {
      const rules = [makeRule({ id: 'r1', number: 101 }), makeRule({ id: 'r2', number: 102 })];
      const engine = makeEngineStub(makeMinimalState({ rules }));
      const app = createApp(engine);

      const res = await request(app).get('/rules');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('r1');
      expect(res.body[1].id).toBe('r2');
    });

    it('calls engine.getState() on each request', async () => {
      const engine = makeEngineStub(makeMinimalState());
      const app = createApp(engine);

      await request(app).get('/rules');
      await request(app).get('/rules');

      expect(engine.getState).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // GET /proposals
  // --------------------------------------------------------------------------

  describe('GET /proposals', () => {
    it('returns 200 with JSON content-type', async () => {
      const engine = makeEngineStub(makeMinimalState());
      const app = createApp(engine);

      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('returns an empty array when there are no active proposals', async () => {
      const engine = makeEngineStub(
        makeMinimalState({ voting: { activeProposals: [], proposalHistory: [] } as never }),
      );
      const app = createApp(engine);

      const res = await request(app).get('/proposals');

      expect(res.body).toEqual([]);
    });

    it('returns only active (pending) proposals', async () => {
      const active = makeProposal({ id: 'p-active', status: 'pending' });
      const state = makeMinimalState({
        voting: {
          activeProposals: [active],
          proposalHistory: [makeProposal({ id: 'p-passed', status: 'passed' })],
        } as never,
      });
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('p-active');
    });

    it('does not include resolved proposals from history', async () => {
      const state = makeMinimalState({
        voting: {
          activeProposals: [],
          proposalHistory: [
            makeProposal({ id: 'p-passed', status: 'passed' }),
            makeProposal({ id: 'p-failed', status: 'failed' }),
          ],
        } as never,
      });
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/proposals');

      expect(res.body).toEqual([]);
    });

    it('returns multiple active proposals when all are pending', async () => {
      const proposals = [
        makeProposal({ id: 'p1', status: 'pending' }),
        makeProposal({ id: 'p2', status: 'pending' }),
      ];
      const state = makeMinimalState({
        voting: { activeProposals: proposals, proposalHistory: [] } as never,
      });
      const engine = makeEngineStub(state);
      const app = createApp(engine);

      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });
});
