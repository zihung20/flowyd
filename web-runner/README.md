# web-runner

The browser UI for [`flowyd`](../flowyd/) — a React SPA that **visualises and drives** typed workflows without writing a host. It powers the [live playground](https://zihung20.github.io/flowyd/playground/).

This package is **not published** — it's a development and demonstration tool. The library (`flowyd/`) is the product; this is how you see it move.

---

## What's in it

| Page | What it does |
|---|---|
| **Home** | Landing page introducing flowyd. |
| **Examples** | A gallery of pre-built workflows (purchase order, incident response, release pipeline, pre-departure checklist — see [`src/workflows/`](./src/workflows/)) you can open and run. |
| **Visual Designer** | A two-way editor: write a workflow in Monaco on one side, see it as a live React Flow graph on the other. Edits sync both directions. |
| **Playground** | Run any workflow interactively — dispatch actions, inspect state, and time-travel. |

**Running a workflow** shows each dispatched action's payload in an expandable history. A video-style timeline scrubber lets you drag a playhead (or press Play) to move through every version of a run; dispatching from a past step branches the run from there — all driven by the library's pure `rewind()`, so nothing is mutated.

**Deadlines** render as amber dashed `after <duration>` edges. When one is armed, a "Skip ahead" clock control jumps the run to that instant and fires it; the firing appears in history as a `timeout` event. The Purchase Order example carries a 48h escalation SLA to demonstrate this.

---

## Run it

The web-runner consumes the library via `file:../flowyd`, so **build the library first**.

```sh
# 1. build the library
cd ../flowyd && pnpm install && pnpm build

# 2. start the web-runner
cd ../web-runner && pnpm install && pnpm dev   # → http://localhost:5173
```

| Script | Purpose |
|---|---|
| `pnpm dev` | Bundle the library's types, then start Vite on :5173. |
| `pnpm build` | Type-check and build for production. |
| `pnpm build:pages` | Production build under the `/flowyd/playground/` base path (used by CI to deploy the playground to GitHub Pages). |
| `pnpm preview` | Preview a production build locally. |
| `pnpm lint` / `pnpm format` | ESLint / Prettier. |

> The library is consumed as compiled output, not source. After changing anything in `flowyd/`, re-run `pnpm build` there (or `pnpm dev` for watch mode) so the web-runner picks it up.

---

## Stack & conventions

- **Vite + React 19 + TypeScript**, **Tailwind CSS**, **[shadcn/ui](https://ui.shadcn.com)** components, **[@xyflow/react](https://reactflow.dev)** (React Flow) for graphs, **Monaco** for the code editor.
- UI components live behind shadcn/ui — see [`components.json`](./components.json). Add one with `pnpm dlx shadcn@latest add <component>`.
- **Iconography is [lucide-react](https://lucide.dev) only** — no emoji, no Unicode-glyph icons. Reach for a lucide component.

---

## Package manager

**`pnpm` exclusively** — never `npm` or `yarn`, here or anywhere in the monorepo.
