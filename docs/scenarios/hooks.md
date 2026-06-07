# Run side effects on enter/exit

> I want something to happen when a workflow reaches or leaves a state — send a notification, write a log line, start an external job, stop a timer.

Attach `onEnter` / `onExit` hooks to any state. They are the sanctioned place for side effects: the engine itself stays pure, and hooks run at the edges.

## The shape

All four `add*` methods accept the hooks:

```ts
import { z } from 'zod';
import { createWorkflow } from 'flowyd';

const po = createWorkflow({ name: 'purchase-order' })
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string() }))

  .addStep('draft')
  .addStep('pending-approval', {
    onEnter: async (ctx) => {
      await notifier.email('approvers@corp', `PO ${ctx.instanceState.instanceId} awaiting approval`);
    },
    onExit: (ctx) => {
      metrics.stopTimer(`approval.${ctx.instanceState.instanceId}`);
    },
  })
  .addStep('approved', {
    onEnter: (ctx) => log.info('PO approved', { id: ctx.instanceState.instanceId }),
  })
  // ...
  .build();
```

## What a hook receives

```ts
type HookFn<TContext> = (ctx: HookContext<TContext>) => void | Promise<void>;

interface HookContext<TContext> {
  stateId: string;                       // the state being entered or exited
  instanceState: ReadonlyInstanceState;  // live status view (after the commit)
  context: TContext;                     // the instance context
}
```

`instanceState` is the same read-only view guards get — query other states with `ctx.instanceState.isStateCompleted('legal-review')`, read the run id with `ctx.instanceState.instanceId`, and branch your side effect on `ctx.context`.

## When and how they fire

- **After the snapshot commits.** Hooks observe the *new* state — by the time `onEnter('approved')` runs, `approved` is already `active`.
- **On `dispatch` and on deadlines fired by `tick`** — for every state entered/exited that step, including fork fan-out, join activation, and auto-completed branches.
- **`onExit` before `onEnter`**, sequentially, and each is `await`ed before the next. Order is deterministic.

```ts
// fork → [legal, finance] then a join:
// dispatch fires, in order:
//   onExit(briefed) → onEnter(legal) → onEnter(finance)  ...then when the join activates:
//   onEnter(join)
```

## Errors propagate

A throwing hook is **not** swallowed — the error surfaces from the `dispatch` (or `tick`) call. The snapshot is already committed at that point, so the state change stands even though the hook failed. If a side effect must not abort the call, guard it yourself:

```ts
.addStep('approved', {
  onEnter: async (ctx) => {
    try { await billing.charge(ctx.context.orderId); }
    catch (err) { log.error('charge failed, will retry async', err); /* don't rethrow */ }
  },
})
```

## Hooks are code, not data

Hooks live in the workflow definition (code), never in the snapshot (data). That means:

- They are **not** serialized by `getSnapshot()` and need **no** re-injection after `restoreInstance` — unlike injected guards, the definition already carries them.
- Keep them idempotent-friendly where you can: a fired deadline caught up by a late `tick` will run its hooks then, not at the original due time.

## Keep heavy work out of the hot path

Hooks run inline and are awaited, so a slow `onEnter` slows the `dispatch` that triggered it. For anything heavy or unreliable (emails, third-party calls), enqueue a job from the hook and let a worker do the work — the hook just publishes the event.

## See also

- [`addStep` / `addFork` / `addJoin` / `addWait`](../api/workflow-builder#lifecycle-hooks-onenter-onexit) — hook options and firing rules
- [Add guards to transitions](./guards) — pure predicates (no side effects), the counterpart to hooks
