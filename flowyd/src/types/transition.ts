import type { IGuard } from './guard.js';

/**
 * Action-trigger half of a transition: the edge fires when an action named `on`
 * is dispatched while `from` is active. The `after?: never` brand makes this a
 * discriminated-union member, so no edge can be both action- and time-triggered.
 *
 * @template OnT - The action-name type. `string` once stored; the specific
 *                 action literal (`keyof TActions`) at the builder input.
 */
export interface ActionTrigger<OnT extends string = string> {
  readonly on: OnT;
  readonly after?: never;
}

/**
 * Time-trigger half of a transition: the edge fires automatically once the
 * instance has sat in `from` for `after`. The clock is anchored to `from`
 * (starts on entry) and is advanced by `WorkflowInstance.tick(now)` — the
 * engine itself never reads a clock. The `on?: never` brand makes this a
 * discriminated-union member.
 *
 * @template AfterT - The deadline type. `number` (milliseconds) once stored;
 *                    `string | number` at the builder input, where duration
 *                    strings like `'48h'` are accepted and normalised.
 */
export interface TimedTrigger<AfterT = number> {
  readonly after: AfterT;
  readonly on?: never;
}

/**
 * The trigger of a transition — **exactly one** of an action (`on`) or a
 * deadline (`after`). Shared by the builder's input shape and the stored
 * {@link TransitionDefinition} so the on-xor-after discriminant is defined in a
 * single place.
 *
 * @template OnT    - Action-name type (see {@link ActionTrigger}).
 * @template AfterT - Deadline type (see {@link TimedTrigger}).
 */
export type TransitionTrigger<OnT extends string = string, AfterT = number> =
  | ActionTrigger<OnT>
  | TimedTrigger<AfterT>;

/**
 * A compiled, normalised arc in the workflow graph: `from → to`, triggered by
 * exactly one of an action or a deadline (see {@link TransitionTrigger}), with
 * an optional guard.
 *
 * This is a **discriminated union** on the trigger: narrow with
 * `t.after !== undefined` (→ `after: number`) or `t.on !== undefined`
 * (→ `on: string`) and the compiler refines the shape, so the engine never
 * guesses or casts. On firing, the engine marks `from` as `completed` and
 * enters `to` according to the target state's kind; the `guard` (if present)
 * must evaluate to `true` first.
 *
 * @template TStates - Union of registered state IDs. Defaults to `string` for
 *                     the type-erased engine/visualisation layer.
 */
export type TransitionDefinition<TStates extends string = string> = {
  /** ID of the source state. Must be `active` (or `waiting`, for a timed edge) for this transition to fire. */
  readonly from: TStates;
  /** ID of the destination state to enter on a successful transition. */
  readonly to: TStates;
  /**
   * Optional guard evaluated before the transition is applied. Stored as
   * `IGuard<unknown>` because payload typing is resolved at the `dispatch` call
   * site — the engine passes the runtime-validated payload through the
   * `GuardContext`. On a time-triggered edge the guard is re-evaluated on each
   * `tick` until it passes or `from` exits.
   */
  readonly guard?: IGuard<unknown>;
} & TransitionTrigger;
