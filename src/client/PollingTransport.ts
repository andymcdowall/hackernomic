/**
 * HTTP-based GameTransport implementation.
 *
 * All actions are synchronous HTTP POST calls. State reads are GET calls.
 * This transport is used by both the CLI and (future) MCP adapter.
 */

import type { Rule, VoteValue } from '../core/types.js';
import type {
  GameTransport,
  ClientGameState,
  ClientRule,
  ClientProposal,
} from './transport.js';

export class PollingTransport implements GameTransport {
  constructor(private readonly baseUrl: string) {}

  async getState(): Promise<ClientGameState> {
    return this.get<ClientGameState>('/state');
  }

  async getRules(): Promise<ClientRule[]> {
    return this.get<ClientRule[]>('/rules');
  }

  async getProposals(): Promise<ClientProposal[]> {
    return this.get<ClientProposal[]>('/proposals');
  }

  async propose(playerId: string, description: string, rule: Rule): Promise<string> {
    const body = { playerId, description, rule };
    const data = await this.post<{ proposalId: string }>('/propose', body);
    return data.proposalId;
  }

  async vote(playerId: string, proposalId: string, value: VoteValue): Promise<string> {
    const body = { playerId, proposalId, value };
    const data = await this.post<{ proposalId: string; status: string }>('/vote', body);
    return data.status;
  }

  async endTurn(playerId: string): Promise<void> {
    await this.post('/end-turn', { playerId });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(body.error ?? res.statusText);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(data.error ?? res.statusText);
    }
    return res.json() as Promise<T>;
  }
}
