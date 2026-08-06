import type { ZodSchema } from 'zod';
import type { AnyState } from './state.js';
import type { TransitionDefinition } from './transition.js';
import type { StateHooks } from './instance.js';

export type ActionPayloadMap = Record<string, unknown>;

/**
 * Compiled, immutable workflow definition. `WorkflowDefinition` (= `WorkflowDefinition<unknown,
 * string>`) is the type-erased form used by the visualisation layer; `Workflow`/`WorkflowInstance`
 * hold the fully-typed form so the engine returns a typed `DispatchResult` with no boundary cast.
 */
export interface WorkflowDefinition<TContext = unknown, TStates extends string = string> {
  readonly name: string;
  readonly states: ReadonlyMap<TStates, AnyState>;
  readonly transitions: readonly TransitionDefinition<TStates>[];
  /** Used by the engine to validate payloads before passing them to guards. */
  readonly actionSchemas: ReadonlyMap<string, ZodSchema<unknown>>;
  readonly initialStateId: TStates;
  /** Once any of these becomes `active`, further `dispatch` calls are rejected. */
  readonly terminalStateIds: readonly TStates[];
  /** `undefined` when no context schema was declared via `WorkflowBuilder.setContext()`. */
  readonly contextSchema?: ZodSchema<TContext>;
  /**
   * Hooks are function references living in the definition (code), not instance snapshots
   * (data) — no re-injection needed after `restoreInstance`, unlike guards.
   */
  readonly stateHooks?: ReadonlyMap<TStates, StateHooks<TContext>>;
}
