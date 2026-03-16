/**
 * Scenario Runner
 *
 * Spawns the Nomic CLI as a child process and drives it via stdin/stdout
 * to execute E2E test scenarios described in YAML files.
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ExpectState,
  ProposeAction,
  RuleSpec,
  Scenario,
  ScenarioAction,
  VoteAction,
} from './types.js';
import { premadeRuleSpecs } from './premade-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../../..');
const TSX_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'index.ts');

// The CLI main-loop prompt. We match '\n> ' (newline then "> ") rather than
// just '> ' to avoid false positives on '=> ' inside JSON rule code.
const MAIN_PROMPT = '\n> ';

// ============================================================================
// CLI Process Driver
// ============================================================================

class CliDriver {
  private proc: ChildProcess;
  private buffer: string = '';
  private outputHistory: string = '';
  private resolvers: Array<{
    pattern: string;
    resolve: (captured: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(fixturePath: string) {
    this.proc = spawn(TSX_BIN, [CLI_PATH, 'play', fixturePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: PROJECT_ROOT,
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      const str = chunk.toString();
      this.buffer += str;
      this.outputHistory += str;
      this.checkResolvers();
    });

    this.proc.stderr!.on('data', (_chunk: Buffer) => {
      // Suppress stderr unless debugging
    });
  }

  private checkResolvers(): void {
    for (const resolver of [...this.resolvers]) {
      const idx = this.buffer.indexOf(resolver.pattern);
      if (idx !== -1) {
        const captured = this.buffer.slice(0, idx + resolver.pattern.length);
        this.buffer = this.buffer.slice(idx + resolver.pattern.length);
        this.resolvers = this.resolvers.filter(r => r !== resolver);
        clearTimeout(resolver.timer);
        resolver.resolve(captured);
      }
    }
  }

  async waitFor(pattern: string, timeout = 10000): Promise<string> {
    const idx = this.buffer.indexOf(pattern);
    if (idx !== -1) {
      const captured = this.buffer.slice(0, idx + pattern.length);
      this.buffer = this.buffer.slice(idx + pattern.length);
      return captured;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers = this.resolvers.filter(r => r.resolve !== resolve);
        reject(
          new Error(
            `Timeout (${timeout}ms) waiting for: ${JSON.stringify(pattern)}\n` +
              `Buffer tail: ${JSON.stringify(this.buffer.slice(-300))}\n` +
              `Recent output:\n${this.outputHistory.slice(-800)}`
          )
        );
      }, timeout);

      this.resolvers.push({ pattern, resolve, reject, timer });
    });
  }

  send(text: string): void {
    this.proc.stdin!.write(text);
  }

  async close(): Promise<void> {
    try {
      this.send('quit\n');
    } catch {
      // Ignore errors on close
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.proc.kill();
        resolve();
      }, 3000);

      this.proc.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

// ============================================================================
// Assertion Helpers
// ============================================================================

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return typeof value === 'string' ? [value] : value;
}

function assertOutput(
  output: string,
  expectOutput: string | string[] | undefined,
  expectNotOutput: string | string[] | undefined,
  label: string
): void {
  for (const expected of toArray(expectOutput)) {
    if (!output.includes(expected)) {
      throw new Error(
        `[${label}] Expected output to contain: "${expected}"\nActual output:\n${output}`
      );
    }
  }
  for (const notExpected of toArray(expectNotOutput)) {
    if (output.includes(notExpected)) {
      throw new Error(
        `[${label}] Expected output NOT to contain: "${notExpected}"\nActual output:\n${output}`
      );
    }
  }
}

function parseShowStateJson(output: string): Record<string, unknown> {
  const headerMarker = '┌─ Game State (simplified) ─────────────┐';
  const footerMarker = '└───────────────────────────────────────┘';

  const headerIdx = output.indexOf(headerMarker);
  if (headerIdx === -1) throw new Error('Could not find show-state header in output');

  const footerIdx = output.indexOf(footerMarker, headerIdx);
  if (footerIdx === -1) {
    throw new Error(
      `Could not find show-state footer in output.\nOutput received:\n${output}`
    );
  }

  const between = output.slice(headerIdx + headerMarker.length, footerIdx);
  const jsonStart = between.indexOf('{');
  const jsonEnd = between.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Could not find JSON in show-state output. Between markers:\n${between}`);
  }

  return JSON.parse(between.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
}

function resolveSerializedMap(mapData: unknown): Map<string, unknown> {
  if (
    mapData &&
    typeof mapData === 'object' &&
    (mapData as Record<string, unknown>).__type === 'Map'
  ) {
    const entries = (mapData as Record<string, unknown>).entries as Array<[string, unknown]>;
    return new Map(entries);
  }
  return new Map();
}

async function assertState(
  cli: CliDriver,
  expected: ExpectState,
  label: string
): Promise<void> {
  cli.send('show-state\n');
  const output = await cli.waitFor(MAIN_PROMPT, 10000);
  const state = parseShowStateJson(output);

  const players = state.players as Array<{ id: string; name: string }>;
  const turns = state.turns as { currentTurn: number; currentPlayerId: string | null };
  const voting = state.voting as {
    activeProposals: unknown[];
    proposalHistory: Array<{ status: string }>;
  };
  const rules = state.rules as Array<{ isActive: boolean }>;

  if (expected.status !== undefined && state.status !== expected.status) {
    throw new Error(
      `[${label}] expect_state.status: expected "${expected.status}", got "${state.status}"`
    );
  }

  if (expected.turn_number !== undefined && turns.currentTurn !== expected.turn_number) {
    throw new Error(
      `[${label}] expect_state.turn_number: expected ${expected.turn_number}, got ${turns.currentTurn}`
    );
  }

  if (expected.current_player !== undefined) {
    const current = players.find(p => p.id === turns.currentPlayerId);
    if (!current || current.name !== expected.current_player) {
      throw new Error(
        `[${label}] expect_state.current_player: expected "${expected.current_player}", got "${current?.name ?? 'none'}"`
      );
    }
  }

  if (expected.points !== undefined) {
    const pointsMap = resolveSerializedMap(state.points);
    for (const [playerName, expectedPts] of Object.entries(expected.points)) {
      const player = players.find(p => p.name === playerName);
      if (!player) {
        throw new Error(`[${label}] expect_state.points: player "${playerName}" not found`);
      }
      const actualPts = (pointsMap.get(player.id) as number) ?? 0;
      if (actualPts !== expectedPts) {
        throw new Error(
          `[${label}] expect_state.points["${playerName}"]: expected ${expectedPts}, got ${actualPts}`
        );
      }
    }
  }

  if (expected.active_rule_count !== undefined) {
    const activeCount = rules.filter(r => r.isActive).length;
    if (activeCount !== expected.active_rule_count) {
      throw new Error(
        `[${label}] expect_state.active_rule_count: expected ${expected.active_rule_count}, got ${activeCount}`
      );
    }
  }

  if (expected.pending_proposals !== undefined) {
    const pending = voting.activeProposals.length;
    if (pending !== expected.pending_proposals) {
      throw new Error(
        `[${label}] expect_state.pending_proposals: expected ${expected.pending_proposals}, got ${pending}`
      );
    }
  }

  if (expected.adopted_proposals !== undefined) {
    const adopted = voting.proposalHistory.filter(p => p.status === 'passed').length;
    if (adopted !== expected.adopted_proposals) {
      throw new Error(
        `[${label}] expect_state.adopted_proposals: expected ${expected.adopted_proposals}, got ${adopted}`
      );
    }
  }

  if (expected.rejected_proposals !== undefined) {
    const rejected = voting.proposalHistory.filter(p => p.status === 'failed').length;
    if (rejected !== expected.rejected_proposals) {
      throw new Error(
        `[${label}] expect_state.rejected_proposals: expected ${expected.rejected_proposals}, got ${rejected}`
      );
    }
  }
}

// ============================================================================
// Rule Spec Resolution
// ============================================================================

function resolveRuleSpec(rule: string | RuleSpec): {
  name: string;
  description: string;
  code: string;
  trigger: string;
} {
  if (typeof rule === 'string') {
    const spec = premadeRuleSpecs[rule];
    if (!spec) {
      throw new Error(
        `Unknown premade rule key: "${rule}". Available: ${Object.keys(premadeRuleSpecs).join(', ')}`
      );
    }
    return { ...spec, trigger: spec.trigger ?? 'never' };
  }
  return { ...rule, trigger: rule.trigger ?? 'never' };
}

function triggerToCliChoice(trigger: string): { choice: string; eventType?: string } {
  if (trigger === 'turn-end') return { choice: '1' };
  if (trigger === 'never') return { choice: '3' };
  return { choice: '2', eventType: trigger };
}

// ============================================================================
// Action Handlers
// ============================================================================

async function runAction(cli: CliDriver, action: ScenarioAction): Promise<void> {
  let output = '';
  const label = action.type;

  switch (action.type) {
    case 'add_player': {
      cli.send('add-player\n');
      output = await cli.waitFor('Player name: ');
      cli.send(action.name + '\n');
      output += await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'start': {
      cli.send('start\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'propose': {
      output = await handlePropose(cli, action);
      break;
    }

    case 'vote': {
      output = await handleVote(cli, action);
      break;
    }

    case 'end_turn': {
      cli.send('end-turn\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'save': {
      cli.send('save\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'status': {
      cli.send('status\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'rules': {
      cli.send('rules\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'leaderboard': {
      cli.send('leaderboard\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }

    case 'show_state': {
      cli.send('show-state\n');
      output = await cli.waitFor(MAIN_PROMPT);
      break;
    }
  }

  assertOutput(output, action.expect_output, action.expect_not_output, label);

  if (action.expect_state) {
    await assertState(cli, action.expect_state, label);
  }
}

async function handlePropose(cli: CliDriver, action: ProposeAction): Promise<string> {
  const spec = resolveRuleSpec(action.rule);
  const triggerInfo = triggerToCliChoice(spec.trigger);

  cli.send('propose\n');
  let output = await cli.waitFor('Rule name: ');
  cli.send(spec.name + '\n');
  output += await cli.waitFor('Description: ');
  cli.send(spec.description + '\n');
  output += await cli.waitFor('Code: ');
  cli.send(spec.code + '\n');
  output += await cli.waitFor('Choose (1/2/3): ');
  cli.send(triggerInfo.choice + '\n');

  if (triggerInfo.eventType) {
    output += await cli.waitFor('Event type: ');
    cli.send(triggerInfo.eventType + '\n');
  }

  // Drive the voting phase. The CLI prompts each player in join order.
  // We detect the player name from the output preceding each prompt.
  const playerCount = Object.keys(action.votes).length;

  for (let i = 0; i < playerCount; i++) {
    const beforePrompt = await cli.waitFor('Vote (yes/no/abstain): ');
    output += beforePrompt;

    // Extract player name from last "{Name}'s vote:" line in the captured output
    const matches = [...beforePrompt.matchAll(/([^\n']+)'s vote:/g)];
    const playerName =
      matches.length > 0 ? matches[matches.length - 1][1].trim() : null;

    const voteValue = playerName ? action.votes[playerName] : undefined;
    if (!voteValue) {
      const available = Object.keys(action.votes).join(', ');
      throw new Error(
        `[propose] No vote found for player "${playerName}". Available votes: ${available}`
      );
    }

    cli.send(voteValue + '\n');
  }

  // Collect remaining output through voting complete and back to main prompt
  output += await cli.waitFor(MAIN_PROMPT);
  return output;
}

async function handleVote(cli: CliDriver, action: VoteAction): Promise<string> {
  cli.send('vote\n');
  const proposalListOutput = await cli.waitFor('Select proposal (number): ');

  // Determine proposal index
  let proposalIndex = '1';
  if (action.on === 'latest_proposal') {
    const matches = [...proposalListOutput.matchAll(/^(\d+)\.\s/gm)];
    if (matches.length > 0) {
      proposalIndex = matches[matches.length - 1][1];
    }
  }

  cli.send(proposalIndex + '\n');
  const playerListOutput = await cli.waitFor('Select player (number): ');

  // Find player index by name
  let playerIndex = '1';
  let found = false;
  const playerMatches = [...playerListOutput.matchAll(/(\d+)\. \[.?\] (.+)/g)];
  for (const m of playerMatches) {
    if (m[2].trim() === action.player) {
      playerIndex = m[1];
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error(
      `[vote] Player "${action.player}" not found in player list.\nOutput:\n${playerListOutput}`
    );
  }

  cli.send(playerIndex + '\n');
  let output = proposalListOutput + playerListOutput;
  output += await cli.waitFor('Vote (yes/no/abstain): ');
  cli.send(action.value + '\n');
  output += await cli.waitFor(MAIN_PROMPT);
  return output;
}

// ============================================================================
// Public API
// ============================================================================

export async function runScenario(scenario: Scenario): Promise<void> {
  const fixturePath = path.isAbsolute(scenario.fixture)
    ? scenario.fixture
    : path.join(PROJECT_ROOT, scenario.fixture);

  const cli = new CliDriver(fixturePath);

  try {
    // Wait for the initial prompt
    await cli.waitFor(MAIN_PROMPT, 15000);

    for (const action of scenario.actions) {
      await runAction(cli, action);
    }
  } finally {
    await cli.close();
  }
}
