# CLAUDE.md — web-runner Frontend Rules

Frontend-specific rules for the `web-runner` React app. These extend the root `CLAUDE.md`; both apply.

---

## Package manager

`pnpm` exclusively — same as the root. Never `npm` or `yarn`.

---

## Formatting

Prettier is configured (`.prettierrc`). Run before committing:

```sh
pnpm format        # write
pnpm format:check  # CI / dry-run
```

---

## Component rules

### No logic inside JSX event props

`onClick`, `onChange`, and other event props must be a **single function reference**. If a handler does more than call one already-named function, extract it as a named `function handle*()` above the `return`.

```tsx
// Bad — logic buried inside JSX, invisible at a glance
<Button onClick={() => {
  const x = compute();
  doSomething(x);
  setState(true);
}}>

// Good — intent named, JSX stays declarative
function handleFoo() {
  const x = compute();
  doSomething(x);
  setState(true);
}
// ...
<Button onClick={handleFoo}>
```

**Why:** inline handlers hide side-effects inside the render tree. Named handlers surface all the component's behaviour above the `return` where it's easy to scan, test mentally, and diff.

**Applies to:** any prop whose value is a callback (`onClick`, `onChange`, `onSubmit`, `onReset`, `onKeyDown`, …).

**Exception:** a single-expression passthrough with no construction logic is fine inline — `onClick={() => onClose(id)}` — but if it grows to two lines, extract it.

---

## Async in event handlers

If errors from the async call need to surface to the user, make the handler `async` and `await` the call so you can catch and display them. If the call is genuinely fire-and-forget (like opening a new tab), a plain call is fine — don't add `void` as boilerplate noise unless a lint rule (`@typescript-eslint/no-floating-promises`) requires it.
