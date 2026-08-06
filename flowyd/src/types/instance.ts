import type { StateStatus } from './state.js';

/** Read-only view passed to guards during evaluation — guards may inspect but never mutate it. */
export interface ReadonlyInstanceState<TStates extends string = string> {
  readonly instanceId: string;
  readonly workflowName: string;

  getStateStatus(stateId: TStates): StateStatus;
  getActiveStates(): readonly TStates[];
  getWaitingStates(): readonly TStates[];
  getCompletedStates(): readonly TStates[];
  isStateCompleted(stateId: TStates): boolean;
  isStateActive(stateId: TStates): boolean;
  isStateWaiting(stateId: TStates): boolean;
}

interface BaseHistoryEntry<TContext = unknown, TStates extends string = string> {
  readonly exitedStates: readonly TStates[];
  readonly enteredStates: readonly TStates[];
  /**
   * Context at dispatch time — lets `WorkflowInstance.rewind()` restore context at any
   * past version.
   */
  readonly context?: TContext;
  readonly at: string;
}

export interface ActionHistoryEntry<
  TContext = unknown,
  TStates extends string = string,
> extends BaseHistoryEntry<TContext, TStates> {
  readonly kind: 'action';
  readonly action: string;
  /** Zod-validated payload dispatched with the action. */
  readonly payload: unknown;
}

/** Fired via `WorkflowInstance.tick()` or the auto-advance at the start of `dispatch()`. */
export interface TimeoutHistoryEntry<
  TContext = unknown,
  TStates extends string = string,
> extends BaseHistoryEntry<TContext, TStates> {
  readonly kind: 'timeout';
  readonly from: TStates;
  readonly to: TStates;
}

export interface ResolveWaitHistoryEntry<
  TContext = unknown,
  TStates extends string = string,
> extends BaseHistoryEntry<TContext, TStates> {
  readonly kind: 'resolve-wait';
  readonly stateId: TStates;
}

/** Narrow on `kind` to read per-kind fields — no magic-string action conventions to parse. */
export type HistoryEntry<TContext = unknown, TStates extends string = string> =
  | ActionHistoryEntry<TContext, TStates>
  | TimeoutHistoryEntry<TContext, TStates>
  | ResolveWaitHistoryEntry<TContext, TStates>;

/**
 * Plain, JSON-serialisable snapshot of a `WorkflowInstance`, storable in any persistence
 * layer and passed to `workflow.restoreInstance(snapshot)` to reconstruct a live instance.
 * Guard injections are NOT part of the snapshot — re-inject them after restoration.
 */
export interface InstanceSnapshot<TContext = unknown, TStates extends string = string> {
  readonly instanceId: string;
  readonly workflowName: string;
  /** Increments on every dispatch and `resolveWait` — use for optimistic locking. */
  readonly version: number;
  readonly stateStatuses: Readonly<Record<TStates, StateStatus>>;
  readonly isTerminal: boolean;
  readonly history: readonly HistoryEntry<TContext, TStates>[];
  /** `undefined` when no context has been set via `instance.setContext()`. */
  readonly context?: TContext;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Returned by `WorkflowInstance.dispatch()` on a successful state transition. */
export interface TransitionSuccess<
  TContext = unknown,
  TStates extends string = string,
  TAction extends string = string,
> {
  readonly success: true;
  readonly action: TAction;
  readonly enteredStates: readonly TStates[];
  readonly exitedStates: readonly TStates[];
  readonly snapshot: InstanceSnapshot<TContext, TStates>;
}

/** Returned by `WorkflowInstance.dispatch()` when the action cannot be applied. */
export interface TransitionBlocked<
  TStates extends string = string,
  TAction extends string = string,
> {
  readonly success: false;
  readonly action: TAction;
  readonly reason:
    | 'terminal-state' // workflow has already reached a terminal state
    | 'invalid-action' // no transition exists for this action from any active state
    | 'guard-failed' // a matching transition exists but its guard blocked it
    | 'no-active-source'; // the action's source state is not currently active
  readonly activeStates: readonly TStates[];
}

export interface HookContext<TContext = unknown> {
  readonly stateId: string;
  /** Reflects instance state post-transition, not at the moment the state was entered/exited. */
  readonly instanceState: ReadonlyInstanceState;
  readonly context: TContext;
}

export type HookFn<TContext = unknown> = (ctx: HookContext<TContext>) => void | Promise<void>;

/**
 * Defined with method shorthand (bivariant parameter checking) so a concretely-typed
 * `StateHooks<TContext>` is assignable to the type-erased `StateHooks<unknown>` stored
 * in `WorkflowDefinition` — same trick as `IGuard.evaluate`.
 */
export interface StateHooks<TContext = unknown> {
  onEnter?(ctx: HookContext<TContext>): void | Promise<void>;
  onExit?(ctx: HookContext<TContext>): void | Promise<void>;
}

/** Discriminated union returned by every `dispatch` call. */
export type DispatchResult<
  TContext = unknown,
  TStates extends string = string,
  TAction extends string = string,
> = TransitionSuccess<TContext, TStates, TAction> | TransitionBlocked<TStates, TAction>;
