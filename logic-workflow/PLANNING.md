# PLANNING.md

Tracks phase-by-phase implementation plans. Each phase is documented here before any code is written.

---

## Phase 1: VitePress Documentation Site (Diátaxis)

**Status:** COMPLETE ✓

### What was built

- `docs/.vitepress/config.ts` — site config, nav, per-section sidebars, local search
- `docs/index.md` — hero home page with feature grid
- `docs/tutorials/` — section landing + "Build your first workflow" full walkthrough
- `docs/how-to/` — section landing + parallel-branches, sub-workflows, guards, persistence
- `docs/reference/` — section landing + workflow-builder, workflow-instance, state-types, guards, dispatch-result, visualization
- `docs/explanation/` — section landing + architecture, fixed-point-engine, design-decisions
- `package.json` — `docs:dev`, `docs:build`, `docs:preview` scripts; `vitepress ^1.6.4` devDependency
- `.gitignore` — `docs/.vitepress/cache/` and `docs/.vitepress/dist/` excluded
- `README.md` — deleted; VitePress site is now the canonical documentation

---

## Phase 2: Isolated React Web Runner (SPA)

**Status:** COMPLETE ✓ (relocated to sibling position 2026-05-24)

### Final location

`/Users/zihung20/Desktop/workflow/web-runner/` — sibling of `logic-workflow/`, not nested inside it.
Dep: `"logic-workflow": "file:../logic-workflow"` (works because `logic-workflow/package.json` includes `"files": ["dist", "src"]`).

### Goal

Scaffold a completely self-contained single-page application in `web-runner/` that:

- Runs entirely in the browser — no backend, no server
- Links to the parent library via a local file dependency (`"logic-workflow": "file:../"`)
- Instantiates a real `WorkflowInstance` directly in browser memory
- Holds the `InstanceSnapshot` in React state, re-rendering on every dispatch
- Renders the live workflow graph on a React Flow canvas
- Generates action input forms automatically from Zod schema introspection (SDUI)

### Stack

| Concern | Choice |
|---------|--------|
| Build tool | Vite 6 (ESM-native, fast HMR) |
| UI framework | React 19 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin — no postcss config needed) |
| Graph canvas | `@xyflow/react` v12 (React Flow rebranded + rewritten for React 19) |
| State machine | `logic-workflow` (local file link) |
| Schema | `zod` (peer dep — same version as parent) |
| Language | TypeScript 5.8 strict |

---

### Directory blueprint

```
web-runner/
├── index.html                        # Vite entry point
├── package.json                      # Local file dep on logic-workflow
├── vite.config.ts                    # React + @tailwindcss/vite plugins; optimizeDeps
├── tsconfig.json                     # strict, moduleResolution: bundler, target: ES2022
└── src/
    ├── index.css                     # @import "tailwindcss"; — all Tailwind needs in v4
    ├── main.tsx                      # ReactDOM.createRoot, mounts <App />
    ├── App.tsx                       # Orchestrator — see spec below
    ├── workflow/
    │   └── demo-workflow.ts          # Exports a compiled Workflow and initial guard map
    ├── components/
    │   ├── WorkflowGraph.tsx         # @xyflow/react canvas — see spec below
    │   ├── StateNode.tsx             # Custom XYFlow node component
    │   ├── DynamicForm.tsx           # SDUI form from Zod schema — see spec below
    │   └── HistoryPanel.tsx          # Scrollable audit log from snapshot.history
    └── lib/
        └── zod-introspect.ts         # Pure Zod-walking utilities used by DynamicForm
```

---

### File specifications

#### `web-runner/package.json`

```json
{
  "name": "web-runner",
  "private": true,
  "type": "module",
  "scripts": {
    "dev":     "vite",
    "build":   "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "logic-workflow":  "file:../",
    "react":           "^19.0.0",
    "react-dom":       "^19.0.0",
    "@xyflow/react":   "^12.0.0",
    "zod":             "^3.23.8"
  },
  "devDependencies": {
    "@types/react":         "^19.0.0",
    "@types/react-dom":     "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite":    "^4.0.0",
    "tailwindcss":          "^4.0.0",
    "typescript":           "^5.8.0",
    "vite":                 "^6.0.0"
  }
}
```

Key changes from older plan:
- **`react` / `react-dom` 19** — no `autoprefixer` or `postcss` needed; Tailwind v4 handles this internally
- **`@xyflow/react` v12** — replaces the retired `reactflow` v11 package; full React 19 compatibility, new `useNodesState` / `useEdgesState` hooks API
- **`@tailwindcss/vite` v4** — Vite plugin replaces the postcss pipeline entirely; `tailwind.config.ts` is gone; configuration lives in CSS via `@theme` blocks if needed
- **`typescript` 5.8** — includes `erasableSyntaxOnly`, `noUncheckedSideEffectImports`, and updated `moduleResolution` defaults

The `"file:../"` dep resolves to the parent package's `dist/` output (built with `pnpm build`). The `vite.config.ts` adds the parent `dist/` to `optimizeDeps.include` so Vite pre-bundles it correctly.

---

#### `src/workflow/demo-workflow.ts`

Exports a fully compiled `Workflow` built from the engineer pre-departure checklist (or another bundled example). Also exports a `getGuards()` factory that returns pre-wired guard implementations so `App.tsx` can inject them without coupling itself to domain logic.

```ts
export const demoWorkflow: Workflow<typeof DemoActions>;
export function wireGuards(inst: WorkflowInstance<typeof DemoActions>): void;
```

The workflow must be buildable entirely from the types in `logic-workflow` — no Node.js APIs, no file I/O.

---

#### `src/App.tsx` — Orchestrator

Responsibilities:
1. Creates `demoWorkflow.createInstance('runner-001')` on first mount and calls `wireGuards(inst)`.
2. Holds `snapshot: InstanceSnapshot` in `useState`. The instance object is stored in a `useRef` (mutable, not reactive).
3. Exposes a `dispatch(action, payload)` callback that:
   - Calls `inst.dispatch(action, payload)`
   - On `result.success === true`: calls `setSnapshot(inst.getSnapshot())`
   - On failure: surfaces `result.reason` as a dismissible toast
4. Passes `snapshot` and `dispatch` down via React context (no prop drilling).
5. Layout: two-column flex — left: `<WorkflowGraph />` (takes remaining width), right: `<DynamicForm />` + `<HistoryPanel />` stacked vertically.

State shape:

```ts
interface RunnerContext {
  workflow:  Workflow<AnyActions>;      // stable ref, never changes
  snapshot:  InstanceSnapshot;          // updated after every successful dispatch
  dispatch:  (action: string, payload: unknown) => Promise<void>;
  lastError: string | null;             // 'guard-failed' | 'terminal-state' | null
}
```

---

#### `src/components/WorkflowGraph.tsx` — XYFlow Canvas

Data flow:

```
workflow.getDefinition()  ─┐
                            ├─▶ JsonGraphExporter.export(def, snapshot) ─▶ JsonGraph
snapshot                  ─┘
```

`JsonGraph.nodes` → mapped to `@xyflow/react` `Node[]`:
- `position` computed via a BFS topological sort (column = depth, row = sibling index). No external layout lib needed — the graph is a DAG with bounded width.
- Each node gets `type: 'stateNode'` pointing to `StateNode.tsx`.
- Node `data` carries: `{ label, kind, status, isInitial, isTerminal, targets?, join? }`.

`JsonGraph.edges` → mapped to `@xyflow/react` `Edge[]`:
- `label` = the action name
- `animated` = `true` when the source state's status is `active`
- `style` — dashed stroke when `hasGuard: true`

`StateNode.tsx` renders a rounded card using `@xyflow/react`'s `Handle` component for connection points:
- Background by `status`: `idle`=slate-100, `active`=blue-500, `waiting`=amber-400, `completed`=green-500
- Icon suffix by `kind`: ⑂ fork, ⑁ join, ⤴ sub-workflow, none for step
- Bold label, small kind chip below

The canvas uses the v12 `<ReactFlow>` component (import from `@xyflow/react`) with `fitView`, `<Controls />`, and `<MiniMap />`. No node dragging — `nodesDraggable={false}`. State is driven by the form only.

---

#### `src/lib/zod-introspect.ts` — Schema Walker

Pure utility module. Walks a `ZodTypeAny` and returns a `FieldDescriptor[]`:

```ts
type FieldDescriptor =
  | { kind: 'string';   name: string; optional: boolean }
  | { kind: 'number';   name: string; optional: boolean }
  | { kind: 'boolean';  name: string; optional: boolean }
  | { kind: 'enum';     name: string; optional: boolean; options: string[] }
  | { kind: 'unknown';  name: string; optional: boolean };  // fallback → free-text
```

Implementation strategy using Zod's first-party type names (accessed via `schema._def.typeName` against `ZodFirstPartyTypeKind`):

```
ZodObject   → recurse into .shape entries, flatten into FieldDescriptor[]
ZodOptional → unwrap inner, set optional: true
ZodString   → { kind: 'string' }
ZodNumber   → { kind: 'number' }
ZodBoolean  → { kind: 'boolean' }
ZodEnum     → { kind: 'enum', options: schema._def.values }
ZodDefault  → unwrap inner, carry default value
*           → { kind: 'unknown' }   (safe fallback: renders a text input)
```

Exported function signature:

```ts
export function describeSchema(
  schema: ZodTypeAny,
  parentKey?: string,
): FieldDescriptor[];
```

This is a pure function with no side-effects. It is tested independently of the React tree.

---

#### `src/components/DynamicForm.tsx` — SDUI Action Form

Reads from `RunnerContext`:
- `snapshot` → `inst.getAvailableTransitions()` gives the list of action names currently dispatchable
- `workflow.getDefinition().actionSchemas` → keyed by action name, gives `ZodSchema<unknown>`

Renders:

1. **Action selector** — a `<select>` or button group listing available actions. Disabled when `snapshot.isTerminal`.
2. **Field list** — calls `describeSchema(actionSchema)` for the selected action and renders one input per `FieldDescriptor`:
   - `string` → `<input type="text">`
   - `number` → `<input type="number">`
   - `boolean` → `<input type="checkbox">`
   - `enum` → `<select>` populated with `options`
   - `unknown` → `<input type="text">` (user types raw JSON)
3. **Submit button** — collects the form's controlled state into a plain object, calls `ctx.dispatch(selectedAction, payload)`.
4. **Error badge** — shows `ctx.lastError` in red when non-null, auto-clears on next successful dispatch.

All inputs are controlled (value + onChange). The collected payload object is typed as `Record<string, unknown>` before being handed to `dispatch` — Zod validates it inside the engine before any state change.

---

#### `src/components/HistoryPanel.tsx`

Maps `snapshot.history` (most-recent-first) into a scrollable list. Each entry shows:
- Action name (bold)
- Timestamp (relative, e.g. "3s ago")
- Entered states (green chips) / Exited states (gray chips)

---

### Build / dev instructions (to be added to CLAUDE.md after execution)

```sh
# One-time: build the parent library first
pnpm build

# Then in web-runner/:
pnpm install
pnpm dev      # → http://localhost:5173
pnpm build    # production bundle → web-runner/dist/
```

The parent library must be rebuilt (`pnpm build` at the root) whenever source files in `src/` change, because the file dep resolves to `dist/`.

---

### Architecture constraints honoured

- `web-runner/` is a fully isolated package — it does not share `node_modules` with the parent
- It imports from `logic-workflow` (the compiled package), never from `../src/` directly — the layer boundary is respected
- No backend, no server, no Node.js APIs in the browser bundle
- No `any` — all Zod introspection uses `unknown` narrowed through `instanceof` / `_def.typeName` checks
- The parent package's `pnpm` lockfile is not touched; `web-runner/` maintains its own `pnpm-lock.yaml`

---

## Phase 3: Advanced Testing (Property-Based)

_Not yet planned. Will be added after Phase 2 is approved and complete._

## Phase 4: Persistence Adapter Pattern

_Not yet planned._
