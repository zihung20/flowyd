# flowyd examples

A guided ladder from the smallest possible workflow to full, real-world ones.
Each file is a self-contained, runnable script with a diagram in its header
comment. Read them in order — every example assumes the ones before it.

Run any example with [`tsx`](https://github.com/privatenumber/tsx):

```sh
npx tsx examples/01-document-approval-basics.ts
```

## The ladder

| # | File | Tier | What it teaches |
|---|------|------|-----------------|
| 01 | `01-document-approval-basics.ts` | Basics | The four essentials: Zod-validated actions, steps, the graph (`setInitial`/`setTerminal`/`addTransition`), and running an instance. Plus what a non-throwing **blocked** result looks like. |
| 02 | `02-guards-and-context.ts` | Feature | Typed **context** (`setContext`) and **guards** — inline, `Guard.fn`, `Guard.and/or/not`, and `Guard.inject` + `injectGuard`. Routing by guard, `canExecute`, updating context mid-run. |
| 03 | `03-parallel-fork-join.ts` | Feature | **Fork** / **join** for parallel work, the three join **modes** (`all` / `any` / quorum number), the two-state auto-complete pattern, and state-aware guards (`Guard.stateCompleted`). |
| 04 | `04-deadlines-hooks-wait.ts` | Feature | **Deadlines** (`after`, `tick`, `getNextDueAt`, host-supplied clock), lifecycle **hooks** (`onEnter`/`onExit`), and **wait states** (`addWait` + `resolveWait`). |
| 05 | `05-loan-origination.ts` | Full | Everything at once, service-layer style: context-driven guards, fork/join, wait, a deadline, hooks, **snapshot/restore** (with guard re-injection), **`rewind`** time-travel, and both exporters. |
| 06 | `06-incident-response.ts` | Full | An on-call runbook: **role guards**, multiple **SLAs** (including a deadline that fires from a *waiting* state), parallel mobilisation, the persistence pattern, and a JSON-graph dashboard export. |
| 07 | `07-dynamic-workflow.ts` | Full | **`createDynamicWorkflow`**: compile workflows from runtime config/JSON, build them in loops, let `build()` reject malformed graphs, and generate an N-stage chain from data. |

## Feature coverage map

| Feature | Shown in |
|---|---|
| `createWorkflow` / accumulating builder | 01–06 |
| `createDynamicWorkflow` | 07 |
| Zod action payloads (`defineAction`) | all |
| `addStep` / `addFork` / `addJoin` / `addWait` | 03, 04, 05, 06 |
| Join modes (`all` / `any` / quorum) | 03 |
| `addTransition` — action (`on`) | all |
| `addTransition` — deadline (`after`) | 04, 05, 06 |
| Guards — inline / `Guard.fn` | 02, 05 |
| Guards — `and` / `or` / `not` | 02, 03, 05 |
| Guards — `stateCompleted` / `stateActive` | 03 |
| Guards — `inject` + `injectGuard` | 02, 05, 06 |
| Typed context — `setContext` / `getContext` | 02, 05 |
| Lifecycle hooks — `onEnter` / `onExit` | 04, 05, 06 |
| `dispatch` / blocked results | all |
| `canExecute` / `getAvailableTransitions` | 01, 02, 06 |
| `resolveWait` | 04, 05, 06 |
| `tick` / `getNextDueAt` (deadlines) | 04, 05, 06 |
| `getSnapshot` / `restoreInstance` | 05, 06 |
| `rewind` (time-travel) | 05 |
| `MermaidExporter` | 01, 03, 05, 07 |
| `JsonGraphExporter` | 05, 06 |
