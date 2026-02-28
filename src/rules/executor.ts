/**
 * Rule executor
 *
 * Manages rule execution lifecycle: validation, sandboxed execution,
 * and state transition verification.
 */

import type {
  ExecutionResult,
  GameState,
  Rule,
  RuleContext,
} from '../core/types.js';
import { RuleSandbox, type SandboxConfig } from '../sandbox/runtime.js';
import { validateTransition } from '../systems/transitions.js';
import { addTransition, generateId } from '../core/state.js';

// ============================================================================
// Rule Executor
// ============================================================================

export class RuleExecutor {
  private sandbox: RuleSandbox;

  constructor(sandboxConfig?: Partial<SandboxConfig>) {
    this.sandbox = new RuleSandbox(sandboxConfig);
  }

  /**
   * Execute a single rule
   */
  executeRule(state: GameState, rule: Rule, context: RuleContext): ExecutionResult {
    // Validate rule is active
    if (!rule.isActive) {
      return {
        success: false,
        error: `Rule ${rule.id} is not active`,
        rule,
      };
    }

    try {
      // Execute rule in sandbox
      const newState = this.sandbox.execute(rule, state, context);

      // Validate the state transition
      const validation = validateTransition(state, newState, rule);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid state transition: ${validation.errors.join(', ')}`,
          rule,
        };
      }

      // Record the rule execution in history
      const stateWithHistory = addTransition(newState, {
        id: generateId(),
        timestamp: context.timestamp,
        type: 'rule-executed',
        actorId: context.triggeredBy,
        data: {
          ruleId: rule.id,
          ruleNumber: rule.number,
          ruleName: rule.name,
        },
      });

      return {
        success: true,
        state: stateWithHistory,
        rule,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rule,
      };
    }
  }

  /**
   * Execute multiple rules in sequence
   * Stops on first error unless continueOnError is true
   */
  executeRules(
    state: GameState,
    rules: ReadonlyArray<Rule>,
    context: RuleContext,
    options: { continueOnError?: boolean } = {}
  ): ExecuteMultipleResult {
    const results: ExecutionResult[] = [];
    let currentState = state;

    for (const rule of rules) {
      const result = this.executeRule(currentState, rule, context);
      results.push(result);

      if (result.success && result.state) {
        currentState = result.state;
      } else if (!options.continueOnError) {
        // Stop on first error
        break;
      }
    }

    const allSucceeded = results.every(r => r.success);

    return {
      success: allSucceeded,
      results,
      finalState: allSucceeded ? currentState : state,
    };
  }

  /**
   * Execute all active rules
   */
  executeAllActiveRules(state: GameState, context: RuleContext): ExecuteMultipleResult {
    const activeRules = state.rules.filter(r => r.isActive);
    return this.executeRules(state, activeRules, context);
  }

  /**
   * Execute rules of a specific type
   * Useful for triggering win conditions, scoring rules, etc.
   */
  executeRulesByPattern(
    state: GameState,
    context: RuleContext,
    predicate: (rule: Rule) => boolean
  ): ExecuteMultipleResult {
    const matchingRules = state.rules.filter(r => r.isActive && predicate(r));
    return this.executeRules(state, matchingRules, context);
  }

  /**
   * Execute win condition rules
   * These are rules that check if anyone has won
   */
  checkWinConditions(state: GameState): GameState {
    // Find all rules that might be win conditions
    // (by convention, we can check rule names or have a specific pattern)
    const winConditionRules = state.rules.filter(
      r =>
        r.isActive &&
        (r.name.toLowerCase().includes('win') ||
          r.description.toLowerCase().includes('win'))
    );

    const context: RuleContext = {
      triggeredBy: 'system',
      timestamp: Date.now(),
    };

    const result = this.executeRules(state, winConditionRules, context, {
      continueOnError: true, // Check all win conditions
    });

    return result.finalState;
  }

  /**
   * Validate rule code without executing it
   */
  validateRuleCode(ruleCode: string): ValidationResult {
    // Check syntax
    const syntaxCheck = this.sandbox.validate(ruleCode);
    if (!syntaxCheck.valid) {
      return {
        valid: false,
        errors: [syntaxCheck.error || 'Invalid syntax'],
      };
    }

    // Check for forbidden patterns
    const securityCheck = this.sandbox.checkForbiddenPatterns(ruleCode);
    if (!securityCheck.safe) {
      return {
        valid: false,
        errors: securityCheck.violations,
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Test a rule with a given state (dry run)
   * Returns the result without modifying the actual game state
   */
  testRule(rule: Rule, state: GameState, context?: Partial<RuleContext>): ExecutionResult {
    const fullContext: RuleContext = {
      triggeredBy: context?.triggeredBy || 'test',
      timestamp: context?.timestamp || Date.now(),
      action: context?.action,
    };

    return this.executeRule(state, rule, fullContext);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ExecuteMultipleResult {
  success: boolean;
  results: ExecutionResult[];
  finalState: GameState;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
