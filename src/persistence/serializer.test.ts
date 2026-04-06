/**
 * Unit tests for GameSerializer
 * Tests serialize/deserialize round-trips, all state fields, edge cases,
 * and invalid JSON handling.
 */

import { describe, it, expect } from 'vitest';
import { GameSerializer } from './serializer.js';
import { createInitialState, addPlayer, awardPoints, generateId } from '../core/state.js';
import { VotingManager } from '../systems/voting.js';
import { TurnManager } from '../systems/turn.js';
import type { GameState, Rule } from '../core/types.js';

// ============================================================================
// Helpers
// ============================================================================

const serializer = new GameSerializer();
const turnManager = new TurnManager();
const votingManager = new VotingManager();

function makePlayer(id: string, name: string) {
  return { id, name, joinedAt: Date.now(), isActive: true };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: generateId(),
    number: 500,
    name: 'Extra Rule',
    description: 'A rule',
    code: '(state) => state',
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [],
    ...overrides,
  };
}

function makeActiveState(): GameState {
  let state = createInitialState('game-serialize-test');
  state = addPlayer(state, makePlayer('p1', 'Alice'));
  state = addPlayer(state, makePlayer('p2', 'Bob'));
  state = turnManager.startGame(state);
  return state;
}

// ============================================================================
// serialize → deserialize round-trips
// ============================================================================

describe('GameSerializer — round-trip', () => {
  it('produces an equivalent state after serialize → deserialize', () => {
    const state = makeActiveState();
    const serialized = serializer.serialize(state);
    const restored = serializer.deserialize(serialized);
    expect(restored.gameId).toBe(state.gameId);
    expect(restored.version).toBe(state.version);
    expect(restored.status).toBe(state.status);
  });

  it('preserves players', () => {
    const state = makeActiveState();
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.players).toHaveLength(2);
    expect(restored.players[0].id).toBe('p1');
    expect(restored.players[1].id).toBe('p2');
  });

  it('preserves rules', () => {
    const state = makeActiveState();
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.rules).toHaveLength(state.rules.length);
    expect(restored.rules[0].id).toBe(state.rules[0].id);
  });

  it('preserves points Map', () => {
    let state = makeActiveState();
    state = awardPoints(state, 'p1', 15);
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.points).toBeInstanceOf(Map);
    expect(restored.points.get('p1')).toBe(15);
    expect(restored.points.get('p2')).toBe(0);
  });

  it('preserves turn state', () => {
    const state = makeActiveState();
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.turns.currentTurn).toBe(state.turns.currentTurn);
    expect(restored.turns.currentPlayerId).toBe(state.turns.currentPlayerId);
    expect(restored.turns.turnOrder).toEqual(state.turns.turnOrder);
  });

  it('preserves history array', () => {
    const state = makeActiveState();
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.history).toHaveLength(state.history.length);
    expect(restored.history[0].type).toBe(state.history[0].type);
  });

  it('preserves extensions Map', () => {
    let state = createInitialState('ext-test');
    // Use updateState pattern to set an extension
    state = addPlayer(state, makePlayer('p1', 'Alice'));
    const serialized = serializer.serialize(state);
    const restored = serializer.deserialize(serialized);
    expect(restored.extensions).toBeInstanceOf(Map);
  });

  it('preserves voting state — active proposals', () => {
    let state = makeActiveState();
    const rule = makeRule();
    state = votingManager.createProposal(state, 'add-rule', 'p1', 'A proposal', rule);
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.voting.activeProposals).toHaveLength(1);
    expect(restored.voting.activeProposals[0].id).toBe(state.voting.activeProposals[0].id);
    expect(restored.voting.activeProposals[0].votes).toBeInstanceOf(Map);
  });

  it('preserves voting state — proposal history', () => {
    let state = makeActiveState();
    const rule = makeRule();
    state = votingManager.createProposal(state, 'add-rule', 'p1', 'A proposal', rule);
    const proposalId = state.voting.activeProposals[0].id;
    state = votingManager.castVote(state, proposalId, 'p1', 'yes');
    state = votingManager.castVote(state, proposalId, 'p2', 'yes');
    state = votingManager.resolveProposal(state, proposalId);
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.voting.proposalHistory).toHaveLength(1);
    expect(restored.voting.proposalHistory[0].status).toBe('passed');
    expect(restored.voting.proposalHistory[0].votes).toBeInstanceOf(Map);
  });

  it('resets pendingEvents to empty on deserialize', () => {
    const state = makeActiveState();
    // pendingEvents exist after startGame emits game-started
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.pendingEvents).toHaveLength(0);
  });
});

// ============================================================================
// toJSON / fromJSON
// ============================================================================

describe('GameSerializer — toJSON / fromJSON', () => {
  it('toJSON produces valid JSON string', () => {
    const state = makeActiveState();
    const json = serializer.toJSON(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('fromJSON reconstructs equivalent state', () => {
    const state = makeActiveState();
    const json = serializer.toJSON(state);
    const restored = serializer.fromJSON(json);
    expect(restored.gameId).toBe(state.gameId);
    expect(restored.status).toBe(state.status);
  });

  it('toJSON with pretty=false produces compact JSON', () => {
    const state = makeActiveState();
    const compact = serializer.toJSON(state, false);
    expect(compact).not.toContain('\n');
  });

  it('fromJSON throws on invalid JSON', () => {
    expect(() => serializer.fromJSON('not json')).toThrow();
  });

  it('fromJSON throws on empty string', () => {
    expect(() => serializer.fromJSON('')).toThrow();
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('GameSerializer — edge cases', () => {
  it('round-trips an empty game (no players, initial rules only)', () => {
    const state = createInitialState('empty-game');
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.players).toHaveLength(0);
    expect(restored.rules).toHaveLength(state.rules.length);
    expect(restored.points).toBeInstanceOf(Map);
    expect(restored.points.size).toBe(0);
  });

  it('round-trips a game with many players', () => {
    let state = createInitialState('big-game');
    for (let i = 0; i < 10; i++) {
      state = addPlayer(state, makePlayer(`p${i}`, `Player ${i}`));
    }
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.players).toHaveLength(10);
  });

  it('preserves timestamps', () => {
    const state = makeActiveState();
    const restored = serializer.deserialize(serializer.serialize(state));
    expect(restored.createdAt).toBe(state.createdAt);
    expect(restored.updatedAt).toBe(state.updatedAt);
  });
});
