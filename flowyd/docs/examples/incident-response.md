# 06 · On-Call Incident Response

The same "everything together" weight as the loan example, but a different shape: an operations runbook driven by **roles** and **SLAs** rather than by applicant data. It highlights things the loan example doesn't.

## Workflow diagram

<!--@include: ./diagrams/incident-response.md-->

**Features shown:** role-based guards via `Guard.inject`, multiple SLAs — including a **deadline that fires from a `waiting` state** — parallel mobilisation joined with `mode: 'all'`, the persistence/handover pattern, and a JSON-graph export grouped by node kind.

## Code

```ts
import { z } from 'zod';
import {
  createWorkflow,
  Guard,
  StateKind,
  type HookContext,
  type HistoryEntry,
  type WorkflowInstance,
} from 'flowyd';
import { JsonGraphExporter } from 'flowyd/visualization';
```

<<< ../../examples/06-incident-response.ts#example

## What to notice

- **A deadline can fire from a `waiting` state, not just an `active` one.** The vendor-escalation wait carries its own 2-hour SLA; if the vendor goes silent, `tick` advances the timed edge straight out of the waiting state and falls back to internal mitigation.
- **Role guards resolve from "who is acting".** The injected `isOnCall` / `isCommander` guards read a request-scoped value — the same way you'd resolve a role from a session or JWT.
- **The handover pattern.** Mid-incident the instance is snapshotted to JSON and rebuilt on the other side, re-injecting the role guards — exactly a shift handover or a server restart.
- **`JsonGraphExporter`** gives a renderer-agnostic `{ nodes, edges }` shape; grouping nodes by `StateKind` is a quick way to drive an ops dashboard.

> Run it locally: `npx tsx examples/06-incident-response.ts`
