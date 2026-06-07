# CLAUDE.md — Project Law

This file is the authoritative reference for every agent and developer working in this codebase. Read it before touching any file. The rules here override instinct, habit, and convention.

---

## 1. System Overview

`flowyd` is a TypeScript library for building typed, auditable workflow state machines. It exposes a fluent `WorkflowBuilder` API that enforces state-ID correctness at compile time, a pure stateless `WorkflowEngine` that executes transitions, and pluggable guard functions for async business-rule evaluation. Snapshots are plain JSON — the library has no opinion on storage.

**Companion apps (not in this directory):**

- `../web-runner/` — React SPA (Vite + Tailwind + @xyflow/react) that visualises and drives workflows in the browser. Always run `pnpm build` in this directory before starting the web runner.
- `docs/` — VitePress documentation site (Diátaxis structure). Run with `pnpm docs:dev`.

---

## 2. Core File Map

```
src/
├── types/
│   ├── state.ts          — StateKind, StateStatus, IState/IStepState/IForkState/IJoinState/IWaitState, JoinMode, AnyState
│   ├── instance.ts       — ReadonlyInstanceState, HistoryEntry, InstanceSnapshot, TransitionSuccess/Blocked, DispatchResult, HookContext/HookFn/StateHooks
│   ├── transition.ts     — TransitionDefinition
│   ├── guard.ts          — IGuard, GuardFn, GuardContext
│   ├── workflow.ts       — WorkflowDefinition, ActionPayloadMap
│   └── index.ts          — barrel re-export

├── states/
│   ├── base.ts           — BaseState<TId> — shared id/status/label logic
│   ├── step-state.ts     — StepState implements IStepState
│   ├── fork-state.ts     — ForkState<TId, TValidStates> — splits into parallel branches
│   ├── join-state.ts     — JoinState<TId, TValidStates> — synchronises branches (all/any/quorum)
│   └── wait-state.ts — WaitState — pauses until external process resolves

├── guards/
│   ├── factory.ts        — Guard namespace: inject, stateCompleted, stateActive, and, or, not, fn, always, never
│   └── *.test.ts         — unit tests co-located with source

├── core/
│   ├── builder.ts        — WorkflowBuilder<TActions, TStates, TContext> — accumulating fluent builder
│   ├── workflow.ts       — Workflow — immutable compiled definition; exposes createInstance/restoreInstance/getDefinition
│   ├── instance.ts       — WorkflowInstance — stateful wrapper; holds snapshot; exposes dispatch/canExecute/getSnapshot/resolveWait/setContext/rewind
│   ├── engine.ts         — WorkflowEngine — pure static dispatch; fixed-point join loop
│   ├── registry.ts       — StateRegistry — typed Map<string, AnyState>
│   ├── utils.ts          — internal helpers
│   ├── index.ts          — core barrel (createWorkflow, createDynamicWorkflow, WorkflowInstance)
│   └── *.test.ts         — unit tests co-located with source

├── visualization/
│   ├── exporter.ts       — shared exporter helpers
│   ├── mermaid.ts        — MermaidExporter
│   ├── json-graph.ts     — JsonGraphExporter, JsonGraph, JsonGraphNode, JsonGraphEdge
│   └── index.ts          — visualization barrel

└── index.ts              — public barrel: createWorkflow, createDynamicWorkflow, WorkflowInstance (type), Guard, StateKind/StateStatus enums, and type-only interfaces (state/guard/transition/instance/workflow). Exporters are NOT here — they live behind the `flowyd/visualization` entry point.
```

**Key entry points in `package.json`:**

- `"."` → `dist/index.js` — core library
- `"./visualization"` → `dist/visualization/index.js` — visualization (tree-shakeable)

> This file map and the one in `docs/dev/architecture.md` are machine-checked against `src/` by `pnpm check:filemap` (`scripts/check-file-map.ts`, run directly via Node 24 type-stripping). It fails CI if a map names a `.ts` file that no longer exists, or if a new source file is missing from the architecture map. Run `node scripts/check-file-map.ts --print` to dump the canonical tree.

---

## 3. Architectural Decisions & Guardrails

### Backward compatibility

**This package has not been published to npm. Backward compatibility is not a concern.** Breaking changes to public APIs, snapshot formats, and type signatures are acceptable. Do not add compatibility shims, migration code, or deprecation warnings — just make the change.

---

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

### Accumulating Builder

State IDs are inferred from `addStep`, `addFork`, `addJoin`, and `addWait` calls — each registration widens the `TStates` union by one literal. No upfront `states` array is needed. `setInitial`, `setTerminal`, `addTransition`, and the `targets`/`requires` options are all constrained to the accumulated set — typos fail at compile time.

```ts
const wf = createWorkflow({ name: 'my-workflow' })
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
- Use `createWorkflow({ name })` — `TStates` starts as `never` and grows with each state-registration call.
- Never use `new WorkflowBuilder({...})` directly.
- Every state must be registered via `addStep`, `addFork`, `addJoin`, or `addWait`. There is no `addState` escape hatch.
- **Ordering rule for fork/join:** `addFork.targets` and `addJoin.requires` are constrained to states already in `TStates`. Register branch/prerequisite states *before* the fork or join that references them — unregistered IDs are compile-time errors.
- `defineAction` and the four state-registration methods return a new generic specialization; the runtime object is unchanged, only the TypeScript type widens. `setInitial`, `setTerminal`, and `addTransition` return `this`.
- **Dynamic workflows** (state IDs only known at runtime): cast to a wide builder — `createWorkflow({ name }) as unknown as WorkflowBuilder<Record<string, unknown>, string>` — and rely on `build()` for validation.

---

### Discriminated union — no unsafe casts in the engine

`AnyState = IStepState | IForkState | IJoinState | IWaitState` (in `src/types/state.ts`).

The `kind` property is a literal on each interface. Narrow with `state.kind === StateKind.Fork` — do not cast with `state as IForkState`. The six remaining `as` casts in the codebase are at storage-boundary sites and all have justifying comments.

---

### Pure stateless engine

`WorkflowEngine.dispatch()` is a static method. It takes a snapshot and an action, returns a new snapshot (or `TransitionBlocked`), and never mutates anything. No I/O, no `setTimeout`, no side effects. Guards that need I/O are injected as `() => Promise<boolean>` callbacks via `instance.injectGuard()`.

---

### No silent failures — everything throws

Functions that can fail must throw a typed error with a precise message. Do not return `null`, `undefined`, or `false` to signal failure.

The only sanctioned exception: `dispatch` returns `TransitionBlocked` for domain failures (`guard-failed`, `terminal-state`, `no-active-source`, `invalid-action`). These are valid, expected outcomes that the caller's business logic must handle. Payload validation failure still throws `ZodError`.

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

`MermaidExporter` and `JsonGraphExporter` live in `src/visualization/` and are exported from `"flowyd/visualization"`. Bundlers can tree-shake this from applications that don't use it. `core/` has zero knowledge that visualization exists.

---

### Vitest projects — named test projects

Defined inline via `test.projects` in `vitest.config.ts` (there is no separate `vitest.workspace.ts` — that file form is deprecated in Vitest 3.2 and removed in Vitest 4).

| Project | Glob | Purpose |
|---|---|---|
| `unit` | `src/**/*.test.ts` | Co-located unit tests |
| `integration` | `tests/integration/**/*.test.ts` | Multi-component flows |
| `e2e` | `tests/e2e/**/*.test.ts` | Full workflow invariants |
| `perf` | `tests/perf/**/*.test.ts` | Performance regression checks |

`tests/helpers.ts` — shared `makeCtx` fixture used by unit tests in `src/guards/`.

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
| `states: [...]` in `createWorkflow` | removed; `TStates` accumulates from `addStep`/`addFork`/`addJoin`/`addWait` |
| `addState()` | removed; use `addStep`/`addFork`/`addJoin`/`addWait` |
| `state as IForkState` without a kind guard | use discriminated union narrowing |
| Non-null assertions without a justifying comment | hides null-safety assumptions |
| Exported symbol without a TSDoc block | breaks the boundary documentation contract |
| Inline comment explaining *what* code does | noise; rename the identifier instead |

---

### Agent session protocol

After every code change:

1. Run `pnpm lint && pnpm check:filemap && pnpm typecheck && pnpm test && pnpm build` — all must exit clean before declaring the task done. (`check:filemap` verifies the §2 / architecture file maps still match `src/`.)
2. Append a version entry to **Section 5 (Project Version History)** below and update `README.md` to reflect what changed. Future agents read this file first — leave a clear trail.
3. After updating the version history: if Section 5 contains **5 or more entries**, merge all entries into a single condensed summary that is shorter than the combined text of the individual entries, then replace Section 5 with that single merged entry.

---

## 4. AI Behavioral Guidelines (Karpathy Rules)

1. **Think Before Coding** — State assumptions explicitly before writing any code. If requirements are ambiguous or conflicting, ask a clarifying question rather than guessing.

2. **Simplicity First** — Write the minimum code needed to solve the problem. No over-engineering, no speculative abstractions, no features that weren't asked for.

3. **Surgical Changes** — Touch only the code required to complete the task. Match the surrounding style. Do not refactor, rename, or restructure anything outside the stated scope.

4. **Goal-Driven Execution** — Define what success looks like before starting. Run tests and linters to confirm the goal is met before reporting the task complete.

---

## 5. Project Version History

### [v0.1.0–v0.30 + docs/examples + web-runner] Cumulative history (merged 2026-06-07)

- **Core library:** `WorkflowBuilder` / `WorkflowEngine` (pure static `dispatch`) / `WorkflowInstance` / `Guard`; four state kinds (`Step`/`Fork`/`Join`/`Wait`); Zod payload validation; `createWorkflow()` / `createDynamicWorkflow()` factories; accumulating `TStates` builder; full `TContext`/`TStates`/`TActions` generics; `setContext`/`getContext`/`rewind`; `getSnapshot()` 48× faster via delta-replay; Mermaid + JSON-graph exporters (fork fan-out, join fan-in with `kind` discriminant); exhaustive switches; full TSDoc.
- **Auto-complete, fork/join, hooks (v0.25–v0.28):** `enterState` auto-completes dead-end non-terminal `StepState`s (in-progress→done→join pattern); `MermaidExporter` emits `requires` edges. `build()` runs BFS reachability + dead-end checks (one combined throw). `onEnter`/`onExit` callbacks on all four `add*` methods, stored type-erased in `WorkflowDefinition.stateHooks`, fired by `runHooks()` after commit (`onExit` before `onEnter`, sequential, async, throw-propagating). Public: `HookContext`, `HookFn`, `StateHooks`.
- **Deadlines (v0.29):** a transition fires on **either** an action (`on`) **or** a deadline (`after: '48h'`) — exactly one, compile-time enforced. `TransitionDefinition = { from; to; guard? } & TransitionTrigger` (`ActionTrigger | TimedTrigger`, each forbids the other's key via `?: never`); engine/builder/exporters narrow, never cast. `parseDuration`/`formatDuration` (`ms`/`s`/`m`/`h`/`d`/`w`). Deadline anchored to its `from` state's entry, fired scoped to `from`. Engine stays pure: `dispatch` takes `at: string`; static `WorkflowEngine.fireTimed()` advances one timed edge through the fixed-point loop (source `active` or `waiting`). Timers history-derived (no snapshot field): `tick(now): Promise<number>` + `getNextDueAt(): string | null`. Clock injected everywhere (`dispatch`/`resolveWait`/`createInstance` default `now` to `new Date()`); `dispatch` auto-advances overdue deadlines (skipped on `canExecute` dry-runs). `getAvailableTransitions` skips timed edges; `MermaidExporter` labels them `after <duration>`; `JsonGraphEdge` gains `after?: number`. Public: `TransitionTrigger`, `ActionTrigger`, `TimedTrigger`.
- **Discriminated history (v0.30):** `HistoryEntry` is a discriminated union on `kind` (`'action'`|`'timeout'`|`'resolve-wait'`), replacing the `__timeout:`/`__resolve_wait:` magic strings. `BaseHistoryEntry` (`at`, `enteredStates`, `exitedStates`, `context?`) + per-member data: `action`+`payload`, `from`+`to`, `stateId`. Public: `ActionHistoryEntry`, `TimeoutHistoryEntry`, `ResolveWaitHistoryEntry`. `dispatch`/`fireTimed`/`resolveWait` build the right `kind`; delta-replay and all consumers narrow on `kind`. The `__timeout:` string survives only on `DispatchResult.action` for blocked-result diagnostics. Snapshot format changed (acceptable — unpublished).
- **Examples — 7-tier learning ladder:** `examples/01-document-approval-basics` → `02-guards-and-context` → `03-parallel-fork-join` → `04-deadlines-hooks-wait` → `05-loan-origination` (flagship) → `06-incident-response` (deadline from a `waiting` state) → `07-dynamic-workflow`; collectively exercise every public API (index in `examples/README.md`). API-honesty notes: dynamic payloads are `unknown` so only `{}` is statically safe; `restoreInstance` after `JSON.parse` needs `Parameters<typeof wf.restoreInstance>[0]`. All seven typecheck under strict config and run via `npx tsx`.
- **Docs (Diátaxis VitePress):** pages import the example `// #region example` source via `<<< ../../examples/NN-*.ts#example` so they can't drift (VitePress's region regex needs the name on the `#endregion` line too). Seven example pages mirror the ladder; each shows an **auto-generated** Mermaid diagram first (`<!--@include: ./diagrams/<slug>.md-->`) produced by `scripts/gen-example-diagrams.ts` (`pnpm docs:diagrams`, invoked by `docs:dev`/`docs:build`) from each example's exported workflow; demo runs sit behind an `import.meta.url` guard outside the region so importing is side-effect-free. `vitepress-plugin-mermaid` via `withMermaid(...)` with `srcExclude: ['**/diagrams/*.md']`; the five Mermaid CJS transitive deps (`dayjs`, `cytoscape`, `cytoscape-cose-bilkent`, `@braintree/sanitize-url`, `debug`) are direct devDeps so pnpm resolves them for Vite pre-bundling. `scripts/check-file-map.ts` (`pnpm check:filemap`) verifies both file maps against `src/`. Iconography is lucide-only.
- **web-runner v2.x:** React SPA (Vite + Tailwind + shadcn/ui + @xyflow/react). Landing/Examples/Visual Designer (Monaco↔React Flow bidirectional sync)/Playground; shared `SiteNav`. `TimelineBar` scrubber time-travels non-destructively via pure `rewind()`; dispatching while scrubbed branches the run. Deadlines surfaced (no library change): both `AnyInstance` shapes gained `tick`/`getNextDueAt`/`dispatch(..., { now? })`; `ClockControl` (lucide `AlarmClock`/`FastForward`) shows the soonest armed deadline + "Skip ahead"; timed graph edges render amber+dashed `after <duration>`; `HistoryPanel` narrows on `entry.kind`. Purchase Order example gained an `escalated` step + 48h SLA.

### [vitest 3 upgrade] (2026-06-07)
- Bumped `vitest` `^1.6.0 → ^3.2.6` (dev-only). Migrated the four named test projects (`unit`/`integration`/`e2e`/`perf`) from the standalone `vitest.workspace.ts` (deprecated in 3.2, removed in 4.x) into `test.projects` inside `vitest.config.ts`; deleted `vitest.workspace.ts`. Coverage (`v8`) and `globals` stay at the root `test` config. No source or public-API change. Updated CLAUDE.md §3 "Vitest projects" section to drop the workspace-file reference and list the `perf` project. **Note:** stopped at vitest 3, not the Dependabot PR #2 target of 4.1.0 — vitest 4 requires vite `^6`, but `vitepress@1.6.4` pins vite 5, so 4.x would force a vitepress 2.x (beta) upgrade. Vitest 3 supports vite `^5 || ^6` and coexists cleanly (vite 5 for docs, its own vite 6). Full `lint && check:filemap && typecheck && test && build` gate clean; 272 tests pass, zero peer warnings.

### [builder import cleanup] (2026-06-07)
- `core/builder.ts` now imports every dependency through its layer barrel for consistency: `JoinMode` was being pulled directly from `../types/state.js` (folded into the existing `../types/index.js` `import type {…}` block, which already re-exports it), and the four state classes (`StepState`/`ForkState`/`JoinState`/`WaitState`) were each imported from their own `../states/*-state.js` file (collapsed into one `../states/index.js` barrel import, matching how `FnGuard` already came from `../guards/index.js`). Pure consistency, no behavior/API change. Full `lint && check:filemap && typecheck && test && build` gate clean; 272 tests pass.
