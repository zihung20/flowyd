# CLAUDE.md — Project Law

This file is the authoritative reference for every agent and developer working in this codebase. Read it before touching any file. The rules here override instinct, habit, and convention.

---

## 1. System Overview

`flowyd` is a TypeScript library for building typed, auditable workflow state machines. It exposes a fluent `WorkflowBuilder` API that enforces state-ID correctness at compile time, a pure stateless `WorkflowEngine` that executes transitions, and pluggable guard functions for async business-rule evaluation. Snapshots are plain JSON — the library has no opinion on storage.

**Companion apps (not in this directory):**

- `../web-runner/` — React SPA (Vite + Tailwind + @xyflow/react) that visualises and drives workflows in the browser. Always run `pnpm build` in this directory before starting the web runner.
- `../docs/` — standalone VitePress documentation site (`flowyd-docs` package, Diátaxis structure). It consumes this library via `file:../flowyd` and reads the example sources here directly. From that directory: `pnpm install`, then `pnpm dev` (or `pnpm build`). Doc-only dependencies (vitepress, mermaid, etc.) live there, not in this library.

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

> This file map and the one in `../docs/dev/architecture.md` (now in the standalone docs package) are machine-checked against `src/` by `pnpm check:filemap` (`scripts/check-file-map.ts`, run directly via Node 24 type-stripping). It fails CI if a map names a `.ts` file that no longer exists, or if a new source file is missing from the architecture map. Run `node scripts/check-file-map.ts --print` to dump the canonical tree.

---

## 3. Architectural Decisions & Guardrails

### Backward compatibility

**This package IS published to npm (`flowyd@0.2.0`, latest), but has no production consumers yet — so backward compatibility is still not a concern.** Breaking changes to public APIs, snapshot formats, and type signatures are acceptable. Do not add compatibility shims, migration code, or deprecation warnings — just make the change. (Do not describe flowyd as "unpublished" or "not yet on npm" anywhere — it is live; it simply has no users yet.)

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

### [Clean-code audit pass] (2026-06-24)

Readability audit of `flowyd/src` against the Clean Code creed (names/functions/comments) and §3's own non-null-assertion rule, covering core, guards, and visualization layers. Conclusion: the source already meets the bar — no refactor warranted (would violate §4 Surgical Changes). Three surgical fixes only: (1+2) the two bare `!` sites that §3 prohibits without a justifying comment now carry one — `builder.ts` `stack.pop()!` (loop-guard guarantees non-empty) and `instance.ts` `history[version - 1]!` (earlier guards bound `version` to a valid index); (3) `mermaid.ts` `WaitState` label suffix changed from a decorative `⤴` glyph to a plain `(wait)` text marker, honoring the no-emoji rule (the `[externalName]` bracket already conveys the wait). Guards layer (8 single-responsibility guard classes + `Guard` factory) and JSON-graph/Mermaid exporters reviewed: clean, no findings. No API/snapshot/file-map change; one line of exporter output changed (asserted by no test). Gate clean: lint / check:filemap / typecheck / 272 tests / build all pass. README unchanged — nothing user-facing moved.

### [Repo presentation & onboarding] (2026-06-08)

Documentation/marketing pass for adoption — no source, no API, no behaviour change. **Root `README.md`** rewritten as a product hook: badges (CI / MIT / Types / Zod / pre-release), a GitHub-native ` ```mermaid ` state diagram (the "Look"), a why-flowyd bullet list, a monorepo package table linking each sub-README, a quick start, and an honest **Status & roadmap** note. Badges include a live npm-version badge (`flowyd` IS published — `flowyd@0.2.0`, latest; it simply has no consumers yet). **`flowyd/README.md`** gained the same badge row + an embedded Mermaid diagram of the quick example; install is the normal `pnpm add flowyd zod`. Created the missing **`web-runner/README.md`** (pages, run instructions, stack, lucide/pnpm conventions). Added the "make contributing feel safe" set: `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, a short root **`CONTRIBUTING.md`** (links to `docs/dev/contributing.md`). **Docs trim pass** (VitePress site): `docs/index.md` hero tagline + all 7 feature-card descriptions cut to one punchy line each; `docs/guide/index.md` intro prose tightened (code blocks kept); `docs/guide/concepts.md` gained a plain-language "The idea in one minute" mental-model lead (checklist-that-knows-the-rules) before the graph terminology. No `src/` or file-map changes.

### [v0.1.0–v0.30 + tooling, docs split & vitest 4] Cumulative history (merged 2026-06-07)

- **Core library:** `WorkflowBuilder` / pure-static `WorkflowEngine.dispatch` / `WorkflowInstance` / `Guard`; four state kinds (`Step`/`Fork`/`Join`/`Wait`); Zod payloads; `createWorkflow()` / `createDynamicWorkflow()`; accumulating `TStates` builder; `TContext`/`TStates`/`TActions` generics; `setContext`/`getContext`/`rewind`; `getSnapshot()` 48× faster via delta-replay; Mermaid + JSON-graph exporters; full TSDoc.
- **Auto-complete / fork-join / hooks (v0.25–v0.28):** `enterState` auto-completes dead-end non-terminal `StepState`s (in-progress→done→join); `build()` runs BFS reachability + dead-end checks (one combined throw); `MermaidExporter` emits `requires` edges. `onEnter`/`onExit` on all four `add*` methods, stored type-erased in `WorkflowDefinition.stateHooks`, fired by `runHooks()` after commit (`onExit` before `onEnter`, sequential, throw-propagating). Public: `HookContext`, `HookFn`, `StateHooks`.
- **Deadlines (v0.29):** a transition fires on **either** an action (`on`) **or** a deadline (`after: '48h'`) — exactly one, compile-time enforced via `TransitionDefinition = { from; to; guard? } & (ActionTrigger | TimedTrigger)` (each forbids the other's key with `?: never`). `parseDuration`/`formatDuration` (`ms`–`w`). Deadline anchored to its `from` entry. Engine stays pure: `dispatch` takes `at: string`; static `WorkflowEngine.fireTimed()` advances one timed edge through the fixed-point loop (source `active`/`waiting`). Timers history-derived: `tick(now)` + `getNextDueAt()`. Clock injected everywhere (defaults to `new Date()`); `dispatch` auto-advances overdue deadlines (skipped on `canExecute`). `getAvailableTransitions` skips timed edges; `JsonGraphEdge` gains `after?: number`. Public: `TransitionTrigger`, `ActionTrigger`, `TimedTrigger`.
- **Discriminated history (v0.30):** `HistoryEntry` is a discriminated union on `kind` (`action`/`timeout`/`resolve-wait`), replacing `__timeout:`/`__resolve_wait:` magic strings. `BaseHistoryEntry` + per-member data. Public: `ActionHistoryEntry`, `TimeoutHistoryEntry`, `ResolveWaitHistoryEntry`. All consumers + delta-replay narrow on `kind`; `__timeout:` survives only on `DispatchResult.action` for diagnostics. Snapshot format changed (unpublished — OK).
- **Examples (7-tier ladder):** `01-document-approval-basics` → `02-guards-and-context` → `03-parallel-fork-join` → `04-deadlines-hooks-wait` → `05-loan-origination` (flagship) → `06-incident-response` (deadline from `waiting`) → `07-dynamic-workflow`; exercise every public API. Live in `flowyd/examples/`, import library *source* (`../src/index.js`), part of flowyd's `tsconfig` `include`, run via `tsx`. Dynamic payloads are `unknown` (only `{}` statically safe); `restoreInstance` after `JSON.parse` needs `Parameters<typeof wf.restoreInstance>[0]`.
- **web-runner v2.x:** React SPA (Vite + Tailwind + shadcn/ui + @xyflow/react), consumes `flowyd` via `file:../flowyd`. Landing/Examples/Visual Designer (Monaco↔React Flow sync)/Playground. `TimelineBar` time-travels non-destructively via pure `rewind()`. Deadlines surfaced with no library change (`tick`/`getNextDueAt`/`dispatch(..., { now? })`, `ClockControl`, amber-dashed timed edges, `HistoryPanel` narrows on `kind`).
- **Tooling — builder imports:** `core/builder.ts` imports every dep through its layer barrel (`../types/index.js`, `../states/index.js`, `../guards/index.js`); pure consistency, no API change.
- **Docs split into standalone `../docs/` package (`flowyd-docs`, private):** moved the VitePress site out of `flowyd/` so doc-only deps stop polluting the library. `docs/package.json` depends on `flowyd` via `file:../flowyd` and owns the 8 doc deps (`@braintree/sanitize-url`, `cytoscape`, `cytoscape-cose-bilkent`, `dayjs`, `debug`, `mermaid`, `vitepress`, `vitepress-plugin-mermaid`). Scripts there: `pnpm dev` / `pnpm build` / `pnpm docs:diagrams`. `gen-example-diagrams.ts` lives in `docs/scripts/`, imports flowyd *source* (`../../flowyd/src/visualization/index.js` + `../../flowyd/examples/*.js`, so no prior build needed), writes `../examples/diagrams`. The 7 `<<<` example includes read `../../flowyd/examples/NN-*.ts#example`; pages render an auto-generated Mermaid diagram via `<!--@include: ./diagrams/<slug>.md-->`. `flowyd/scripts/check-file-map.ts` (`pnpm check:filemap`) still validates both file maps, resolving `architecture.md` cross-folder at `resolve(FLOWYD_ROOT, '..', 'docs/dev/architecture.md')`. CI `deploy-docs` builds/uploads from `docs/`.
- **vitest 4 (dev-only):** `vitest` `^1.6 → ^3.2.6 → ^4.1.8`, fixing the `vitest <4.1.0` critical (GHSA-5xrq-8626-4rwp) — unblocked because the docs split removed vitepress's vite-5 pin from flowyd, so vitest 4 (which needs vite ^6) now installs freely. Four named projects (`unit`/`integration`/`e2e`/`perf`) live in `test.projects` inside `vitest.config.ts` (no `vitest.workspace.ts` — removed in vitest 4). vitest 4 stopped implicitly auto-including `@types/node`, so Node globals (`structuredClone`/`console`/`performance`) failed to resolve; fixed deterministically with `"types": ["node"]` in `tsconfig.json`. `pnpm audit` clean in all three packages. Full `lint && check:filemap && typecheck && test && build` gate clean; 272 tests pass.
