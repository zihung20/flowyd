# WorkflowInstance & DispatchResult

`WorkflowInstance<TActions, TContext, TStates>` is the mutable runtime object for a single workflow run. Create it via `workflow.createInstance(id)` or `workflow.restoreInstance(snapshot)`.

```ts
import type { WorkflowInstance, InstanceSnapshot, DispatchResult } from 'flowyd';
```

## WorkflowInstance methods

### `dispatch(action, payload, options?)`

```ts
dispatch<K extends keyof TActions & string>(
  action: K,
  payload: TActions[K],
  options?: { now?: Date },
): Promise<DispatchResult>
```

Validates the payload, evaluates guards, and applies state transitions atomically.

- **On success** — updates internal snapshot, returns `TransitionSuccess`
- **On failure** — returns `TransitionBlocked` with **no state change**

Before applying the action, `dispatch` advances any **overdue deadlines** to `now`, so a late action can't act on a state that should already have timed out (e.g. an `APPROVE` arriving after the escalation deadline is blocked, not applied). `options.now` defaults to `new Date()` — pass it for deterministic replay/testing. The same `now` stamps the history entry; the engine never reads a clock itself.

**Throws** (does not return failure):

- `ZodError` — payload fails the action's Zod schema
- `Error` — a named guard has not been injected

Both `action` and `payload` are fully typed from the workflow's `TActions` generic. Any `onEnter`/`onExit` hooks on the states entered/exited fire after the snapshot commits.

### `canExecute(action, payload)`

```ts
canExecute<K extends keyof TActions & string>(
  action: K,
  payload: TActions[K],
): Promise<boolean>
```

Dry-run: evaluates guards but commits no state change. Use to drive UI affordances (enable/disable buttons). Returns `false` if the workflow is terminal, the action has no transitions from any active state, or all matching guards fail.

### `getCurrentStates()`

```ts
getCurrentStates(): TStates[]
```

Returns IDs of all states currently `active` or `waiting`, narrowed to the workflow's registered state-ID union `TStates`. Both statuses are included because they represent the current position in the workflow.

### `getStateStatus(stateId)`

```ts
getStateStatus(stateId: TStates): StateStatus
// 'idle' | 'active' | 'waiting' | 'completed'
```

**Throws** if `stateId` is not registered in this workflow.

### `isTerminal()`

```ts
isTerminal(): boolean
```

Returns `true` once any terminal state is `active`. Once terminal, all subsequent `dispatch` calls return `{ success: false, reason: 'terminal-state' }`.

### `getAvailableTransitions()`

```ts
getAvailableTransitions(): (keyof TActions & string)[]
```

Returns action names that have at least one transition from a currently `active` state, narrowed to the workflow's registered action-name union. Does **not** evaluate guards — use for displaying available action names without the cost of a guard round-trip. Use `canExecute` when you need guard evaluation.

### `injectGuard(name, fn)`

```ts
injectGuard<TPayload>(
  name: string,
  fn: (ctx: GuardContext<TPayload>) => boolean | Promise<boolean>,
): this
```

Registers a named guard implementation. Returns `this` for chaining. Calling with the same name twice replaces the previous implementation. Guard injections are **not persisted** in snapshots — re-inject after every `restoreInstance`.

### `getSnapshot()`

```ts
getSnapshot(): InstanceSnapshot
```

Returns a deep-cloned, JSON-serialisable snapshot of the current instance state. Safe to mutate — does not affect the instance.

### `tick(now)`

```ts
tick(now: Date): Promise<number>
```

Advances every **time-triggered transition** (deadline) that is due as of `now`, and returns how many fired. The engine has no clock of its own — the host supplies `now` and decides when to call this (a sweep, a catch-up after downtime, a test).

- Fires to a fixed point, so a sweep after long downtime catches up through chained deadlines in due-time order.
- Each firing is stamped with its **logical** due time (not the wall-clock sweep time), so cascades and the audit trail are reproducible. They appear in history as `__timeout:<from>-><to>`.
- A guard on a timed edge that blocks is retried on the next `tick`, not consumed.

```ts
const fired = await inst.tick(new Date()); // e.g. a cron job over due instances
if (fired > 0) await db.save(inst.getSnapshot());
```

### `getNextDueAt()`

```ts
getNextDueAt(): string | null
```

Returns the earliest ISO-8601 time at which a deadline will fire across all currently `active`/`waiting` states, or `null` when none is armed (or the instance is terminal). Persist it as an indexed column so a scheduler can sweep due instances (`SELECT … WHERE next_due_at <= now()`) and `tick` each — the library owns no scheduler and no storage. See [Add deadlines and escalation](../scenarios/timeouts).

### `resolveWait(stateId, options?)`

```ts
resolveWait(
  stateId: string,
  options?: { now?: Date },
): void
```

Promotes a `WaitState` from `waiting` → `active`. Call from your service layer when the external process completes. Increments `snapshot.version` and appends a `__resolve_wait:<stateId>` history entry. To record what the external process returned, put it in the payload of the action you dispatch next to leave the wait state — it lands in the audit history there. `options.now` stamps the history entry (defaults to `new Date()`; pass it for deterministic replay/testing).

**Throws** if `stateId` is not a `WaitState` or is not currently `waiting`.

### `getContext()` / `setContext(data)`

```ts
getContext(): TContext | undefined
setContext(data: TContext): this
```

`getContext` returns the caller-owned instance context (set at `createInstance` time or via `setContext`), or `undefined` if none was set. `setContext` replaces it and returns `this` for chaining. The context is persisted in the snapshot and read by guards via `ctx.context`.

### `rewind(version)`

```ts
rewind(version: number): InstanceSnapshot<TContext, TStates>
```

Returns an independent, deep-cloned `InstanceSnapshot` reconstructed as of any past `version` — with accurate `stateStatuses` and the context that was in effect at that point. Does not mutate the live instance.

**Throws** if `version` is out of range for this instance's history.

## DispatchResult

`dispatch` returns a discriminated union on the `success` field:

```ts
type DispatchResult = TransitionSuccess | TransitionBlocked;
```

### TransitionSuccess

```ts
interface TransitionSuccess {
  success: true;
  action: string;
  enteredStates: readonly string[]; // states that became active/waiting this tick
  exitedStates: readonly string[]; // states that completed this tick
  snapshot: InstanceSnapshot; // the new snapshot (already committed internally)
}
```

### TransitionBlocked

```ts
interface TransitionBlocked {
  success: false;
  action: string;
  reason:
    | 'terminal-state' // workflow has already ended
    | 'invalid-action' // no transitions exist for this action name
    | 'no-active-source' // action exists but none of its source states are active
    | 'guard-failed'; // all matching transitions were blocked by guards
  activeStates: string[];
}
```

When `success` is `false`, the instance state is **unchanged**.

### Reason reference

| Reason             | Meaning                                                   | Suggested HTTP response |
| ------------------ | --------------------------------------------------------- | ----------------------- |
| `terminal-state`   | Workflow has already reached a terminal state             | 409 Conflict            |
| `invalid-action`   | Action name has no transitions defined                    | 400 Bad Request         |
| `no-active-source` | Action is defined but no active state has this transition | 400 Bad Request         |
| `guard-failed`     | Transitions exist but all guards blocked                  | 403 Forbidden           |

### Exhaustive switch

```ts
const result = await inst.dispatch('APPROVE', payload);

if (!result.success) {
  switch (result.reason) {
    case 'guard-failed':
      return res.status(403).json({ error: 'Not authorized to approve' });
    case 'terminal-state':
      return res.status(409).json({ error: 'This workflow has already ended' });
    case 'no-active-source':
    case 'invalid-action':
      return res.status(400).json({ error: result.reason });
  }
}

await db.save(inst.getSnapshot());
```

### What throws vs what returns failure

`dispatch` **throws** for programming errors — bugs in the caller that should never reach production:

- `ZodError` — payload does not match the action's declared schema
- `Error` — a named `Guard.inject(name)` has not been injected via `injectGuard`

It **returns** `TransitionBlocked` for valid domain outcomes — things the caller's business logic must handle (guard blocked, terminal, wrong order of operations).
