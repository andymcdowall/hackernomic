/**
 * Game server route handlers.
 *
 * Turn-gated endpoints (propose, end-turn) validate that the requesting
 * playerId is the current player before calling the engine.
 * Voting is NOT turn-gated — any player can vote at any time.
 */

import type { Router, Request, Response, NextFunction } from 'express';
import { Router as createRouter } from 'express';
import type { NomicEngine } from '../core/engine.js';
import { NomicEngineError } from '../core/types.js';
import type { Rule } from '../core/types.js';
import { generateId } from '../core/state.js';

// Fields a client supplies when proposing a rule. Server generates id, createdAt,
// isActive, isMutable, and proposedBy.
type RuleInput = Pick<Rule, 'number' | 'name' | 'description' | 'code' | 'triggers'>;

// Note: playerId is taken from the request body with no cryptographic verification.
// Any client can claim to be any player. This is intentional for local/trusted play.
// Revisit before exposing this server over an untrusted network.
//
// Throws NomicEngineError so callers inside try/catch blocks get automatic error
// handler dispatch — no boolean return to forget to check.
function assertCurrentPlayer(engine: NomicEngine, playerId: string): void {
  if (engine.getStatus() !== 'active') {
    throw new NomicEngineError(`Game is not active (status: ${engine.getStatus()})`, 'INVALID_STATE');
  }
  if (!engine.isPlayerTurn(playerId)) {
    throw new NomicEngineError('It is not your turn', 'PERMISSION_DENIED');
  }
}

export function createRoutes(engine: NomicEngine, saveFile: string): Router {
  const router = createRouter();

  // ── Read endpoints ────────────────────────────────────────────────────────
  // Response shapes per endpoint:
  //   GET  /state       → { gameId, status, turn, currentPlayerId, players[], activeProposals }
  //   GET  /rules       → Rule[] (id, number, name, description, isMutable, proposedBy — no code)
  //   GET  /proposals   → Proposal[] (id, type, description, proposedBy, status, votes[], totalActivePlayers)
  //   POST /players     → Player (id, name, joinedAt, isActive)
  //   POST /start       → { status }
  //   POST /propose     → { proposalId }
  //   POST /vote        → { proposalId, status }
  //   POST /end-turn    → { turn, currentPlayerId }

  router.get('/state', (_req: Request, res: Response) => {
    const state = engine.getState();
    res.json({
      gameId: state.gameId,
      status: state.status,
      turn: state.turns.currentTurn,
      currentPlayerId: state.turns.currentPlayerId,
      players: engine.getPlayers().map(p => ({
        id: p.id,
        name: p.name,
        points: engine.getPoints(p.id),
        isActive: p.isActive,
      })),
      activeProposals: engine.getActiveProposals().length,
    });
  });

  router.get('/rules', (_req: Request, res: Response) => {
    res.json(
      engine.getActiveRules().map(r => ({
        id: r.id,
        number: r.number,
        name: r.name,
        description: r.description,
        isMutable: r.isMutable,
        proposedBy: r.proposedBy,
      }))
    );
  });

  router.get('/proposals', (_req: Request, res: Response) => {
    res.json(
      engine.getActiveProposals().map(p => ({
        id: p.id,
        type: p.type,
        description: p.description,
        proposedBy: p.proposedBy,
        status: p.status,
        votes: Array.from(p.votes.entries()).map(([playerId, vote]) => ({
          playerId,
          value: vote.value,
        })),
        totalActivePlayers: engine.getPlayers().filter(player => player.isActive).length,
      }))
    );
  });

  // ── Setup endpoints ───────────────────────────────────────────────────────

  router.post('/players', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const player = engine.addPlayer(name);
      await engine.save(saveFile);
      res.status(201).json(player);
    } catch (err) {
      next(err);
    }
  });

  router.post('/start', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      engine.start();
      await engine.save(saveFile);
      res.json({ status: engine.getStatus() });
    } catch (err) {
      next(err);
    }
  });

  // ── Gameplay endpoints ────────────────────────────────────────────────────

  router.post('/propose', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId, description, rule: ruleInput } = req.body as {
        playerId: string;
        description: string;
        rule: RuleInput;
      };
      if (!playerId || !description || !ruleInput) {
        res.status(400).json({ error: 'playerId, description, and rule are required' });
        return;
      }
      if (typeof ruleInput.name !== 'string' || !ruleInput.name || typeof ruleInput.code !== 'string' || !ruleInput.code) {
        res.status(400).json({ error: 'rule.name and rule.code must be non-empty strings' });
        return;
      }
      if (typeof ruleInput.number !== 'number' || !Number.isInteger(ruleInput.number)) {
        res.status(400).json({ error: 'rule.number must be an integer' });
        return;
      }
      assertCurrentPlayer(engine, playerId);

      const rule: Rule = {
        ...ruleInput,
        id: generateId(),
        createdAt: Date.now(),
        isActive: false,
        isMutable: true,
        proposedBy: playerId,
      };
      const proposalId = engine.proposeRule(playerId, description, rule);
      await engine.save(saveFile);
      res.status(201).json({ proposalId });
    } catch (err) {
      next(err);
    }
  });

  // Note: concurrent POST /vote requests are not protected by a lock. Two simultaneous
  // votes could both read pre-resolved state and both attempt auto-resolution. This is
  // a known limitation acceptable for single-machine local play. Add a mutex before
  // exposing this server to real concurrent clients.
  router.post('/vote', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId, proposalId, value } = req.body as {
        playerId: string;
        proposalId: string;
        value: 'yes' | 'no' | 'abstain';
      };
      if (!playerId || !proposalId || !value) {
        res.status(400).json({ error: 'playerId, proposalId, and value are required' });
        return;
      }
      if (!['yes', 'no', 'abstain'].includes(value)) {
        res.status(400).json({ error: 'value must be yes, no, or abstain' });
        return;
      }
      engine.vote(proposalId, playerId, value);
      await engine.save(saveFile);

      // engine.getProposal checks both activeProposals and proposalHistory,
      // so this returns the real status ('passed'/'failed') even after auto-resolution.
      const proposal = engine.getProposal(proposalId);
      res.json({
        proposalId,
        status: proposal?.status,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/end-turn', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.body as { playerId: string };
      if (!playerId) {
        res.status(400).json({ error: 'playerId is required' });
        return;
      }
      assertCurrentPlayer(engine, playerId);

      engine.endTurn();
      await engine.save(saveFile);
      res.json({
        turn: engine.getCurrentTurn(),
        currentPlayerId: engine.getCurrentPlayerId(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
