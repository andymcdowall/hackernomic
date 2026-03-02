/**
 * Turn management system
 *
 * Handles turn order, turn progression, and turn history.
 */

import type { Action, GameState, TurnRecord, TurnStats } from '../core/types.js';
import { emitSystemEvent, generateId, updateState } from '../core/state.js';

// ============================================================================
// Turn Manager
// ============================================================================

export class TurnManager {
  /**
   * Start the game (transition from setup to active)
   * Initializes turn order and starts first turn
   */
  startGame(state: GameState): GameState {
    if (state.status !== 'setup') {
      throw new Error(`Cannot start game in ${state.status} status`);
    }

    const activePlayers = state.players.filter(p => p.isActive);

    if (activePlayers.length < 2) {
      throw new Error('Need at least 2 active players to start the game');
    }

    // Initialize turn order (sequential by join order)
    const turnOrder = activePlayers.map(p => p.id);
    const firstPlayerId = turnOrder[0];
    const now = Date.now();

    let newState = updateState(state, draft => {
      draft.status = 'active';
      (draft.turns as any).currentTurn = 1;
      (draft.turns as any).currentPlayerId = firstPlayerId;
      (draft.turns.turnOrder as string[]) = turnOrder;
      (draft.turns as any).turnStartedAt = now;

      (draft.history as any[]).push({
        id: generateId(),
        timestamp: now,
        type: 'turn-started',
        actorId: 'system',
        data: {
          turnNumber: 1,
          playerId: firstPlayerId,
        },
      });
    });

    // Emit game-started and turn-start events
    newState = emitSystemEvent(newState, 'game-started', 'system');
    newState = emitSystemEvent(newState, 'turn-start', firstPlayerId);

    return newState;
  }

  /**
   * End the current turn and advance to the next player
   */
  endTurn(state: GameState, actions: ReadonlyArray<Action> = []): GameState {
    if (state.status !== 'active') {
      throw new Error(`Cannot end turn when game is ${state.status}`);
    }

    if (state.turns.currentPlayerId === null) {
      throw new Error('No active turn to end');
    }

    const currentTurn = state.turns.currentTurn;
    const currentPlayerId = state.turns.currentPlayerId;
    const turnStartedAt = state.turns.turnStartedAt!;
    const now = Date.now();

    // Find next player
    const currentIndex = state.turns.turnOrder.indexOf(currentPlayerId);
    if (currentIndex === -1) {
      throw new Error(`Current player ${currentPlayerId} not found in turn order`);
    }

    const nextIndex = (currentIndex + 1) % state.turns.turnOrder.length;
    const nextPlayerId = state.turns.turnOrder[nextIndex];
    const nextTurn = currentTurn + 1;

    let newState = updateState(state, draft => {
      // Record turn history
      const turnRecord: TurnRecord = {
        turnNumber: currentTurn,
        playerId: currentPlayerId,
        startedAt: turnStartedAt,
        endedAt: now,
        actions: Array.from(actions),
      };
      (draft.turns.turnHistory as TurnRecord[]).push(turnRecord);

      // Advance turn
      (draft.turns as any).currentTurn = nextTurn;
      (draft.turns as any).currentPlayerId = nextPlayerId;
      (draft.turns as any).turnStartedAt = now;

      // Record transitions
      (draft.history as any[]).push(
        {
          id: generateId(),
          timestamp: now,
          type: 'turn-ended',
          actorId: currentPlayerId,
          data: {
            turnNumber: currentTurn,
            duration: now - turnStartedAt,
            actionCount: actions.length,
          },
        },
        {
          id: generateId(),
          timestamp: now,
          type: 'turn-started',
          actorId: 'system',
          data: {
            turnNumber: nextTurn,
            playerId: nextPlayerId,
          },
        }
      );
    });

    // Emit turn-start for next player (turn-end emitted by engine)
    newState = emitSystemEvent(newState, 'turn-start', nextPlayerId);

    return newState;
  }

  /**
   * Check if it's a specific player's turn
   */
  isPlayerTurn(state: GameState, playerId: string): boolean {
    return state.turns.currentPlayerId === playerId;
  }

  /**
   * Get the current player (whose turn it is)
   */
  getCurrentPlayerId(state: GameState): string | null {
    return state.turns.currentPlayerId;
  }

  /**
   * Get turn statistics for a player
   */
  getTurnStats(state: GameState, playerId: string): TurnStats {
    const playerTurns = state.turns.turnHistory.filter(t => t.playerId === playerId);

    if (playerTurns.length === 0) {
      return {
        totalTurns: 0,
        totalActions: 0,
        averageTurnDuration: 0,
      };
    }

    const totalActions = playerTurns.reduce((sum, t) => sum + t.actions.length, 0);
    const totalDuration = playerTurns.reduce(
      (sum, t) => sum + (t.endedAt - t.startedAt),
      0
    );

    return {
      totalTurns: playerTurns.length,
      totalActions,
      averageTurnDuration: totalDuration / playerTurns.length,
    };
  }

  /**
   * Get all turn statistics
   */
  getAllTurnStats(state: GameState): Map<string, TurnStats> {
    const stats = new Map<string, TurnStats>();

    for (const player of state.players) {
      stats.set(player.id, this.getTurnStats(state, player.id));
    }

    return stats;
  }

  /**
   * Get the next player in turn order (without advancing the turn)
   */
  getNextPlayerId(state: GameState): string | null {
    if (state.turns.currentPlayerId === null) {
      return null;
    }

    const currentIndex = state.turns.turnOrder.indexOf(state.turns.currentPlayerId);
    if (currentIndex === -1) {
      return null;
    }

    const nextIndex = (currentIndex + 1) % state.turns.turnOrder.length;
    return state.turns.turnOrder[nextIndex];
  }

  /**
   * Pause the game
   */
  pauseGame(state: GameState): GameState {
    if (state.status !== 'active') {
      throw new Error(`Cannot pause game in ${state.status} status`);
    }

    return updateState(state, draft => {
      draft.status = 'paused';
    });
  }

  /**
   * Resume a paused game
   */
  resumeGame(state: GameState): GameState {
    if (state.status !== 'paused') {
      throw new Error(`Cannot resume game in ${state.status} status`);
    }

    return updateState(state, draft => {
      draft.status = 'active';
    });
  }

  /**
   * Skip the current player's turn (if they're inactive or unavailable)
   */
  skipTurn(state: GameState, reason: string): GameState {
    if (state.status !== 'active') {
      throw new Error(`Cannot skip turn when game is ${state.status}`);
    }

    if (state.turns.currentPlayerId === null) {
      throw new Error('No active turn to skip');
    }

    const skipAction: Action = {
      id: generateId(),
      type: 'turn-skipped',
      playerId: state.turns.currentPlayerId,
      timestamp: Date.now(),
      data: { reason },
    };

    return this.endTurn(state, [skipAction]);
  }

  /**
   * Get current turn number
   */
  getCurrentTurn(state: GameState): number {
    return state.turns.currentTurn;
  }

  /**
   * Get turn duration (how long current turn has been running)
   */
  getCurrentTurnDuration(state: GameState): number | null {
    if (state.turns.turnStartedAt === null) {
      return null;
    }

    return Date.now() - state.turns.turnStartedAt;
  }

  /**
   * Check if the game has been running (is in active or paused state)
   */
  isGameStarted(state: GameState): boolean {
    return state.status === 'active' || state.status === 'paused';
  }
}
