import type { IState, StateKind } from '../types/index.js';

/**
 * `TId` preserves the constructor argument's string literal type so `WorkflowBuilder`'s
 * `addStep`/`addFork`/`addJoin`/`addWait` can track registered IDs at compile time.
 */
export abstract class BaseState<TId extends string = string> implements IState {
  abstract readonly kind: StateKind;

  constructor(
    readonly id: TId,
    readonly label: string,
  ) {
    if (!id.trim()) {
      throw new Error('State id must be a non-empty string');
    }
  }
}
