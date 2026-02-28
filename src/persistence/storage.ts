/**
 * File storage for game state
 *
 * Handles reading and writing game state to JSON files.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { GameState } from '../core/types.js';
import { GameSerializer } from './serializer.js';
import { validateState } from '../systems/transitions.js';

// ============================================================================
// Game Storage
// ============================================================================

export class GameStorage {
  private serializer: GameSerializer;

  constructor() {
    this.serializer = new GameSerializer();
  }

  /**
   * Save game state to a file
   */
  async save(state: GameState, filepath: string): Promise<void> {
    // Validate state before saving
    const validation = validateState(state);
    if (!validation.valid) {
      throw new Error(
        `Cannot save invalid state: ${validation.errors.join(', ')}`
      );
    }

    // Ensure directory exists
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });

    // Serialize to JSON
    const json = this.serializer.toJSON(state, true);

    // Write to file
    await fs.writeFile(filepath, json, 'utf-8');
  }

  /**
   * Load game state from a file
   */
  async load(filepath: string): Promise<GameState> {
    // Read file
    const json = await fs.readFile(filepath, 'utf-8');

    // Deserialize
    const state = this.serializer.fromJSON(json);

    // Validate loaded state
    const validation = validateState(state);
    if (!validation.valid) {
      throw new Error(
        `Loaded state is invalid: ${validation.errors.join(', ')}`
      );
    }

    return state;
  }

  /**
   * Check if a file exists
   */
  async exists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all game files in a directory
   */
  async list(directory: string): Promise<string[]> {
    try {
      const files = await fs.readdir(directory);
      return files.filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
  }

  /**
   * Delete a game file
   */
  async delete(filepath: string): Promise<void> {
    await fs.unlink(filepath);
  }

  /**
   * Create a backup of a game file
   */
  async backup(filepath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const ext = path.extname(filepath);
    const base = filepath.slice(0, -ext.length);
    const backupPath = `${base}.backup.${timestamp}${ext}`;

    await fs.copyFile(filepath, backupPath);
    return backupPath;
  }

  /**
   * Get file metadata
   */
  async getMetadata(filepath: string): Promise<FileMetadata> {
    const stats = await fs.stat(filepath);
    const json = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(json);

    return {
      filepath,
      size: stats.size,
      modified: stats.mtime,
      gameId: data.gameId,
      version: data.version,
      status: data.status,
      playerCount: data.players?.length || 0,
      turnCount: data.turns?.currentTurn || 0,
    };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface FileMetadata {
  filepath: string;
  size: number;
  modified: Date;
  gameId: string;
  version: string;
  status: string;
  playerCount: number;
  turnCount: number;
}
