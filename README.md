# flowyd

[![CI](https://github.com/zihung20/flowyd/actions/workflows/ci.yml/badge.svg)](https://github.com/zihung20/flowyd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Types: included](https://img.shields.io/badge/Types-included-3178c6.svg?logo=typescript&logoColor=white)](#)
[![Validation: Zod](https://img.shields.io/badge/Validation-Zod-1a5fb4.svg)](https://zod.dev)
[![npm](https://img.shields.io/npm/v/flowyd.svg?logo=npm)](https://www.npmjs.com/package/flowyd)

**Strongly-typed Standard-Operating-Procedure state machines for TypeScript.**

Describe a real business process as a graph of states and transitions. The compiler catches every typo in a state ID, every wrong action name, and every mismatched payload shape — **before your code runs**. Snapshots are plain JSON, so you own the storage and the library owns nothing.

**[Documentation →](https://zihung20.github.io/flowyd/guide/)**  ·  **[Live Playground →](https://zihung20.github.io/flowyd/playground/)**  ·  **[Examples →](https://zihung20.github.io/flowyd/examples/)**

---

## See it

A document-approval workflow, in code and as a diagram — both generated from the same definition:

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> pending_approval : SUBMIT
    pending_approval --> approved : APPROVE [isManager]
    pending_approval --> rejected : REJECT
    pending_approval --> escalated : after 48h
    approved --> [*]
    rejected --> [*]
    escalated --> [*]
```

```ts
import { z } from 'zod';
import { createWorkflow, Guard } from 'flowyd';

const approval = createWorkflow({ name: 'document-approval' })
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string() }))
  .defineAction('REJECT', z.object({ reason: z.string() }))

  .addStep('draft')
  .addStep('pending-approval')
  .addStep('approved')
  .addStep('rejected')
  .addStep('escalated')

  .setInitial('draft')
  .setTerminal(['approved', 'rejected', 'escalated'])

  .addTransition({ from: 'draft', to: 'pending-approval', on: 'SUBMIT' })
  .addTransition({ from: 'pending-approval', to: 'approved', on: 'APPROVE', guard: Guard.inject('isManager') })
  .addTransition({ from: 'pending-approval', to: 'rejected', on: 'REJECT' })
  .addTransition({ from: 'pending-approval', to: 'escalated', after: '48h' }) // deadline
  .build();

const inst = approval.createInstance('doc-001');
inst.injectGuard('isManager', async (ctx) => ctx.payload.approverId === 'mgr-1');

await inst.dispatch('SUBMIT', { submitterId: 'alice' });
await inst.dispatch('APPROVE', { approverId: 'mgr-1' });

inst.getCurrentStates(); // ['approved']
inst.getSnapshot();      // plain JSON — persist it anywhere
```

> Type `'drft'` instead of `'draft'`, or `'APPROV'` instead of `'APPROVE'`, and it won't compile. **[Try it in the playground — no install →](https://zihung20.github.io/flowyd/playground/)**

---

## Why flowyd

- **Compile-time safety on everything** — state IDs, action names, and payload fields are all checked by TypeScript. Typos and wrong shapes never reach runtime.
- **One source of truth** — payloads are Zod schemas; the same schema drives the TypeScript type *and* the runtime validation. No duplication.
- **Pure, stateless engine** — `dispatch` takes a snapshot and an action, returns a new snapshot. No I/O, no globals, no hidden clock. Deterministic and trivially testable.
- **Parallel branches, deadlines, and waits** — fork/join (`all` / `any` / quorum), time-triggered transitions (`after: '48h'`), and external wait states — all without the engine ever touching a database or a timer.
- **You own persistence** — `getSnapshot()` is plain JSON; `restoreInstance()` rebuilds exact state. Postgres, Redis, a file — the library doesn't care.
- **Built-in visualization** — export to Mermaid or a JSON graph for React Flow / D3 / Cytoscape (the diagram above came straight from a definition).

---

## Repository layout

This is a monorepo of three packages that ship together.

| Package | What it is | Published |
|---|---|---|
| **[`flowyd/`](./flowyd/)** | The core library — the fluent builder, the pure engine, guards, and exporters. **[→ Library README](./flowyd/README.md)** | yes — [`flowyd`](https://www.npmjs.com/package/flowyd) |
| **[`web-runner/`](./web-runner/)** | React SPA (Vite + Tailwind + shadcn/ui + React Flow) that visualises and drives workflows in the browser. Powers the live playground. **[→ Web-runner README](./web-runner/README.md)** | no (demo / dev tool) |
| **[`docs/`](./docs/)** | Standalone VitePress documentation site (Diátaxis structure). Consumes the library via `file:../flowyd`. | no (deployed to Pages) |

---

## Quick start

Install from npm (`zod` is a required peer dependency):

```sh
pnpm add flowyd zod
```

Then drop in the [`See it`](#see-it) snippet above, or work through the seven guided [examples](./flowyd/examples/) from a clone of this repo:

```sh
git clone https://github.com/zihung20/flowyd.git
cd flowyd/flowyd && pnpm install
npx tsx examples/01-document-approval-basics.ts
```

---

## Development

```sh
# library — build it first; web-runner and docs both consume it
cd flowyd        && pnpm install && pnpm build
cd ../web-runner && pnpm install && pnpm dev   # → http://localhost:5173
cd ../docs       && pnpm install && pnpm dev   # VitePress site
```

Every change to the library must pass the full gate before it's done:

```sh
cd flowyd && pnpm lint && pnpm check:filemap && pnpm typecheck && pnpm test && pnpm build
```

**`pnpm` only** — never `npm` or `yarn`. See **[Contributing](./docs/dev/contributing.md)** for the full guide, and **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** for the short version.

---

## Status

flowyd is **published on npm** ([`flowyd@0.2.0`](https://www.npmjs.com/package/flowyd)), feature-complete for its current scope, and fully tested. It's pre-1.0, so the API may still evolve.

Found a bug or have an idea? **[Open an issue](https://github.com/zihung20/flowyd/issues/new/choose)** — there are templates to make it quick.

---

## License

[MIT](./LICENSE)
