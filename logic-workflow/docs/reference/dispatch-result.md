# DispatchResult

`dispatch` returns a discriminated union on the `success` field:

```ts
type DispatchResult = TransitionSuccess | TransitionBlocked;
```

```ts
import type { DispatchResult, TransitionSuccess, TransitionBlocked } from 'logic-workflow';
```


## TransitionSuccess

```ts
interface TransitionSuccess {
  success:       true;
  action:        string;
  enteredStates: readonly string[];   // states that became active/waiting in this tick
  exitedStates:  readonly string[];   // states that completed in this tick
  snapshot:      InstanceSnapshot;    // the new snapshot (already committed internally)
}
```

When `success` is `true`, the internal instance state has already been updated. Save `inst.getSnapshot()` to your database.


## TransitionBlocked

```ts
interface TransitionBlocked {
  success:      false;
  action:       string;
  reason:
    | 'terminal-state'    // workflow has already ended
    | 'invalid-action'    // no transitions exist for this action name
    | 'no-active-source'  // action exists but none of its source states are active
    | 'guard-failed';     // all matching transitions were blocked by guards
  activeStates: string[];
}
```

When `success` is `false`, **the instance state is unchanged**. No persistence is needed.


## Reason reference

| Reason | Meaning | Typical HTTP response |
|--------|---------|----------------------|
| `terminal-state` | The workflow has already reached a terminal state | 409 Conflict |
| `invalid-action` | The action name has no transitions defined | 400 Bad Request |
| `no-active-source` | The action is defined but no active state has this transition | 400 Bad Request |
| `guard-failed` | Transitions exist and source states are active, but all guards blocked | 403 Forbidden |


## Pattern: exhaustive switch

```ts
const result = await inst.dispatch('APPROVE', payload);

if (!result.success) {
  switch (result.reason) {
    case 'guard-failed':
      return res.status(403).json({ error: 'Not authorized to approve' });
    case 'terminal-state':
      return res.status(409).json({ error: 'This workflow has already ended' });
    case 'no-active-source':
    case 'invalid-action':
      return res.status(400).json({ error: result.reason });
  }
}

// result.success is true here
await db.save(inst.getSnapshot());
```


## Throws vs returns failure

`dispatch` **throws** (does not return `TransitionBlocked`) for programming errors that should never occur in a correctly-integrated system:

- `ZodError` — the payload does not match the action's declared schema
- `Error` — a named `Guard.inject(name)` has not been injected via `injectGuard`

These are bugs in the caller, not valid domain outcomes.
