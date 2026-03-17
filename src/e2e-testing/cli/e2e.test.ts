/**
 * E2E Test Entry Point
 *
 * Discovers all *.yaml files in the scenarios/ directory and runs each
 * as a Vitest test case. Each test spawns the Nomic CLI and drives it
 * via stdin/stdout according to the scenario definition.
 *
 * Run all E2E tests:   npx vitest src/e2e-testing
 * Run all tests:       npm test
 * Regenerate fixtures: npm run generate-fixtures
 */

import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { Scenario } from './types.js';
import { runScenario } from './scenario-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, '../../../e2e/scenarios');

function discoverScenarios(): Array<{ file: string; scenario: Scenario }> {
  let files: string[];
  try {
    files = readdirSync(SCENARIOS_DIR).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml')
    );
  } catch {
    // scenarios/ directory doesn't exist yet
    return [];
  }

  return files.map(file => {
    const fullPath = path.join(SCENARIOS_DIR, file);
    const content = readFileSync(fullPath, 'utf-8');
    const scenario = yaml.load(content) as Scenario;
    return { file, scenario };
  });
}

const scenarios = discoverScenarios();

describe('E2E Scenarios', () => {
  if (scenarios.length === 0) {
    it('placeholder - no scenario files found in scenarios/', () => {
      // Scenarios directory is empty or doesn't exist. Create .yaml files
      // in scenarios/ to add E2E tests. See README for schema details.
    });
    return;
  }

  for (const { file, scenario } of scenarios) {
    it(
      scenario.name ?? file,
      async () => {
        await runScenario(scenario);
      },
      // 30-second timeout per scenario (spawning + CLI interaction takes time)
      30_000
    );
  }
});
