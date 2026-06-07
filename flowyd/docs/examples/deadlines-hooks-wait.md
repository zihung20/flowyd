# 04 · Deadlines, Hooks & Waiting

The three features that make a workflow feel alive: **deadlines** that fire on their own, **hooks** that run side effects on enter/exit, and **wait states** that pause for an external system. A support ticket with SLAs ties them together.

## Workflow diagram

<!--@include: ./diagrams/deadlines-hooks-wait.md-->

**Features shown:** time-triggered transitions (`after`), `tick` / `getNextDueAt`, the host-supplied clock (`createInstance(id, ctx, now)`, `dispatch(…, { now })`), `onEnter` / `onExit` hooks, `addWait` + `resolveWait`.

## Code

```ts
import { z } from 'zod';
import { createWorkflow, type HookContext } from 'flowyd';
```

<<< ../../examples/04-deadlines-hooks-wait.ts#example

## What to notice

- **The engine never reads a clock — the host does.** Every time-aware call takes an optional `now` (defaulting to `new Date()`). Pass explicit timestamps and a run becomes a pure function of its events: deterministic replay and tests with zero fake timers.
- **Two ways deadlines advance:** automatically at the start of every `dispatch` (so a late action can't act on a state that should already have timed out), and explicitly via `tick(now)` — what a scheduler calls for idle instances. Persist `getNextDueAt()` as an indexed column to drive that sweep.
- **Hooks fire after the transition commits**, in order: `onExit` of exited states, then `onEnter` of entered states. Keep notifications and audit writes here, out of the transition logic.
- A **wait state** has no deadline of its own here, so `getNextDueAt()` returns `null` while paused on the vendor.

> Run it locally: `npx tsx examples/04-deadlines-hooks-wait.ts`
