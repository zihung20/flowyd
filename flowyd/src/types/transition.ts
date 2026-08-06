import type { IGuard } from './guard.js';

/**
 * Fires when action `on` is dispatched while `from` is active. `after?: never` forbids
 * also being time-triggered.
 */
export interface ActionTrigger<OnT extends string = string> {
  readonly on: OnT;
  readonly after?: never;
}

/**
 * Fires automatically once the instance has sat in `from` for `after`. Clock is anchored to
 * `from` (starts on entry) and advanced only by `WorkflowInstance.tick(now)` — the engine
 * never reads a clock itself. `on?: never` forbids also being action-triggered.
 */
export interface TimedTrigger<AfterT = number> {
  readonly after: AfterT;
  readonly on?: never;
}

/**
 * Exactly one of an action (`on`) or a deadline (`after`) — shared by the builder's input
 * shape and the stored {@link TransitionDefinition} so the discriminant is defined once.
 */
export type TransitionTrigger<OnT extends string = string, AfterT = number> =
  | ActionTrigger<OnT>
  | TimedTrigger<AfterT>;

/**
 * Compiled, normalised arc `from → to`. Discriminated union on the trigger: narrow with
 * `t.after !== undefined` or `t.on !== undefined` and the compiler refines the shape —
 * the engine never guesses or casts.
 */
export type TransitionDefinition<TStates extends string = string> = {
  /** Must be `active` (or `waiting`, for a timed edge) for this transition to fire. */
  readonly from: TStates;
  readonly to: TStates;
  /**
   * Stored as `IGuard<unknown>`; payload typing resolves at the `dispatch` call site. On
   * a timed edge the guard is re-evaluated on each `tick` until it passes or `from` exits.
   */
  readonly guard?: IGuard<unknown>;
} & TransitionTrigger;
