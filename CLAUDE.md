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

### Vitest workspace — three named projects

| Project | Glob | Purpose |
|---|---|---|
| `unit` | `src/**/*.test.ts` | Co-located unit tests |
| `integration` | `tests/integration/**/*.test.ts` | Multi-component flows |
| `e2e` | `tests/e2e/**/*.test.ts` | Full workflow invariants |

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

### [v0.1.0–v0.29 core + web-runner v2.x] Cumulative history (merged 2026-06-07)

- **Core library:** `WorkflowBuilder` / `WorkflowEngine` (pure static `dispatch`) / `WorkflowInstance` / `Guard`; four state kinds (`Step`/`Fork`/`Join`/`Wait`); Zod payload validation; `createWorkflow()` / `createDynamicWorkflow()` factories; accumulating `TStates` builder; full `TContext`/`TStates`/`TActions` generics; `setContext`/`getContext`/`rewind`; `getSnapshot()` 48× faster via delta-replay; Mermaid + JSON-graph exporters (fork fan-out, join fan-in structural edges with `kind` discriminant); VitePress docs; exhaustive switches; full TSDoc.
- **Auto-complete & two-state fork/join (v0.25–v0.27):** `enterState` auto-completes any dead-end non-terminal `StepState` on entry (no flag), enabling the in-progress→done→join branch pattern. `MermaidExporter` emits `requires` edges.
- **Graph validation + lifecycle hooks (v0.28):** `build()` runs BFS reachability + dead-end checks (combined into one thrown error). `onEnter`/`onExit` optional callbacks on all four `add*` methods, stored type-erased in `WorkflowDefinition.stateHooks`, fired by `WorkflowInstance.runHooks()` after commit (`onExit` before `onEnter`, sequential, async, throw-propagating). Public exports: `HookContext`, `HookFn`, `StateHooks`.
- **Time-triggered transitions / deadlines (v0.29, 2026-06-06):** a transition is triggered by **either** an action (`on`) **or** a deadline (`after: '48h'`) — exactly one, enforced at compile time. `TransitionDefinition = { from; to; guard? } & TransitionTrigger` where `TransitionTrigger = ActionTrigger | TimedTrigger` (each forbids the other's key via `?: never`); engine/builder/exporters narrow instead of casting. Duration strings normalised by `parseDuration` (`ms`/`s`/`m`/`h`/`d`/`w`); `formatDuration` renders compact whole-unit. Deadline anchored to its `from` state's entry, fired scoped to `from` (never an action broadcast). Engine stays pure: `dispatch` takes `at: string` (never reads the clock); new static `WorkflowEngine.fireTimed()` advances one timed edge through the fixed-point loop (source may be `active` or `waiting`). Timers derived from history (no snapshot field): `WorkflowInstance.tick(now): Promise<number>` (fixed-point catch-up, guard-blocked edges retried next tick) + `getNextDueAt(): string | null`. Clock injected everywhere — `dispatch(action, payload, { now? })`, `resolveWait(stateId, { now? })`, `createInstance(id, context?, now?)` all default `now` to `new Date()`; `dispatch` auto-advances overdue deadlines before applying (skipped on `canExecute` dry-runs). Fired deadlines record history `action: '__timeout:<from>-><to>'`; `getAvailableTransitions` skips timed edges. `MermaidExporter` labels timed edges `after <duration>`; `JsonGraphEdge` gains `after?: number`. New public types: `TransitionTrigger`, `ActionTrigger`, `TimedTrigger`. The speculative `resolveWait` `externalSnapshot` param was removed (derivable via `rewind`). 272 tests; full gate clean.
- **Docs:** full Diátaxis VitePress site kept in sync — scenario pages for timeouts and hooks; `api/workflow-builder`/`workflow-instance`, `guide/concepts`, and the home page cover deadline triggers, `createInstance` `now`, `tick`/`getNextDueAt`, and lifecycle hooks. Earlier accuracy sweep removed fictional APIs and aligned every page with source. Tooling: `scripts/check-file-map.ts` (`pnpm check:filemap`) verifies both file maps against `src/`. Iconography is lucide-only (no emoji/glyphs) across docs and web-runner.
- **web-runner v2.x:** React SPA (Vite + Tailwind + shadcn/ui single source of truth + @xyflow/react). Landing page, Examples page, Visual Designer (Monaco↔React Flow bidirectional sync, live run panel), Playground; shared `SiteNav` across tool pages. Run panel shows each `HistoryEntry.payload` in an expand/collapse disclosure and a video-style `TimelineBar` scrubber that time-travels non-destructively via the library's pure `rewind()` (live instance untouched); dispatching while scrubbed branches the run (replay-rebuild through `makeInstance()`). Context surface: `scrubTo`/`previewVersion`/`headVersion`/`isPreviewing`.
- **web-runner deadline experience (2026-06-07):** surfaced v0.29 deadlines in the runner (no library change). Both `AnyInstance` shapes (`SingleRunner`, `evaluateWorkflowCode`) gained `tick(now)`, `getNextDueAt()`, and `dispatch(..., { now? })`. `availableActions` now excludes timed edges (`t.on` undefined); `replayInto` threads each entry's `{ now: entry.at }` and replays `__timeout:` entries via `tick()` so rewinds stay deterministic across deadlines. New `ClockControl` component (lucide `AlarmClock`/`FastForward`) shows the soonest armed deadline and a "Skip ahead" button → `advanceClock` ticks the live instance to `getNextDueAt()`; context gained `nextDueAt`/`advanceClock`. Graph renders timed edges amber + dashed with an `after <duration>` label (local `src/lib/formatDuration.ts`, mirroring the library's compact form); `HistoryPanel` renders `__timeout:` rows as a `deadline` event with an alarm icon. Purchase Order example gained a terminal `escalated` step + `{ from: 'under-review', to: 'escalated', after: '48h' }` SLA. web-runner typecheck + build clean (pre-existing `DynamicForm` lint findings untouched).

### [v0.30 — discriminated history entries] (2026-06-07)
- **`HistoryEntry` is now a discriminated union on `kind`** (`'action'` | `'timeout'` | `'resolve-wait'`), replacing the stringly-typed `action: '__timeout:<from>-><to>'` / `'__resolve_wait:<stateId>'` magic-string conventions. Shared fields live on an internal `BaseHistoryEntry` (`at`, `enteredStates`, `exitedStates`, `context?`); each member adds its own data — `action`+`payload` (action), `from`+`to` (timeout), `stateId` (resolve-wait). New public type exports: `ActionHistoryEntry`, `TimeoutHistoryEntry`, `ResolveWaitHistoryEntry` (the `HistoryEntry` union still re-exported from both `flowyd` and `flowyd/types`). Snapshot format changed (acceptable — unpublished). The synthetic `__timeout:` string is retained **only** on `DispatchResult.action` for blocked-result diagnostics (an internal value `tick` discards); history no longer carries it.
- **Removed every magic-string parse:** the library's own delta-replay (`instance.ts` `rewind`/delta loop) now narrows `entry.kind === 'resolve-wait'` instead of `startsWith('__resolve_wait:')`; `engine.dispatch` builds `kind: 'action'`, `engine.fireTimed` builds `kind: 'timeout'` (with `from`/`to`), `instance.resolveWait` builds `kind: 'resolve-wait'`. Timer helpers were already history-derived via `enteredStates`, untouched.
- **Consumers updated to narrow on `kind`:** flowyd examples (`occ-disruption-sop`, `station-opening-checklist`) gained a small `historyLabel()` switch; docs synced (`scenarios/persistence` HistoryEntry interface + audit example, `scenarios/timeouts`, `scenarios/external-wait`, `api/workflow-instance`, `examples/approval-flow` + `examples/station-opening`; `JsonGraphEdge.action` reads in `disruption-sop`/`visualization` left as-is — graph edges, not history). web-runner (`HistoryPanel`, `SingleRunner.replayInto`, `TimelineBar`) switched from `startsWith('__timeout:')` to `entry.kind` checks, with `payload` access guarded behind `kind === 'action'`.
- 272 tests (history-shape assertions in `engine`/`e2e`/`timeout`/`wait` tests updated to narrow on `kind`); full `lint && check:filemap && typecheck && test && build` gate clean; `docs:build` clean; web-runner typecheck + build clean.
