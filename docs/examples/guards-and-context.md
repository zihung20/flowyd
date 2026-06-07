# 02 · Guards & Context

Turns a plain state machine into a rules engine. Typed **context** carries per-instance policy; **guards** decide whether a transition may fire. Two arcs leave the same state on the same action with mutually-exclusive guards, so the data routes the flow.

## Workflow diagram

<!--@include: ./diagrams/guards-and-context.md-->

**Features shown:** `setContext` (typed via Zod), inline guards reading `ctx.payload` / `ctx.context`, `Guard.fn`, `Guard.and` / `or` / `not`, `Guard.inject` + `injectGuard`, routing by guard, `canExecute`, updating context mid-run with `setContext`.

## Code

```ts
import { z } from 'zod';
import { createWorkflow, Guard } from 'flowyd';
```

<<< ../../flowyd/examples/02-guards-and-context.ts#example

## What to notice

- **Context is required at `createInstance`** once you declare a schema with `setContext`, and it's fully typed inside every guard as `ctx.context`.
- **Routing by guard:** two transitions share the `REVIEW` action but have mutually-exclusive guards, so exactly one fires. (If two guards both passed, *both* arcs would fire — keep routing guards exclusive.)
- **`canExecute` is a dry run.** It evaluates the guards with a candidate payload and returns a boolean *without* mutating state — ideal for enabling/disabling an "Approve" button.
- **`Guard.inject` decouples the graph from auth.** The definition never knows how "is this a manager?" is answered; you supply it per instance with `injectGuard`.

> Run it locally: `npx tsx examples/02-guards-and-context.ts`
