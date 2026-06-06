# flowyd

Strongly-typed SOP state machines for TypeScript.

This repository contains two packages that work together:

---

## `flowyd/` — the core library

A TypeScript library for building typed, auditable workflow state machines. Install it in your project to define and execute workflows in code.

```sh
pnpm add flowyd zod
```

The compiler catches every typo in a state ID, every wrong action name, and every mismatched payload shape before your code runs.

- [Library README](./flowyd/README.md) — install, quick start, API overview
- [Full documentation](https://zihung20.github.io/flowyd/guide/)
- [Playground](https://zihung20.github.io/flowyd/playground/) — an interactive online editor for building and testing workflows without installing anythings

---

## `web-runner/` — the browser UI

A React SPA (Vite + Tailwind + shadcn/ui + React Flow) that visualises and drives workflows in the browser. Not published to npm — used for local development and demonstration. The run panel shows each dispatched action's payload in an expandable history, and a video-style timeline scrubber lets you drag a playhead (or press Play) to time-travel through every version of a run; dispatching from a past step branches the run from there.

UI components are provided by **shadcn/ui** — see `web-runner/components.json` for configuration. Add new components with `pnpm dlx shadcn@latest add <component>` inside `web-runner/`. Iconography is **lucide-react** throughout — no emoji or Unicode-glyph icons; reach for a lucide icon component instead.

```sh
# Build the library first
cd flowyd && pnpm build

# Start the web runner
cd ../web-runner && pnpm dev   # → http://localhost:5173
```

---

## Development

```sh
# Install and build everything
cd flowyd && pnpm install && pnpm build
cd ../web-runner  && pnpm install
```

See [Contributing](./flowyd/docs/dev/contributing.md) for the full development guide.
