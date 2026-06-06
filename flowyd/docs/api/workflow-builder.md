# WorkflowBuilder

Fluent builder that compiles a workflow definition. Use `createWorkflow()` — do not call `new WorkflowBuilder()` directly.

```ts
import { createWorkflow } from 'flowyd';
```

## `createWorkflow(config)`

```ts
function createWorkflow(config: { name: string }): WorkflowBuilder<Record<never, never>, never>;
```

Instantiates a `WorkflowBuilder` with `TStates = never`. Each subsequent `addStep`, `addFork`, `addJoin`, or `addWait` call widens `TStates` by one literal — every call is constrained to the accumulated union, so typos are compile errors.

```ts
const wf = createWorkflow({ name: 'purchase-order' });
// TStates = never initially; grows with each addStep/addFork/addJoin/addWait call
```

**Throws** if `name` is empty or whitespace.

## Call order

Methods must be called in this sequence:

1. `defineAction()` — register each action and its payload schema
2. `setContext()` _(optional)_ — declare a typed instance context
3. `addStep()` / `addFork()` / `addJoin()` / `addWait()` — register every state
4. `setInitial()` / `setTerminal()` — declare entry and exit points
5. `addTransition()` — wire states together
6. `build()` — validate and compile

## `.defineAction(name, schema)`

```ts
defineAction<K extends string, T>(
  name: K,
  schema: ZodSchema<T>,
): WorkflowBuilder<TActions & Record<K, T>, TStates>
```

Registers an action and binds a Zod schema to its payload. Returns a new builder specialization with extended `TActions` — downstream calls to `addTransition`, `dispatch`, and `canExecute` are all typed to registered action names.

```ts
.defineAction('APPROVE', z.object({ approverId: z.string(), reason: z.string() }))
```

## `.setContext(schema)`

```ts
setContext<C>(schema: ZodSchema<C>): WorkflowBuilder<TActions, TStates, C>
```

Declares a typed, caller-owned instance context. Once set, `createInstance` **requires** an initial context value, guards read it via `ctx.context`, and it is persisted in the snapshot (survives `getSnapshot` / `restoreInstance`).

```ts
createWorkflow({ name: 'review' })
  .setContext(z.object({ score: z.number(), isDutyManager: z.boolean() }))
  // ...
  .build();
// const inst = wf.createInstance('req-001', { score: 92, isDutyManager: true });
```

## `.addStep(id, options?)`

```ts
addStep<K extends string>(
  id: K,
  options?: { label?: string; onEnter?: HookFn; onExit?: HookFn },
): WorkflowBuilder<TActions, TStates | K>
```

Registers a `StepState` and widens `TStates` to include `K`. Becomes `active` on entry; waits for a dispatch to advance. Optional `onEnter`/`onExit` lifecycle hooks fire after the snapshot commits (`onExit` before `onEnter`).

A dead-end non-terminal `StepState` (no outgoing transitions) auto-completes the moment it becomes active — this is inferred at `build()` time and needs no flag. It is the basis for pass-through fork branches that let a `JoinState` activate without explicit branch→join transitions.

## `.addFork(id, options)`

```ts
addFork(id: TStates, options: {
  targets: [TStates, ...TStates[]];
  label?: string;
  onEnter?: HookFn;
  onExit?: HookFn;
}): this
```

Registers a `ForkState`. On entry it immediately completes and activates all `targets` in the same engine tick. The `targets` array is constrained to the declared `TStates` union — a misspelled target is a compile error.

## `.addJoin(id, options)`

```ts
addJoin(id: TStates, options: {
  requires: [TStates, ...TStates[]];
  mode: 'all' | 'any' | number;
  label?: string;
  onEnter?: HookFn;
  onExit?: HookFn;
}): this
```

Registers a `JoinState`. Activates automatically when the `mode` threshold of `requires` states is satisfied. The `requires` array is constrained to `TStates`.

| `mode`     | Activates when                                  |
| ---------- | ----------------------------------------------- |
| `'all'`    | All states in `requires` are `completed`        |
| `'any'`    | At least one state in `requires` is `completed` |
| `number N` | At least N states in `requires` are `completed` |

## `.addWait(id, options?)`

```ts
addWait(id: TStates, options?: {
  externalName?: string;
  label?: string;
  onEnter?: HookFn;
  onExit?: HookFn;
}): this
```

Registers a `WaitState`. On entry its status becomes `waiting` (not `active`). Resume with `inst.resolveWait(id)`.

`externalName` is documentary — it appears in snapshots and visualization but has no runtime effect.

## Lifecycle hooks (`onEnter` / `onExit`)

All four `add*` methods accept optional `onEnter` / `onExit` callbacks — side effects tied to a state's lifecycle (notify, log, kick off an external job).

```ts
type HookFn<TContext> = (ctx: HookContext<TContext>) => void | Promise<void>;

interface HookContext<TContext> {
  stateId: string;                        // the state being entered/exited
  instanceState: ReadonlyInstanceState;   // live status view (post-commit)
  context: TContext;                       // the instance context
}
```

```ts
.addStep('pending-approval', {
  onEnter: async (ctx) => { await notify.managers(`PO ${ctx.instanceState.instanceId} awaiting approval`); },
  onExit:  (ctx) => { metrics.timeIn('pending-approval').stop(); },
})
```

Firing rules — hooks run **after** the snapshot has committed, so they observe the new state:

- They fire on `dispatch` and on deadlines fired by `tick` — for **every** state entered/exited that step, including fork fan-out, join activation, and auto-completed branches.
- `onExit` hooks run before `onEnter` hooks, sequentially (deterministic order), and are `await`ed.
- A throwing hook **propagates** — the error surfaces from the `dispatch`/`tick` call. The snapshot is already committed at that point, so handle hook failures yourself if they must not abort the call.
- Hooks are definition code, not data: they are **not** stored in snapshots and need no re-injection after `restoreInstance`.

See [Run side effects on enter/exit](../scenarios/hooks) for patterns.

## `.setInitial(id)`

```ts
setInitial(id: TStates): this
```

Marks one state as the initial state. It becomes `active` when `createInstance` is called.

## `.setTerminal(ids)`

```ts
setTerminal(ids: [TStates, ...TStates[]]): this
```

Marks one or more states as terminal. Once any terminal state is `active`, all subsequent `dispatch` calls return `{ success: false, reason: 'terminal-state' }`.

## `.addTransition(def)`

Wires a directed edge, triggered by **exactly one** of an action (`on`) or a deadline (`after`):

```ts
// Action-triggered — fires when the action is dispatched
addTransition(def: {
  from: TStates;
  to: TStates;
  on: keyof TActions & string;
  guard?: IGuard | GuardFn;
}): this

// Time-triggered (a deadline) — fires automatically after the delay
addTransition(def: {
  from: TStates;
  to: TStates;
  after: string | number;   // '48h', '7d', '90s', … or raw milliseconds
  guard?: IGuard | GuardFn;
}): this
```

`from` and `to` are constrained to registered IDs; `on` to registered action names. Supplying both `on` and `after`, or neither, is a **compile-time** error.

`guard` accepts either a `Guard.*` factory result or an inline function `(ctx: GuardContext) => boolean | Promise<boolean>`. On an action edge `ctx.payload` is typed to the action's schema; on a timed edge there is no payload (`unknown`).

### Time-triggered transitions (deadlines)

A timed edge models *"if still here after N, go there"* — escalations, auto-cancels, SLA breaches. The clock is anchored to `from`: it starts the moment `from` is entered.

```ts
.addTransition({ from: 'pending-approval', to: 'approved',  on: 'APPROVE' })
.addTransition({ from: 'pending-approval', to: 'escalated', after: '48h' })
```

`after` accepts a duration string (`'500ms'`, `'90s'`, `'15m'`, `'48h'`, `'7d'`, `'2w'`; decimals allowed) or a raw millisecond number. The firing is scoped to its `from` — it never broadcasts to other active states. Deadlines are advanced by [`tick(now)`](./workflow-instance#tick-now) and at the start of every `dispatch`; the library never reads a clock itself. See [Add deadlines and escalation](../scenarios/timeouts) for the full pattern.

For "action **or** deadline to the same target", declare two transitions sharing a `to`.

## `.build()`

```ts
build(): Workflow<TActions, TContext, TStates>
```

Validates the complete definition and returns an immutable `Workflow` object.

**Throws** if (all violations are collected and reported in one error):

- Any declared state was not registered via `addStep/addFork/addJoin/addWait`
- No initial state was set
- No terminal state was set
- A transition references an unregistered state or action
- **Graph checks** — a state is unreachable from the initial state (BFS over transitions + fork fan-out + join activation edges), no terminal state is reachable, or a non-terminal `WaitState`/`JoinState` has no outgoing transitions

## `Workflow` object (returned by `build()`)

### `.createInstance(instanceId)`

```ts
createInstance(
  instanceId: string,
  context?: TContext, // required when setContext() was declared on the builder
  now?: Date,         // creation time; defaults to new Date()
): WorkflowInstance<TActions, TContext>
```

Creates a new `WorkflowInstance` with the initial state set to `active`. When `setContext()` was used on the builder, the `context` argument is **required** (the type enforces it); otherwise it is optional.

`now` sets `createdAt` and, since the initial state is active from creation, is the start time of any deadline anchored to it. It defaults to `new Date()`; pass it for deterministic replay or testing. For a workflow with **no** context, `now` is the third argument, so reach it with `createInstance(id, undefined, now)`.

### `.restoreInstance(snapshot)`

```ts
restoreInstance(snapshot: InstanceSnapshot): WorkflowInstance<TActions>
```

Reconstructs a `WorkflowInstance` from a previously saved snapshot. Validates that `snapshot.workflowName` matches this workflow.

**Throws** if the snapshot's `workflowName` does not match.

### `.getDefinition()`

```ts
getDefinition(): WorkflowDefinition
```

Returns the immutable compiled definition. Pass to `MermaidExporter.export()` or `JsonGraphExporter.export()`.
