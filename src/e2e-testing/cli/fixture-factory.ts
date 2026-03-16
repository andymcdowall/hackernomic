/**
 * Fixture Factory
 *
 * Creates pre-built game state JSON files used by E2E tests.
 * Run with: npm run generate-fixtures
 *
 * Fixtures are committed to the repo. Re-run this script if the
 * game state format changes.
 */

import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { NomicEngine } from '../../core/engine.js';
import { addRule, awardPoints, generateId } from '../../core/state.js';
import type { Rule } from '../../core/types.js';
import {
  makeAwardTurnPointsRule,
  makeProposableAwardTurnPointsRule,
  makeWinAt30Rule,
} from './premade-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../../..');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');

// ============================================================================
// Individual Fixture Creators
// ============================================================================

/**
 * Setup state: 3 players added, game not yet started.
 */
async function createSetup3Players(): Promise<void> {
  const engine = new NomicEngine();
  engine.initialize(['Alice', 'Bob', 'Charlie']);
  await engine.save(path.join(FIXTURES_DIR, 'game-setup-3-players.json'));
  console.log('  ✓ game-setup-3-players.json');
}

/**
 * Active state: game started, Alice's turn (turn 1), no proposals.
 */
async function createActive3Players(): Promise<void> {
  const engine = new NomicEngine();
  engine.initialize(['Alice', 'Bob', 'Charlie']);
  engine.start();
  await engine.save(path.join(FIXTURES_DIR, 'game-active-3-players.json'));
  console.log('  ✓ game-active-3-players.json');
}

/**
 * Pending proposal state: active game with 1 pending proposal (Alice voted yes,
 * Bob and Charlie have not voted yet).
 *
 * Useful for testing the individual vote action.
 */
async function createPendingProposal1Yes(): Promise<void> {
  const engine = new NomicEngine();
  engine.initialize(['Alice', 'Bob', 'Charlie']);
  engine.start();

  const state = engine.getState();
  const alice = state.players.find(p => p.name === 'Alice');
  if (!alice) throw new Error('Alice not found');

  const proposalRule = makeProposableAwardTurnPointsRule(alice.id);
  const proposalId = engine.proposeRule(
    alice.id,
    'Award 5 points to current player on turn end',
    proposalRule
  );

  // Only Alice votes (2 more votes needed for resolution with requireAllVotes: true)
  engine.vote(proposalId, alice.id, 'yes');

  await engine.save(path.join(FIXTURES_DIR, 'game-pending-proposal-1-yes.json'));
  console.log('  ✓ game-pending-proposal-1-yes.json');
}

/**
 * Near-win state: active game where Alice has 25 points.
 * Two extra rules are active:
 *   Rule 202 - Award 5 pts to the player who ended the turn (context.triggeredBy)
 *   Rule 203 - Win at 30 pts on turn-end (runs after award)
 *
 * Ending Alice's turn: Rule 202 runs (Alice 25→30), Rule 203 runs (30≥30 → completed).
 */
async function createNearWin(): Promise<void> {
  const engine = new NomicEngine();
  engine.initialize(['Alice', 'Bob', 'Charlie']);
  engine.start();

  let state = engine.getState();
  const alice = state.players.find(p => p.name === 'Alice');
  if (!alice) throw new Error('Alice not found');

  // Award Alice 25 points directly via state function
  state = awardPoints(state, alice.id, 25);

  // Add award-5-pts rule (number 202, runs before win-check 203)
  state = addRule(state, makeAwardTurnPointsRule());

  // Add win-at-30 rule (number 203)
  state = addRule(state, makeWinAt30Rule());

  const nearWinEngine = new NomicEngine(state);
  await nearWinEngine.save(path.join(FIXTURES_DIR, 'game-near-win.json'));
  console.log('  ✓ game-near-win.json');
}

/**
 * Active game with a passed proposal already in history.
 * Alice has 10 points (from Rule 4 awarding 10 pts when a proposal passes).
 */
async function createPassedProposal(): Promise<void> {
  const engine = new NomicEngine();
  engine.initialize(['Alice', 'Bob', 'Charlie']);
  engine.start();

  const state = engine.getState();
  const alice = state.players.find(p => p.name === 'Alice');
  const bob = state.players.find(p => p.name === 'Bob');
  const charlie = state.players.find(p => p.name === 'Charlie');
  if (!alice || !bob || !charlie) throw new Error('Players not found');

  // Create a simple informational rule to propose
  const infoRule: Rule = {
    id: generateId(),
    number: 201,
    name: 'House Rule',
    description: 'An informational rule with no automatic effect',
    code: `(state) => state`,
    isActive: false,
    isMutable: true,
    proposedBy: alice.id,
    createdAt: Date.now(),
    triggers: [{ type: 'never' }],
  };

  const proposalId = engine.proposeRule(alice.id, 'House Rule', infoRule);
  engine.vote(proposalId, alice.id, 'yes');
  engine.vote(proposalId, bob.id, 'yes');
  engine.vote(proposalId, charlie.id, 'yes');
  // Proposal auto-resolves, Alice gets 10 pts from Rule 4

  await engine.save(path.join(FIXTURES_DIR, 'game-passed-proposal.json'));
  console.log('  ✓ game-passed-proposal.json');
}

// ============================================================================
// Main
// ============================================================================

export async function generateAllFixtures(): Promise<void> {
  console.log('\nGenerating E2E test fixtures...\n');

  await mkdir(FIXTURES_DIR, { recursive: true });

  await createSetup3Players();
  await createActive3Players();
  await createPendingProposal1Yes();
  await createNearWin();
  await createPassedProposal();

  console.log('\n✓ All fixtures generated in fixtures/\n');
}

// Run when called directly: tsx src/e2e-testing/cli/fixture-factory.ts
const scriptUrl = pathToFileURL(process.argv[1] ?? '').href;
if (import.meta.url === scriptUrl) {
  generateAllFixtures().catch(err => {
    console.error('Error generating fixtures:', err);
    process.exit(1);
  });
}
