# Contributing

## Prerequisites

| Tool    | Version |
| ------- | ------- |
| Node.js | ≥ 20    |
| pnpm    | ≥ 9     |

Install pnpm if you don't have it:

```sh
npm install -g pnpm
```

## Project Structure

```
workflow/
├── logic-workflow/   # Core TypeScript library
│   ├── src/          # Source code
│   ├── tests/        # Integration and e2e tests (Vitest)
│   ├── examples/     # Runnable usage examples
│   └── docs/         # VitePress documentation site
└── web-runner/       # React SPA demo (Vite + React Flow)
```

## Setup

```sh
# 1. Install library deps and build
cd logic-workflow
pnpm install
pnpm build

# 2. Install web-runner deps (uses the built library above)
cd ../web-runner
pnpm install
```

## Development Workflow

### Library (`logic-workflow/`)

```sh
pnpm dev            # watch mode — rebuilds on save
pnpm format         # Prettier — format all files
pnpm format:check   # Prettier — check without writing
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
pnpm test           # Vitest (single run)
pnpm test:watch     # Vitest (watch mode)
pnpm build          # production build → dist/
```

Run the full gate before opening a PR:

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### Web Runner (`web-runner/`)

> Rebuild the library first whenever you change `logic-workflow/src/`.

```sh
# In logic-workflow/
pnpm build

# In web-runner/
pnpm dev      # → http://localhost:5173
pnpm build    # production build
```

### Documentation (`logic-workflow/docs/`)

```sh
pnpm docs:dev      # dev server → http://localhost:5173
pnpm docs:build    # production build
pnpm docs:preview  # preview the production build
```

---

## Code Style

### Formatting

Handled by Prettier — run `pnpm format` before committing, never manually align. Config: `singleQuote`, `semi`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`.

### General

- Functions are verbs, types are nouns, booleans answer yes/no (`isTerminal`, `canTransition`).
- One function, one job. Early returns over nesting. Boolean parameters → options object.
- Every `if`/`else` body must have braces — enforced by ESLint (`curly: error`). This avoids a conflict where Prettier wraps a long one-liner to the next line, which would make it look braceless.
- No `any` — use `unknown` and narrow. No non-null assertions (`!`) without a justifying comment.
- Silent `catch` blocks are banned — re-throw or wrap-and-rethrow. Failures throw; never return `null`/`false` to signal failure.
- TSDoc on every exported symbol. Inside function bodies, comment the *why* only — never the what.

### TypeScript & Zod

Derive types from Zod schemas with `z.infer<>`. Never write a parallel `interface` alongside a schema.

Strict mode flags (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`) are permanent — do not disable them.

### Discriminated unions

Narrow with `state.kind`, never cast with `as`. Multiple branches on the same discriminant belong in a `switch`, not a chain of `if` statements.

```ts
// use switch for AnyState branches — exhaustiveness is visible at a glance
switch (state.kind) {
  case StateKind.Fork: ...
  case StateKind.Join: ...
  case StateKind.Wait: ...
}
```

Any remaining `as` cast must have an inline comment explaining why it is safe at that site.

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

| Type       | When to use                                 |
| ---------- | ------------------------------------------- |
| `feat`     | New feature or capability                   |
| `fix`      | Bug fix                                     |
| `refactor` | Code restructure with no behaviour change   |
| `test`     | Adding or updating tests                    |
| `docs`     | Documentation only                          |
| `chore`    | Tooling, config, dependency updates         |

Examples:

```
feat(core): add timeout support to WorkflowEngine
fix(builder): throw on duplicate state ID instead of silently overwriting
docs(guards): add guard injection example to how-to guide
chore: upgrade vitest to 2.x
```

---

## Pull Requests

1. Branch off `main`.
2. Keep changes focused — one logical change per PR.
3. Ensure the full gate passes: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
4. Update `CLAUDE.md` Session History with a dated entry describing what changed and why.
5. Write a clear PR description: what problem does this solve, and how?
