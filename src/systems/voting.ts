/**
 * Voting system
 *
 * Handles rule proposals, voting, and resolution.
 * Implements democratic decision-making for rule changes.
 */

import type {
  GameState,
  Proposal,
  ProposalType,
  Rule,
  Vote,
  VoteResult,
  VoteValue,
  VotingRules,
} from '../core/types.js';
import { addRule, awardPoints, generateId, updateState } from '../core/state.js';

// ============================================================================
// Voting Manager
// ============================================================================

export class VotingManager {
  private defaultVotingRules: VotingRules = {
    threshold: 0.5, // Simple majority (>50%)
    requireAllVotes: true, // All players must vote
  };

  /**
   * Create a new proposal
   */
  createProposal(
    state: GameState,
    type: ProposalType,
    proposedBy: string,
    description: string,
    rule?: Rule
  ): GameState {
    if (state.status !== 'active') {
      throw new Error('Cannot create proposals during setup or when game is complete');
    }

    // Verify proposer is a valid player
    const proposer = state.players.find(p => p.id === proposedBy);
    if (!proposer) {
      throw new Error(`Player ${proposedBy} not found`);
    }

    if (!proposer.isActive) {
      throw new Error(`Player ${proposedBy} is not active`);
    }

    // For modify/remove proposals, rule is required
    if ((type === 'modify-rule' || type === 'remove-rule') && !rule) {
      throw new Error(`Rule is required for ${type} proposals`);
    }

    const proposal: Proposal = {
      id: generateId(),
      type,
      proposedBy,
      proposedAt: Date.now(),
      rule,
      description,
      votes: new Map(),
      status: 'pending',
      resolvedAt: null,
    };

    return updateState(state, draft => {
      (draft.voting.activeProposals as Proposal[]).push(proposal);
      (draft.history as any[]).push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'proposal-created',
        actorId: proposedBy,
        data: {
          proposalId: proposal.id,
          type,
          description,
          ruleNumber: rule?.number,
        },
      });
    });
  }

  /**
   * Cast a vote on a proposal
   */
  castVote(
    state: GameState,
    proposalId: string,
    playerId: string,
    value: VoteValue
  ): GameState {
    const proposal = state.voting.activeProposals.find(p => p.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Proposal ${proposalId} is ${proposal.status}, cannot vote`);
    }

    // Verify voter is a valid active player
    const voter = state.players.find(p => p.id === playerId);
    if (!voter) {
      throw new Error(`Player ${playerId} not found`);
    }

    if (!voter.isActive) {
      throw new Error(`Player ${playerId} is not active and cannot vote`);
    }

    // Check if player already voted
    if (proposal.votes.has(playerId)) {
      throw new Error(`Player ${playerId} has already voted on this proposal`);
    }

    const vote: Vote = {
      playerId,
      value,
      votedAt: Date.now(),
    };

    return updateState(state, draft => {
      const proposalIndex = draft.voting.activeProposals.findIndex(
        p => p.id === proposalId
      );

      const updatedProposal = { ...draft.voting.activeProposals[proposalIndex] };
      (updatedProposal.votes as Map<string, Vote>).set(playerId, vote);

      (draft.voting.activeProposals as Proposal[])[proposalIndex] = updatedProposal;

      (draft.history as any[]).push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'vote-cast',
        actorId: playerId,
        data: { proposalId, vote: value },
      });
    });
  }

  /**
   * Check if a proposal can be resolved
   * (all required votes are in, or voting rules allow partial resolution)
   */
  canResolve(state: GameState, proposalId: string, votingRules?: VotingRules): boolean {
    const proposal = state.voting.activeProposals.find(p => p.id === proposalId);
    if (!proposal || proposal.status !== 'pending') {
      return false;
    }

    const rules = votingRules || this.defaultVotingRules;
    const activePlayers = state.players.filter(p => p.isActive);

    if (rules.requireAllVotes) {
      return proposal.votes.size === activePlayers.length;
    }

    // If not requiring all votes, can resolve once we have enough for a decision
    // For now, keep it simple: require all votes
    return proposal.votes.size === activePlayers.length;
  }

  /**
   * Resolve a proposal
   * Tallies votes and determines if the proposal passed or failed
   */
  resolveProposal(
    state: GameState,
    proposalId: string,
    votingRules?: VotingRules
  ): GameState {
    const proposal = state.voting.activeProposals.find(p => p.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Proposal ${proposalId} is already ${proposal.status}`);
    }

    const rules = votingRules || this.defaultVotingRules;
    const activePlayers = state.players.filter(p => p.isActive);

    // Check if we can resolve
    if (!this.canResolve(state, proposalId, rules)) {
      throw new Error('Not all required votes have been cast');
    }

    // Tally votes
    const result = this.tallyVotes(proposal, activePlayers.length, rules);

    let newState = state;

    // Move proposal to history
    newState = updateState(newState, draft => {
      const proposalIndex = draft.voting.activeProposals.findIndex(
        p => p.id === proposalId
      );

      const resolvedProposal: Proposal = {
        ...draft.voting.activeProposals[proposalIndex],
        status: result.passed ? 'passed' : 'failed',
        resolvedAt: Date.now(),
      };

      // Remove from active
      (draft.voting.activeProposals as Proposal[]) = draft.voting.activeProposals.filter(
        p => p.id !== proposalId
      );

      // Add to history
      (draft.voting.proposalHistory as Proposal[]).push(resolvedProposal);

      (draft.history as any[]).push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'proposal-resolved',
        actorId: 'system',
        data: {
          proposalId,
          status: result.passed ? 'passed' : 'failed',
          yesVotes: result.yesCount,
          noVotes: result.noCount,
          abstainVotes: result.abstainCount,
        },
      });
    });

    // If proposal passed, apply the change
    if (result.passed && proposal.rule) {
      newState = this.applyProposal(newState, proposal);
    }

    return newState;
  }

  /**
   * Tally votes for a proposal
   */
  private tallyVotes(
    proposal: Proposal,
    totalActivePlayers: number,
    rules: VotingRules
  ): VoteResult {
    let yesCount = 0;
    let noCount = 0;
    let abstainCount = 0;

    for (const vote of proposal.votes.values()) {
      switch (vote.value) {
        case 'yes':
          yesCount++;
          break;
        case 'no':
          noCount++;
          break;
        case 'abstain':
          abstainCount++;
          break;
      }
    }

    // Determine if passed based on threshold
    const requiredVotes = Math.ceil(totalActivePlayers * rules.threshold);
    const passed = yesCount >= requiredVotes && yesCount > noCount;

    return {
      passed,
      yesCount,
      noCount,
      abstainCount,
      totalEligibleVoters: totalActivePlayers,
    };
  }

  /**
   * Apply a passed proposal to the game state
   */
  private applyProposal(state: GameState, proposal: Proposal): GameState {
    if (!proposal.rule) {
      return state;
    }

    let newState = state;

    switch (proposal.type) {
      case 'add-rule':
        // Add new rule
        newState = addRule(newState, proposal.rule);
        // Award points to proposer (Rule 302)
        newState = awardPoints(newState, proposal.proposedBy, 10);
        break;

      case 'modify-rule':
        // Replace existing rule
        newState = updateState(newState, draft => {
          const ruleIndex = draft.rules.findIndex(r => r.id === proposal.rule!.id);
          if (ruleIndex >= 0) {
            (draft.rules as Rule[])[ruleIndex] = proposal.rule!;
          }
        });
        newState = awardPoints(newState, proposal.proposedBy, 10);
        break;

      case 'remove-rule':
        // Deactivate rule (don't actually remove it - keep history)
        newState = updateState(newState, draft => {
          const ruleIndex = draft.rules.findIndex(r => r.id === proposal.rule!.id);
          if (ruleIndex >= 0) {
            const updatedRule = { ...draft.rules[ruleIndex], isActive: false };
            (draft.rules as Rule[])[ruleIndex] = updatedRule;
          }
        });
        newState = awardPoints(newState, proposal.proposedBy, 10);
        break;
    }

    return newState;
  }

  /**
   * Withdraw a proposal (proposer cancels it)
   */
  withdrawProposal(state: GameState, proposalId: string, playerId: string): GameState {
    const proposal = state.voting.activeProposals.find(p => p.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (proposal.proposedBy !== playerId) {
      throw new Error(`Only the proposer can withdraw a proposal`);
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Cannot withdraw ${proposal.status} proposal`);
    }

    return updateState(state, draft => {
      const proposalIndex = draft.voting.activeProposals.findIndex(
        p => p.id === proposalId
      );

      const withdrawnProposal: Proposal = {
        ...draft.voting.activeProposals[proposalIndex],
        status: 'withdrawn',
        resolvedAt: Date.now(),
      };

      // Remove from active
      (draft.voting.activeProposals as Proposal[]) = draft.voting.activeProposals.filter(
        p => p.id !== proposalId
      );

      // Add to history
      (draft.voting.proposalHistory as Proposal[]).push(withdrawnProposal);

      (draft.history as any[]).push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'proposal-resolved',
        actorId: playerId,
        data: {
          proposalId,
          status: 'withdrawn',
        },
      });
    });
  }

  /**
   * Get all active proposals
   */
  getActiveProposals(state: GameState): ReadonlyArray<Proposal> {
    return state.voting.activeProposals;
  }

  /**
   * Get proposal by ID
   */
  getProposal(state: GameState, proposalId: string): Proposal | undefined {
    return (
      state.voting.activeProposals.find(p => p.id === proposalId) ||
      state.voting.proposalHistory.find(p => p.id === proposalId)
    );
  }

  /**
   * Get votes for a proposal
   */
  getVotes(state: GameState, proposalId: string): ReadonlyMap<string, Vote> | undefined {
    const proposal = this.getProposal(state, proposalId);
    return proposal?.votes;
  }

  /**
   * Check if a player has voted on a proposal
   */
  hasVoted(state: GameState, proposalId: string, playerId: string): boolean {
    const proposal = this.getProposal(state, proposalId);
    return proposal?.votes.has(playerId) || false;
  }
}
