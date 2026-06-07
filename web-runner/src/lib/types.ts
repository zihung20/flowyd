import type { DispatchResult, InstanceSnapshot } from 'flowyd';

/**
 * The subset of `WorkflowInstance` the runner UI depends on, with the
 * `<TActions, TContext, TStates>` generics erased.
 *
 * The runner drives workflows whose generics aren't known at this layer — the
 * built-in examples plus arbitrary playground code from `evaluateWorkflowCode` —
 * so it leans on this structural shape instead of the precise instance type.
 * Declared once here so the producer (`evaluateWorkflowCode`) and the consumer
 * (`SingleRunner`) can't drift apart at the `makeInstance` boundary.
 */
export type AnyInstance = {
  dispatch(action: string, payload: unknown, options?: { now?: Date }): Promise<DispatchResult>;
  getSnapshot(): InstanceSnapshot;
  /** Pure read — returns a detached snapshot for any past version without mutating the instance. */
  rewind(version: number): InstanceSnapshot;
  /** Fire every deadline due at or before `now`; returns how many fired. */
  tick(now: Date): Promise<number>;
  /** ISO timestamp of the soonest armed deadline, or `null` when none is pending. */
  getNextDueAt(): string | null;
  injectGuard(name: string, fn: () => boolean | Promise<boolean>): unknown;
};
