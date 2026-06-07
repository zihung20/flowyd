# Examples

A guided ladder from the smallest possible workflow to full, real-world ones. Each page renders a complete, runnable script (the code is imported directly from `flowyd/examples/`, so it never drifts from what actually runs). Read them in order — every example assumes the ones before it.

| # | Example | Tier | Key features |
|---|---------|------|--------------|
| 01 | [Document Approval (Basics)](./basics) | Basics | Actions, steps, the graph, dispatch, blocked results, Mermaid |
| 02 | [Guards & Context](./guards-and-context) | Feature | Typed context, every guard flavour, routing by guard, `canExecute` |
| 03 | [Parallel Work (Fork/Join)](./parallel-fork-join) | Feature | Fork/join, join modes (`all`/`any`/quorum), auto-complete |
| 04 | [Deadlines, Hooks & Waiting](./deadlines-hooks-wait) | Feature | `after` deadlines, `tick`/`getNextDueAt`, hooks, wait states |
| 05 | [Loan Origination](./loan-origination) | Full | Everything together, service-style: snapshot/restore, `rewind`, exporters |
| 06 | [Incident Response](./incident-response) | Full | Role guards, SLAs (incl. a deadline from a *waiting* state), dashboards |
| 07 | [Dynamic Workflow](./dynamic-workflow) | Full | `createDynamicWorkflow`: compiling workflows from runtime config |

## Running the examples

The code on each page is ready to paste into a project that has flowyd installed (`pnpm add flowyd zod`).

To run the examples themselves, get them from the [GitHub repository](https://github.com/zihung20/flowyd/tree/main/examples):

```sh
git clone https://github.com/zihung20/flowyd.git
cd flowyd && pnpm install
npx tsx examples/01-document-approval-basics.ts
```

The [`examples/` directory](https://github.com/zihung20/flowyd/tree/main/examples) also has a README with a full feature-coverage map.
