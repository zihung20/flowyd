import { StateKind } from '../types/index.js';
import type { IStepState } from '../types/index.js';
import { BaseState } from './base.js';

/**
 * Dead-end fork-target steps (no outgoing transitions) are auto-completed on entry by the
 * engine (inferred at `build()` time), so a downstream `JoinState` can activate via `requires`
 * without an explicit branch→join transition.
 */
export class StepState<TId extends string = string> extends BaseState<TId> implements IStepState {
  readonly kind = StateKind.Step;

  constructor(id: TId, options: { label?: string } = {}) {
    super(id, options.label ?? id);
  }
}
