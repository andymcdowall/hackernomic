/**
 * Immutable state management utilities
 *
 * Provides functions for creating and updating game state immutably,
 * following functional programming principles.
 */

import { randomBytes } from 'crypto';
import type {
  GameEvent,
  GameState,
  Player,
  Rule,
  StateTransition,
  SystemEvent,
  Writable,
} from './types.js';
import { SYSTEM_EVENTS } from './types.js';

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(): string {
  return randomBytes(16).toString('hex');
}

// ============================================================================
// Deep Clone and Freeze
// ============================================================================

/**
 * Deep clone an object using structured clone algorithm
 */
export function deepClone<T>(obj: T): T {
  // Handle Maps
  if (obj instanceof Map) {
    return new Map(
      Array.from(obj.entries()).map(([k, v]) => [k, deepClone(v)])
    ) as T;
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  // Handle plain objects
  if (obj !== null && typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  // Primitives
  return obj;
}

/**
 * Deep freeze an object to make it truly immutable
 */
export function deepFreeze<T>(obj: T): T {
  // Get all property names
  const propNames = Object.getOwnPropertyNames(obj);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (obj as any)[name];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}

// ============================================================================
// Initial State Creation
// ============================================================================

/**
 * Get the initial set of rules that every game starts with
 */
export function getInitialRules(): ReadonlyArray<Rule> {
  const now = Date.now();

  return [
    {
      id: generateId(),
      number: 1,
      name: 'Sequential Turn Order',
      description: 'Players take turns in sequential order.',
      code: `// Enforced by turn management system`,
      isActive: true,
      isMutable: false,
      proposedBy: 'system',
      createdAt: now,
      triggers: [{ type: 'never' }],
    },
    {
      id: generateId(),
      number: 2,
      name: 'One Proposal Per Turn',
      description: 'Each player may propose one rule per turn.',
      code: `// Enforced by voting system`,
      isActive: true,
      isMutable: false,
      proposedBy: 'system',
      createdAt: now,
      triggers: [{ type: 'never' }],
    },
    {
      id: generateId(),
      number: 3,
      name: 'Majority Vote',
      description:
        'A proposed rule is adopted if and only if a majority of players vote yes.',
      code: `// Implemented in voting system`,
      isActive: true,
      isMutable: false,
      proposedBy: 'system',
      createdAt: now,
      triggers: [{ type: 'never' }],
    },
    {
      id: generateId(),
      number: 4,
      name: 'Points for Adopted Rules',
      description: 'When a rule is adopted, its proposer gains 10 points.',
      code: `(state, context) => {
  // Award 10 points to the proposer when a rule is adopted
  if (context.triggeredBy) {
    return StateHelpers.awardPoints(state, context.triggeredBy, 10);
  }
  return state;
}`,
      isActive: true,
      isMutable: false,
      proposedBy: 'system',
      createdAt: now,
      triggers: [{ type: 'event', eventType: 'proposal-passed' }],
    },
    {
      id: generateId(),
      number: 101,
      name: 'Win by Points',
      description: 'The first player to reach 100 points wins the game.',
      code: `(state) => {
  for (const [playerId, points] of state.points.entries()) {
    if (points >= 100) {
      return { ...state, status: 'completed' };
    }
  }
  return state;
}`,
      isActive: true,
      isMutable: true,
      proposedBy: 'system',
      createdAt: now,
      triggers: [{ type: 'event', eventType: 'turn-end' }],
    },
  ];
}

/**
 * Create initial game state
 */
export function createInitialState(gameId: string): GameState {
  const now = Date.now();

  const state: GameState = {
    version: '1.0.0',
    gameId,
    createdAt: now,
    updatedAt: now,
    status: 'setup',
    players: [],
    points: new Map(),
    rules: getInitialRules(),
    turns: {
      currentTurn: 0,
      currentPlayerId: null,
      turnOrder: [],
      turnStartedAt: null,
      turnHistory: [],
    },
    voting: {
      activeProposals: [],
      proposalHistory: [],
    },
    pendingEvents: [],
    history: [
      {
        id: generateId(),
        timestamp: now,
        type: 'game-created',
        actorId: 'system',
        data: { gameId },
      },
    ],
    extensions: new Map(),
  };

  return deepFreeze(state);
}

// ============================================================================
// State Updates
// ============================================================================

/**
 * Update state immutably
 * Uses an updater function that modifies a draft, then freezes the result
 */
export function updateState<T extends GameState>(
  state: T,
  updater: (draft: Writable<T>) => void
): T {
  // Deep clone the state
  const draft = deepClone(state) as Writable<T>;

  // Apply updates
  updater(draft);

  // Update timestamp
  (draft as any).updatedAt = Date.now();

  // Freeze and return
  return deepFreeze(draft as T);
}

// ============================================================================
// Common State Helpers
// ============================================================================

/**
 * Add a player to the game
 */
export function addPlayer(state: GameState, player: Player): GameState {
  return updateState(state, draft => {
    (draft.players as Player[]).push(player);
    (draft.points as Map<string, number>).set(player.id, 0);
    (draft.history as StateTransition[]).push({
      id: generateId(),
      timestamp: Date.now(),
      type: 'player-joined',
      actorId: player.id,
      data: { playerId: player.id, name: player.name },
    });
  });
}

/**
 * Award points to a player
 */
export function awardPoints(
  state: GameState,
  playerId: string,
  amount: number
): GameState {
  return updateState(state, draft => {
    const current = draft.points.get(playerId) || 0;
    (draft.points as Map<string, number>).set(playerId, current + amount);
    (draft.history as StateTransition[]).push({
      id: generateId(),
      timestamp: Date.now(),
      type: 'points-awarded',
      actorId: 'system',
      data: { playerId, amount, newTotal: current + amount },
    });
  });
}

/**
 * Add a rule to the game
 */
export function addRule(state: GameState, rule: Rule): GameState {
  return updateState(state, draft => {
    (draft.rules as Rule[]).push(rule);
  });
}

/**
 * Add a state transition to history
 */
export function addTransition(
  state: GameState,
  transition: StateTransition
): GameState {
  return updateState(state, draft => {
    (draft.history as StateTransition[]).push(transition);
  });
}

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit a system event (internal use only)
 * @internal
 */
export function emitSystemEvent(
  state: GameState,
  eventType: SystemEvent,
  actorId: string,
  data?: Record<string, any>
): GameState {
  const event: GameEvent = {
    type: eventType,
    actorId,
    timestamp: Date.now(),
    data,
  };

  return updateState(state, draft => {
    (draft.pendingEvents as GameEvent[]).push(event);
  });
}

// ============================================================================
// State Helpers (for use in rules)
// ============================================================================

/**
 * Helper functions available to rules for reading state
 */
export const StateHelpers = {
  /**
   * Get a player by ID
   */
  getPlayer(state: GameState, playerId: string): Player | undefined {
    return state.players.find(p => p.id === playerId);
  },

  /**
   * Get all active players
   */
  getActivePlayers(state: GameState): ReadonlyArray<Player> {
    return state.players.filter(p => p.isActive);
  },

  /**
   * Get the current player (whose turn it is)
   */
  getCurrentPlayer(state: GameState): Player | undefined {
    if (!state.turns.currentPlayerId) return undefined;
    return state.players.find(p => p.id === state.turns.currentPlayerId);
  },

  /**
   * Get player's points
   */
  getPoints(state: GameState, playerId: string): number {
    return state.points.get(playerId) || 0;
  },

  /**
   * Count active players
   */
  countActivePlayers(state: GameState): number {
    return state.players.filter(p => p.isActive).length;
  },

  /**
   * Get active rules
   */
  getActiveRules(state: GameState): ReadonlyArray<Rule> {
    return state.rules.filter(r => r.isActive);
  },

  /**
   * Get extension value with default
   */
  getExtension<T>(state: GameState, key: string, defaultValue: T): T {
    return (state.extensions.get(key) as T) ?? defaultValue;
  },

  /**
   * Set extension value (returns new state)
   */
  setExtension(state: GameState, key: string, value: unknown): GameState {
    return updateState(state, draft => {
      (draft.extensions as Map<string, unknown>).set(key, value);
      (draft.history as StateTransition[]).push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'extension-updated',
        actorId: 'system',
        data: { key, operation: 'set' },
      });
    });
  },

  /**
   * Update extension value using an updater function
   */
  updateExtension<T>(
    state: GameState,
    key: string,
    updater: (current: T | undefined) => T
  ): GameState {
    const current = state.extensions.get(key) as T | undefined;
    const newValue = updater(current);
    return StateHelpers.setExtension(state, key, newValue);
  },

  /**
   * Award points (convenience wrapper)
   */
  awardPoints,

  /**
   * Get player points sorted by rank
   */
  getLeaderboard(state: GameState): Array<{ player: Player; points: number }> {
    return state.players
      .map(player => ({
        player,
        points: state.points.get(player.id) || 0,
      }))
      .sort((a, b) => b.points - a.points);
  },

  /**
   * Emit a custom event (player rules can call this)
   * System events are reserved and will throw an error
   */
  emitEvent(state: GameState, eventType: string, data?: Record<string, any>): GameState {
    // Validate not a system event
    if (SYSTEM_EVENTS.includes(eventType as SystemEvent)) {
      throw new Error(`Cannot emit reserved system event: ${eventType}`);
    }

    const event: GameEvent = {
      type: eventType,
      actorId: 'rule',
      timestamp: Date.now(),
      data,
    };

    return updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(event);
    });
  },
};
