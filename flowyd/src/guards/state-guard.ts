import type { IGuard, GuardContext } from '../types/index.js';

/**
 * Passes when `stateId` has reached `completed` status — enforces a prerequisite in
 * the guard layer rather than relying solely on `JoinState` topology.
 */
export class StateCompletedGuard implements IGuard<unknown> {
  constructor(private readonly stateId: string) {}

  evaluate(ctx: GuardContext<unknown>): Promise<boolean> {
    return Promise.resolve(ctx.instanceState.isStateCompleted(this.stateId));
  }
}

/**
 * Passes when `stateId` is currently `active` — e.g. to confirm a parallel branch is
 * still in progress.
 */
export class StateActiveGuard implements IGuard<unknown> {
  constructor(private readonly stateId: string) {}

  evaluate(ctx: GuardContext<unknown>): Promise<boolean> {
    return Promise.resolve(ctx.instanceState.isStateActive(this.stateId));
  }
}
