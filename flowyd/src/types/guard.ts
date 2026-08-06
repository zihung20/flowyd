import type { ReadonlyInstanceState } from './instance.js';

export interface GuardContext<TPayload, TContext = unknown, TStates extends string = string> {
  readonly payload: TPayload;
  /**
   * Set via `instance.setContext()`; persists across all dispatches for the instance's
   * lifetime.
   */
  readonly context: TContext;
  /**
   * For guards that depend on other steps, e.g.
   * `ctx.instanceState.isStateCompleted('legal-review')`.
   */
  readonly instanceState: ReadonlyInstanceState<TStates>;
  /** @internal Called by `InjectedGuard` — guard authors should not call this directly. */
  resolveGuard(name: string): GuardFn<unknown> | undefined;
}

/** Stateless, composable predicate evaluated by the engine before a transition is applied. */
export interface IGuard<TPayload = unknown> {
  /** @returns `true` to allow the transition; `false` to block it. */
  evaluate(ctx: GuardContext<TPayload>): Promise<boolean>;
}

/**
 * Signature for a user-supplied guard function. `TPayload` is inferred when used inline on
 * `addTransition`; annotate explicitly for `Guard.fn<TPayload, TContext>()` or
 * `injectGuard<TPayload>()`.
 */
export type GuardFn<TPayload, TContext = unknown, TStates extends string = string> = (
  ctx: GuardContext<TPayload, TContext, TStates>,
) => boolean | Promise<boolean>;
