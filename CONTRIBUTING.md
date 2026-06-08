# Contributing to flowyd

Contributions are welcome — bug reports, ideas, docs fixes, and code. This is the short version; the **[full developer guide](./docs/dev/contributing.md)** covers architecture and design decisions in depth.

## Ground rules

- **`pnpm` only.** Never `npm` or `yarn`. If a `package-lock.json` or `yarn.lock` appears, it's a mistake — delete it.
- **Read [`CLAUDE.md`](./CLAUDE.md) first.** It's the authoritative project law: strict TypeScript (no `any`, no unguarded casts), Zod as the single source of truth for payload types, a one-way layer dependency rule, and TSDoc on every exported symbol. These override habit and convention.

## Setup

```sh
cd flowyd
pnpm install
pnpm build
```

The `web-runner/` and `docs/` packages consume the library via `file:../flowyd`, so build it before working on either.

## Before you open a PR

Run the full gate from `flowyd/` — every step must pass clean:

```sh
pnpm lint && pnpm check:filemap && pnpm typecheck && pnpm test && pnpm build
```

Then:

- Add or update tests for your change (see the four Vitest projects in [`CLAUDE.md`](./CLAUDE.md) §2).
- Give every new exported symbol a TSDoc block.
- Update docs if public behaviour changed — `flowyd/README.md`, the `docs/` site, and the version history in `CLAUDE.md` §5.

## Reporting bugs & ideas

Open an issue — there are [templates](https://github.com/zihung20/flowyd/issues/new/choose) for bug reports and feature ideas. A minimal, runnable reproduction (ideally a failing test) is the fastest path to a fix.

## Breaking changes

flowyd is pre-1.0, so breaking changes are acceptable for now — no compatibility shims or migration code (see [`CLAUDE.md`](./CLAUDE.md) §3).
