#!/usr/bin/env node

/**
 * Nomic Engine CLI
 *
 * Command-line interface for creating and playing Nomic games.
 */

import { Command } from 'commander';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { NomicEngine, generateId, type Rule } from '../index.js';

const program = new Command();

program
  .name('nomic')
  .description('Nomic Engine - A self-amending game engine')
  .version('0.1.0');

// ============================================================================
// Commands
// ============================================================================

program
  .command('new <game-name>')
  .description('Create a new Nomic game')
  .option('-p, --players <names...>', 'Player names')
  .action(async (gameName: string, options: { players?: string[] }) => {
    try {
      const engine = new NomicEngine();

      if (options.players && options.players.length > 0) {
        engine.initialize(options.players);
        console.log(`\n✓ Created game: ${gameName}`);
        console.log(`✓ Players: ${options.players.join(', ')}`);
      } else {
        console.log(`\n✓ Created game: ${gameName}`);
        console.log('  No players added. Use "nomic play" to add players interactively.');
      }

      const filepath = `./games/${gameName}.json`;
      await engine.save(filepath);
      console.log(`✓ Saved to: ${filepath}\n`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('play <game-file>')
  .description('Play a game interactively')
  .action(async (gameFile: string) => {
    try {
      const engine = await NomicEngine.load(gameFile);
      await interactivePlay(engine, gameFile);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status <game-file>')
  .description('Show game status')
  .action(async (gameFile: string) => {
    try {
      const engine = await NomicEngine.load(gameFile);
      showStatus(engine);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('rules <game-file>')
  .description('List all active rules')
  .action(async (gameFile: string) => {
    try {
      const engine = await NomicEngine.load(gameFile);
      showRules(engine);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('leaderboard <game-file>')
  .description('Show player leaderboard')
  .action(async (gameFile: string) => {
    try {
      const engine = await NomicEngine.load(gameFile);
      showLeaderboard(engine);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Interactive Play Mode
// ============================================================================

async function interactivePlay(engine: NomicEngine, saveFile: string): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   Nomic Engine - Interactive Mode    ║');
  console.log('╚═══════════════════════════════════════╝\n');

  console.log('Commands:');
  console.log('  status      - Show game status');
  console.log('  rules       - List active rules');
  console.log('  leaderboard - Show player standings');
  console.log('  add-player  - Add a new player (setup only)');
  console.log('  start       - Start the game');
  console.log('  propose     - Propose a new rule');
  console.log('  vote        - Vote on a proposal');
  console.log('  end-turn    - End current turn');
  console.log('  save        - Save the game');
  console.log('  quit        - Exit\n');

  let playing = true;

  while (playing) {
    const state = engine.getState();

    // Show current turn info if game is active
    if (state.status === 'active') {
      const currentPlayerId = engine.getCurrentPlayerId();
      const currentPlayer = engine.getPlayer(currentPlayerId!);
      console.log(`\n[Turn ${engine.getCurrentTurn()}] ${currentPlayer?.name}'s turn`);
    } else {
      console.log(`\n[Status: ${state.status}]`);
    }

    const command = await rl.question('> ');
    const [cmd] = command.trim().split(/\s+/);

    try {
      switch (cmd) {
        case 'status':
          showStatus(engine);
          break;

        case 'rules':
          showRules(engine);
          break;

        case 'leaderboard':
          showLeaderboard(engine);
          break;

        case 'add-player':
          await addPlayer(engine, rl);
          break;

        case 'start':
          engine.start();
          console.log('\n✓ Game started!');
          break;

        case 'propose':
          await proposeRule(engine, rl);
          break;

        case 'vote':
          await voteOnProposal(engine, rl);
          break;

        case 'end-turn':
          engine.endTurn();
          console.log('✓ Turn ended');
          break;

        case 'save':
          await engine.save(saveFile);
          console.log('✓ Game saved');
          break;

        case 'quit':
        case 'exit':
          playing = false;
          break;

        case 'help':
          console.log('\nSee available commands above');
          break;

        default:
          if (cmd) {
            console.log(`Unknown command: ${cmd}`);
          }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }

  rl.close();
  console.log('\nGoodbye!\n');
}

// ============================================================================
// Display Functions
// ============================================================================

function showStatus(engine: NomicEngine): void {
  const state = engine.getState();

  console.log('\n┌─ Game Status ─────────────────────────┐');
  console.log(`│ ID:     ${state.gameId.slice(0, 8)}...`);
  console.log(`│ Status: ${state.status}`);
  console.log(`│ Turn:   ${state.turns.currentTurn}`);
  console.log('└───────────────────────────────────────┘\n');

  console.log('Players:');
  const players = engine.getPlayers();
  for (const player of players) {
    const points = engine.getPoints(player.id);
    const current = player.id === state.turns.currentPlayerId ? ' ◄' : '';
    console.log(`  ${player.name}: ${points} points${current}`);
  }

  const activeProposals = engine.getActiveProposals();
  console.log(`\nActive proposals: ${activeProposals.length}`);
  console.log(`Active rules: ${engine.getActiveRules().length}`);
}

function showRules(engine: NomicEngine): void {
  const rules = engine.getActiveRules();

  console.log('\n┌─ Active Rules ────────────────────────┐\n');

  for (const rule of rules) {
    console.log(`[${rule.number}] ${rule.name}`);
    console.log(`    ${rule.description}`);
    console.log(`    ${rule.isMutable ? 'Mutable' : 'Immutable'}\n`);
  }

  console.log('└───────────────────────────────────────┘');
}

function showLeaderboard(engine: NomicEngine): void {
  const leaderboard = engine.getLeaderboard();

  console.log('\n┌─ Leaderboard ─────────────────────────┐\n');

  leaderboard.forEach((entry, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
    console.log(`${medal} ${index + 1}. ${entry.player.name}: ${entry.points} points`);
  });

  console.log('\n└───────────────────────────────────────┘');
}

// ============================================================================
// Interactive Actions
// ============================================================================

async function addPlayer(engine: NomicEngine, rl: readline.Interface): Promise<void> {
  if (engine.getStatus() !== 'setup') {
    console.log('Can only add players during setup');
    return;
  }

  const name = await rl.question('Player name: ');
  if (!name.trim()) {
    console.log('Name cannot be empty');
    return;
  }

  const player = engine.addPlayer(name.trim());
  console.log(`✓ Added player: ${player.name}`);
}

async function proposeRule(engine: NomicEngine, rl: readline.Interface): Promise<void> {
  if (engine.getStatus() !== 'active') {
    console.log('Can only propose rules when game is active');
    return;
  }

  const currentPlayerId = engine.getCurrentPlayerId();
  if (!currentPlayerId) {
    console.log('No active turn');
    return;
  }

  console.log('\nPropose a new rule:');
  const name = await rl.question('Rule name: ');
  const description = await rl.question('Description: ');

  console.log('\nRule code (TypeScript function):');
  console.log('Example: (state) => state');
  const code = await rl.question('Code: ');

  // Validate the code
  const validation = engine.validateRuleCode(code);
  if (!validation.valid) {
    console.log('\n✗ Invalid rule code:');
    validation.errors.forEach(err => console.log(`  - ${err}`));
    return;
  }

  // Get next available rule number
  const existingNumbers = engine.getAllRules().map(r => r.number);
  const nextNumber = Math.max(...existingNumbers, 400) + 1;

  const rule: Rule = {
    id: generateId(),
    number: nextNumber,
    name: name.trim(),
    description: description.trim(),
    code: code.trim(),
    isActive: false, // Will be activated if proposal passes
    isMutable: true,
    proposedBy: currentPlayerId,
    createdAt: Date.now(),
  };

  const proposalId = engine.proposeRule(currentPlayerId, description, rule);
  console.log(`\n✓ Proposal created: ${proposalId.slice(0, 8)}...`);
  console.log(`  All players must vote on this proposal.`);
}

async function voteOnProposal(
  engine: NomicEngine,
  rl: readline.Interface
): Promise<void> {
  const proposals = engine.getActiveProposals();

  if (proposals.length === 0) {
    console.log('No active proposals');
    return;
  }

  // Show proposals
  console.log('\nActive proposals:');
  proposals.forEach((p, i) => {
    console.log(`${i + 1}. ${p.description}`);
    console.log(`   Proposed by: ${engine.getPlayer(p.proposedBy)?.name}`);
    console.log(`   Votes: ${p.votes.size}/${engine.getPlayers().length}`);
  });

  const indexStr = await rl.question('\nSelect proposal (number): ');
  const index = parseInt(indexStr) - 1;

  if (index < 0 || index >= proposals.length) {
    console.log('Invalid selection');
    return;
  }

  const proposal = proposals[index];

  // Show who can vote
  const players = engine.getPlayers();
  console.log('\nPlayers:');
  players.forEach((p, i) => {
    const hasVoted = proposal.votes.has(p.id) ? '✓' : ' ';
    console.log(`${i + 1}. [${hasVoted}] ${p.name}`);
  });

  const playerIndexStr = await rl.question('\nSelect player (number): ');
  const playerIndex = parseInt(playerIndexStr) - 1;

  if (playerIndex < 0 || playerIndex >= players.length) {
    console.log('Invalid selection');
    return;
  }

  const player = players[playerIndex];

  const voteValue = await rl.question('Vote (yes/no/abstain): ');

  if (!['yes', 'no', 'abstain'].includes(voteValue)) {
    console.log('Invalid vote. Must be yes, no, or abstain');
    return;
  }

  engine.vote(proposal.id, player.id, voteValue as 'yes' | 'no' | 'abstain');
  console.log(`✓ ${player.name} voted: ${voteValue}`);
}

// ============================================================================
// Run CLI
// ============================================================================

program.parse();
