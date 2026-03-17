/**
 * Manual integration test for depth-first event processing
 *
 * Test scenario:
 * turn-end → Rule 101 emits [event-a, event-b]
 *   event-a → Rules 102, 204
 *   event-b → Rules 005, 201
 *   Rule 005 → emits [event-c]
 *     event-c → Rule 050
 *
 * Expected execution order: 101 → 005 → 050 → 102 → 201 → 204
 */

import { NomicEngine } from './dist/index.js';

const executionOrder = [];

// Create engine
const engine = new NomicEngine();

// Initialize with Alice and Bob
engine.initialize(['Alice', 'Bob']);

// Start the game
engine.start();

console.log('\n=== Setting up test rules ===\n');

// Get Alice's player ID
const state = engine.getState();
const aliceId = state.players[0].id;

// Add Rule 5: Triggers on event-b, emits event-c
const rule5 = {
  id: 'rule-005',
  number: 5,
  name: 'Rule 5',
  description: 'Triggers on event-b, emits event-c',
  code: `(state) => {
    console.log('Executing Rule 5');
    return StateHelpers.emitEvent(state, 'event-c', { from: 5 });
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-b' }],
};

// Add Rule 50: Triggers on event-c
const rule50 = {
  id: 'rule-050',
  number: 50,
  name: 'Rule 50',
  description: 'Triggers on event-c',
  code: `(state) => {
    console.log('Executing Rule 50');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-c' }],
};

// Add Rule 102: Triggers on event-a
const rule102 = {
  id: 'rule-102',
  number: 102,
  name: 'Rule 102',
  description: 'Triggers on event-a',
  code: `(state) => {
    console.log('Executing Rule 102');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-a' }],
};

// Add Rule 201: Triggers on event-b
const rule201 = {
  id: 'rule-201',
  number: 201,
  name: 'Rule 201',
  description: 'Triggers on event-b',
  code: `(state) => {
    console.log('Executing Rule 201');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-b' }],
};

// Add Rule 204: Triggers on event-a
const rule204 = {
  id: 'rule-204',
  number: 204,
  name: 'Rule 204',
  description: 'Triggers on event-a',
  code: `(state) => {
    console.log('Executing Rule 204');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-a' }],
};

// Modify Rule 101 to emit event-a and event-b
const modifiedRule101 = {
  id: state.rules[4].id, // Rule 101 is at index 4
  number: 101,
  name: 'Win by Points - Modified',
  description: 'Emits event-a and event-b for testing',
  code: `(state) => {
    console.log('Executing Rule 101');
    // Emit event-a and event-b
    let newState = StateHelpers.emitEvent(state, 'event-a', { from: 101 });
    newState = StateHelpers.emitEvent(newState, 'event-b', { from: 101 });
    return newState;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: 'system',
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'turn-end' }],
};

// Directly add rules to the engine (bypassing voting for test purposes)
console.log('Adding test rules...');
engine.state = engine.state.rules.reduce((s, rule) => {
  if (rule.number === 101) {
    // Replace Rule 101
    return {
      ...s,
      rules: [...s.rules.filter(r => r.number !== 101), modifiedRule101],
    };
  }
  return s;
}, engine.state);

engine.state = {
  ...engine.state,
  rules: [
    ...engine.state.rules,
    rule5,
    rule50,
    rule102,
    rule201,
    rule204,
  ],
};

console.log('Test rules added successfully.\n');

console.log('=== Executing turn end (triggers Rule 101) ===\n');
console.log('Expected execution order: 101 → 5 → 50 → 102 → 201 → 204\n');
console.log('Actual execution order:\n');

// End turn (this will trigger Rule 101 which emits event-a and event-b)
try {
  engine.endTurn();
  console.log('\n=== Test completed successfully! ===\n');
  console.log('If you saw the execution order: 101 → 5 → 50 → 102 → 201 → 204');
  console.log('Then depth-first preorder traversal is working correctly!\n');
} catch (error) {
  console.error('\n=== Test failed with error: ===');
  console.error(error);
}
