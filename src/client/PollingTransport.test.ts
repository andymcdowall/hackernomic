import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingTransport } from './PollingTransport.js';
import type { Rule } from '../core/types.js';

const BASE = 'http://localhost:3000';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

describe('PollingTransport', () => {
  let transport: PollingTransport;

  beforeEach(() => {
    transport = new PollingTransport(BASE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Read endpoints ──────────────────────────────────────────────────────────

  it('getState calls GET /state', async () => {
    const state = { gameId: 'g1', status: 'active', turn: 1, currentPlayerId: 'p1', players: [], activeProposals: 0 };
    vi.stubGlobal('fetch', mockFetch(200, state));

    const result = await transport.getState();

    expect(fetch).toHaveBeenCalledWith(`${BASE}/state`);
    expect(result).toEqual(state);
  });

  it('getRules calls GET /rules', async () => {
    const rules = [{ id: 'r1', number: 101, name: 'Test', description: 'desc', isMutable: true, proposedBy: 'p1' }];
    vi.stubGlobal('fetch', mockFetch(200, rules));

    const result = await transport.getRules();

    expect(fetch).toHaveBeenCalledWith(`${BASE}/rules`);
    expect(result).toEqual(rules);
  });

  it('getProposals calls GET /proposals', async () => {
    const proposals = [{ id: 'pr1', type: 'add-rule', description: 'Add rule', proposedBy: 'p1', status: 'pending', votes: [], totalPlayers: 2 }];
    vi.stubGlobal('fetch', mockFetch(200, proposals));

    const result = await transport.getProposals();

    expect(fetch).toHaveBeenCalledWith(`${BASE}/proposals`);
    expect(result).toEqual(proposals);
  });

  // ── Write endpoints ─────────────────────────────────────────────────────────

  it('propose calls POST /propose with correct body and returns proposalId', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { proposalId: 'pr1' }));

    const rule = { id: 'r1', number: 201 } as Rule;
    const result = await transport.propose('p1', 'My rule', rule);

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/propose`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'p1', description: 'My rule', rule }),
      })
    );
    expect(result).toBe('pr1');
  });

  it('vote calls POST /vote with correct body and returns status', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { proposalId: 'pr1', status: 'passed' }));

    const result = await transport.vote('p1', 'pr1', 'yes');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/vote`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerId: 'p1', proposalId: 'pr1', value: 'yes' }),
      })
    );
    expect(result).toBe('passed');
  });

  it('endTurn calls POST /end-turn with playerId', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { turn: 2, currentPlayerId: 'p2' }));

    await transport.endTurn('p1');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/end-turn`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerId: 'p1' }),
      })
    );
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it('throws with server error message on 4xx GET', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'Game is not active' }));

    await expect(transport.getState()).rejects.toThrow('Game is not active');
  });

  it('throws with server error message on 4xx POST', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'It is not your turn' }));

    await expect(transport.endTurn('p2')).rejects.toThrow('It is not your turn');
  });
});
