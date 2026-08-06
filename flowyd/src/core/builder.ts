import { type ZodSchema } from 'zod';
import type {
  TransitionDefinition,
  ActionTrigger,
  TimedTrigger,
  ActionPayloadMap,
  WorkflowDefinition,
  IGuard,
  GuardFn,
  AnyState,
  StateHooks,
  HookFn,
  JoinMode,
} from '../types/index.js';
import { StateKind } from '../types/index.js';
import { parseDuration } from './utils.js';
import { StateRegistry } from './registry.js';
import { Workflow } from './workflow.js';
import { FnGuard } from '../guards/index.js';
import { StepState, ForkState, JoinState, WaitState } from '../states/index.js';

/**
 * Argument to {@link WorkflowBuilder.addTransition}: a directed edge triggered by exactly
 * one of an action (`on`) or a deadline (`after`) — each forbids the other's key via
 * `?: never`, so supplying both or neither is a compile-time error. On an action edge the
 * guard's `ctx.payload` is typed as `TActions[K]`; a deadline carries no payload, so its
 * guard payload is `unknown`.
 */
type TransitionInput<
  TActions extends ActionPayloadMap,
  TStates extends string,
  TContext,
  K extends keyof TActions & string,
> = {
  readonly from: TStates;
  readonly to: TStates;
} & (
  | (ActionTrigger<K> & {
      readonly guard?: IGuard<TActions[K]> | GuardFn<TActions[K], TContext, TStates>;
    })
  | (TimedTrigger<string | number> & {
      readonly guard?: IGuard<unknown> | GuardFn<unknown, TContext, TStates>;
    })
);

/**
 * Fluent builder for composing and validating a workflow definition.
 *
 * ## Accumulating-Builder construction
 *
 * Call `createWorkflow({ name })` to start. Each call to `addStep`, `addFork`,
 * `addJoin`, or `addWait` widens the `TStates` union by one literal, so every
 * subsequent call is constrained to the growing set of registered IDs — no
 * upfront array needed. IDEs autocomplete state IDs as they are registered.
 *
 * ```ts
 * const builder = createWorkflow({ name: 'my-workflow' })
 *   .addStep('pending')
 *   .addStep('branch-a')
 *   .addStep('branch-b')
 *   .addFork('fork', { targets: ['branch-a', 'branch-b'] })
 *   .addStep('joined')
 *   .addStep('done');
 * ```
 *
 * **Ordering rule for fork/join:** `addFork.targets` and `addJoin.requires` are
 * constrained to states already in `TStates`. Register branch/prerequisite
 * states before the fork or join that references them.
 *
 * ## Typical call order
 *
 * 1. `createWorkflow({ name })` — start the builder.
 * 2. `defineAction()` — register each action and its Zod payload schema.
 * 3. `addStep()` / `addFork()` / `addJoin()` / `addWait()` — register states (branches
 *    before forks/joins).
 * 4. `setInitial()` / `setTerminal()` — declare entry and exit points.
 * 5. `addTransition()` — wire states together with named, optionally-guarded arcs.
 * 6. `build()` — validate and compile into an immutable `Workflow`.
 *
 * `defineAction()` and the four state-registration methods return the same builder
 * instance under a widened type — `TActions` and `TStates` accumulate correctly without
 * allocating a new object. `setInitial`, `setTerminal`, and `addTransition` return `this`.
 */
export class WorkflowBuilder<
  TActions extends ActionPayloadMap = Record<never, never>,
  TStates extends string = never,
  TContext = unknown,
> {
  private readonly name: string;
  private readonly stateRegistry = new StateRegistry();
  private readonly transitions: TransitionDefinition[] = [];
  private readonly actionSchemas = new Map<string, ZodSchema<unknown>>();
  private readonly hookMap = new Map<string, StateHooks<TContext>>();
  private initialStateId: string | null = null;
  private terminalStateIds: string[] = [];
  private contextSchema: ZodSchema<unknown> | undefined = undefined;

  /**
   * Prefer the {@link createWorkflow} factory over calling this directly.
   *
   * @throws {Error} If `name` is empty.
   */
  constructor(config: { name: string }) {
    if (!config.name.trim()) {
      throw new Error('Workflow name must be non-empty');
    }
    this.name = config.name;
  }

  /**
   * Declares the shape of the instance context, widening `TContext` from `unknown` to the
   * inferred type `C`. Also types `ctx.context` in inline guards on `addTransition`. The
   * initial context value is supplied per-instance at `createInstance` time, not here —
   * different instances of the same workflow may start with different context values.
   *
   * ```ts
   * const wf = createWorkflow({ name: 'approval' })
   *   .setContext(z.object({ score: z.number(), isDutyManager: z.boolean() }))
   *   .addTransition({
   *     from: 'review',
   *     to: 'approved',
   *     on: 'APPROVE',
   *     guard: (ctx) => ctx.context.isDutyManager && ctx.context.score >= 80,
   *   })
   *   .build();
   *
   * const instance = wf.createInstance('req-001', { score: 92, isDutyManager: true });
   * ```
   */
  setContext<C>(schema: ZodSchema<C>): WorkflowBuilder<TActions, TStates, C> {
    this.contextSchema = schema;
    // TContext and C are unrelated type parameters; double cast is required.
    return this as unknown as WorkflowBuilder<TActions, TStates, C>;
  }

  /**
   * Accumulates the `TActions` generic — the returned builder has a more specific type
   * that includes the new action, enabling fully typed `dispatch`/`canExecute` on the
   * resulting instance. Must be called before any `addTransition` using this action name.
   */
  defineAction<K extends string, T>(
    name: K,
    schema: ZodSchema<T>,
  ): WorkflowBuilder<TActions & Record<K, T>, TStates, TContext> {
    this.actionSchemas.set(name, schema);
    return this;
  }

  /**
   * Records `onEnter`/`onExit` hooks for a state if provided.
   * Hooks are stored type-erased; the builder's generic constraints enforce
   * correct types at each call site.
   */
  private recordHooks(id: string, onEnter?: HookFn<TContext>, onExit?: HookFn<TContext>): void {
    if (onEnter !== undefined || onExit !== undefined) {
      this.hookMap.set(id, {
        ...(onEnter !== undefined && { onEnter }),
        ...(onExit !== undefined && { onExit }),
      });
    }
  }

  /**
   * Widens `TStates` to include `K`, making `id` a valid target in subsequent
   * `setInitial`/`setTerminal`/`addTransition`/`addFork.targets`/`addJoin.requires` calls.
   * Fork-target steps with no outgoing transitions auto-complete on entry — no extra
   * option needed.
   *
   * @throws {Error} If `id` is empty or already registered.
   */
  addStep<K extends string>(
    id: K,
    options: {
      label?: string;
      onEnter?: HookFn<TContext>;
      onExit?: HookFn<TContext>;
    } = {},
  ): WorkflowBuilder<TActions, TStates | K, TContext> {
    this.stateRegistry.register(new StepState(id, options));
    this.recordHooks(id, options.onEnter, options.onExit);
    return this as WorkflowBuilder<TActions, TStates | K, TContext>;
  }

  /**
   * `targets` is constrained to `TStates` — register all branch states before calling
   * `addFork`, or the reference is a compile-time error.
   *
   * @throws {Error} If `id` is empty or already registered, or if `targets` is empty.
   */
  addFork<K extends string>(
    id: K,
    options: {
      label?: string;
      targets: [TStates, ...TStates[]];
      onEnter?: HookFn<TContext>;
      onExit?: HookFn<TContext>;
    },
  ): WorkflowBuilder<TActions, TStates | K, TContext> {
    this.stateRegistry.register(new ForkState(id, options));
    this.recordHooks(id, options.onEnter, options.onExit);
    return this as WorkflowBuilder<TActions, TStates | K, TContext>;
  }

  /**
   * `requires` is constrained to `TStates` — register all prerequisite states before
   * calling `addJoin`, or the reference is a compile-time error.
   *
   * @throws {Error} If `id` is empty or already registered, or if `requires` is empty.
   */
  addJoin<K extends string>(
    id: K,
    options: {
      label?: string;
      requires: [TStates, ...TStates[]];
      mode?: JoinMode;
      onEnter?: HookFn<TContext>;
      onExit?: HookFn<TContext>;
    },
  ): WorkflowBuilder<TActions, TStates | K, TContext> {
    this.stateRegistry.register(new JoinState(id, options));
    this.recordHooks(id, options.onEnter, options.onExit);
    return this as WorkflowBuilder<TActions, TStates | K, TContext>;
  }

  /** @throws {Error} If `id` is empty or already registered. */
  addWait<K extends string>(
    id: K,
    options: {
      label?: string;
      externalName: string;
      onEnter?: HookFn<TContext>;
      onExit?: HookFn<TContext>;
    },
  ): WorkflowBuilder<TActions, TStates | K, TContext> {
    this.stateRegistry.register(new WaitState(id, options));
    this.recordHooks(id, options.onEnter, options.onExit);
    return this as WorkflowBuilder<TActions, TStates | K, TContext>;
  }

  /** @throws {Error} If called more than once. */
  setInitial(stateId: TStates): this {
    if (this.initialStateId !== null) {
      throw new Error(`Initial state is already set to "${this.initialStateId}"`);
    }
    this.initialStateId = stateId;
    return this;
  }

  /** Once any terminal state becomes `active`, the instance rejects further `dispatch` calls. */
  setTerminal(stateIds: ReadonlyArray<TStates>): this {
    this.terminalStateIds = [...stateIds];
    return this;
  }

  /**
   * Adds a directed arc, triggered by exactly one of `on` / `after` — enforced at compile
   * time by {@link TransitionInput}.
   *
   * **Action-triggered** (`on`): fires when the matching action is dispatched and `from`
   * is `active`.
   *
   * **Time-triggered** (`after`): a deadline anchored to `from`'s entry time; once elapsed
   * the edge fires automatically, moving exactly `from → to` (never broadcasting to other
   * active states). Accepts a millisecond number or a duration string (`'48h'`, `'7d'`, …).
   * Firing is driven by `WorkflowInstance.tick(now)` and at the start of every `dispatch` —
   * the host owns the clock (see `getNextDueAt()`). For "action OR deadline to the same
   * target", declare two transitions sharing a `to`.
   *
   * `guard` accepts a raw `(ctx) => boolean | Promise<boolean>` or any `IGuard`; on a timed
   * edge it is re-evaluated on each tick until it passes or `from` exits.
   */
  addTransition<K extends keyof TActions & string>(
    transition: TransitionInput<TActions, TStates, TContext, K>,
  ): this {
    const { from, to } = transition;

    // exactOptionalPropertyTypes requires `guard` to be absent rather than
    // `undefined`, so each branch conditionally spreads it.
    if (transition.after !== undefined) {
      const guard = this.wrapGuard<unknown>(transition.guard);
      const after = parseDuration(transition.after);
      this.transitions.push(guard !== undefined ? { from, to, after, guard } : { from, to, after });
    } else {
      const guard = this.wrapGuard<TActions[K]>(transition.guard);
      const on = transition.on;
      this.transitions.push(guard !== undefined ? { from, to, on, guard } : { from, to, on });
    }
    return this;
  }

  /**
   * Wraps a raw guard function in `FnGuard`, passes an `IGuard` through
   * unchanged, and erases the payload type to `IGuard<unknown>` for storage
   * (payload typing is re-resolved at `dispatch` via `GuardContext`).
   */
  private wrapGuard<P>(
    guard: IGuard<P> | GuardFn<P, TContext, TStates> | undefined,
  ): IGuard<unknown> | undefined {
    if (guard === undefined) {
      return undefined;
    }
    return typeof guard === 'function' ? new FnGuard<P, TContext, TStates>(guard) : guard;
  }

  /**
   * Runs graph-level reachability and dead-end checks after structural validation.
   * Collects all violations and throws a single combined error.
   *
   * @throws {Error} If any graph invariant is violated.
   */
  private validateGraph(states: ReadonlyMap<string, AnyState>): void {
    const errors: string[] = [];

    // DFS reachability from the initial state. Edges: transitions (from→to), fork fan-out
    // (fork→target), join activation (requires→join).
    const reachable = new Set<string>();
    const stack = [this.initialStateId];
    while (stack.length > 0) {
      // Non-null: the `stack.length > 0` loop guard guarantees pop() returns an element.
      const id = stack.pop()!;
      if (reachable.has(id)) {
        continue;
      }
      reachable.add(id);
      for (const t of this.transitions) {
        if (t.from === id) {
          stack.push(t.to);
        }
      }
      const state = states.get(id);
      if (state?.kind === StateKind.Fork) {
        for (const target of state.targets) {
          stack.push(target);
        }
      }
      for (const [jid, s] of states) {
        if (s.kind === StateKind.Join && s.requires.includes(id)) {
          stack.push(jid);
        }
      }
    }

    for (const id of states.keys()) {
      if (!reachable.has(id)) {
        errors.push(`State "${id}" is unreachable from initial state "${this.initialStateId}"`);
      }
    }

    if (!this.terminalStateIds.some((id) => reachable.has(id))) {
      errors.push(
        `No terminal state is reachable from "${this.initialStateId}" — the workflow can never complete`,
      );
    }

    const outgoing = new Set(this.transitions.map((t) => t.from));
    for (const [id, state] of states) {
      const blocksForeverWhenEntered =
        !this.terminalStateIds.includes(id) &&
        (state.kind === StateKind.Wait || state.kind === StateKind.Join) &&
        !outgoing.has(id);
      if (blocksForeverWhenEntered) {
        errors.push(
          `${state.kind === StateKind.Wait ? 'WaitState' : 'JoinState'} "${id}" has no outgoing transitions and is not terminal`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Workflow "${this.name}" has graph errors:\n  - ${errors.join('\n  - ')}`);
    }
  }

  /**
   * Validates the workflow structure and returns an immutable `Workflow` instance.
   *
   * Structural checks: exactly one initial state, at least one terminal state, all
   * referenced state IDs registered, all `on` action names schema-registered.
   *
   * Graph checks (after structural checks pass): every state reachable from the initial
   * state, at least one terminal state reachable, and non-terminal `WaitState`/`JoinState`
   * nodes have an outgoing transition (otherwise the workflow gets permanently stuck there).
   *
   * @throws {Error} If any structural or graph invariant is violated — the message lists
   *                 all violations found in one pass.
   */
  build(): Workflow<TActions, TContext, TStates> {
    if (!this.initialStateId) {
      throw new Error('Workflow requires exactly one initial state (call setInitial)');
    }
    if (this.terminalStateIds.length === 0) {
      throw new Error('Workflow requires at least one terminal state (call setTerminal)');
    }

    const states = this.stateRegistry.snapshot();

    if (!states.has(this.initialStateId)) {
      throw new Error(`Initial state "${this.initialStateId}" is not registered`);
    }
    for (const id of this.terminalStateIds) {
      if (!states.has(id)) {
        throw new Error(`Terminal state "${id}" is not registered`);
      }
    }
    for (const t of this.transitions) {
      if (!states.has(t.from)) {
        throw new Error(`Transition from unregistered state "${t.from}"`);
      }
      if (!states.has(t.to)) {
        throw new Error(`Transition to unregistered state "${t.to}"`);
      }
      // The on/after XOR (and a positive `after`) are guaranteed by
      // addTransition's typed union, so they need no runtime check. Action edges
      // must still resolve to a registered schema — the dynamic path widens
      // action names to `string`, which the compiler cannot verify. Narrowing on
      // `after` refines `t` to the action member, so `t.on` is `string` here.
      if (t.after === undefined && !this.actionSchemas.has(t.on)) {
        throw new Error(
          `Transition uses action "${t.on}" which has no registered schema (call defineAction)`,
        );
      }
    }
    for (const [id, state] of states) {
      if (state.kind === StateKind.Fork) {
        for (const target of state.targets) {
          if (!states.has(target)) {
            throw new Error(`ForkState "${id}" references unregistered target "${target}"`);
          }
        }
      }
      if (state.kind === StateKind.Join) {
        for (const req of state.requires) {
          if (!states.has(req)) {
            throw new Error(`JoinState "${id}" requires unregistered state "${req}"`);
          }
        }
      }
    }

    this.validateGraph(states);

    // All four casts below are safe by registration invariant: `build()` has already
    // verified every ID appears in `states`. The builder's internal storage is
    // type-erased (`string`) because `TStates` accumulates via type-level widening,
    // not runtime branching. At `build()` time TStates and TContext are sealed.
    const definition: WorkflowDefinition<TContext, TStates> = {
      name: this.name,
      // StateRegistry is type-erased; all stored IDs are TStates by construction.
      states: states as ReadonlyMap<TStates, AnyState>,
      // addTransition constrains from/to to TStates at the type level.
      transitions: [...this.transitions] as TransitionDefinition<TStates>[],
      actionSchemas: new Map(this.actionSchemas),
      // setInitial validates the ID is a registered state (a TStates member).
      initialStateId: this.initialStateId as TStates,
      // setTerminal validates all IDs are registered (TStates members).
      terminalStateIds: [...this.terminalStateIds] as TStates[],
      ...(this.contextSchema !== undefined && {
        // contextSchema stored as ZodSchema<unknown>; TContext is sealed at build() time.
        contextSchema: this.contextSchema as ZodSchema<TContext>,
      }),
      ...(this.hookMap.size > 0 && {
        stateHooks: new Map([...this.hookMap].map(([id, h]) => [id as TStates, h])),
      }),
    };

    return new Workflow<TActions, TContext, TStates>(definition);
  }
}

/**
 * Starts a new workflow definition, with `TStates` beginning as `never`. Each call to
 * `addStep`, `addFork`, `addJoin`, or `addWait` widens `TStates` by one literal, so all
 * subsequent calls are constrained to the growing set of registered IDs.
 *
 * ```ts
 * const wf = createWorkflow({ name: 'po' })
 *   .addStep('draft')
 *   .addStep('review')
 *   .addStep('done')
 *   .setInitial('draft')
 *   .setTerminal(['done'])
 *   .build();
 * ```
 *
 * For workflows whose state IDs are only known at runtime, use
 * {@link createDynamicWorkflow} instead.
 *
 * @throws {Error} If `name` is empty.
 */
export function createWorkflow(config: {
  name: string;
}): WorkflowBuilder<Record<never, never>, never> {
  return new WorkflowBuilder<Record<never, never>, never>(config);
}

/**
 * Creates a {@link WorkflowBuilder} typed for runtime-defined state IDs.
 *
 * Use this when state IDs come from an external source (database, config file,
 * user input) and cannot be known at compile time. Unlike {@link createWorkflow},
 * `TStates` is pre-widened to `string` so you can call `addStep`, `addFork`,
 * `addJoin`, and `addWait` in loops without type errors. Structural correctness
 * is enforced at runtime by `build()`.
 *
 * ```ts
 * const builder = createDynamicWorkflow({ name: 'dynamic-linear' });
 * builder.defineAction('NEXT', z.object({}));
 * for (const id of fetchedIds) {
 *   builder.addStep(id);
 * }
 * builder.setInitial(fetchedIds[0]).setTerminal([fetchedIds.at(-1)]);
 * const wf = builder.build();
 * ```
 *
 * @throws {Error} If `name` is empty.
 */
export function createDynamicWorkflow(config: {
  name: string;
}): WorkflowBuilder<Record<string, unknown>, string> {
  return new WorkflowBuilder<Record<string, unknown>, string>(config);
}
