/** Discriminant the engine switches on to select entry behaviour for a state. */
export enum StateKind {
  Step = 'step',
  Fork = 'fork',
  Join = 'join',
  Wait = 'wait',
}

/**
 * Lifecycle phase of a state within a running `WorkflowInstance`; `waiting` is
 * `WaitState`-only.
 */
export enum StateStatus {
  Idle = 'idle',
  Active = 'active',
  Waiting = 'waiting',
  Completed = 'completed',
}

export interface IState {
  readonly id: string;
  readonly kind: StateKind;
  readonly label: string;
}

/**
 * Activates every `targets` state on entry, then immediately completes itself — a
 * transient fan-out.
 */
export interface IForkState extends IState {
  readonly kind: StateKind.Fork;
  /** At least one target is required. */
  readonly targets: readonly string[];
}

/**
 * Threshold rule for a `JoinState`: `'all'` requires every `requires` state completed,
 * `'any'` requires at least one, a `number` requires that many (quorum).
 */
export type JoinMode = 'all' | 'any' | number;

/**
 * Synchronisation barrier: becomes `active` automatically once `mode`'s threshold over
 * `requires` is satisfied — no dispatch needed to cross the barrier itself. Behaves like
 * a `StepState` once active.
 */
export interface IJoinState extends IState {
  readonly kind: StateKind.Join;
  readonly requires: readonly string[];
  readonly mode: JoinMode;
}

/**
 * Blocks the parent workflow until the service layer calls `instance.resolveWait(stateId)`,
 * which transitions it to `active` so the workflow can resume via a normal `dispatch`.
 */
export interface IWaitState extends IState {
  readonly kind: StateKind.Wait;
  /** Documentary only — not read by the engine. */
  readonly externalName: string;
}

export interface IStepState extends IState {
  readonly kind: StateKind.Step;
}

/**
 * Narrow via `state.kind === StateKind.X` — never `as IForkState` — to stay
 * within the discriminated-union rule the engine and visualization layer rely on.
 */
export type AnyState = IStepState | IForkState | IJoinState | IWaitState;
