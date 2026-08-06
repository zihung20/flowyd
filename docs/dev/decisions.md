# Design decisions

Why the library's most distinctive choices were made.

## Zod as the single source of truth for types

Every payload type is derived from a Zod schema via `z.infer<typeof MySchema>`. A parallel `interface` mirroring the schema would duplicate the contract — the two would drift.

Zod schemas serve triple duty:

1. **TypeScript type** — `z.infer<>` produces the type for free
2. **Runtime validator** — called by the engine before every `dispatch`
3. **Schema introspection** — a future JSON Schema or OpenAPI exporter can derive its output from the same Zod object

This is why `defineAction(name, schema)` accepts a `ZodSchema` directly rather than a plain TypeScript type.

## No silent failures — everything throws

Functions that can fail throw — never `null`, `undefined`, or `false`. A `null` return puts the burden on every caller to check it; one who forgets creates a silent failure that surfaces as a confusing bug downstream, often in production. A thrown `Error` with a precise message surfaces immediately at the call site.

The one exception: `dispatch` returns `TransitionBlocked` for domain failures (`guard-failed`, `terminal-state`, etc.) instead of throwing — these are valid, expected outcomes the caller's business logic must handle, not programming errors. Payload validation failure still throws `ZodError`, since that's always a caller bug.

## Purely functional persistence

The engine never touches storage. `getSnapshot()` returns a plain JSON object; `restoreInstance(snapshot)` reconstructs exact state from it. Database, ORM, serialization format, and concurrency strategy are entirely the application's concern.

Benefits:

- **Testability** — unit tests `createInstance`, dispatch, and inspect `getSnapshot()` with no database
- **Portability** — the same snapshot writes to Postgres, Redis, S3, or a flat file with no library changes
- **Auditability** — the snapshot is human-readable JSON, inspectable in any database client
- **Version conflicts** — `snapshot.version` is a free optimistic-concurrency token

## The engine has no I/O

`WorkflowEngine` is a pure function: snapshot + action → new snapshot. No `setTimeout`, `fetch`, or other I/O. Guards that need I/O are injected at runtime via `injectGuard` — the engine calls them as opaque `() => Promise<boolean>` callbacks.

This keeps the engine deterministic and synchronously testable: inject a guard that resolves to a fixed value and run it. No mocking, no waiting.

## Guard injections are not persisted

Guards are functions, not data — serializing them into a snapshot isn't feasible and would couple the format to the implementation language. Contract: after every `restoreInstance`, re-inject any named guards before dispatching.

A missing guard throws immediately on evaluation, so the gap is never silent:

```
Error: Guard "isManager" has not been injected. Call instance.injectGuard("isManager", fn).
```

## Visualization is a separate entry point

`MermaidExporter` and `JsonGraphExporter` live in `flowyd/visualization`, a separate package entry point:

1. Bundlers tree-shake it from applications that don't use it
2. The core engine (`core/`, `states/`, `guards/`, `types/`) has zero knowledge of visualization — importing it from `core/` is a build violation, not just a style one
3. Future exporters (SVG, BPMN) can be added without touching any core file

Physical separation enforces the rule at the toolchain level, not just by convention.

## WorkflowBuilder: Accumulating state declaration

`TStates` starts as `never` and widens by one literal with every `addStep`/`addFork`/`addJoin`/`addWait` call — the same pattern `TActions` uses for `defineAction`. No upfront `states` array; the compiler knows exactly which IDs are in scope at each point in the chain.

`addFork.targets` and `addJoin.requires` are constrained to the `TStates` accumulated _before_ that call, so branch states must be registered before the fork or join that targets them — a compile-time ordering rule.

All four state-registration methods return `WorkflowBuilder<TActions, TStates | K>`; at runtime the same object is returned via `as unknown as …` casts, only the type changes. `setInitial`, `setTerminal`, and `addTransition` return `this`. This catches state-ID and action-name typos at compile time rather than at `build()`.
