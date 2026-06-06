# flowyd

Strongly-typed SOP state machines for TypeScript.

Build Standard Operating Procedures as typed workflow state machines. The compiler catches every typo in a state ID, every wrong action name, and every mismatched payload shape — before your code runs.

**[Full documentation →](https://zihung20.github.io/flowyd/guide/)**
**[Playground →](https://zihung20.github.io/flowyd/playground/)**

---

## The selling point: safety you can feel

Most workflow libraries accept strings everywhere. A typo silently creates dead code. `flowyd` makes that impossible.

### Typo in a state ID — compile error

```ts
const wf = createWorkflow({ name: 'approval' })
  .addStep('draft')
  .addStep('review')
  .addStep('approved')
  .addStep('rejected')
  .setInitial('drft'); // typo
// TS2345: Argument of type '"drft"' is not assignable to
// parameter of type '"draft" | "review" | "approved" | "rejected"'
```

### Wrong action name at dispatch — compile error

```ts
await inst.dispatch('APPROV', { approverId: 'x' });
//                  ^^^^^^
// TS2345: Argument of type '"APPROV"' is not assignable to
// parameter of type '"SUBMIT" | "APPROVE" | "REJECT"'
```

### Wrong payload shape — compile error + Zod runtime check

```ts
await inst.dispatch('APPROVE', { approver: 'mgr-1' });
//                               ^^^^^^^^
// TS2345: Object literal may only specify known properties,
// and 'approver' does not exist in type '{ approverId: string }'
```

### Fork targets and join requires are autocompleted

```ts
.addStep('legal')
.addStep('finance')
.addFork('fork', { targets: ['legal', 'finance'] })       // autocompletes to registered state IDs
.addJoin('join', { requires: ['legal', 'finannce'], mode: 'all' })
//                                      ^^^^^^^^^ compile error
```

---

## Install

```sh
pnpm add flowyd zod
```

`zod` is a required peer dependency.

---

## Quick example

```ts
import { z } from 'zod';
import { createWorkflow, Guard } from 'flowyd';

const purchaseOrder = createWorkflow({ name: 'purchase-order' })
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string(), reason: z.string() }))
  .defineAction('REJECT', z.object({ reason: z.string() }))

  .addStep('draft')
  .addStep('pending-approval')
  .addStep('approved')
  .addStep('rejected')

  .setInitial('draft')
  .setTerminal(['approved', 'rejected'])

  .addTransition({ from: 'draft', to: 'pending-approval', on: 'SUBMIT' })
  .addTransition({
    from: 'pending-approval',
    to: 'approved',
    on: 'APPROVE',
    guard: Guard.inject('isManager'),
  })
  .addTransition({ from: 'pending-approval', to: 'rejected', on: 'REJECT' })

  .build();

const inst = purchaseOrder.createInstance('po-001');

inst.injectGuard('isManager', async (ctx) => {
  return ctx.payload.approverId === 'mgr-1'; // replace with your auth check
});

await inst.dispatch('SUBMIT', { submitterId: 'alice' });
await inst.dispatch('APPROVE', { approverId: 'mgr-1', reason: 'LGTM' });

console.log(inst.getCurrentStates()); // ['approved']
console.log(inst.isTerminal()); // true

const snapshot = inst.getSnapshot(); // plain JSON — save wherever you want
```

---

## Deadlines (timeouts)

Real SOPs need "escalate if not approved in 48h" or "auto-cancel a draft after 7 days". A **time-triggered transition** is a normal transition triggered by a deadline instead of an action — declared with `after` in place of `on`:

```ts
const po = createWorkflow({ name: 'purchase-order' })
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string() }))

  .addStep('draft')
  .addStep('pending-approval')
  .addStep('escalated')
  .addStep('approved')

  .setInitial('draft')
  .setTerminal(['approved', 'escalated'])

  .addTransition({ from: 'draft', to: 'pending-approval', on: 'SUBMIT' })
  .addTransition({ from: 'pending-approval', to: 'approved', on: 'APPROVE' })
  .addTransition({ from: 'pending-approval', to: 'escalated', after: '48h' }) // ← the deadline
  .build();
```

The clock is anchored to the `from` state — it starts when the state is entered. `after` accepts a duration string (`'500ms'`, `'90s'`, `'15m'`, `'48h'`, `'7d'`, `'2w'`) or a raw millisecond number. "Action **or** deadline to the same target" is just two transitions sharing a `to`.

**The library never reads a clock — the host does.** That keeps the engine pure and your storage untouched. There are two ways deadlines advance:

```ts
const inst = po.createInstance('po-1');
await inst.dispatch('SUBMIT', { submitterId: 'alice' });

inst.getNextDueAt(); // → '2026-06-08T10:00:00Z' — index this column to drive a sweep

// 48h later your scheduler loads the instance and advances the clock:
const fired = await inst.tick(new Date()); // pure; fires any elapsed deadlines, returns how many
inst.getCurrentStates();                   // → ['escalated']
```

- `dispatch` **auto-advances** elapsed deadlines first, so any real interaction self-heals after downtime — a stale `APPROVE` against an already-overdue approval is correctly blocked.
- `getNextDueAt()` is the one value to persist (an indexed column) so a cron/queue can sweep idle instances — `SELECT … WHERE next_due_at <= now()` → `restoreInstance` → `tick(now)` → save. flowyd owns no scheduler and no storage.

`tick` catches up cleanly after long downtime: chained deadlines fire in due-time order, each stamped with its **logical** due time (not the wall-clock sweep time), so cascades and the audit trail are reproducible. Fired deadlines appear in history as `__timeout:<from>-><to>`, so an audit can always tell a human action from an SLA breach. A guard on a timed edge is re-evaluated on each `tick` until it passes or the source exits.

**The host owns the clock.** The instance is the only clock-reader, and even that is just a default — `dispatch(action, payload, { now })`, `resolveWait(stateId, snapshot, now)`, and `createInstance(id, context, now)` all accept an optional `now` (defaulting to `new Date()`), and the engine is handed the time rather than reading it. So a run is a pure function of its timestamped events: pass the same `now` values and you reproduce the exact state — deterministic replay and tests with zero clock mocking.

```ts
// Deterministic — no fake timers, the host supplies the time:
const inst = wf.createInstance('po-9', undefined, new Date('2026-06-06T00:00:00Z'));
await inst.dispatch('SUBMIT', { submitterId: 'alice' }, { now: new Date('2026-06-06T00:00:00Z') });
await inst.tick(new Date('2026-06-08T00:00:00Z')); // 48h later → escalated
```

---

## Features

- **Compile-time state ID safety** — `TStates` accumulates per `addStep`/`addFork`/`addJoin`/`addWait` call; typos caught immediately
- **Typed actions and payloads** — `dispatch` and `canExecute` typed end-to-end from `defineAction`
- **Zod-validated at every boundary** — runtime payload validation from the same schema
- **Parallel branches** — `ForkState` fans out; `JoinState` synchronises (`all` / `any` / quorum); dead-end non-terminal `StepState` branches auto-complete on entry (inferred at `build()` time, no flag needed) so joins activate without explicit branch→join transitions
- **External wait states** — `WaitState` pauses until `resolveWait` is called
- **Deadlines (time-triggered transitions)** — `addTransition({ from, to, after: '48h' })` fires automatically when a state has been sat in too long; scoped to its `from`, never broadcast; the host owns the clock via `tick(now)` / `getNextDueAt()`
- **Purely functional persistence** — `getSnapshot()` / `restoreInstance()`, no storage opinions
- **Typed instance context** — `setContext(schema)` makes context required at `createInstance` time; guards read it via `ctx.context`; `getContext()` returns `TContext | undefined` with no cast
- **Fully generic type chain** — `WorkflowDefinition<TContext, TStates>`, `InstanceSnapshot<TContext, TStates>`, `HistoryEntry<TContext, TStates>`, `DispatchResult<TContext, TStates, TAction>` — context, state IDs, and action type flow end-to-end with no boundary casts; `WorkflowEngine.dispatch` returns a fully typed result so `WorkflowInstance` needs zero internal casts
- **Rewind** — `instance.rewind(version)` returns an independent deep-cloned `InstanceSnapshot<TContext>` for any past version, with accurate stateStatuses and context
- **Typed instance queries** — `getCurrentStates()` returns `TStates[]`; `getAvailableTransitions()` returns `(keyof TActions & string)[]`; state-ID and action-name unions propagate from the builder all the way to the instance
- **Composable guards** — `Guard.inject`, `Guard.fn`, `Guard.and`, `Guard.or`, `Guard.not`
- **Built-in visualization** — Mermaid `stateDiagram-v2` and JSON graph for React Flow / D3; both exporters emit fork fan-out and join fan-in edges so the full fork/join topology is visible without explicit transitions

---

## Documentation

| Section                                                                | What's there                                  |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| [Introduction & type safety](https://zihung20.github.io/flowyd/guide/) | What it is, compile-time guarantees in detail |
| [Core Concepts](https://zihung20.github.io/flowyd/guide/concepts)      | States, transitions, guards, snapshots        |
| [Examples](https://zihung20.github.io/flowyd/examples/)                | Four complete runnable workflows              |
| [Scenarios](https://zihung20.github.io/flowyd/scenarios/)              | Task-based guides ("I want to…")              |
| [API Reference](https://zihung20.github.io/flowyd/api/)                | Complete method reference                     |
| [Developer Guide](https://zihung20.github.io/flowyd/dev/)              | Architecture, contributing, design decisions  |

---

## Requirements

- Node.js ≥ 20
- TypeScript ≥ 5.0 with `strict: true`
- `zod` ≥ 3

---

## License

MIT
