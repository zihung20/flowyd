# Control transitions with guards

Guards are async predicates attached to transitions. If a guard returns `false`, the transition does not fire and the instance state is unchanged.

## The guard evaluation sequence

1. Payload is validated against the action's Zod schema (throws `ZodError` on failure).
2. All transitions whose `from` state is `active` and whose `on` matches the action are collected.
3. Each transition's guard is evaluated.
4. Transitions whose guard returns `true` fire; the rest are silently skipped.
5. If **no** transitions fired, dispatch returns `{ success: false, reason: 'guard-failed' }`.

## Guard.inject — resolve at runtime

Use `Guard.inject` when the guard implementation depends on your service layer (database, auth token, feature flags). The implementation is supplied at runtime via `inst.injectGuard()`.

```ts
// In the workflow definition:
.addTransition({
  from: 'pending-approval',
  to: 'approved',
  on: 'APPROVE',
  guard: Guard.inject('isManager'),
})

// At runtime, before dispatching:
inst.injectGuard('isManager', async (ctx) => {
  const { approverId } = ctx.payload as { approverId: string };
  return myAuthService.hasRole(approverId, 'manager');
});
```

Dispatching without injecting the required guard throws:

```
Error: Guard "isManager" has not been injected. Call instance.injectGuard("isManager", fn).
```

## Guard.fn — inline predicate

Use `Guard.fn` for guards that can be expressed as a pure function with no external dependencies.

```ts
Guard.fn<{ role: string }>((ctx) => ctx.payload.role === 'admin');
```

The `ctx` object exposes:

- `ctx.payload` — the validated action payload (type comes from the generic parameter)
- `ctx.instanceState` — read-only view of all state statuses

## Guard.stateCompleted / Guard.stateActive

Pre-built guards that inspect the live instance:

```ts
// Only allow APPROVE if the legal-review state has already completed
Guard.stateCompleted('legal-review');

// Only allow ESCALATE if the incident-triage state is currently active
Guard.stateActive('incident-triage');
```

Useful for encoding ordering constraints without adding explicit intermediate states.

## Guard.and / Guard.or / Guard.not — composition

All guards implement `IGuard` and are composable:

```ts
// All conditions must pass
Guard.and([
  Guard.inject('isManager'),
  Guard.stateCompleted('legal-review'),
  Guard.not(Guard.inject('isOnLeave')),
]);

// At least one must pass
Guard.or([Guard.inject('isSupervisor'), Guard.inject('isAdmin')]);

// Invert any guard
Guard.not(Guard.inject('isBlocked'));
```

Composition is arbitrarily deep — `Guard.and` and `Guard.or` accept any `IGuard[]`.

## Guard.always / Guard.never

Sentinel values useful in tests:

```ts
Guard.always(); // always returns true
Guard.never(); // always returns false
```

## Multiple transitions on the same action

You can attach multiple transitions from the same state on the same action, each with a different guard. The engine applies **all** transitions whose guard passes:

```ts
// Mutual exclusion via complementary guards — only one fires
.addTransition({ from: 's', to: 'a', on: 'DECIDE', guard: Guard.inject('isApprover') })
.addTransition({ from: 's', to: 'b', on: 'DECIDE', guard: Guard.not(Guard.inject('isApprover')) })
```

## Guard injections are not persisted

Guard functions are runtime behaviour, not data. They are never included in `getSnapshot()`. After every `restoreInstance`, re-inject any named guards before dispatching:

```ts
const inst = workflow.restoreInstance(snapshot);
inst.injectGuard('isManager', myGuardFn);
```
