/**
 * Unit tests for EventDispatcher
 * Tests depth-first preorder traversal with rule-number sorting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventDispatcher } from './dispatcher.js';
import { RuleExecutor } from './executor.js';
import { createInitialState, generateId, updateState } from '../core/state.js';
import type { GameState, Rule, GameEvent } from '../core/types.js';

// Test helper: track execution order
const executionOrder: number[] = [];

// Test helper: create a mock rule that tracks execution
function createTrackingRule(number: number, eventType: string): Rule {
  return {
    id: generateId(),
    number,
    name: `Test Rule ${number}`,
    description: `Test rule ${number}`,
    code: `(state) => state`, // Placeholder
    isActive: true,
    isMutable: true,
    proposedBy: 'test',
    createdAt: Date.now(),
    triggers: [{ type: 'event', eventType }],
  };
}

// Test helper: create GameState with test rules
function createTestState(rules: Rule[]): GameState {
  const state = createInitialState('test-game');
  return updateState(state, draft => {
    (draft.rules as Rule[]) = rules;
  });
}

// Mock executor that tracks execution order and emits events
class MockExecutor extends RuleExecutor {
  private emissionMap: Map<number, GameEvent[]> = new Map();

  setEmissions(ruleNumber: number, events: GameEvent[]) {
    this.emissionMap.set(ruleNumber, events);
  }

  executeRule(state: GameState, rule: Rule) {
    executionOrder.push(rule.number);

    const eventsToEmit = this.emissionMap.get(rule.number) || [];
    let newState = state;

    for (const event of eventsToEmit) {
      newState = updateState(newState, draft => {
        (draft.pendingEvents as GameEvent[]).push(event);
      });
    }

    return {
      success: true,
      state: newState,
      rule,
    };
  }
}

describe('EventDispatcher - Depth-first execution', () => {
  let mockExecutor: MockExecutor;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    executionOrder.length = 0;
    mockExecutor = new MockExecutor();
    dispatcher = new EventDispatcher(mockExecutor as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: should execute child rules before sibling rules', () => {
    // Setup: turn-end → Rule 101 emits [event-a, event-b]
    //   event-a → Rules 102, 204
    //   event-b → Rules 005, 201
    //   Rule 005 → emits [event-c] → Rule 050

    const eventA: GameEvent = {
      type: 'event-a',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const eventB: GameEvent = {
      type: 'event-b',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const eventC: GameEvent = {
      type: 'event-c',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const turnEnd: GameEvent = {
      type: 'turn-end',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(101, 'turn-end'),
      createTrackingRule(5, 'event-b'),
      createTrackingRule(102, 'event-a'),
      createTrackingRule(201, 'event-b'),
      createTrackingRule(204, 'event-a'),
      createTrackingRule(50, 'event-c'),
    ];

    // Configure emissions
    mockExecutor.setEmissions(101, [eventA, eventB]);
    mockExecutor.setEmissions(5, [eventC]);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(turnEnd);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Expected order: 101, 5, 50, 102, 201, 204
    expect(executionOrder).toEqual([101, 5, 50, 102, 201, 204]);
  });

  it('Test 2: should execute sibling (event, rule) pairs in ascending rule number order', () => {
    // Setup: One event triggers rules [204, 5, 102, 201]
    // Expected order: 5, 102, 201, 204

    const testEvent: GameEvent = {
      type: 'test-event',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(204, 'test-event'),
      createTrackingRule(5, 'test-event'),
      createTrackingRule(102, 'test-event'),
      createTrackingRule(201, 'test-event'),
    ];

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(testEvent);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Expected order: 5, 102, 201, 204
    expect(executionOrder).toEqual([5, 102, 201, 204]);
  });

  it('Test 3: should stop at MAX_EVENT_DEPTH and warn', () => {
    // Setup: Rule that recursively emits same event 101+ times

    const recursiveEvent: GameEvent = {
      type: 'recursive',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [createTrackingRule(1, 'recursive')];

    // Configure rule to emit itself recursively
    mockExecutor.setEmissions(1, [recursiveEvent]);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(recursiveEvent);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Should hit depth limit of 100
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max event depth (100) reached')
    );
    expect(executionOrder.length).toBe(100); // Executes exactly 100 times before stopping
  });

  it('Test 4: should stop at MAX_TOTAL_NODES and warn', () => {
    // Setup: Create tree with 1001+ total nodes
    // We'll create a wide tree: 1 root emits 500 events, each triggers 2 rules = 1001 nodes

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const rootEvent: GameEvent = {
      type: 'root',
      actorId: 'test',
      timestamp: Date.now(),
    };

    // Create 500 child events
    const childEvents: GameEvent[] = [];
    for (let i = 0; i < 500; i++) {
      childEvents.push({
        type: `child-${i}`,
        actorId: 'test',
        timestamp: Date.now(),
      });
    }

    const rules: Rule[] = [createTrackingRule(1, 'root')];

    // Each child event triggers 2 rules
    for (let i = 0; i < 500; i++) {
      rules.push(createTrackingRule(i * 2 + 10, `child-${i}`));
      rules.push(createTrackingRule(i * 2 + 11, `child-${i}`));
    }

    mockExecutor.setEmissions(1, childEvents);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(rootEvent);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Should hit node limit of 1000
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max total nodes (1000) reached')
    );
    expect(executionOrder.length).toBeLessThanOrEqual(1000);
  });

  it('Test 5: should treat same event type with different data as separate events', () => {
    // Setup: Rule emits event-x twice with different data
    // Expected: Triggered rule executes twice

    const event1: GameEvent = {
      type: 'event-x',
      actorId: 'test',
      timestamp: Date.now(),
      data: { id: 1 },
    };

    const event2: GameEvent = {
      type: 'event-x',
      actorId: 'test',
      timestamp: Date.now(),
      data: { id: 2 },
    };

    const trigger: GameEvent = {
      type: 'trigger',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(1, 'trigger'),
      createTrackingRule(2, 'event-x'),
    ];

    mockExecutor.setEmissions(1, [event1, event2]);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(trigger);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Rule 1 executes once, rule 2 executes twice (once for each event-x)
    expect(executionOrder).toEqual([1, 2, 2]);
  });

  it('Test 6: should process events emitted mid-execution after rule completes', () => {
    // This is implicitly tested by our mock executor design:
    // The executor emits events during execution, and they're collected
    // in pendingEvents. The dispatcher processes them after the rule finishes.

    const trigger: GameEvent = {
      type: 'trigger',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const child: GameEvent = {
      type: 'child',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(1, 'trigger'),
      createTrackingRule(2, 'child'),
    ];

    mockExecutor.setEmissions(1, [child]);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(trigger);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Rule 1 completes (added to executionOrder), then rule 2 executes
    expect(executionOrder).toEqual([1, 2]);
  });

  it('Test 7: should collect all events from a rule and sort child pairs by rule number', () => {
    // Setup: Rule 101 emits [event-b, event-a, event-c] (out of order)
    //   event-a → Rule 50
    //   event-b → Rule 30
    //   event-c → Rule 40
    // Expected order: 101, 30, 40, 50 (sorted by rule number)

    const eventB: GameEvent = {
      type: 'event-b',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const eventA: GameEvent = {
      type: 'event-a',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const eventC: GameEvent = {
      type: 'event-c',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const trigger: GameEvent = {
      type: 'trigger',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(101, 'trigger'),
      createTrackingRule(50, 'event-a'),
      createTrackingRule(30, 'event-b'),
      createTrackingRule(40, 'event-c'),
    ];

    // Emit events out of order
    mockExecutor.setEmissions(101, [eventB, eventA, eventC]);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(trigger);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Expected order: 101, 30, 40, 50 (sorted by rule number)
    expect(executionOrder).toEqual([101, 30, 40, 50]);
  });

  it('Test 8: should track depth per branch, allowing each sibling its own depth budget', () => {
    // Setup: Two sibling branches, each going 50 levels deep
    // Expected: Both complete successfully (100 total nodes, 50 per branch)

    // Create a chain of 50 events for branch A
    const branchAEvents: GameEvent[] = [];
    for (let i = 0; i < 50; i++) {
      branchAEvents.push({
        type: `branch-a-${i}`,
        actorId: 'test',
        timestamp: Date.now(),
      });
    }

    // Create a chain of 50 events for branch B
    const branchBEvents: GameEvent[] = [];
    for (let i = 0; i < 50; i++) {
      branchBEvents.push({
        type: `branch-b-${i}`,
        actorId: 'test',
        timestamp: Date.now(),
      });
    }

    const trigger: GameEvent = {
      type: 'trigger',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [createTrackingRule(1, 'trigger')];

    // Branch A: Chain of rules, each triggering the next
    for (let i = 0; i < 50; i++) {
      rules.push(createTrackingRule(100 + i, `branch-a-${i}`));
      if (i < 49) {
        mockExecutor.setEmissions(100 + i, [branchAEvents[i + 1]]);
      }
    }

    // Branch B: Chain of rules, each triggering the next
    for (let i = 0; i < 50; i++) {
      rules.push(createTrackingRule(200 + i, `branch-b-${i}`));
      if (i < 49) {
        mockExecutor.setEmissions(200 + i, [branchBEvents[i + 1]]);
      }
    }

    // Root emits first event from each branch
    mockExecutor.setEmissions(1, [branchAEvents[0], branchBEvents[0]]);

    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(trigger);
    });

    // Execute
    dispatcher.processEvents(stateWithEvent);

    // Expected: 1 root + 50 branch A + 50 branch B = 101 total
    expect(executionOrder.length).toBe(101);

    // Branch A should execute first (lower rule numbers), then branch B
    // Root: 1
    // Branch A: 100-149 (50 nodes)
    // Branch B: 200-249 (50 nodes)
    expect(executionOrder[0]).toBe(1); // Root
    expect(executionOrder[1]).toBe(100); // First of branch A
    expect(executionOrder[50]).toBe(149); // Last of branch A
    expect(executionOrder[51]).toBe(200); // First of branch B
    expect(executionOrder[100]).toBe(249); // Last of branch B
  });

  it('Test 8b: custom config — should enforce lower maxEventDepth', () => {
    const recursiveEvent: GameEvent = {
      type: 'recursive',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [createTrackingRule(1, 'recursive')];
    mockExecutor.setEmissions(1, [recursiveEvent]);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const customDispatcher = new EventDispatcher(mockExecutor as any, { maxEventDepth: 5 });
    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(recursiveEvent);
    });

    customDispatcher.processEvents(stateWithEvent);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max event depth (5) reached'));
    expect(executionOrder.length).toBe(5);
  });

  it('Test 8c: custom config — should enforce lower maxTotalNodes', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const rootEvent: GameEvent = { type: 'root', actorId: 'test', timestamp: Date.now() };
    const childEvents: GameEvent[] = Array.from({ length: 25 }, (_, i) => ({
      type: `child-${i}`,
      actorId: 'test',
      timestamp: Date.now(),
    }));

    const rules: Rule[] = [createTrackingRule(1, 'root')];
    for (let i = 0; i < 25; i++) {
      rules.push(createTrackingRule(i + 10, `child-${i}`));
    }
    mockExecutor.setEmissions(1, childEvents);

    const customDispatcher = new EventDispatcher(mockExecutor as any, { maxTotalNodes: 20 });
    const state = createTestState(rules);
    const stateWithEvent = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(rootEvent);
    });

    customDispatcher.processEvents(stateWithEvent);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max total nodes (20) reached'));
    expect(executionOrder.length).toBeLessThanOrEqual(20);
  });

  it('Test 9: should sort initial events by rule number, not event order', () => {
    // Setup: Multiple initial events in pendingEvents
    // event-a comes first in array but triggers Rule 102
    // event-b comes second in array but triggers Rule 5
    // Expected: Rule 5 executes before Rule 102 (sorted by rule number)

    const eventA: GameEvent = {
      type: 'event-a',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const eventB: GameEvent = {
      type: 'event-b',
      actorId: 'test',
      timestamp: Date.now(),
    };

    const rules: Rule[] = [
      createTrackingRule(102, 'event-a'),
      createTrackingRule(5, 'event-b'),
    ];

    const state = createTestState(rules);
    // Add events in order: event-a first, event-b second
    const stateWithEvents = updateState(state, draft => {
      (draft.pendingEvents as GameEvent[]).push(eventA);
      (draft.pendingEvents as GameEvent[]).push(eventB);
    });

    // Execute
    dispatcher.processEvents(stateWithEvents);

    // Expected order: 5, 102 (sorted by rule number, NOT event order)
    expect(executionOrder).toEqual([5, 102]);
  });
});
