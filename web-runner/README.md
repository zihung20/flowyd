# web-runner

React SPA that **visualises and drives** [`flowyd`](../flowyd/) workflows without writing a host. Powers the [live playground](https://zihung20.github.io/flowyd/playground/).

**Not published** — a dev/demo tool; `flowyd/` is the product.

---

## What's in it

| Page                | What it does                                                                  |
| ------------------- | ------------------------------------------------------------------------------ |
| **Home**            | Landing page.                                                                  |
| **Examples**        | Gallery of pre-built workflows ([`src/workflows/`](./src/workflows/)).        |
| **Visual Designer** | Two-way editor: Monaco code ↔ live React Flow graph.                         |
| **Playground**      | Dispatch actions, inspect state, time-travel.                                 |

A timeline scrubber steps through every version of a run via the library's pure `rewind()` — nothing mutated; dispatching from a past step branches the run.

**Deadlines** render as amber dashed `after <duration>` edges; a "Skip ahead" clock control fires an armed one, logged as a `timeout` event.

---

## Run it

The web-runner consumes the library via `file:../flowyd`, so **build the library first**.

```sh
# 1. build the library
cd ../flowyd && pnpm install && pnpm build

# 2. start the web-runner
cd ../web-runner && pnpm install && pnpm dev   # → http://localhost:5173
```

| Script                      | Purpose                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                  | Bundle library types, start Vite on :5173.                    |
| `pnpm build`                | Type-check and build for production.                          |
| `pnpm build:pages`          | Production build under `/flowyd/playground/` (CI → Pages).    |
| `pnpm preview`              | Preview a production build locally.                            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier.                                              |

> Consumed as compiled output, not source — re-run `pnpm build` in `flowyd/` after changing it.

---

## Stack & conventions

- **Vite + React 19 + TypeScript**, **Tailwind**, **[shadcn/ui](https://ui.shadcn.com)**, **[@xyflow/react](https://reactflow.dev)** for graphs, **Monaco** for the editor.
- Components behind shadcn/ui — see [`components.json`](./components.json); add with `pnpm dlx shadcn@latest add <component>`.
- Icons: **[lucide-react](https://lucide.dev) only** — no emoji, no Unicode glyphs.

---

## Package manager

**`pnpm` exclusively** — never `npm` or `yarn`, here or anywhere in the monorepo.
