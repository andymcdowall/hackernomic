/**
 * Test that initial events (multiple events in pendingEvents)
 * are processed with rule-number sorting, not event order
 */

import { NomicEngine } from './dist/index.js';

console.log('\n=== Testing Initial Event Sorting ===\n');

const engine = new NomicEngine();
engine.initialize(['Alice', 'Bob']);
engine.start();

const state = engine.getState();
const aliceId = state.players[0].id;

// Add Rule 5: Triggers on event-b
const rule5 = {
  id: 'rule-005',
  number: 5,
  name: 'Rule 5',
  description: 'Triggers on event-b',
  code: `(state) => {
    console.log('Executing Rule 5 (event-b)');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-b' }],
};

// Add Rule 102: Triggers on event-a
const rule102 = {
  id: 'rule-102',
  number: 102,
  name: 'Rule 102',
  description: 'Triggers on event-a',
  code: `(state) => {
    console.log('Executing Rule 102 (event-a)');
    return state;
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'event-a' }],
};

// Directly add rules and events to state
engine.state = {
  ...engine.state,
  rules: [...engine.state.rules, rule5, rule102],
  pendingEvents: [
    // Note: event-a comes FIRST in array, but Rule 5 (event-b) has lower number
    { type: 'event-a', actorId: 'test', timestamp: Date.now() },
    { type: 'event-b', actorId: 'test', timestamp: Date.now() },
  ],
};

console.log('Initial events: [event-a, event-b]');
console.log('event-a → Rule 102');
console.log('event-b → Rule 5');
console.log('\nBefore fix: Would execute 102, then 5 (event order)');
console.log('After fix: Should execute 5, then 102 (rule number order)\n');
console.log('Actual execution order:\n');

// Process events
engine.state = engine.eventDispatcher.processEvents(engine.state);

console.log('\n=== Test completed! ===\n');
console.log('If you saw "Rule 5" before "Rule 102", the fix is working!\n');
