import { StateKind } from '../types/index.js';
import type { IJoinState, JoinMode } from '../types/index.js';
import { BaseState } from './base.js';

/**
 * After every transition, the engine re-evaluates all `JoinState`s and flips `idle` → `active`
 * the moment `mode`'s threshold over `requires` is met — no explicit `dispatch` crosses the
 * barrier. Once active it behaves like a `StepState`, waiting for an action to advance.
 */
export class JoinState<TId extends string = string, TValidStates extends string = string>
  extends BaseState<TId>
  implements IJoinState
{
  readonly kind = StateKind.Join;
  readonly requires: readonly string[];
  readonly mode: JoinMode;

  /** `mode` defaults to `'all'`. @throws {Error} If `requires` is empty. */
  constructor(
    id: TId,
    options: { label?: string; requires: [TValidStates, ...TValidStates[]]; mode?: JoinMode },
  ) {
    super(id, options.label ?? id);
    if (options.requires.length === 0) {
      throw new Error(`JoinState "${id}" must declare at least one required state`);
    }
    this.requires = [...options.requires];
    this.mode = options.mode ?? 'all';
  }
}
