# 01 · Document Approval (The Basics)

The smallest useful flowyd workflow. It introduces the four things every workflow needs — Zod-validated actions, states, the graph, and running an instance — and nothing else.

## Workflow diagram

<!--@include: ./diagrams/basics.md-->

**Features shown:** `createWorkflow`, `defineAction` with Zod, `addStep`, `setInitial` / `setTerminal` / `addTransition`, `dispatch`, `getCurrentStates` / `getAvailableTransitions` / `isTerminal`, non-throwing **blocked** results, `MermaidExporter`.

## Code

```ts
import { z } from 'zod';
import { createWorkflow } from 'flowyd';
import { MermaidExporter } from 'flowyd/visualization';
```

<<< ../../examples/01-document-approval-basics.ts#example

## What to notice

- **`dispatch` doesn't throw for ordinary domain failures.** It returns a discriminated `{ success: false, reason }` — here `'terminal-state'` and `'no-active-source'`. Narrow on `result.success` and let your business logic handle the rest. (Payload validation failure still throws a `ZodError`.)
- **State IDs are checked at compile time.** A typo in any `from`/`to`/`setInitial` argument is a TypeScript error, because the set of valid IDs accumulates with each `addStep`.
- **`getAvailableTransitions()`** is the no-guard list of actions valid from the current state — exactly what a UI needs to decide which buttons to render.

> Run it locally: `npx tsx examples/01-document-approval-basics.ts`
