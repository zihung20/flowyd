# 05 · Loan Origination (Everything Together)

A realistic, end-to-end workflow that uses nearly every feature, wired the way you'd wire it in a service — with a small "service layer" around the instance and a crash-and-restore in the middle of the happy path.

## Workflow diagram

<!--@include: ./diagrams/loan-origination.md-->

**Features shown:** typed context driving guards, `Guard.and` of an injected role + a payload check, fork/join (`mode: 'all'`), a wait state, a deadline (auto-withdraw), lifecycle hooks, **snapshot persistence + restore with guard re-injection**, **`rewind`** time-travel, and both exporters.

## Code

```ts
import { z } from 'zod';
import {
  createWorkflow,
  Guard,
  type HookContext,
  type HistoryEntry,
  type WorkflowInstance,
} from 'flowyd';
import { MermaidExporter, JsonGraphExporter } from 'flowyd/visualization';
```

<<< ../../examples/05-loan-origination.ts#example

## What to notice

- **Guards are runtime behaviour, never serialised.** The service helpers re-inject them on *create and after every restore* — this is the single most common production gotcha. The `load()` helper types the parsed JSON as `Parameters<typeof loan.restoreInstance>[0]` so the snapshot keeps the definition's exact state-ID union, not a bare `string`.
- **The join is automatic.** The moment the third check clears, `checks-complete` activates with no extra dispatch.
- **`rewind(version)` is non-destructive.** It reconstructs an independent snapshot of any past version (with the context that was live then) while the running instance stays exactly where it is.
- **One definition, two views.** `MermaidExporter` and `JsonGraphExporter` both read the compiled definition — diagrams and dashboards never drift from the source of truth.

> Run it locally: `npx tsx examples/05-loan-origination.ts`
