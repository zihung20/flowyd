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

### [v0.1.0–v0.28.0 + web-runner v2.0] Cumulative history
- **Core library (v0.1–v0.24):** `WorkflowBuilder` / `WorkflowEngine` / `WorkflowInstance` / `Guard`; four state kinds (`Step`/`Fork`/`Join`/`Wait`); Zod payload validation; `createWorkflow()` / `createDynamicWorkflow()` factories; Mermaid + JSON-graph exporters (with fork fan-out and join fan-in structural edges); VitePress docs; accumulating `TStates` builder; `setContext` / `getContext` / `rewind`; full `TContext`/`TStates`/`TAction` generic chain through all types; `getSnapshot()` 48× faster via delta-replay; perf suite; exhaustive switches; TSDoc complete.
- **Auto-complete & two-state fork/join (v0.25–v0.27):** `enterState` auto-completes ANY dead-end non-terminal `StepState` on entry — no user flag. Enables two-state branch pattern (fork activates in-progress → dispatch → transitions to done → auto-completes → join activates). `MermaidExporter` emits `requires` edges. `JsonGraphEdge` gains `kind` discriminant. All examples updated. web-runner v2.0: landing page, Examples page, Visual Designer (Monaco↔@xyflow/react bidirectional sync, live run panel).
- **Graph validation + hooks (v0.28, 2026-06-02):** `build()` now runs graph checks after structural validation — BFS reachability from initial state (transitions + fork fan-out + join activation edges), no reachable terminal state, non-terminal `WaitState`/`JoinState` with no outgoing transitions; all violations combined into one thrown error. `onEnter`/`onExit` lifecycle hooks: optional callbacks on all four `add*` methods; stored type-erased in `WorkflowDefinition.stateHooks` (`ReadonlyMap<TStates, StateHooks<TContext>>`); fired by `WorkflowInstance.runHooks()` after the snapshot commits — `onExit` before `onEnter`, sequential, async, throw-propagating. `StateHooks` uses method shorthand (bivariant) to remain assignable to the type-erased definition form. New public exports: `HookContext`, `HookFn`, `StateHooks`. 242 tests; all pipeline steps clean.
- **web-runner navigation (2026-06-04):** Added shared `SiteNav` component (`src/components/SiteNav.tsx`) used by all three tool pages — Examples, Designer, Playground — providing consistent cross-section links with active-state highlighting. Examples page now has a two-tier header (SiteNav + dark example-tab bar). Designer page right-slots its toolbar into SiteNav. Playground header replaced entirely by SiteNav. VitePress docs home page gains an "Interactive Playground" action button.
- **web-runner shadcn/ui migration (2026-06-04):** Migrated all UI to shadcn/ui as single source of truth. Added `components.json`, `@/` path alias (tsconfig + vite), `tailwindcss-animate` plugin. Installed 7 new packages (`@radix-ui/react-{separator,tabs,dialog,scroll-area,toggle,toggle-group}`, `tailwindcss-animate`). Updated 6 existing components (button, input, label, checkbox, select, textarea) to latest shadcn/ui conventions with `data-slot` attributes. Added 9 new components: card, badge, tabs, separator, tooltip, scroll-area, dialog, toggle, toggle-group. `App.tsx` wraps the tree in `TooltipProvider`. Pages updated: `HomePage` uses Card+Badge for features/examples; `PlaygroundPage` uses ToggleGroup for layout selector; `DynamicForm` uses Select/Input/Checkbox/Label/Button from shadcn/ui; `HistoryPanel` uses ScrollArea+Badge; `RunnerToolbar` uses Tooltip+Separator+Badge; `ShowCodeModal` uses Dialog; `ExamplesPage` uses Badge for tags.
- **Documentation accuracy sweep (2026-06-05):** Full audit of all docs against source; no behaviour changes. Fixes — README: removed nonexistent `addStep({ autoComplete: true })` option (auto-complete is inferred at `build()`, no flag). `dev/architecture.md`: deleted fictional `ExecutionContext`/`nodes/` section; corrected file map (`primitives.ts` → real `constant-guards.ts`+`fn-guard.ts`; added `index.ts`/`utils.ts`/`exporter.ts`). `scenarios/persistence.md`: `HistoryEntry.timestamp` → `at` (+ `payload`/`context`); audit-trail example used `e.timestamp`. `guide/concepts.md` + `scenarios/persistence.md`: added missing `context?` field to `InstanceSnapshot`. `api/visualization.md`: `JsonGraphEdge` gained `kind` discriminant, `action`/`hasGuard` made optional. `api/guards.md` + `scenarios/guards.md`: added `context` to `GuardContext`; `Guard.fn` second generic. `api/workflow-builder.md`: documented `onEnter`/`onExit` on add* methods, context-arg `createInstance`, graph-validation throws, `build()` returns `Workflow<TActions, TContext, TStates>`, added `setContext`. `api/workflow-instance.md`: `getCurrentStates(): TStates[]`, `getAvailableTransitions(): (keyof TActions & string)[]`, added `getContext`/`setContext`/`rewind`. `examples/index.md`: corrected run instructions to the 3 files that actually exist. This file: §2 file map (real `types/` filenames + `core/workflow.ts` + accurate `index.ts` exports), §3 block-reason list gained `invalid-action`, agent-protocol "Section 4" → "Section 5". Source TSDoc: `InstanceSnapshot.version` increments on dispatch **and** `resolveWait`. New tooling: `scripts/check-file-map.ts` (`pnpm check:filemap`, run via Node 24 type-stripping) verifies both file maps against the real `src/` tree and is wired into the pre-PR gate so the maps can't silently drift again.
