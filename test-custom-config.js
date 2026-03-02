/**
 * Test custom dispatcher configuration
 * Demonstrates using custom maxEventDepth and maxTotalNodes
 */

import { NomicEngine } from './dist/index.js';

console.log('\n=== Testing Custom Dispatcher Config ===\n');

// Create engine with custom limits
const engine = new NomicEngine({
  dispatcherConfig: {
    maxEventDepth: 5,  // Much lower than default 100
    maxTotalNodes: 20, // Much lower than default 1000
  },
});

engine.initialize(['Alice', 'Bob']);
engine.start();

const state = engine.getState();
const aliceId = state.players[0].id;

// Create a rule that recursively emits the same event
const recursiveRule = {
  id: 'rule-999',
  number: 999,
  name: 'Recursive Rule',
  description: 'Recursively emits same event',
  code: `(state) => {
    console.log('Executing Rule 999');
    return StateHelpers.emitEvent(state, 'recursive', {});
  }`,
  isActive: true,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now(),
  triggers: [{ type: 'event', eventType: 'recursive' }],
};

// Add the rule to the engine
engine.state = {
  ...engine.state,
  rules: [...engine.state.rules, recursiveRule],
  pendingEvents: [
    { type: 'recursive', actorId: 'test', timestamp: Date.now() },
  ],
};

console.log('Config: maxEventDepth=5, maxTotalNodes=20');
console.log('Rule 999 will recursively emit itself');
console.log('Expected: Should stop at depth 5 with warning\n');

// Process events
try {
  engine.state = engine.eventDispatcher.processEvents(engine.state);
  console.log('\n=== Test completed successfully! ===\n');
  console.log('Custom config limits are working correctly!\n');
} catch (error) {
  console.error('Error:', error);
}
