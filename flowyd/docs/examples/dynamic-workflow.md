# 07 · Workflows Defined at Runtime

Every other example hard-codes its states, so flowyd infers a precise union of state-ID literals and catches typos at compile time. When the *shape* of a workflow isn't known until runtime — it comes from a database row, a JSON config, or a no-code builder — use **`createDynamicWorkflow`**: `TStates` is pre-widened to `string`, so you can build in loops. You trade compile-time ID checking for runtime validation, and `build()` still enforces every structural and graph invariant.

## Workflow diagram

Even a runtime-defined workflow has an inspectable graph. This is the `employee-onboarding` workflow compiled from the config below — its diagram is generated from the compiled definition, exactly like the static examples.

<!--@include: ./diagrams/dynamic-workflow.md-->

**Features shown:** `createDynamicWorkflow`, compiling a plain-data config into a runnable workflow, `build()` rejecting a malformed graph, and generating an N-stage chain purely from an array.

## Code

```ts
import { z } from 'zod';
import { createDynamicWorkflow } from 'flowyd';
import { MermaidExporter } from 'flowyd/visualization';
```

<<< ../../examples/07-dynamic-workflow.ts#example

## What to notice

- **Validation moves from the compiler to `build()`.** Unknown IDs, unreachable states, non-terminating graphs, and missing action schemas all throw at build time — *before* any instance runs — as the malformed config demonstrates.
- **Payloads are `unknown` on a dynamic workflow**, so the only statically-safe payload is `{}`. That fits config/no-code engines, which key off state (and context) rather than typed action payloads; a richer per-action schema is still possible if you validate and narrow at the dispatch boundary.
- **The workflow's size is data.** The N-level approval chain is generated from an array of approver levels — add a level to the array, not to the code.

> Run it locally: `npx tsx examples/07-dynamic-workflow.ts`
