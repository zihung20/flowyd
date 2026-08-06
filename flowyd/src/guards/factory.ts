import type { IGuard, GuardFn } from '../types/index.js';
import { AndGuard } from './and-guard.js';
import { OrGuard } from './or-guard.js';
import { NotGuard } from './not-guard.js';
import { InjectedGuard } from './inject-guard.js';
import { StateCompletedGuard, StateActiveGuard } from './state-guard.js';
import { AlwaysGuard, NeverGuard } from './constant-guards.js';
import { FnGuard } from './fn-guard.js';

/**
 * Factory namespace for constructing and composing guards. All guards implement
 * `IGuard<unknown>` so they can be freely stored in `TransitionDefinition.guard`;
 * payload typing is enforced at `injectGuard<TPayload>()` / `Guard.fn<TPayload>()`.
 */
export const Guard = {
  /** Named placeholder resolved from the instance's guard registry at evaluation time. */
  inject(name: string): InjectedGuard {
    return new InjectedGuard(name);
  },

  /** Passes when `stateId` has `completed` status. */
  stateCompleted(stateId: string): StateCompletedGuard {
    return new StateCompletedGuard(stateId);
  },

  /** Passes when `stateId` has `active` status. */
  stateActive(stateId: string): StateActiveGuard {
    return new StateActiveGuard(stateId);
  },

  /** @throws {Error} If fewer than two guards are provided. */
  and(guards: IGuard<unknown>[]): AndGuard {
    return new AndGuard(guards);
  },

  /** @throws {Error} If fewer than two guards are provided. */
  or(guards: IGuard<unknown>[]): OrGuard {
    return new OrGuard(guards);
  },

  not(guard: IGuard<unknown>): NotGuard {
    return new NotGuard(guard);
  },

  /**
   * Wraps a typed function as a reusable guard; for a one-off, prefer an inline arrow
   * on `addTransition`'s `guard:`.
   */
  fn<T = unknown, TContext = unknown>(fn: GuardFn<T, TContext>): FnGuard<T, TContext> {
    return new FnGuard(fn);
  },

  /** A guard that always passes. Useful as an explicit no-op in tests. */
  always(): AlwaysGuard {
    return new AlwaysGuard();
  },

  /** A guard that always blocks. Useful for testing blocked transitions. */
  never(): NeverGuard {
    return new NeverGuard();
  },
} as const;
