# 03 · Parallel Work (Fork, Join & Modes)

Several things happen at once, then the flow waits for *enough* of them to finish. A **fork** activates all its targets in parallel; a **join** activates automatically once its `requires` reach the threshold set by `mode`. This models peer review where a decision can be made as soon as two of three reviewers report back.

## Workflow diagram

<!--@include: ./diagrams/parallel-fork-join.md-->

**Features shown:** `addFork`, `addJoin`, join `mode` (`'all'` / `'any'` / a quorum **number**), the two-state auto-complete pattern, state-aware guards (`Guard.stateCompleted`, `Guard.or`), `getStateStatus`.

## Code

```ts
import { z } from 'zod';
import { createWorkflow, Guard, StateStatus } from 'flowyd';
import { MermaidExporter } from 'flowyd/visualization';
```

<<< ../../examples/03-parallel-fork-join.ts#example

## What to notice

- **The join fires automatically.** With `mode: 2`, `decision-ready` activates the instant the second review lands — no dispatch crosses the barrier, and the third reviewer is left untouched (still `active`). Switch `mode` to `'all'` to wait for everyone, or `'any'` for the first.
- **The two-state branch pattern.** Each fork target (`reviewer-a`) leads to a *done* step (`a-done`) that has no outgoing transition and isn't terminal, so flowyd auto-completes it on entry — and that completion is what the join counts. Register the done states *before* the join, and the in-progress states *before* the fork.
- **State-aware guards** read the live status of *other* states (`Guard.stateCompleted`), not the action payload.

> Run it locally: `npx tsx examples/03-parallel-fork-join.ts`
