#!/usr/bin/env node

/**
 * Nomic Engine CLI
 *
 * Command-line interface for creating and playing Nomic games.
 */

import { Command } from 'commander';
import { NomicEngine } from '../index.js';
import { createApp } from '../server/index.js';
import { PollingTransport } from '../client/PollingTransport.js';
import { HumanCliPlayer } from '../client/HumanCliPlayer.js';

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
  .command('play <server-url>')
  .description('Play a game via HTTP server')
  .requiredOption('--player-id <id>', 'Your player ID')
  .action(async (serverUrl: string, options: { playerId: string }) => {
    try {
      const transport = new PollingTransport(serverUrl);
      const player = new HumanCliPlayer(transport, options.playerId);
      await player.play();
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

program
  .command('server <game-file>')
  .description('Start HTTP game server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .action(async (gameFile: string, options: { port: string }) => {
    try {
      const engine = await NomicEngine.load(gameFile);
      const app = createApp(engine, gameFile);
      const port = parseInt(options.port, 10);
      app.listen(port, () => {
        console.log(`\nGame server running on http://localhost:${port}`);
        console.log(`Game: ${gameFile}`);
        console.log('Press Ctrl+C to stop\n');
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Display Functions (used by status/rules/leaderboard commands)
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
    console.log(`    ${rule.isMutable ? 'Mutable' : 'Immutable'}`);
    console.log(`    Proposed by: ${rule.proposedBy}`);

    console.log('\n    Code:');
    const codeLines = rule.code.split('\n');
    for (const line of codeLines) {
      console.log(`      ${line}`);
    }
    console.log('');
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
// Run CLI
// ============================================================================

program.parse();
