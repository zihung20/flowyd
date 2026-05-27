import type { IGuard, GuardContext, GuardFn } from '../types/index.js';

/**
 * A guard that unconditionally passes. Useful as a default in tests or
 * as an explicit "no guard required" marker on transitions.
 */
export class AlwaysGuard implements IGuard<unknown> {
  evaluate(_ctx: GuardContext<unknown>): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * A guard that unconditionally blocks. Useful in tests to assert that a
 * transition cannot fire regardless of payload.
 */
export class NeverGuard implements IGuard<unknown> {
  evaluate(_ctx: GuardContext<unknown>): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/**
 * Wraps an inline typed function as an `IGuard`.
 *
 * Use `Guard.fn(fn)` when you want to define a guard inline at transition
 * definition time rather than registering it by name. The payload type `T`
 * is asserted via a cast inside `evaluate` — ensure that the action this
 * guard is attached to produces a payload of type `T`.
 *
 * @template T        - The payload type the wrapped function expects.
 * @template TContext - The instance context type the function expects.
 */
export class FnGuard<T = unknown, TContext = unknown> implements IGuard<unknown> {
  constructor(private readonly fn: GuardFn<T, TContext>) {}

  evaluate(ctx: GuardContext<unknown>): Promise<boolean> {
    // Cast is safe: the engine validates payload against the action schema
    // before calling evaluate, and context is the live instance context.
    return Promise.resolve(this.fn(ctx as GuardContext<T, TContext>));
  }
}
