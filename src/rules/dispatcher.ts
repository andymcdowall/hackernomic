/**
 * Event dispatcher
 *
 * Handles event-driven rule execution using depth-first preorder traversal.
 * When events are emitted, finds matching rules, creates (event, rule) pairs,
 * sorts by rule number, and executes each pair's entire effect chain before
 * moving to the next sibling.
 */

import type { GameEvent, GameState, Rule, RuleContext } from '../core/types.js';
import { updateState } from '../core/state.js';
import { RuleExecutor } from './executor.js';

// ============================================================================
// Configuration
// ============================================================================

export interface EventDispatcherConfig {
  /**
   * Maximum depth per branch (prevents infinite recursion in a single chain)
   * @default 100
   */
  maxEventDepth: number;

  /**
   * Maximum total nodes executed across entire tree (prevents runaway execution)
   * @default 1000
   */
  maxTotalNodes: number;
}

export const DEFAULT_DISPATCHER_CONFIG: EventDispatcherConfig = {
  maxEventDepth: 100,
  maxTotalNodes: 1000,
};

// ============================================================================
// Internal Types
// ============================================================================

interface DispatchResult {
  state: GameState;
  totalNodes: number;
}

interface EventRulePair {
  event: GameEvent;
  rule: Rule;
}

// ============================================================================
// Event Dispatcher
// ============================================================================

export class EventDispatcher {
  private executor: RuleExecutor;
  private config: EventDispatcherConfig;

  constructor(executor: RuleExecutor, config?: Partial<EventDispatcherConfig>) {
    this.executor = executor;
    this.config = {
      ...DEFAULT_DISPATCHER_CONFIG,
      ...config,
    };
  }

  /**
   * Create (event, rule) pairs for given events and sort by rule number
   * This ensures consistent ordering regardless of event emission order
   */
  private createAndSortEventRulePairs(
    events: ReadonlyArray<GameEvent>,
    state: GameState
  ): EventRulePair[] {
    const pairs: EventRulePair[] = [];

    for (const event of events) {
      const matchingRules = state.rules.filter(
        r =>
          r.isActive &&
          r.triggers.some(t => t.type === 'event' && t.eventType === event.type)
      );

      for (const rule of matchingRules) {
        pairs.push({ event, rule });
      }
    }

    // Sort by rule number (ascending: 1, 2, 3...)
    pairs.sort((a, b) => a.rule.number - b.rule.number);

    return pairs;
  }

  /**
   * Process all pending events, triggering matching rules
   * Returns new state with events cleared and rules executed
   */
  processEvents(state: GameState): GameState {
    const result = this.processEventsWithTracking(state, 0);
    return result.state;
  }

  /**
   * Internal: Process events with node tracking
   */
  private processEventsWithTracking(
    state: GameState,
    totalNodes: number
  ): DispatchResult {
    // Check global node limit
    if (totalNodes >= this.config.maxTotalNodes) {
      console.warn(
        `Max total nodes (${this.config.maxTotalNodes}) reached, stopping event processing`
      );
      return {
        state: updateState(state, draft => {
          (draft.pendingEvents as GameEvent[]) = [];
        }),
        totalNodes,
      };
    }

    // If no pending events, we're done
    if (state.pendingEvents.length === 0) {
      return { state, totalNodes };
    }

    // Get current batch of events and clear them
    const events = state.pendingEvents;
    let newState = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]) = [];
    });

    // Create and sort (event, rule) pairs for all initial events
    const initialPairs = this.createAndSortEventRulePairs(events, newState);

    // Execute each pair depth-first
    for (const pair of initialPairs) {
      const result = this.dispatchEventForRule(
        newState,
        pair.event,
        pair.rule,
        0,
        totalNodes
      );
      newState = result.state;
      totalNodes = result.totalNodes;
    }

    return { state: newState, totalNodes };
  }

  /**
   * Execute a specific event-rule pair depth-first
   */
  private dispatchEventForRule(
    state: GameState,
    event: GameEvent,
    rule: Rule,
    depth: number,
    totalNodes: number
  ): DispatchResult {
    // Check depth limit
    if (depth >= this.config.maxEventDepth) {
      console.warn(
        `Max event depth (${this.config.maxEventDepth}) reached for rule ${rule.number}, stopping branch`
      );
      return { state, totalNodes };
    }

    // Check global node limit
    if (totalNodes >= this.config.maxTotalNodes) {
      console.warn(
        `Max total nodes (${this.config.maxTotalNodes}) reached, stopping event processing`
      );
      return { state, totalNodes };
    }

    // Execute the rule
    const context: RuleContext = {
      triggeredBy: event.actorId,
      timestamp: event.timestamp,
      action: undefined,
    };

    const result = this.executor.executeRule(state, rule, context);
    let newState = state;
    if (result.success && result.state) {
      newState = result.state;
    }
    totalNodes++;

    // Process child events depth-first
    if (newState.pendingEvents.length > 0) {
      const childEvents = newState.pendingEvents;

      // Clear pending events
      newState = updateState(newState, draft => {
        (draft.pendingEvents as GameEvent[]) = [];
      });

      // Create and sort (event, rule) pairs for child events
      const childPairs = this.createAndSortEventRulePairs(childEvents, newState);

      // Execute each pair recursively
      for (const pair of childPairs) {
        const pairResult = this.dispatchEventForRule(
          newState,
          pair.event,
          pair.rule,
          depth + 1,
          totalNodes
        );
        newState = pairResult.state;
        totalNodes = pairResult.totalNodes;
      }
    }

    return { state: newState, totalNodes };
  }
}
