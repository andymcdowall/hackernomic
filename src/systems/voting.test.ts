/**
 * Unit tests for VotingManager
 * Tests proposal creation, vote casting, resolution logic, and event emission.
 * Note: VotingManager emits a `proposal-passed` event on adoption; point awards
 * are handled downstream by Rule 4 via the event dispatcher.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VotingManager } from './voting.js';
import { TurnManager } from './turn.js';
import { createInitialState, generateId, updateState, addPlayer } from '../core/state.js';
import type { GameState, Player, Rule, VotingRules } from '../core/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: generateId(),
    name: 'Test Player',
    joinedAt: Date.now(),
    isActive: true,
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: generateId(),
    number: 200,
    name: 'Test Rule',
    description: 'A test rule',
    code: '(state) => state',
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [{ type: 'never' }],
    ...overrides,
  };
}

const turnManager = new TurnManager();

/**
 * Create an active game state with the given players.
 *
 * With 2+ players, uses TurnManager.startGame() — the proper API — which sets
 * status, turnStartedAt, and turn order in one step.
 *
 * With 1 player (only used in error-path tests where turn state doesn't matter),
 * falls back to an `as any` cast because startGame() requires ≥2 active players.
 */
function makeActiveState(...players: Player[]): GameState {
  let state = createInitialState('test-game');
  for (const player of players) {
    state = addPlayer(state, player);
  }
  if (players.filter(p => p.isActive).length >= 2) {
    return turnManager.startGame(state);
  }
  // Single-player fallback for error-condition tests only.
  return updateState(state, draft => {
    (draft as any).status = 'active';
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('VotingManager', () => {
  let manager: VotingManager;

  beforeEach(() => {
    manager = new VotingManager();
  });

  // --------------------------------------------------------------------------
  // createProposal
  // --------------------------------------------------------------------------

  describe('createProposal', () => {
    it('creates an add-rule proposal in the active proposals list', () => {
      const player = makePlayer();
      const state = makeActiveState(player);
      const rule = makeRule({ proposedBy: player.id });

      const next = manager.createProposal(state, 'add-rule', player.id, 'Add rule 200', rule);

      expect(next.voting.activeProposals).toHaveLength(1);
      const proposal = next.voting.activeProposals[0];
      expect(proposal.type).toBe('add-rule');
      expect(proposal.proposedBy).toBe(player.id);
      expect(proposal.description).toBe('Add rule 200');
      expect(proposal.status).toBe('pending');
      expect(proposal.rule?.id).toBe(rule.id);
    });

    it('creates a modify-rule proposal', () => {
      const player = makePlayer();
      const state = makeActiveState(player);
      const rule = makeRule({ proposedBy: player.id });

      const next = manager.createProposal(state, 'modify-rule', player.id, 'Modify rule', rule);

      expect(next.voting.activeProposals[0].type).toBe('modify-rule');
    });

    it('creates a remove-rule proposal', () => {
      const player = makePlayer();
      const state = makeActiveState(player);
      const rule = makeRule({ proposedBy: player.id });

      const next = manager.createProposal(state, 'remove-rule', player.id, 'Remove rule', rule);

      expect(next.voting.activeProposals[0].type).toBe('remove-rule');
    });

    it('throws if game status is not active', () => {
      const player = makePlayer();
      let state = createInitialState('test-game');
      state = addPlayer(state, player);
      // status is 'setup' by default

      expect(() =>
        manager.createProposal(state, 'add-rule', player.id, 'desc')
      ).toThrow('Cannot create proposals during setup or when game is complete');
    });

    it('throws if proposer player does not exist', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() =>
        manager.createProposal(state, 'add-rule', 'nonexistent-id', 'desc')
      ).toThrow('not found');
    });

    it('throws if proposer is inactive', () => {
      const player = makePlayer({ isActive: false });
      const state = makeActiveState(player);

      expect(() =>
        manager.createProposal(state, 'add-rule', player.id, 'desc')
      ).toThrow('not active');
    });

    it('enforces Rule 2: only one proposal per turn', () => {
      // Use a second player so makeActiveState calls TurnManager.startGame(),
      // which sets turnStartedAt — no manual patching needed.
      const [player, other] = [makePlayer(), makePlayer()];
      const state = makeActiveState(player, other);
      const rule = makeRule();

      const afterFirst = manager.createProposal(state, 'add-rule', player.id, 'First proposal', rule);

      expect(() =>
        manager.createProposal(afterFirst, 'add-rule', player.id, 'Second proposal', rule)
      ).toThrow('Rule 2: Only one proposal per turn is allowed');
    });

    it('add-rule does not require a rule argument', () => {
      // Only modify-rule and remove-rule require a rule; add-rule intentionally
      // does not (the rule to add can be supplied later or inferred by context).
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() =>
        manager.createProposal(state, 'add-rule', player.id, 'desc')
      ).not.toThrow();
    });

    it('throws if modify-rule is missing a rule', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() =>
        manager.createProposal(state, 'modify-rule', player.id, 'desc')
      ).toThrow('Rule is required for modify-rule proposals');
    });

    it('throws if remove-rule is missing a rule', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() =>
        manager.createProposal(state, 'remove-rule', player.id, 'desc')
      ).toThrow('Rule is required for remove-rule proposals');
    });

    it('emits a proposal-created pending event', () => {
      const player = makePlayer();
      const state = makeActiveState(player);
      const rule = makeRule();

      const next = manager.createProposal(state, 'add-rule', player.id, 'desc', rule);

      const event = next.pendingEvents.find(e => e.type === 'proposal-created');
      expect(event).toBeDefined();
      expect(event?.actorId).toBe(player.id);
    });

    it('does not mutate the original state', () => {
      const player = makePlayer();
      const state = makeActiveState(player);
      const rule = makeRule();

      const originalProposalCount = state.voting.activeProposals.length;
      manager.createProposal(state, 'add-rule', player.id, 'desc', rule);

      expect(state.voting.activeProposals.length).toBe(originalProposalCount);
    });
  });

  // --------------------------------------------------------------------------
  // castVote
  // --------------------------------------------------------------------------

  describe('castVote', () => {
    // players[0] is always the proposer in this helper.
    function stateWithProposal(players: Player[]) {
      const state = makeActiveState(...players);
      const rule = makeRule();
      return manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
    }

    it('records a yes vote', () => {
      const players = [makePlayer(), makePlayer()];
      let state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[1].id, 'yes');

      const proposal = state.voting.activeProposals[0];
      expect(proposal.votes.get(players[1].id)?.value).toBe('yes');
    });

    it('records a no vote', () => {
      const players = [makePlayer(), makePlayer()];
      let state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[1].id, 'no');

      expect(state.voting.activeProposals[0].votes.get(players[1].id)?.value).toBe('no');
    });

    it('records an abstain vote', () => {
      const players = [makePlayer(), makePlayer()];
      let state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[1].id, 'abstain');

      expect(state.voting.activeProposals[0].votes.get(players[1].id)?.value).toBe('abstain');
    });

    it('throws if proposal does not exist', () => {
      const players = [makePlayer()];
      const state = stateWithProposal(players);

      expect(() => manager.castVote(state, 'bad-id', players[0].id, 'yes')).toThrow(
        'not found'
      );
    });

    it('throws if voter does not exist', () => {
      const players = [makePlayer()];
      const state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      expect(() =>
        manager.castVote(state, proposalId, 'nonexistent-player', 'yes')
      ).toThrow('not found');
    });

    it('throws if voter is inactive', () => {
      const active = makePlayer();
      const inactive = makePlayer({ isActive: false });
      let state = makeActiveState(active, inactive);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', active.id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      expect(() =>
        manager.castVote(state, proposalId, inactive.id, 'yes')
      ).toThrow('not active');
    });

    it('prevents duplicate votes from the same player', () => {
      const players = [makePlayer(), makePlayer()];
      let state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[1].id, 'yes');

      expect(() =>
        manager.castVote(state, proposalId, players[1].id, 'no')
      ).toThrow('already voted');
    });

    it('throws if proposal has been resolved and moved to history', () => {
      // Once resolved, the proposal is removed from activeProposals and moved to
      // proposalHistory, so castVote throws 'not found' (not 'not pending').
      // The 'not pending' guard in castVote only applies to proposals that somehow
      // remain in activeProposals with a non-pending status, which the current
      // model does not allow through normal code paths.
      const players = [makePlayer(), makePlayer()];
      let state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'yes');
      state = manager.resolveProposal(state, proposalId);

      expect(() =>
        manager.castVote(state, proposalId, players[0].id, 'yes')
      ).toThrow('not found');
    });

    it('emits a vote-cast pending event', () => {
      const players = [makePlayer(), makePlayer()];
      const state = stateWithProposal(players);
      const proposalId = state.voting.activeProposals[0].id;

      const next = manager.castVote(state, proposalId, players[1].id, 'yes');
      const event = next.pendingEvents.find(e => e.type === 'vote-cast');
      expect(event).toBeDefined();
      expect(event?.actorId).toBe(players[1].id);
    });
  });

  // --------------------------------------------------------------------------
  // canResolve
  // --------------------------------------------------------------------------

  describe('canResolve', () => {
    it('returns false when not all players have voted (requireAllVotes=true)', () => {
      const players = [makePlayer(), makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[0].id, 'yes');

      expect(manager.canResolve(state, proposalId)).toBe(false);
    });

    it('returns true when all players have voted', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'no');

      expect(manager.canResolve(state, proposalId)).toBe(true);
    });

    it('returns true when all players have voted including abstains', () => {
      // Abstain counts as a cast vote; once all players have voted canResolve is true
      const players = [makePlayer(), makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'abstain');
      state = manager.castVote(state, proposalId, players[2].id, 'abstain');

      expect(manager.canResolve(state, proposalId)).toBe(true);
    });

    it('requireAllVotes=false currently behaves the same as requireAllVotes=true', () => {
      // The source notes "For now, keep it simple: require all votes" even when
      // requireAllVotes is false. This test enshrines that current behavior.
      const players = [makePlayer(), makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      // Only one of three players has voted
      state = manager.castVote(state, proposalId, players[0].id, 'yes');

      const partialVotesRules: VotingRules = { threshold: 0.5, requireAllVotes: false };
      expect(manager.canResolve(state, proposalId, partialVotesRules)).toBe(false);
    });

    it('returns false for a non-existent proposal', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(manager.canResolve(state, 'bad-id')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // resolveProposal
  // --------------------------------------------------------------------------

  describe('resolveProposal', () => {
    function fullyVotedState(
      players: Player[],
      votes: ('yes' | 'no' | 'abstain')[],
      rule?: Rule
    ) {
      let state = makeActiveState(...players);
      const r = rule ?? makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', r);
      const proposalId = state.voting.activeProposals[0].id;
      for (let i = 0; i < players.length; i++) {
        state = manager.castVote(state, proposalId, players[i].id, votes[i]);
      }
      return { state, proposalId, rule: r };
    }

    it('moves a passed proposal to history', () => {
      const players = [makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes']);

      const next = manager.resolveProposal(preResolve, proposalId);

      expect(next.voting.activeProposals).toHaveLength(0);
      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('passed');
    });

    it('moves a failed proposal to history', () => {
      const players = [makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['no', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId);

      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('failed');
    });

    it('majority logic: passes with more yes than no and yes >= threshold', () => {
      // 3 players, 2 yes, 1 no — should pass (2 >= ceil(3*0.5)=2 and 2>1)
      const players = [makePlayer(), makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId);

      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('passed');
    });

    it('majority logic: fails when yes count equals no count', () => {
      // 2 players, 1 yes, 1 no — 1 >= ceil(2*0.5)=1 but 1 > 1 is false
      const players = [makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId);

      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('failed');
    });

    it('abstain votes do not count as yes', () => {
      const players = [makePlayer(), makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, [
        'yes',
        'abstain',
        'abstain',
      ]);

      const next = manager.resolveProposal(preResolve, proposalId);

      // 1 yes, 0 no, 2 abstain: ceil(3*0.5)=2, 1 >= 2 is false → fails
      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('failed');
    });

    it('configurable threshold: supermajority (0.66)', () => {
      const customRules: VotingRules = { threshold: 0.66, requireAllVotes: true };
      const players = [makePlayer(), makePlayer(), makePlayer()];
      // 2 yes, 1 no: ceil(3*0.66)=2, 2 >= 2 and 2 > 1 → passes
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId, customRules);

      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('passed');
    });

    it('configurable threshold: supermajority fails if not enough yes votes', () => {
      const customRules: VotingRules = { threshold: 0.75, requireAllVotes: true };
      // 3 players, 2 yes: ceil(3*0.75)=3, 2 >= 3 is false → fails
      const players = [makePlayer(), makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId, customRules);

      const resolved = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(resolved?.status).toBe('failed');
    });

    it('throws if not all votes are in', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');

      expect(() => manager.resolveProposal(state, proposalId)).toThrow(
        'Not all required votes have been cast'
      );
    });

    it('throws if proposal does not exist', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() => manager.resolveProposal(state, 'bad-id')).toThrow('not found');
    });

    it('throws if proposal is already resolved', () => {
      const players = [makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes']);

      const next = manager.resolveProposal(preResolve, proposalId);

      expect(() => manager.resolveProposal(next, proposalId)).toThrow('not found');
    });

    it('applies an add-rule proposal by adding the rule to state', () => {
      const players = [makePlayer(), makePlayer()];
      const rule = makeRule({ number: 200 });
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes'], rule);

      const next = manager.resolveProposal(preResolve, proposalId);

      const addedRule = next.rules.find(r => r.id === rule.id);
      expect(addedRule).toBeDefined();
      expect(addedRule?.isActive).toBe(true);
    });

    it('applies a modify-rule proposal by replacing the rule', () => {
      const players = [makePlayer(), makePlayer()];
      const originalRule = makeRule({ number: 200 });
      let state = makeActiveState(...players);
      // Add the rule to state first
      state = updateState(state, draft => {
        (draft.rules as Rule[]).push(originalRule);
      });
      // Propose modification
      const modifiedRule = { ...originalRule, name: 'Modified Name' };
      state = manager.createProposal(state, 'modify-rule', players[0].id, 'Modify', modifiedRule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'yes');

      const next = manager.resolveProposal(state, proposalId);

      const updatedRule = next.rules.find(r => r.id === originalRule.id);
      expect(updatedRule?.name).toBe('Modified Name');
    });

    it('applies a remove-rule proposal by deactivating the rule', () => {
      const players = [makePlayer(), makePlayer()];
      const rule = makeRule({ number: 200, isActive: true });
      let state = makeActiveState(...players);
      state = updateState(state, draft => {
        (draft.rules as Rule[]).push(rule);
      });
      state = manager.createProposal(state, 'remove-rule', players[0].id, 'Remove', rule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'yes');

      const next = manager.resolveProposal(state, proposalId);

      const deactivated = next.rules.find(r => r.id === rule.id);
      expect(deactivated?.isActive).toBe(false);
    });

    it('emits proposal-passed event when rule is adopted', () => {
      const players = [makePlayer(), makePlayer()];
      const rule = makeRule();
      const { state: preResolve, proposalId } = fullyVotedState(players, ['yes', 'yes'], rule);

      const next = manager.resolveProposal(preResolve, proposalId);

      const event = next.pendingEvents.find(e => e.type === 'proposal-passed');
      expect(event).toBeDefined();
    });

    it('does not emit proposal-failed event on failure (current behavior)', () => {
      // proposal-failed is a reserved system event but VotingManager does not
      // currently emit it — resolution status is recorded on the proposal object.
      const players = [makePlayer(), makePlayer()];
      const { state: preResolve, proposalId } = fullyVotedState(players, ['no', 'no']);

      const next = manager.resolveProposal(preResolve, proposalId);

      const event = next.pendingEvents.find(e => e.type === 'proposal-failed');
      expect(event).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // withdrawProposal
  // --------------------------------------------------------------------------

  describe('withdrawProposal', () => {
    it('moves a proposal to history with status withdrawn', () => {
      const player = makePlayer();
      let state = makeActiveState(player);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', player.id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      const next = manager.withdrawProposal(state, proposalId, player.id);

      expect(next.voting.activeProposals).toHaveLength(0);
      const withdrawn = next.voting.proposalHistory.find(p => p.id === proposalId);
      expect(withdrawn?.status).toBe('withdrawn');
    });

    it('does not emit proposal-withdrawn event (current behavior)', () => {
      // proposal-withdrawn is a reserved system event but VotingManager does not
      // currently emit it — withdrawal status is recorded on the proposal object.
      const player = makePlayer();
      let state = makeActiveState(player);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', player.id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      const next = manager.withdrawProposal(state, proposalId, player.id);

      const event = next.pendingEvents.find(e => e.type === 'proposal-withdrawn');
      expect(event).toBeUndefined();
    });

    it('throws if a non-proposer tries to withdraw', () => {
      const [owner, other] = [makePlayer(), makePlayer()];
      let state = makeActiveState(owner, other);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', owner.id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      expect(() => manager.withdrawProposal(state, proposalId, other.id)).toThrow(
        'Only the proposer can withdraw'
      );
    });

    it('throws if proposal does not exist', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(() => manager.withdrawProposal(state, 'bad-id', player.id)).toThrow('not found');
    });
  });

  // --------------------------------------------------------------------------
  // getActiveProposals / getProposal / getVotes / hasVoted
  // --------------------------------------------------------------------------

  describe('query helpers', () => {
    it('getActiveProposals returns current pending proposals', () => {
      const player = makePlayer();
      let state = makeActiveState(player);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', player.id, 'desc', rule);

      expect(manager.getActiveProposals(state)).toHaveLength(1);
    });

    it('getProposal finds proposals in active list', () => {
      const player = makePlayer();
      let state = makeActiveState(player);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', player.id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      expect(manager.getProposal(state, proposalId)).toBeDefined();
    });

    it('getProposal finds proposals in history', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');
      state = manager.castVote(state, proposalId, players[1].id, 'yes');
      state = manager.resolveProposal(state, proposalId);

      expect(manager.getProposal(state, proposalId)).toBeDefined();
    });

    it('getProposal returns undefined for unknown id', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(manager.getProposal(state, 'bad-id')).toBeUndefined();
    });

    it('getVotes returns undefined for an unknown proposal id', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(manager.getVotes(state, 'bad-id')).toBeUndefined();
    });

    it('getVotes returns the votes map for a proposal', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');

      const votes = manager.getVotes(state, proposalId);
      expect(votes?.get(players[0].id)?.value).toBe('yes');
    });

    it('hasVoted returns true after voting', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;
      state = manager.castVote(state, proposalId, players[0].id, 'yes');

      expect(manager.hasVoted(state, proposalId, players[0].id)).toBe(true);
    });

    it('hasVoted returns false for an unknown proposal id', () => {
      const player = makePlayer();
      const state = makeActiveState(player);

      expect(manager.hasVoted(state, 'bad-id', player.id)).toBe(false);
    });

    it('hasVoted returns false before voting', () => {
      const players = [makePlayer(), makePlayer()];
      let state = makeActiveState(...players);
      const rule = makeRule();
      state = manager.createProposal(state, 'add-rule', players[0].id, 'desc', rule);
      const proposalId = state.voting.activeProposals[0].id;

      expect(manager.hasVoted(state, proposalId, players[1].id)).toBe(false);
    });
  });
});
