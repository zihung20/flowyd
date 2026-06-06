# Add deadlines and escalation

> I want a step to act on its own if it sits too long — escalate an unapproved request, auto-cancel an abandoned draft, give up on a stalled branch.

Use a **time-triggered transition**: a normal transition triggered by a deadline (`after`) instead of an action (`on`).

## The shape

```ts
import { z } from 'zod';
import { createWorkflow } from 'flowyd';

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

The clock is anchored to `from`: it starts the moment `pending-approval` is entered. `after` accepts a duration string (`'500ms'`, `'90s'`, `'15m'`, `'48h'`, `'7d'`, `'2w'`; decimals allowed) or a raw millisecond number. The firing is scoped to its `from` — it moves exactly `pending-approval → escalated` and never disturbs other active states.

For "an action **or** a deadline to the same place", just declare two transitions sharing a `to`:

```ts
.addTransition({ from: 'pending-approval', to: 'escalated', on: 'ESCALATE' })
.addTransition({ from: 'pending-approval', to: 'escalated', after: '48h' })
```

The audit history records which path fired: a real action (`ESCALATE`) vs. a deadline (`__timeout:pending-approval->escalated`).

## The host owns the clock

The library never fires deadlines on its own — nothing has a background timer. There are two ways time advances, and both are driven by you:

```ts
const inst = po.createInstance('po-1');
await inst.dispatch('SUBMIT', { submitterId: 'alice' });
```

**1. Automatically, on any interaction.** Every `dispatch` first advances overdue deadlines to "now". So if an instance sat past its deadline while idle, the next interaction self-heals — a late `APPROVE` is blocked because the escalation already fired:

```ts
// 50h later, nobody escalated in between:
const result = await inst.dispatch('APPROVE', { approverId: 'mgr' });
result.success;            // false — pending-approval already timed out at 48h
inst.getCurrentStates();   // ['escalated']
```

**2. Explicitly, for idle instances.** An instance nobody touches needs a nudge, or its deadline never fires. Persist `getNextDueAt()` as an indexed column and let a scheduler sweep:

```ts
inst.getNextDueAt();   // '2026-06-08T10:00:00Z' — store this, indexed

// A cron job, every minute:
//   SELECT id FROM instances WHERE next_due_at <= now()
for (const id of dueIds) {
  const inst = po.restoreInstance(load(id));
  const fired = await inst.tick(new Date());   // fires any overdue deadlines
  if (fired > 0) save(inst.getSnapshot());
}
```

flowyd owns no scheduler and no storage — it just tells you *when* something is due (`getNextDueAt`) and advances the clock when you say to (`tick`).

## Catch-up and determinism

`tick` advances to a fixed point, so a sweep after long downtime fires **chained** deadlines in due-time order in one call. Each firing is stamped with its **logical** due time (not the wall-clock moment the sweep ran), so the result is the same no matter when you sweep:

```ts
// A → (1h) → B → (1h) → C, swept 10h late:
const fired = await inst.tick(new Date(start + 10 * 3_600_000));
fired;                     // 2 — both deadlines fired
inst.getCurrentStates();   // ['c']
// history[0].at = start + 1h,  history[1].at = start + 2h  (logical, chained)
```

Because the host supplies the time, runs are reproducible — pass the same `now` values and you get the same state, with no clock mocking:

```ts
const inst = po.createInstance('po-2', undefined, new Date('2026-06-06T00:00:00Z'));
await inst.tick(new Date('2026-06-08T00:00:00Z')); // exactly 48h later → escalated
```

## Give up on a stalled parallel branch

A deadline pointing at a dead-end branch state lets a slow branch bow out so a join can proceed. The branch state [auto-completes on entry](./parallel-branches), satisfying the join's `requires`:

```ts
.addStep('sec-review')
.addStep('sec-skipped')  // dead-end → auto-completes
.addJoin('resolved', { requires: ['eng-review', 'sec-review'], mode: 'all' })
// security has 1h; if it stalls, the branch is treated as done
.addTransition({ from: 'sec-review', to: 'sec-skipped', after: '1h' })
```

## Guards on deadlines

A timed edge can carry a `guard`. It is re-evaluated on each `tick` until it passes or the source exits — so a deadline can be conditional ("escalate after 48h, but only for VIP accounts"). A timed guard has no payload (`ctx.payload` is `unknown`); use `ctx.context` and `ctx.instanceState`.

## See also

- [`addTransition`](../api/workflow-builder#addtransition-def) — the `after` trigger
- [`tick` / `getNextDueAt`](../api/workflow-instance#tick-now) — driving the clock
- [Run steps in parallel](./parallel-branches) — the branch give-up pattern
