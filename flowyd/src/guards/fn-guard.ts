import type { IGuard, GuardContext, GuardFn } from '../types/index.js';

/**
 * Wraps a typed function as an `IGuard` for reuse across multiple transitions. For a
 * one-off guard, prefer the inline arrow-function shorthand on `addTransition`'s `guard:`
 * — it is auto-typed from the action's payload schema and the workflow's `TContext`.
 */
export class FnGuard<
  T = unknown,
  TContext = unknown,
  TStates extends string = string,
> implements IGuard<unknown> {
  constructor(private readonly fn: GuardFn<T, TContext, TStates>) {}

  evaluate(ctx: GuardContext<unknown>): Promise<boolean> {
    // Cast is safe: the engine validates payload against the action schema before
    // calling evaluate, context is the live instance context, and all state IDs
    // in instanceState are registered TStates by construction.
    return Promise.resolve(this.fn(ctx as GuardContext<T, TContext, TStates>));
  }
}
