/**
 * Nomic HTTP game server entry point.
 *
 * Loads a game file, instantiates the engine, and starts listening on the
 * configured port.
 */

import { NomicEngine } from '../core/engine.js';
import { GameStorage } from '../persistence/storage.js';
import { createApp } from './app.js';
import type { ServerConfig } from './types.js';

/**
 * Start the HTTP game server.
 *
 * Loads existing game state from `config.gameFile` if the file exists,
 * otherwise creates a fresh engine. Starts listening on `config.port`.
 */
export async function startServer(config: ServerConfig): Promise<void> {
  let engine: NomicEngine;

  const storage = new GameStorage();
  if (await storage.exists(config.gameFile)) {
    const state = await storage.load(config.gameFile);
    engine = new NomicEngine({ state });
    console.log(`Loaded game from ${config.gameFile}`);
  } else {
    engine = new NomicEngine();
    console.log(`No existing game file found at ${config.gameFile} — starting fresh`);
  }

  const app = createApp(engine);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, () => {
      console.log(`Nomic server listening on port ${config.port}`);
      console.log(`Game file: ${config.gameFile}`);
      resolve();
    });
    server.on('error', reject);
  });
}
