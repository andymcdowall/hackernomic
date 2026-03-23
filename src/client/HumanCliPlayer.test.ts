import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanCliPlayer } from './HumanCliPlayer.js';
import type { GameTransport, ClientGameState, ClientProposal, ClientRule } from './transport.js';
import type { RlInterface } from './HumanCliPlayer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'game-1',
    status: 'active',
    turn: 1,
    currentPlayerId: 'player-1',
    players: [
      { id: 'player-1', name: 'Alice', points: 0, isActive: true },
      { id: 'player-2', name: 'Bob', points: 0, isActive: true },
    ],
    activeProposals: 0,
    ...overrides,
  };
}

function makeTransport(overrides: Partial<GameTransport> = {}): GameTransport {
  return {
    getState: vi.fn().mockResolvedValue(makeState()),
    getRules: vi.fn().mockResolvedValue([]),
    getProposals: vi.fn().mockResolvedValue([]),
    propose: vi.fn().mockResolvedValue('proposal-1'),
    vote: vi.fn().mockResolvedValue('pending'),
    endTurn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Build a mock readline that feeds a sequence of answers */
function makeRl(answers: string[]): RlInterface {
  let i = 0;
  return {
    question: vi.fn().mockImplementation(() => Promise.resolve(answers[i++] ?? '')),
    close: vi.fn(),
  };
}

function makePlayer(transport: GameTransport, answers: string[]): HumanCliPlayer {
  const rl = makeRl(answers);
  return new HumanCliPlayer(transport, 'player-1', () => rl);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HumanCliPlayer', () => {
  it('calls endTurn when user types end-turn', async () => {
    const transport = makeTransport({
      getState: vi.fn()
        .mockResolvedValueOnce(makeState({ currentPlayerId: 'player-1' }))
        .mockResolvedValue(makeState({ status: 'completed' })),
    });

    await makePlayer(transport, ['end-turn']).play();

    expect(transport.endTurn).toHaveBeenCalledWith('player-1');
  });

  it('exits immediately when user types quit without calling endTurn', async () => {
    const transport = makeTransport({
      getState: vi.fn().mockResolvedValue(makeState({ currentPlayerId: 'player-1' })),
    });

    await makePlayer(transport, ['quit']).play();

    expect(transport.endTurn).not.toHaveBeenCalled();
  });

  it('calls getRules when user types rules', async () => {
    const rules: ClientRule[] = [
      { id: 'r1', number: 101, name: 'Test', description: 'desc', isMutable: true, proposedBy: 'p1' },
    ];
    const transport = makeTransport({
      getState: vi.fn().mockResolvedValue(makeState({ currentPlayerId: 'player-1' })),
      getRules: vi.fn().mockResolvedValue(rules),
    });

    await makePlayer(transport, ['rules', 'quit']).play();

    expect(transport.getRules).toHaveBeenCalled();
  });

  it('calls getProposals when user types proposals', async () => {
    const transport = makeTransport({
      getState: vi.fn().mockResolvedValue(makeState({ currentPlayerId: 'player-1' })),
    });

    await makePlayer(transport, ['proposals', 'quit']).play();

    expect(transport.getProposals).toHaveBeenCalled();
  });

  it('submits vote when user selects a proposal and votes', async () => {
    const proposal: ClientProposal = {
      id: 'pr1', type: 'add-rule', description: 'Add rule', proposedBy: 'player-2',
      status: 'pending', votes: [], totalPlayers: 2,
    };
    const transport = makeTransport({
      getState: vi.fn().mockResolvedValue(makeState({ currentPlayerId: 'player-1', activeProposals: 1 })),
      getProposals: vi.fn().mockResolvedValue([proposal]),
    });

    // vote → select 1 → yes → quit
    await makePlayer(transport, ['vote', '1', 'yes', 'quit']).play();

    expect(transport.vote).toHaveBeenCalledWith('player-1', 'pr1', 'yes');
  });

  it('polls and waits when it is not the player\'s turn', async () => {
    let callCount = 0;
    const transport = makeTransport({
      getState: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeState({ currentPlayerId: 'player-2' }));
        return Promise.resolve(makeState({ status: 'completed' }));
      }),
    });

    vi.useFakeTimers();
    const playPromise = new HumanCliPlayer(transport, 'player-1', () => makeRl([])).play();
    await vi.runAllTimersAsync();
    await playPromise;
    vi.useRealTimers();

    expect(transport.getState).toHaveBeenCalledTimes(3);
    expect(transport.endTurn).not.toHaveBeenCalled();
  });

  it('shows status when user types status', async () => {
    const transport = makeTransport({
      getState: vi.fn().mockResolvedValue(makeState({ currentPlayerId: 'player-1' })),
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await makePlayer(transport, ['status', 'quit']).play();

    consoleSpy.mockRestore();
    // getState called once for poll, once for status command
    expect(transport.getState).toHaveBeenCalledTimes(2);
  });
});
