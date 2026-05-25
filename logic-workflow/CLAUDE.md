# CLAUDE.md — Project Law

This file is the authoritative reference for every agent and developer working in this codebase. Read it before touching any file. The rules here override instinct, habit, and convention.

---

## 1. System Overview

`logic-workflow` is a TypeScript library for building typed, auditable workflow state machines. It exposes a fluent `WorkflowBuilder` API that enforces state-ID correctness at compile time, a pure stateless `WorkflowEngine` that executes transitions, and pluggable guard functions for async business-rule evaluation. Snapshots are plain JSON — the library has no opinion on storage.

**Companion apps (not in this directory):**

- `../web-runner/` — React SPA (Vite + Tailwind + @xyflow/react) that visualises and drives workflows in the browser. Always run `pnpm build` in this directory before starting the web runner.
- `docs/` — VitePress documentation site (Diátaxis structure). Run with `pnpm docs:dev`.

---

## 2. Core File Map

```
src/
├── types/
│   ├── state.ts          — IStepState, IForkState, IJoinState, ISubWorkflowState, AnyState discriminated union
│   ├── workflow.ts       — WorkflowDefinition, InstanceSnapshot, TransitionDefinition
│   ├── guards.ts         — IGuard interface, GuardContext
│   └── index.ts          — barrel re-export

├── states/
│   ├── base.ts           — BaseState<TId> — shared id/status/label logic
│   ├── step-state.ts     — StepState implements IStepState
│   ├── fork-state.ts     — ForkState<TId, TValidStates> — splits into parallel branches
│   ├── join-state.ts     — JoinState<TId, TValidStates> — synchronises branches (all/any/quorum)
│   └── sub-workflow-state.ts — SubWorkflowState — pauses until external process resolves

├── guards/
│   ├── factory.ts        — Guard namespace: inject, stateCompleted, stateActive, and, or, not, fn, always, never
│   └── *.test.ts         — unit tests co-located with source

├── core/
│   ├── builder.ts        — WorkflowBuilder<TActions, TStates> — Config-First fluent builder
│   ├── engine.ts         — WorkflowEngine — pure static dispatch; fixed-point join loop
│   ├── instance.ts       — WorkflowInstance — stateful wrapper; holds snapshot; exposes dispatch/getSnapshot/restoreInstance
│   ├── registry.ts       — StateRegistry — typed Map<string, AnyState>
│   └── *.test.ts         — unit tests co-located with source

├── visualization/
│   ├── mermaid.ts        — MermaidExporter
│   └── json-graph.ts     — JsonGraphExporter, JsonGraph, JsonGraphNode, JsonGraphEdge

├── testing/
│   └── helpers.ts        — shared test fixtures (makeLinear, etc.)

└── index.ts              — public barrel: WorkflowBuilder, Guard, state classes, types, exporters
```

**Key entry points in `package.json`:**

- `"."` → `dist/index.js` — core library
- `"./visualization"` → `dist/visualization/index.js` — visualization (tree-shakeable)

---

## 3. Architectural Decisions & Guardrails

### Package manager

**`pnpm` exclusively. No exceptions.**

```sh
pnpm install   pnpm add <pkg>   pnpm run build   pnpm test
# Never: npm install / yarn add
```

If a `package-lock.json` or `yarn.lock` appears, delete it and investigate.

---

### TypeScript strict mode

The following `compilerOptions` must remain enabled at all times:

```json
"strict": true,
"exactOptionalPropertyTypes": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true
```

- No `any`. Use `unknown` and narrow explicitly.
- No non-null assertions (`!`) without a comment proving the value is non-null at that site.
- No `as` casts except at layer boundaries (after a `kind` discriminant check). Every cast needs a comment.

---

### Zod as single source of truth

Every payload type is derived from a Zod schema via `z.infer<typeof MySchema>`. Never write a parallel `type` or `interface`.

```ts
// Correct
const UserSchema = z.object({ id: z.string(), score: z.number() });
type User = z.infer<typeof UserSchema>;

// Never — duplicated source of truth
interface User { id: string; score: number; }
const UserSchema = z.object({ id: z.string(), score: z.number() });
```

---

### Layer architecture — one-way dependency rule

```
visualization/
    ↓
core/
    ↓
states/
    ↓
types/
```

- `core/` must not import from `visualization/`.
- `states/` must not import from `core/`.
- `types/` must not import from any other layer.
- Cross-layer communication goes through `types/` interfaces only.

Treat a violation as a build error even when the compiler does not catch it.

---

### Config-First WorkflowBuilder

All state IDs are declared upfront in the constructor. This establishes the `TStates` union at instantiation, so `addStep`, `addFork`, `addJoin`, `addSubWorkflow`, `setInitial`, `setTerminal`, and `addTransition` are all constrained to that fixed set — typos fail at compile time.

```ts
const wf = createWorkflow({
  name: 'my-workflow',
  states: ['draft', 'review', 'approved', 'rejected'],  // no `as const` needed
})
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .addStep('draft')
  .addStep('review')
  .addStep('approved')
  .addStep('rejected')
  .setInitial('draft')
  .setTerminal(['approved', 'rejected'])
  .addTransition({ from: 'draft', to: 'review', on: 'SUBMIT' })
  .build();
```

**Rules:**
- Use `createWorkflow()` — the `const` type parameter infers literal types automatically.
- Never use `new WorkflowBuilder('name')` (old positional signature — removed) or `new WorkflowBuilder({...})` directly.
- Every state must be registered via `addStep`, `addFork`, `addJoin`, or `addSubWorkflow`. There is no `addState` escape hatch.
- `addFork` targets and `addJoin` requires autocomplete to the `TStates` union. A reference to an unregistered ID is both a compile-time error and a `build()` runtime error.
- `defineAction` returns a new generic specialization (`WorkflowBuilder<TActions & Record<K, T>, TStates>`) because `TActions` must accumulate per call. The runtime object is unchanged; only the TypeScript type widens. All other methods return `this`.

---

### Discriminated union — no unsafe casts in the engine

`AnyState = IStepState | IForkState | IJoinState | ISubWorkflowState` (in `src/types/state.ts`).

The `kind` property is a literal on each interface. Narrow with `state.kind === StateKind.Fork` — do not cast with `state as IForkState`. The six remaining `as` casts in the codebase are at storage-boundary sites and all have justifying comments.

---

### Pure stateless engine

`WorkflowEngine.dispatch()` is a static method. It takes a snapshot and an action, returns a new snapshot (or `TransitionBlocked`), and never mutates anything. No I/O, no `setTimeout`, no side effects. Guards that need I/O are injected as `() => Promise<boolean>` callbacks via `instance.injectGuard()`.

---

### No silent failures — everything throws

Functions that can fail must throw a typed error with a precise message. Do not return `null`, `undefined`, or `false` to signal failure.

The only sanctioned exception: `dispatch` returns `TransitionBlocked` for domain failures (`guard-failed`, `terminal-state`, `no-active-source`). These are valid, expected outcomes that the caller's business logic must handle. Payload validation failure still throws `ZodError`.

---

### No swallowed exceptions

`try/catch` must either re-throw or wrap-and-re-throw. Logging and continuing is not acceptable.

```ts
// Correct
try { result = await doWork(); }
catch (err) { throw new WorkflowExecutionError('failed', { cause: err }); }

// Never
try { result = await doWork(); }
catch { result = defaultValue; }
```

---

### Purely functional persistence

`getSnapshot()` returns a plain JSON object. `restoreInstance(snapshot)` reconstructs exact state from it. The library never touches storage. Guard functions are runtime behaviour and are not persisted — re-inject them after every `restoreInstance`.

---

### TSDoc on every exported symbol

Every exported class, interface, type alias, and function needs a TSDoc block with:
- One-sentence description (imperative mood)
- `@param` for every parameter
- `@returns` describing shape and meaning
- `@throws` for every error condition callers must handle

Private/internal methods only need TSDoc when their purpose is genuinely non-obvious.

**Inside function bodies:** Only write a comment when the *reason* would surprise an informed reader. Explain why, not what. Obvious syntax gets no comment.

---

### Visualization is a separate entry point

`MermaidExporter` and `JsonGraphExporter` live in `src/visualization/` and are exported from `"logic-workflow/visualization"`. Bundlers can tree-shake this from applications that don't use it. `core/` has zero knowledge that visualization exists.

---

### Vitest workspace — three named projects

| Project | Glob | Purpose |
|---|---|---|
| `unit` | `src/**/*.test.ts` | Co-located unit tests |
| `integration` | `tests/integration/**/*.test.ts` | Multi-component flows |
| `e2e` | `tests/e2e/**/*.test.ts` | Full workflow invariants |

```sh
pnpm test              # all three projects
pnpm test:unit         # unit only
pnpm test:integration  # integration only
pnpm test:e2e          # e2e only
```

---

### Prohibited actions

| Prohibited | Reason |
|---|---|
| `npm` or `yarn` | pnpm only |
| `any` type | defeats the type system |
| Silent `catch` blocks | hides failures |
| Mutating function arguments | creates invisible coupling |
| Importing `visualization/` from `core/` | breaks layer separation |
| Parallel `type`/`interface` alongside a Zod schema | duplicates source of truth |
| `new WorkflowBuilder('name')` | old positional API — removed |
| `addState()` | removed; use `addStep`/`addFork`/`addJoin`/`addSubWorkflow` |
| `state as IForkState` without a kind guard | use discriminated union narrowing |
| Non-null assertions without a justifying comment | hides null-safety assumptions |
| Exported symbol without a TSDoc block | breaks the boundary documentation contract |
| Inline comment explaining *what* code does | noise; rename the identifier instead |

---

### Agent session protocol

After every code change:

1. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all four must exit clean before declaring the task done.
2. Append a version entry to **Section 4** below and update `README.md` to reflect what changed. Future agents read this file first — leave a clear trail.

---

## 4. Project Version History

### [v0.1.0] 2026-05-24 — Foundation: TSDoc, examples, discriminated union, testing pyramid

- Added full TSDoc (`@param`, `@throws`, `@example`) to all exported state classes and `WorkflowBuilder` public methods.
- Introduced `AnyState` discriminated union in `src/types/state.ts`; removed 11 unsafe casts from engine, instance, and visualization layers.
- Deleted dead code: `src/types/node.ts`, `src/core/context.ts` (layer violation + unused).
- Established Vitest workspace with three named projects: `unit`, `integration`, `e2e`.
- Co-located unit tests next to source files (`src/guards/*.test.ts`, `src/core/*.test.ts`).
- Grew test suite from 74 → 141 passing tests.
- Added `occ-disruption-sop.ts` example demonstrating multi-role guards, fork/join, and sub-workflow.

### [v0.2.0] 2026-05-24 — VitePress documentation site (Diátaxis)

- Created `docs/` with four sections: Tutorials, How-To, Reference, Explanation.
- Added `docs:dev`, `docs:build`, `docs:preview` scripts to `package.json`.
- No source code changes; all tests pass.

### [v0.3.0] 2026-05-24 — React web runner SPA

- Created `../web-runner/` (sibling directory): React 19 + Vite 6 + Tailwind v4 + @xyflow/react.
- Visualises workflow graph with dagre layout; auto-fills dispatch forms from Zod schema introspection; shows audit history panel.
- Initial demo: engineer pre-departure checklist, later replaced with 40-section EWCR demo (5×8 grid, cross-section neighbour guards).
- Fixed `package.json` exports map (`.mjs` → `.js`) and added `"files": ["dist", "src"]`.

### [v0.4.0] 2026-05-24 — Config-First WorkflowBuilder + typed factory methods

**Breaking change.** Constructor signature changed from `new WorkflowBuilder('name')` to `new WorkflowBuilder({ name, states: [...] as const })`.

- `states` array declared upfront establishes the `TStates` union; all subsequent method calls are constrained to it.
- Added typed factory methods: `addStep`, `addFork`, `addJoin`, `addSubWorkflow`. Each creates and registers the state in one call, enabling a fully typed single-chain fluent API.
- `addFork` `targets` and `addJoin` `requires` autocomplete to `TStates` and are typed as non-empty tuples `[TStates, ...TStates[]]`.
- Removed `addState()` escape hatch entirely. Tests that verify runtime validation now use `@ts-expect-error` on `addFork`/`addJoin` directly.
- `ForkState<TId, TValidStates>` and `JoinState<TId, TValidStates>` gained a second generic; defaults to `string` for standalone use.
- Updated all call sites: tests, integration tests, e2e tests, examples, and all docs markdown.
- Grew test suite from 141 → 143 passing tests. `pnpm typecheck && pnpm test && pnpm build` all exit clean.

### [v0.5.0] 2026-05-24 — Trim public API surface

- Removed from `src/index.ts`: `StepState`, `ForkState`, `JoinState`, `SubWorkflowState` (users use `addStep`/`addFork`/`addJoin`/`addSubWorkflow`), `WorkflowEngine` (internal; users go through `WorkflowInstance`), and all concrete guard classes (`AndGuard`, `OrGuard`, `NotGuard`, `InjectedGuard`, `FnGuard`, `AlwaysGuard`, `NeverGuard`, `StateCompletedGuard`, `StateActiveGuard`) — all guard composition goes through the `Guard` namespace.
- All type exports, `Guard`, `StateKind`, `StateStatus`, `WorkflowBuilder`, `WorkflowInstance`, `Workflow` retained.
- Updated web-runner workflow files (`src/workflow/demo-workflow.ts`, `src/workflows/ewcr.ts`, `incident.ts`, `predeparture.ts`, `purchase-order.ts`) to Config-First API; removed all direct state-class imports.
- 143 tests pass; `pnpm typecheck && pnpm build` clean.

### [v0.7.0] 2026-05-25 — createWorkflow factory; no more `as const`

**Breaking change.** `new WorkflowBuilder({ states: [...] as const })` is replaced by `createWorkflow({ states: [...] })`.

- Added `createWorkflow<const TStates extends string>(config)` factory function in `src/core/builder.ts`. The `const` type parameter modifier infers literal state IDs from a plain array automatically — no `as const` at call sites.
- When `states` is a runtime `string[]`, TypeScript infers `TStates = string` automatically — no cast (`as [string, ...string[]]`) needed for dynamic workflows.
- Constructor parameter relaxed from `readonly [TStates, ...TStates[]]` to `readonly TStates[]`; the non-empty check is handled at runtime by `build()`.
- `createWorkflow` exported from `src/core/index.ts` and `src/index.ts`.
- Updated all call sites: 11 test files, 3 example files, and all TSDoc examples.
- 162 tests pass; all four pipeline steps exit clean.

### [v0.6.0] 2026-05-25 — Dynamic workflow tests + lint clean

- Added `tests/integration/dynamic-workflow.test.ts`: 19 tests covering dynamic (runtime `string[]`) workflow construction — linear chain traversal, snapshot round-trips, parallel fan-out/fan-in, and `build()` runtime validation for all invalid-reference cases.
- Fixed pre-existing lint errors across 11 files: removed `async` from guard methods that never needed it (`primitives.ts`, `state-guard.ts`, `and-guard.test.ts`, `or-guard.test.ts`, `inject-guard.test.ts`), sync test callbacks, and all `injectGuard(() => async)` callbacks in integration and e2e tests; fixed `prefer-as-const` in `engine.test.ts`.
- Updated Agent session protocol in Section 3 to require `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (all four) after every change.
- 162 tests pass; all four pipeline steps exit clean.
