import type { WorkflowDefinition, ActionPayloadMap, InstanceSnapshot } from '../types/index.js';
import { StateStatus } from '../types/index.js';
import { WorkflowInstance } from './instance.js';
import { typedFromEntries } from './utils.js';

/**
 * Immutable, compiled workflow definition that acts as a factory for `WorkflowInstance`
 * objects. A single `Workflow` can power any number of independent concurrent instances;
 * the definition itself is never mutated after `WorkflowBuilder.build()` returns.
 */
export class Workflow<
  TActions extends ActionPayloadMap,
  TContext = unknown,
  TStates extends string = string,
> {
  /** @internal */
  constructor(private readonly definition: WorkflowDefinition<TContext, TStates>) {}

  /**
   * Creates a fresh `WorkflowInstance` with the initial state active and no history.
   * `context` is required when `setContext()` was called on the builder. `now` defaults
   * to `new Date()` and is used as the initial state's entry time (so a deadline on it
   * counts from here) — pass it explicitly for deterministic replay or testing.
   * @throws {ZodError} if `context` fails the builder's `contextSchema`.
   */
  createInstance(
    instanceId: string,
    ...args: unknown extends TContext
      ? [context?: TContext, now?: Date]
      : [context: TContext, now?: Date]
  ): WorkflowInstance<TActions, TContext, TStates> {
    // Conditional rest params collapse to [TContext?, Date?] at runtime.
    const restArgs = args as [TContext | undefined, Date | undefined];
    const now = (restArgs[1] ?? new Date()).toISOString();

    const stateStatuses = new Map<TStates, StateStatus>();
    for (const id of this.definition.states.keys()) {
      stateStatuses.set(id, StateStatus.Idle);
    }
    stateStatuses.set(this.definition.initialStateId, StateStatus.Active);

    // The signature enforces context presence when TContext is concrete.
    const context = restArgs[0];
    // contextSchema is ZodSchema<TContext>, so parse() returns TContext directly.
    const validatedContext =
      context !== undefined
        ? (this.definition.contextSchema?.parse(context) ?? context)
        : undefined;

    const snapshotBase: InstanceSnapshot<TContext, TStates> = {
      instanceId,
      workflowName: this.definition.name,
      version: 0,
      stateStatuses: typedFromEntries(stateStatuses),
      isTerminal: false,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    // Conditionally include context to satisfy exactOptionalPropertyTypes:
    // context?: TContext does not allow explicit `undefined` when TContext is concrete.
    const snapshot: InstanceSnapshot<TContext, TStates> =
      validatedContext !== undefined
        ? { ...snapshotBase, context: validatedContext }
        : snapshotBase;

    return new WorkflowInstance<TActions, TContext, TStates>(this.definition, snapshot);
  }

  /**
   * Reconstructs a `WorkflowInstance` from a snapshot produced by `instance.getSnapshot()`.
   * Guard injections are NOT restored — call `instance.injectGuard()` again after restoration.
   *
   * @throws {Error} If the snapshot's `workflowName` does not match this definition.
   */
  restoreInstance(
    snapshot: InstanceSnapshot<TContext, TStates>,
  ): WorkflowInstance<TActions, TContext, TStates> {
    if (snapshot.workflowName !== this.definition.name) {
      throw new Error(
        `Cannot restore snapshot: workflow name mismatch. ` +
          `Expected "${this.definition.name}", got "${snapshot.workflowName}"`,
      );
    }
    return new WorkflowInstance<TActions, TContext, TStates>(
      this.definition,
      structuredClone(snapshot),
    );
  }

  /** Returns the underlying definition for use by visualisation exporters. */
  getDefinition() {
    return this.definition;
  }
}
