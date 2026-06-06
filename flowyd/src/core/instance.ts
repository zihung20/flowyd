import type {
  WorkflowDefinition,
  ActionPayloadMap,
  DispatchResult,
  HistoryEntry,
  InstanceSnapshot,
  ReadonlyInstanceState,
  TransitionDefinition,
  GuardFn,
  HookContext,
} from '../types/index.js';
import { StateStatus, StateKind } from '../types/index.js';
import { GuardRegistry } from './registry.js';
import { WorkflowEngine } from './engine.js';
import { typedEntries, typedFromEntries } from './utils.js';

/**
 * Produces `Base` intersected with `{ [extra keys in Given]: never }`.
 * Applied to `dispatch` / `canExecute` so that object literals with unknown
 * properties fail at the call site rather than silently reaching Zod's runtime
 * `.strict()` check.
 */
type Exact<Base, Given extends Base> = Given & { [K in Exclude<keyof Given, keyof Base>]: never };

/**
 * Mutable runtime state for a single SOP execution.
 *
 * A `WorkflowInstance` is always created from an immutable `Workflow`
 * definition via `workflow.createInstance(id)` or restored from a persisted
 * snapshot via `workflow.restoreInstance(snapshot)`. Each instance is
 * completely independent — concurrent executions of the same workflow
 * definition share no state.
 *
 * After every `dispatch`, call `instance.getSnapshot()` and write the result
 * to your database. To resume, load the JSON and pass it to
 * `workflow.restoreInstance(snapshot)`. Guard injections are not part of the
 * snapshot and must be re-applied after restoration.
 *
 * @template TActions - Map of action names to their validated payload types,
 *                      inferred from `WorkflowBuilder.defineAction()` calls.
 * @template TContext - Type of the instance context declared via
 *                      `WorkflowBuilder.setContext()`. Defaults to `unknown`.
 */
export class WorkflowInstance<
  TActions extends ActionPayloadMap,
  TContext = unknown,
  TStates extends string = string,
> {
  private readonly guardRegistry = new GuardRegistry();

  /** @internal Created exclusively by `Workflow._createInstance` and `Workflow._restoreInstance`. */
  constructor(
    private readonly definition: WorkflowDefinition<TContext, TStates>,
    private snapshot: InstanceSnapshot<TContext, TStates>,
  ) {}

  /**
   * Registers a named guard function for use by `Guard.inject('name')`
   * placeholders declared in the workflow definition.
   *
   * Returns `this` for chaining. Calling `injectGuard` with the same name
   * twice replaces the previous implementation.
   *
   * @param name - Must match the name used in `Guard.inject('name')`.
   * @param fn   - The guard implementation. Annotate `TPayload` to match the
   *               payload type of the action(s) this guard is attached to.
   */
  injectGuard<TPayload = unknown, TCtx = unknown>(
    name: string,
    fn: GuardFn<TPayload, TCtx, TStates>,
  ): this {
    // Registry is type-erased (GuardFn<unknown>); TStates is asserted correct by construction.
    this.guardRegistry.register(name, fn as GuardFn<TPayload, TCtx>);
    return this;
  }

  /**
   * Replaces the accumulated instance context and persists it in the snapshot.
   *
   * Guards declared on transitions can read this value via `ctx.context`.
   * The new value is immediately available to the next `dispatch` call and is
   * included in the snapshot returned by `getSnapshot()`.
   *
   * @param data - The new context value. Must conform to `TContext`.
   * @returns `this` for chaining.
   */
  setContext(data: TContext): this {
    // contextSchema is ZodSchema<TContext>, so parse() returns TContext directly.
    const validated = this.definition.contextSchema?.parse(data) ?? data;
    this.snapshot = { ...this.snapshot, context: validated };
    return this;
  }

  /**
   * Returns the current instance context.
   *
   * When `setContext()` was called on the builder, `createInstance()` requires
   * context to be provided, so this will never be `undefined` in practice for
   * typed workflows. For workflows with no declared context schema the return
   * type resolves to `unknown`, which subsumes `undefined`.
   *
   * @returns The context passed to `createInstance()` or last set via
   *          `setContext()`, or `undefined` if neither has been called.
   */
  getContext(): TContext | undefined {
    return this.snapshot.context;
  }

  /**
   * Returns the IDs of all states currently in `active` or `waiting` status.
   * `waiting` states are included because they represent steps the workflow
   * is currently "at" (blocked on an external process).
   */
  getCurrentStates(): TStates[] {
    return typedEntries(this.snapshot.stateStatuses)
      .filter(([, s]) => s === StateStatus.Active || s === StateStatus.Waiting)
      .map(([id]) => id);
  }

  /**
   * Returns the `StateStatus` of the given state at the time of this call.
   *
   * @param stateId - A state ID registered in the workflow definition.
   * @throws {Error} If no state with this ID exists in the definition.
   */
  getStateStatus(stateId: TStates): StateStatus {
    if (!this.definition.states.has(stateId)) {
      throw new Error(`State "${stateId}" is not registered in workflow "${this.definition.name}"`);
    }
    return this.snapshot.stateStatuses[stateId] ?? StateStatus.Idle;
  }

  /** `true` if the workflow has reached any terminal state and can accept no further dispatches. */
  isTerminal(): boolean {
    return this.snapshot.isTerminal;
  }

  /**
   * Returns the action names for which at least one transition exists from
   * a currently `active` state, **without evaluating guards**.
   *
   * Use this for UI affordances (e.g. which buttons to show). Use
   * `canExecute` to check whether the guard will actually pass.
   */
  getAvailableTransitions(): (keyof TActions & string)[] {
    const activeStates = new Set(
      typedEntries(this.snapshot.stateStatuses)
        .filter(([, s]) => s === StateStatus.Active)
        .map(([id]) => id),
    );

    const actions = new Set<string>();
    for (const t of this.definition.transitions) {
      // Skip time-triggered edges — they have no `on` and are not user-dispatchable.
      if (t.on !== undefined && activeStates.has(t.from)) {
        actions.add(t.on);
      }
    }
    // Cast is safe: transition.on values are registered via addTransition, which constrains
    // them to keyof TActions & string at the builder level.
    return [...actions] as (keyof TActions & string)[];
  }

  /**
   * Evaluates whether the given action can fire right now — including guard
   * evaluation with the provided payload.
   *
   * @param action  - The action to test.
   * @param payload - The payload that would be passed to `dispatch`.
   * @returns `true` if at least one matching transition passes its guard.
   */
  async canExecute<TAction extends keyof TActions & string, P extends TActions[TAction]>(
    action: TAction,
    payload: Exact<TActions[TAction], P>,
  ): Promise<boolean> {
    const result = await this.dispatch(action, payload, { dryRun: true });
    return result.success;
  }

  /**
   * Dispatches an action against the current instance state.
   *
   * The engine validates the payload, evaluates all matching transitions and
   * their guards, applies the resulting state changes atomically, and returns
   * a `DispatchResult`. On success the internal snapshot is updated —
   * call `getSnapshot()` immediately after to capture the new state for
   * persistence.
   *
   * @param action  - An action name declared via `WorkflowBuilder.defineAction()`.
   * @param payload - The typed payload for this action, validated against the
   *                  action's Zod schema before any guard is evaluated.
   * @param options.now - The current time, used both to fire any overdue
   *                  deadlines before the action and to stamp the history entry.
   *                  Defaults to `new Date()`; pass it explicitly for
   *                  deterministic replay or testing — the instance is the only
   *                  clock-reader, the engine is given the time.
   * @returns A discriminated `DispatchResult` — check `result.success` to
   *          distinguish a successful transition from a blocked one.
   * @throws {Error}    If the action name has no registered schema.
   * @throws {ZodError} If `payload` fails schema validation.
   * @throws {Error}    If a named guard referenced by the transition has not
   *                    been injected via `injectGuard()`.
   */
  async dispatch<TAction extends keyof TActions & string, P extends TActions[TAction]>(
    action: TAction,
    payload: Exact<TActions[TAction], P>,
    options?: { now?: Date },
  ): Promise<DispatchResult<TContext, TStates, TAction>>;

  /**
   * @internal Overload used by `canExecute` to perform a dry-run without
   *           committing state changes.
   */
  async dispatch<TAction extends keyof TActions & string>(
    action: TAction,
    payload: TActions[TAction],
    options: { now?: Date; dryRun: boolean },
  ): Promise<DispatchResult<TContext, TStates, TAction>>;

  async dispatch<TAction extends keyof TActions & string>(
    action: TAction,
    payload: TActions[TAction],
    options: { now?: Date; dryRun?: boolean } = {},
  ): Promise<DispatchResult<TContext, TStates, TAction>> {
    const { now = new Date(), dryRun = false } = options;
    const schema = this.definition.actionSchemas.get(action);
    if (!schema) {
      throw new Error(`Action "${action}" is not registered in workflow "${this.definition.name}"`);
    }

    const validatedPayload = schema.parse(payload);

    // Fire overdue deadlines first so a late action can't act on a state that
    // should already have timed out (e.g. an APPROVE arriving after the 48h
    // escalation deadline is blocked, not applied); dry runs (`canExecute`) skip
    // it — no mutation.
    if (!dryRun) {
      await this.advanceTimers(now);
    }

    const result = await WorkflowEngine.dispatch<TContext, TStates, TAction>(
      this.definition,
      this.buildReadonlyView(),
      this.guardRegistry,
      this.snapshot,
      action,
      validatedPayload,
      this.snapshot.context,
      now.toISOString(),
    );

    if (result.success && !dryRun) {
      this.snapshot = result.snapshot;
      await this.runHooks(result.exitedStates, result.enteredStates);
    }

    return result;
  }

  /**
   * Signals that an external process has completed, promoting the corresponding
   * `WaitState` from `waiting` to `active`.
   *
   * After calling this, dispatch the appropriate action to transition out of
   * the wait state (e.g. `instance.dispatch('KYC_PASSED', {})`). To record what
   * the external process returned, put it in that follow-up dispatch's payload —
   * it lands in the audit history there.
   *
   * @param stateId     - ID of the `WaitState` to resolve.
   * @param options.now - Time to stamp the history entry with. Defaults to
   *                      `new Date()`; pass it explicitly for deterministic
   *                      replay or testing.
   * @throws {Error} If the state is not a `WaitState` or is not currently
   *                 in `waiting` status.
   */
  resolveWait(stateId: TStates, options: { now?: Date } = {}): void {
    const { now = new Date() } = options;
    const state = this.definition.states.get(stateId);
    if (!state || state.kind !== StateKind.Wait) {
      throw new Error(`State "${stateId}" is not a WaitState`);
    }

    const current = this.snapshot.stateStatuses[stateId];
    if (current !== StateStatus.Waiting) {
      throw new Error(
        `WaitState "${stateId}" is not waiting (current status: "${current ?? 'idle'}")`,
      );
    }

    const updatedStatuses = {
      ...this.snapshot.stateStatuses,
      [stateId]: StateStatus.Active,
    };

    const ctx = this.snapshot.context;
    const historyEntry: HistoryEntry<TContext, TStates> = {
      action: `__resolve_wait:${stateId}`,
      payload: null,
      exitedStates: [],
      enteredStates: [stateId],
      at: now.toISOString(),
      ...(ctx !== undefined && { context: ctx }),
    };

    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      stateStatuses: updatedStatuses,
      history: [...this.snapshot.history, historyEntry],
      updatedAt: historyEntry.at,
    };
  }

  /**
   * Advances all elapsed time-triggered transitions ("deadlines") up to `now`.
   *
   * The engine never reads a clock — the host supplies `now` and decides when to
   * call this. There are two ways deadlines advance: automatically at the start
   * of every `dispatch`, and explicitly via this method (which a host's
   * scheduler calls for idle instances; see `getNextDueAt()`).
   *
   * Firing runs to a fixed point and catches up cleanly after downtime: if the
   * process was offline past several chained deadlines, one `tick` fires them
   * all in due-time order. Each firing is stamped with its logical `dueAt` (not
   * wall-clock `now`), so cascades and the audit trail are independent of when
   * the sweep actually ran. A guard on a timed edge that blocks is retried on
   * the next `tick`, not consumed.
   *
   * @param now - The current time. Deadlines with `dueAt <= now` fire.
   * @returns The number of time-triggered transitions that fired.
   */
  async tick(now: Date): Promise<number> {
    return this.advanceTimers(now);
  }

  /**
   * Returns the earliest moment at which a deadline will fire, across every
   * currently `active` or `waiting` state, or `null` when none is armed (or the
   * instance is terminal).
   *
   * Persist this as an indexed column so a scheduler can sweep due instances
   * (`SELECT ... WHERE next_due_at <= now()`) and call `tick(now)` on each —
   * the library owns no scheduler and no storage.
   *
   * @returns An ISO-8601 timestamp, or `null` if no deadline is pending.
   */
  getNextDueAt(): string | null {
    if (this.snapshot.isTerminal) {
      return null;
    }
    let earliest: number | null = null;
    for (const stateId of this.armedStateIds()) {
      const enteredAt = this.enteredAtMs(stateId);
      for (const t of this.timedTransitionsFrom(stateId)) {
        const due = enteredAt + (t.after as number);
        if (earliest === null || due < earliest) {
          earliest = due;
        }
      }
    }
    return earliest === null ? null : new Date(earliest).toISOString();
  }

  /**
   * Shared deadline-advancement loop used by `tick` and the auto-advance at the
   * start of `dispatch`. See `tick` for semantics.
   */
  private async advanceTimers(now: Date): Promise<number> {
    const nowMs = now.getTime();
    const blocked = new Set<string>();
    let fired = 0;

    for (;;) {
      if (this.snapshot.isTerminal) {
        break;
      }

      let chosen: { transition: TransitionDefinition<TStates>; dueMs: number } | null = null;
      for (const stateId of this.armedStateIds()) {
        const enteredAt = this.enteredAtMs(stateId);
        for (const t of this.timedTransitionsFrom(stateId)) {
          const key = `${t.from}->${t.to}:${t.after}`;
          if (blocked.has(key)) {
            continue;
          }
          const dueMs = enteredAt + (t.after as number);
          if (dueMs <= nowMs && (chosen === null || dueMs < chosen.dueMs)) {
            chosen = { transition: t, dueMs };
          }
        }
      }

      if (chosen === null) {
        break;
      }

      const result = await WorkflowEngine.fireTimed<TContext, TStates>(
        this.definition,
        this.buildReadonlyView(),
        this.guardRegistry,
        this.snapshot,
        chosen.transition,
        new Date(chosen.dueMs).toISOString(),
        this.snapshot.context,
      );

      if (result.success) {
        this.snapshot = result.snapshot;
        await this.runHooks(result.exitedStates, result.enteredStates);
        fired += 1;
      } else {
        // Guard blocked (or source no longer armed) — skip this edge for the rest
        // of this advancement so we don't spin; it is retried on the next tick.
        blocked.add(`${chosen.transition.from}->${chosen.transition.to}:${chosen.transition.after}`);
      }
    }

    return fired;
  }

  /** IDs of states a deadline can fire from: those currently `active` or `waiting`. */
  private armedStateIds(): TStates[] {
    return typedEntries(this.snapshot.stateStatuses)
      .filter(([, s]) => s === StateStatus.Active || s === StateStatus.Waiting)
      .map(([id]) => id);
  }

  /** The time-triggered transitions leaving a given state, in declaration order. */
  private timedTransitionsFrom(stateId: TStates): TransitionDefinition<TStates>[] {
    return this.definition.transitions.filter((t) => t.from === stateId && t.after !== undefined);
  }

  /**
   * Milliseconds-since-epoch at which the instance last entered `stateId`,
   * derived from history — no separate timer state is persisted. Falls back to
   * `createdAt` for the initial state, which is active from creation and never
   * appears in an `enteredStates` list.
   */
  private enteredAtMs(stateId: TStates): number {
    const history = this.snapshot.history;
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (entry && entry.enteredStates.includes(stateId)) {
        return Date.parse(entry.at);
      }
    }
    return Date.parse(this.snapshot.createdAt);
  }

  /**
   * Returns a plain, JSON-serialisable snapshot of the current instance state.
   *
   * Safe to `JSON.stringify` and write to any persistence layer. The returned
   * object is a deep clone — mutations do not affect the live instance.
   *
   * @returns An `InstanceSnapshot<TContext>` capturing the full current state.
   */
  getSnapshot(): InstanceSnapshot<TContext, TStates> {
    return structuredClone(this.snapshot);
  }

  /**
   * Returns an independent deep-cloned snapshot of what the instance looked like
   * at the given version. Mutations to the returned object do not affect the live
   * instance.
   *
   * Reconstructs state by replaying the `exitedStates`/`enteredStates` deltas
   * from every history entry up to `version`. Cost is O(version) — acceptable
   * for a debugging or audit tool that is never called in a hot path.
   *
   * **Context accuracy**: each history entry records the context that was active
   * at the time of the corresponding dispatch, so `rewind(N).context` reflects
   * the exact context that guards saw when transitioning to version N. For
   * version 0, context reflects whatever was set before the first dispatch
   * (captured in `history[0].context`); if no dispatches have occurred yet,
   * the current context is used.
   *
   * @param version - An integer in `[0, currentVersion]`. `0` is the initial
   *                  state before any dispatches; passing the current version is
   *                  equivalent to calling `getSnapshot()`.
   * @returns A complete `InstanceSnapshot<TContext>` for the requested version.
   * @throws {Error} If `version` is outside `[0, currentVersion]`.
   */
  rewind(version: number): InstanceSnapshot<TContext, TStates> {
    const current = this.snapshot.version;
    if (version < 0 || version > current) {
      throw new Error(
        `Version ${version} is out of range. Expected a value between 0 and ${current}.`,
      );
    }

    if (version === current) {
      return this.getSnapshot();
    }

    // Build the initial status map: every state idle, initial state active.
    const stateStatuses = new Map<TStates, StateStatus>();
    for (const id of this.definition.states.keys()) {
      stateStatuses.set(id, StateStatus.Idle);
    }
    stateStatuses.set(this.definition.initialStateId, StateStatus.Active);

    if (version === 0) {
      // Use context from the first history entry if it exists (captures what was
      // set before the first dispatch), otherwise fall back to the current context.
      const contextAtV0 = this.snapshot.history[0]?.context ?? this.snapshot.context;
      const base: InstanceSnapshot<TContext, TStates> = {
        instanceId: this.snapshot.instanceId,
        workflowName: this.snapshot.workflowName,
        version: 0,
        stateStatuses: typedFromEntries(stateStatuses),
        isTerminal: false,
        history: [],
        createdAt: this.snapshot.createdAt,
        updatedAt: this.snapshot.createdAt,
      };
      const result: InstanceSnapshot<TContext, TStates> =
        contextAtV0 !== undefined ? { ...base, context: contextAtV0 } : base;
      return structuredClone(result);
    }

    // Replay the exitedStates/enteredStates deltas from each history entry in order.
    // resolveWait promotes a WaitState from Waiting → Active; all other entries derive
    // the entered status from the state's kind.
    for (const entry of this.snapshot.history.slice(0, version)) {
      for (const id of entry.exitedStates) {
        stateStatuses.set(id, StateStatus.Completed);
      }
      const isResolvingWait = entry.action.startsWith('__resolve_wait:');
      for (const id of entry.enteredStates) {
        const state = this.definition.states.get(id);
        const isEnteringWait = !isResolvingWait && state?.kind === StateKind.Wait;
        stateStatuses.set(id, isEnteringWait ? StateStatus.Waiting : StateStatus.Active);
      }
    }

    const isTerminal = this.definition.terminalStateIds.some(
      (id) => stateStatuses.get(id) === StateStatus.Active,
    );

    const entry = this.snapshot.history[version - 1]!;
    // Context at version N is what was in effect when dispatch N fired, recorded in history[N-1].context.
    const contextAtN = entry.context ?? this.snapshot.context;

    const base: InstanceSnapshot<TContext, TStates> = {
      instanceId: this.snapshot.instanceId,
      workflowName: this.snapshot.workflowName,
      version,
      stateStatuses: typedFromEntries(stateStatuses),
      isTerminal,
      history: this.snapshot.history.slice(0, version),
      createdAt: this.snapshot.createdAt,
      updatedAt: entry.at,
    };
    const result: InstanceSnapshot<TContext, TStates> =
      contextAtN !== undefined ? { ...base, context: contextAtN } : base;
    return structuredClone(result);
  }

  /**
   * Fires `onExit` hooks for exited states then `onEnter` hooks for entered
   * states. Runs after the snapshot has been committed. If a hook throws, the
   * error propagates unwrapped — the snapshot is already updated at that point.
   *
   * `onExit` / `onEnter` are intentionally sequential (not parallel) so hook
   * execution order is deterministic.
   */
  private async runHooks(
    exitedStates: readonly TStates[],
    enteredStates: readonly TStates[],
  ): Promise<void> {
    const hooks = this.definition.stateHooks;
    if (!hooks) {
      return;
    }

    const view = this.buildReadonlyView();
    const ctx = (id: TStates): HookContext<TContext> => ({
      stateId: id,
      instanceState: view,
      context: this.snapshot.context as TContext,
    });

    for (const id of exitedStates) {
      await hooks.get(id)?.onExit?.(ctx(id));
    }
    for (const id of enteredStates) {
      await hooks.get(id)?.onEnter?.(ctx(id));
    }
  }

  /**
   * Constructs the `ReadonlyInstanceState` view passed to the engine and guards.
   * This view reflects the state at the time of each `dispatch` call.
   */
  private buildReadonlyView(): ReadonlyInstanceState<TStates> {
    const statuses = this.snapshot.stateStatuses;
    const instanceId = this.snapshot.instanceId;
    const workflowName = this.snapshot.workflowName;

    // stateStatuses is Record<TStates, StateStatus> — keyed access returns StateStatus | undefined
    // under noUncheckedIndexedAccess for dynamic (string) TStates, hence the ?? fallback.
    const getStatus = (id: TStates): StateStatus => statuses[id] ?? StateStatus.Idle;

    return {
      instanceId,
      workflowName,
      getStateStatus: getStatus,
      getActiveStates: () =>
        typedEntries(statuses)
          .filter(([, s]) => s === StateStatus.Active)
          .map(([id]) => id),
      getWaitingStates: () =>
        typedEntries(statuses)
          .filter(([, s]) => s === StateStatus.Waiting)
          .map(([id]) => id),
      getCompletedStates: () =>
        typedEntries(statuses)
          .filter(([, s]) => s === StateStatus.Completed)
          .map(([id]) => id),
      isStateCompleted: (id: TStates) => getStatus(id) === StateStatus.Completed,
      isStateActive: (id: TStates) => getStatus(id) === StateStatus.Active,
      isStateWaiting: (id: TStates) => getStatus(id) === StateStatus.Waiting,
    };
  }
}
