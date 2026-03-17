/**
 * Rule execution sandbox
 *
 * Provides a secure environment for executing rule code using vm2.
 * Rules run in an isolated context with limited access to prevent malicious code.
 */

import { VM } from 'vm2';
import type { GameState, Rule, RuleContext } from '../core/types.js';
import { StateHelpers } from '../core/state.js';

// ============================================================================
// Sandbox Configuration
// ============================================================================

export interface SandboxConfig {
  readonly timeout: number; // milliseconds
  readonly maxIterations: number;
  readonly allowedGlobals: ReadonlyArray<string>;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeout: 5000, // 5 seconds
  maxIterations: 10000,
  allowedGlobals: ['Math', 'Date', 'Map', 'Set', 'Array', 'Object', 'Number', 'String'],
};

// ============================================================================
// Rule Sandbox
// ============================================================================

export class RuleSandbox {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * Execute a rule in a sandboxed environment
   */
  execute(rule: Rule, state: GameState, context: RuleContext): GameState {
    try {
      // Create VM instance with security restrictions
      const vm = new VM({
        timeout: this.config.timeout,
        sandbox: this.createSandbox(state, context),
        eval: false, // Disable eval
        wasm: false, // Disable WebAssembly
      });

      // Wrap the rule code in a function wrapper
      const wrappedCode = this.wrapRuleCode(rule.code);

      // Execute the rule
      const result = vm.run(wrappedCode);

      // Validate the result is a valid GameState
      if (!result || typeof result !== 'object') {
        throw new Error('Rule must return a GameState object');
      }

      // Basic validation that result has required fields
      if (!result.gameId || !result.version) {
        throw new Error('Rule returned invalid GameState (missing required fields)');
      }

      return result as GameState;
    } catch (error) {
      // Wrap execution errors with rule context
      const message = error instanceof Error ? error.message : String(error);
      throw this.createExecutionError(rule, message, error);
    }
  }

  /**
   * Create the sandbox environment with available APIs
   */
  private createSandbox(state: GameState, context: RuleContext): Record<string, any> {
    return {
      // Provide a deep clone of state (prevent direct mutation)
      state: this.cloneState(state),
      context: { ...context },

      // Safe built-in objects
      Math,
      Date,
      Map,
      Set,
      Array,
      Object,
      Number,
      String,
      Boolean,

      // State helper functions
      StateHelpers: {
        ...StateHelpers,
        // Ensure helpers work with the cloned state
      },

      // Logging for debugging (can be disabled in production)
      console: {
        log: (...args: any[]) => {
          // In production, you might want to collect these or disable
          console.log('[Rule Log]', ...args);
        },
      },

      // JSON for data manipulation
      JSON,
    };
  }

  /**
   * Wrap rule code in an immediately-invoked function expression
   */
  private wrapRuleCode(code: string): string {
    // The code should be a function that takes (state, context)
    // We wrap it and call it with the sandboxed state and context
    return `
      'use strict';
      (function() {
        const ruleFunction = ${code};
        if (typeof ruleFunction !== 'function') {
          throw new Error('Rule code must be a function');
        }
        return ruleFunction(state, context);
      })();
    `;
  }

  /**
   * Deep clone state for sandbox (prevents any possibility of mutation)
   */
  private cloneState(state: GameState): any {
    return JSON.parse(JSON.stringify(state, this.mapReplacer), this.mapReviver);
  }

  /**
   * JSON replacer to handle Maps
   */
  private mapReplacer(_key: string, value: any): any {
    if (value instanceof Map) {
      return {
        __type: 'Map',
        value: Array.from(value.entries()),
      };
    }
    return value;
  }

  /**
   * JSON reviver — counterpart to mapReplacer. Restores Map objects that were
   * serialized as { __type: 'Map', value: [...entries] } back into real Maps,
   * so the cloned state has the same structure (Maps intact) as the original.
   */
  private mapReviver(_key: string, value: any): any {
    if (value && value.__type === 'Map') {
      return new Map(value.value);
    }
    return value;
  }

  /**
   * Create a detailed execution error
   */
  private createExecutionError(rule: Rule, message: string, cause?: unknown): Error {
    const error: any = new Error(
      `Rule execution failed [${rule.number}: ${rule.name}]: ${message}`
    );
    error.name = 'RuleExecutionError';
    error.rule = rule;
    error.cause = cause;
    return error;
  }

  /**
   * Validate rule code syntax without executing it
   */
  validate(ruleCode: string): { valid: boolean; error?: string } {
    try {
      // Try to parse the code as a function
      new Function(`return (${ruleCode})`);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test if code contains forbidden patterns
   */
  checkForbiddenPatterns(code: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    // Forbidden patterns (basic checks - vm2 provides the real protection)
    const forbidden = [
      { pattern: /require\s*\(/g, message: 'Cannot use require()' },
      { pattern: /import\s+/g, message: 'Cannot use import statements' },
      { pattern: /eval\s*\(/g, message: 'Cannot use eval()' },
      { pattern: /Function\s*\(/g, message: 'Cannot use Function() constructor' },
      { pattern: /setTimeout|setInterval/g, message: 'Cannot use setTimeout/setInterval' },
      { pattern: /process\./g, message: 'Cannot access process object' },
      { pattern: /__proto__|prototype\s*=/g, message: 'Cannot modify prototypes' },
    ];

    for (const { pattern, message } of forbidden) {
      if (pattern.test(code)) {
        violations.push(message);
      }
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }
}
