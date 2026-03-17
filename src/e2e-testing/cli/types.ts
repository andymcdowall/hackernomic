/**
 * TypeScript types for the E2E YAML scenario schema.
 */

export type VoteValue = 'yes' | 'no' | 'abstain';
export type GameStatus = 'setup' | 'active' | 'completed';

/** Inline rule specification used in propose actions */
export interface RuleSpec {
  name: string;
  description: string;
  /** Single-line TypeScript function, e.g. "(state) => state" */
  code: string;
  /** 'turn-end', 'never', or a custom event type string */
  trigger?: string;
}

export interface ExpectState {
  status?: GameStatus;
  /** Player name (not ID) */
  current_player?: string;
  turn_number?: number;
  /** Map of player name → expected points */
  points?: Record<string, number>;
  active_rule_count?: number;
  pending_proposals?: number;
  adopted_proposals?: number;
  rejected_proposals?: number;
}

export interface ExpectEvent {
  type: string;
}

interface ActionBase {
  expect_output?: string | string[];
  expect_not_output?: string | string[];
  expect_state?: ExpectState;
}

export interface AddPlayerAction extends ActionBase {
  type: 'add_player';
  name: string;
}

export interface StartAction extends ActionBase {
  type: 'start';
}

/**
 * Propose a new rule and drive the full voting phase.
 * votes maps each player name to their vote value (must include all players).
 */
export interface ProposeAction extends ActionBase {
  type: 'propose';
  /** Premade rule key (string) or inline rule spec */
  rule: string | RuleSpec;
  /** One entry per player, keyed by player name */
  votes: Record<string, VoteValue>;
}

/**
 * Cast an individual vote on an existing pending proposal.
 * Use 'latest_proposal' to target the most recently created active proposal.
 */
export interface VoteAction extends ActionBase {
  type: 'vote';
  on: 'latest_proposal' | string;
  player: string;
  value: VoteValue;
}

export interface EndTurnAction extends ActionBase {
  type: 'end_turn';
}

export interface SaveAction extends ActionBase {
  type: 'save';
}

export interface StatusAction extends ActionBase {
  type: 'status';
}

export interface RulesAction extends ActionBase {
  type: 'rules';
}

export interface LeaderboardAction extends ActionBase {
  type: 'leaderboard';
}

export interface ShowStateAction extends ActionBase {
  type: 'show_state';
}

export type ScenarioAction =
  | AddPlayerAction
  | StartAction
  | ProposeAction
  | VoteAction
  | EndTurnAction
  | SaveAction
  | StatusAction
  | RulesAction
  | LeaderboardAction
  | ShowStateAction;

export interface Scenario {
  name: string;
  description?: string;
  /** Path to fixture JSON file, relative to project root */
  fixture: string;
  actions: ScenarioAction[];
}
