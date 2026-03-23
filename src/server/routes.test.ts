import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { NomicEngine } from '../core/engine.js';
import { createApp } from './index.js';

const tempFiles: string[] = [];

async function makeGame(playerNames: string[] = ['Alice', 'Bob']) {
  const saveFile = path.join(os.tmpdir(), `nomic-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  tempFiles.push(saveFile);
  const engine = new NomicEngine();
  engine.initialize(playerNames);
  await engine.save(saveFile);
  const app = createApp(engine, saveFile);
  return { engine, app, saveFile };
}

async function makeActiveGame(playerNames: string[] = ['Alice', 'Bob']) {
  const { engine, app, saveFile } = await makeGame(playerNames);
  engine.start();
  await engine.save(saveFile);
  return { engine, app, saveFile };
}

afterEach(async () => {
  while (tempFiles.length > 0) {
    const f = tempFiles.pop()!;
    await fs.unlink(f).catch(() => { /* already gone */ });
  }
});

describe('GET /state', () => {
  it('returns current game state shape', async () => {
    const { app } = await makeGame();
    const res = await request(app).get('/state');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'setup',
      players: expect.arrayContaining([
        expect.objectContaining({ name: 'Alice' }),
        expect.objectContaining({ name: 'Bob' }),
      ]),
    });
  });
});

describe('GET /rules', () => {
  it('returns active rules without code field', async () => {
    const { app } = await makeGame();
    const res = await request(app).get('/rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((rule: Record<string, unknown>) => {
      expect(rule).not.toHaveProperty('code');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('number');
    });
  });
});

describe('GET /proposals', () => {
  it('returns empty array when no active proposals', async () => {
    const { app } = await makeActiveGame();
    const res = await request(app).get('/proposals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /players', () => {
  it('adds a player during setup', async () => {
    const { app } = await makeGame([]);
    const res = await request(app).post('/players').send({ name: 'Charlie' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Charlie' });
  });

  it('rejects adding a player after game starts', async () => {
    const { app } = await makeActiveGame();
    const res = await request(app).post('/players').send({ name: 'Charlie' });
    expect(res.status).toBe(400);
  });

  it('rejects missing name', async () => {
    const { app } = await makeGame([]);
    const res = await request(app).post('/players').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /start', () => {
  it('transitions game to active', async () => {
    const { app } = await makeGame();
    const res = await request(app).post('/start');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('returns 400 when game is already active', async () => {
    const { app } = await makeActiveGame();
    const res = await request(app).post('/start');
    expect(res.status).toBe(400);
  });
});

describe('POST /propose', () => {
  it('creates a proposal for the current player', async () => {
    const { engine, app } = await makeActiveGame();
    const currentPlayerId = engine.getCurrentPlayerId()!;
    const rule = engine.getAllRules()[0];

    const res = await request(app).post('/propose').send({
      playerId: currentPlayerId,
      description: 'A test proposal',
      rule: { ...rule, id: 'new-rule-id', number: 999, name: 'Test Rule', isActive: false },
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('proposalId');
  });

  it('returns 409 when it is not your turn', async () => {
    const { engine, app } = await makeActiveGame();
    const players = engine.getPlayers();
    const notCurrentPlayer = players.find(p => p.id !== engine.getCurrentPlayerId())!;
    const rule = engine.getAllRules()[0];

    const res = await request(app).post('/propose').send({
      playerId: notCurrentPlayer.id,
      description: 'A test proposal',
      rule: { ...rule, id: 'new-rule-id', number: 999, name: 'Test Rule', isActive: false },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('It is not your turn');
  });

  it('returns 400 when game is not active', async () => {
    const { engine, app } = await makeGame();
    const players = engine.getPlayers();
    const rule = engine.getAllRules()[0];

    const res = await request(app).post('/propose').send({
      playerId: players[0].id,
      description: 'A test proposal',
      rule: { ...rule, id: 'new-rule-id', number: 999, name: 'Test Rule', isActive: false },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /vote', () => {
  async function setupWithProposal() {
    const { engine, app, saveFile } = await makeActiveGame();
    const currentPlayerId = engine.getCurrentPlayerId()!;
    const rule = engine.getAllRules()[0];
    engine.proposeRule(currentPlayerId, 'Test proposal', {
      ...rule,
      id: 'new-rule-id',
      number: 999,
      name: 'Test Rule',
      isActive: false,
    });
    await engine.save(saveFile);
    const proposalId = engine.getActiveProposals()[0].id;
    return { engine, app, saveFile, proposalId };
  }

  it('accepts a vote from any player regardless of turn', async () => {
    const { engine, app, proposalId } = await setupWithProposal();
    const nonCurrentPlayer = engine.getPlayers().find(p => p.id !== engine.getCurrentPlayerId())!;

    const res = await request(app).post('/vote').send({
      playerId: nonCurrentPlayer.id,
      proposalId,
      value: 'yes',
    });
    expect(res.status).toBe(200);
    expect(res.body.proposalId).toBe(proposalId);
  });

  it('auto-resolves when all players have voted', async () => {
    const { engine, app, proposalId } = await setupWithProposal();
    const players = engine.getPlayers();

    for (const player of players) {
      await request(app).post('/vote').send({ playerId: player.id, proposalId, value: 'yes' });
    }

    const proposalsRes = await request(app).get('/proposals');
    expect(proposalsRes.body).toHaveLength(0); // resolved, no longer active
  });

  it('returns 409 on duplicate vote', async () => {
    const { engine, app, proposalId } = await setupWithProposal();
    const player = engine.getPlayers()[0];

    await request(app).post('/vote').send({ playerId: player.id, proposalId, value: 'yes' });
    const res = await request(app).post('/vote').send({ playerId: player.id, proposalId, value: 'yes' });
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid vote value', async () => {
    const { engine, app, proposalId } = await setupWithProposal();
    const player = engine.getPlayers()[0];

    const res = await request(app).post('/vote').send({ playerId: player.id, proposalId, value: 'maybe' });
    expect(res.status).toBe(400);
  });
});

describe('POST /end-turn', () => {
  it('advances to the next player', async () => {
    const { engine, app } = await makeActiveGame();
    const firstPlayerId = engine.getCurrentPlayerId()!;

    const res = await request(app).post('/end-turn').send({ playerId: firstPlayerId });
    expect(res.status).toBe(200);
    expect(res.body.currentPlayerId).not.toBe(firstPlayerId);
  });

  it('returns 409 when it is not your turn', async () => {
    const { engine, app } = await makeActiveGame();
    const notCurrentPlayer = engine.getPlayers().find(p => p.id !== engine.getCurrentPlayerId())!;

    const res = await request(app).post('/end-turn').send({ playerId: notCurrentPlayer.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('It is not your turn');
  });

  it('returns 400 when game is not active', async () => {
    const { engine, app } = await makeGame();
    const player = engine.getPlayers()[0];

    const res = await request(app).post('/end-turn').send({ playerId: player.id });
    expect(res.status).toBe(400);
  });
});
