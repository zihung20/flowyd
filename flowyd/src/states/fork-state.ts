import { StateKind } from '../types/index.js';
import type { IForkState } from '../types/index.js';
import { BaseState } from './base.js';

/**
 * The engine never leaves a `ForkState` in `active` status — it enters and completes it
 * atomically in the same tick, activating every target before `dispatch` returns.
 */
export class ForkState<TId extends string = string, TValidStates extends string = string>
  extends BaseState<TId>
  implements IForkState
{
  readonly kind = StateKind.Fork;
  readonly targets: readonly string[];

  /** @throws {Error} If `targets` is empty. */
  constructor(id: TId, options: { label?: string; targets: [TValidStates, ...TValidStates[]] }) {
    super(id, options.label ?? id);
    if (options.targets.length === 0) {
      throw new Error(`ForkState "${id}" must declare at least one target state`);
    }
    this.targets = [...options.targets];
  }
}
