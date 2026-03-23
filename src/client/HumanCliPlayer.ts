/**
 * Interactive CLI player that communicates with the game server via GameTransport.
 *
 * Polls /state every 2 seconds to detect turn changes. When it is the player's
 * turn, enters an interactive readline loop to collect and submit actions.
 */

import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { generateId } from '../index.js';
import type { Rule, RuleTrigger, VoteValue } from '../core/types.js';
import type { GameTransport, ClientGameState, ClientProposal, ClientRule } from './transport.js';

const POLL_INTERVAL_MS = 2000;

export interface RlInterface {
  question(prompt: string): Promise<string>;
  close(): void;
}

export class HumanCliPlayer {
  private rl: RlInterface | null = null;

  constructor(
    private readonly transport: GameTransport,
    private readonly playerId: string,
    private readonly rlFactory: () => RlInterface = () => readline.createInterface({ input, output })
  ) {}

  async play(): Promise<void> {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   Nomic Engine - HTTP Client Mode    ║');
    console.log('╚═══════════════════════════════════════╝\n');

    this.rl = this.rlFactory();

    try {
      await this.pollLoop();
    } finally {
      this.rl.close();
    }

    console.log('\nGoodbye!\n');
  }

  private async pollLoop(): Promise<void> {
    let lastSeenTurn = -1;

    while (true) {
      let state: ClientGameState;
      try {
        state = await this.transport.getState();
      } catch (err) {
        console.error('Error fetching state:', err instanceof Error ? err.message : err);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (state.status === 'completed') {
        console.log('\nGame over!');
        this.showStatusFromState(state);
        break;
      }

      if (state.status !== 'active') {
        if (state.turn !== lastSeenTurn) {
          console.log(`\n[Status: ${state.status}]`);
          lastSeenTurn = state.turn;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (state.currentPlayerId === this.playerId) {
        // My turn — enter interactive mode
        const shouldQuit = await this.interactiveTurn(state);
        if (shouldQuit) break;
      } else {
        if (state.turn !== lastSeenTurn) {
          const currentPlayer = state.players.find(p => p.id === state.currentPlayerId);
          const name = currentPlayer?.name ?? state.currentPlayerId;
          console.log(`\nWaiting for ${name}'s turn... (Turn ${state.turn})`);
          lastSeenTurn = state.turn;
        }
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  /**
   * Handles one full turn interactively. Returns true if the user wants to quit.
   */
  private async interactiveTurn(state: ClientGameState): Promise<boolean> {
    const me = state.players.find(p => p.id === this.playerId);
    console.log(`\n[Turn ${state.turn}] Your turn, ${me?.name ?? this.playerId}!`);
    console.log('Commands: status, rules, proposals, propose, vote, end-turn, quit\n');

    while (true) {
      const cmd = (await this.rl!.question('> ')).trim();

      try {
        switch (cmd) {
          case 'status': {
            const fresh = await this.transport.getState();
            this.showStatusFromState(fresh);
            break;
          }

          case 'rules': {
            const rules = await this.transport.getRules();
            this.showRules(rules);
            break;
          }

          case 'proposals': {
            const proposals = await this.transport.getProposals();
            this.showProposals(proposals, state.players);
            break;
          }

          case 'propose':
            await this.proposeRule();
            break;

          case 'vote':
            await this.voteOnProposal(state);
            break;

          case 'end-turn':
            await this.transport.endTurn(this.playerId);
            console.log('✓ Turn ended');
            return false;

          case 'quit':
          case 'exit':
            return true;

          default:
            if (cmd) console.log(`Unknown command: ${cmd}`);
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  private async proposeRule(): Promise<void> {
    const rl = this.rl!;

    console.log('\nPropose a new rule:');
    const name = await rl.question('Rule name: ');
    const description = await rl.question('Description: ');

    console.log('\nRule code (TypeScript function):');
    console.log('Example: (state) => state');
    const code = await rl.question('Code: ');

    console.log('\nWhen should this rule execute?');
    console.log('1. At the end of each turn');
    console.log('2. When a specific event occurs');
    console.log('3. Never (informational only)');
    const triggerChoice = await rl.question('Choose (1/2/3): ');

    let triggers: RuleTrigger[];
    if (triggerChoice === '1') {
      triggers = [{ type: 'event', eventType: 'turn-end' }];
    } else if (triggerChoice === '2') {
      const eventType = await rl.question('Event type: ');
      triggers = [{ type: 'event', eventType }];
    } else {
      triggers = [{ type: 'never' }];
    }

    // Determine next rule number from active rules
    const rules = await this.transport.getRules();
    const maxNumber = rules.reduce((max, r) => Math.max(max, r.number), 200);
    const nextNumber = maxNumber + 1;

    const rule: Rule = {
      id: generateId(),
      number: nextNumber,
      name: name.trim(),
      description: description.trim(),
      code: code.trim(),
      isActive: false,
      isMutable: true,
      proposedBy: this.playerId,
      createdAt: Date.now(),
      triggers,
    };

    const proposalId = await this.transport.propose(this.playerId, description.trim(), rule);
    console.log(`\n✓ Proposal created: ${proposalId.slice(0, 8)}...`);
    console.log(`  Rule ${nextNumber}: ${name.trim()}`);
  }

  private async voteOnProposal(state: ClientGameState): Promise<void> {
    const proposals = await this.transport.getProposals();

    if (proposals.length === 0) {
      console.log('No active proposals');
      return;
    }

    console.log('\nActive proposals:');
    proposals.forEach((p, i) => {
      const proposer = state.players.find(pl => pl.id === p.proposedBy)?.name ?? p.proposedBy;
      console.log(`${i + 1}. ${p.description}`);
      console.log(`   Proposed by: ${proposer}  |  Votes: ${p.votes.length}/${p.totalPlayers}`);
    });

    const indexStr = await this.rl!.question('\nSelect proposal (number): ');
    const index = parseInt(indexStr, 10) - 1;
    if (index < 0 || index >= proposals.length) {
      console.log('Invalid selection');
      return;
    }

    let voteValue: string;
    while (true) {
      voteValue = await this.rl!.question('Vote (yes/no/abstain): ');
      if (['yes', 'no', 'abstain'].includes(voteValue)) break;
      console.log('Invalid vote. Must be yes, no, or abstain');
    }

    const proposal = proposals[index];
    const status = await this.transport.vote(this.playerId, proposal.id, voteValue as VoteValue);
    console.log(`✓ Vote cast. Proposal ${status === 'passed' ? 'PASSED' : status === 'failed' ? 'FAILED' : 'still pending'}`);
  }

  // ── Display ─────────────────────────────────────────────────────────────────

  private showStatusFromState(state: ClientGameState): void {
    console.log('\n┌─ Game Status ─────────────────────────┐');
    console.log(`│ ID:     ${state.gameId.slice(0, 8)}...`);
    console.log(`│ Status: ${state.status}`);
    console.log(`│ Turn:   ${state.turn}`);
    console.log('└───────────────────────────────────────┘\n');
    console.log('Players:');
    for (const p of state.players) {
      const marker = p.id === state.currentPlayerId ? ' ◄' : '';
      console.log(`  ${p.name}: ${p.points} points${marker}`);
    }
    console.log(`\nActive proposals: ${state.activeProposals}`);
  }

  private showRules(rules: ClientRule[]): void {
    console.log('\n┌─ Active Rules ────────────────────────┐\n');
    for (const rule of rules) {
      console.log(`[${rule.number}] ${rule.name}`);
      console.log(`    ${rule.description}`);
      console.log(`    ${rule.isMutable ? 'Mutable' : 'Immutable'}`);
    }
    console.log('\n└───────────────────────────────────────┘');
  }

  private showProposals(proposals: ClientProposal[], players: ClientGameState['players']): void {
    if (proposals.length === 0) {
      console.log('No active proposals');
      return;
    }
    console.log('\n┌─ Active Proposals ────────────────────┐\n');
    for (const p of proposals) {
      const proposer = players.find(pl => pl.id === p.proposedBy)?.name ?? p.proposedBy;
      console.log(`  ${p.description}`);
      console.log(`  Proposed by: ${proposer}  |  Votes: ${p.votes.length}/${p.totalPlayers}`);
      if (p.votes.length > 0) {
        const summary = p.votes.map(v => `${v.playerId.slice(0, 6)}: ${v.value}`).join(', ');
        console.log(`  Votes: ${summary}`);
      }
      console.log('');
    }
    console.log('└───────────────────────────────────────┘');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
