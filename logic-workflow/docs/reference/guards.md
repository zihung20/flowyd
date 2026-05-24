# Guards

Guards are async predicates attached to transitions. All guards implement the `IGuard` interface and are composable.

```ts
import { Guard } from 'logic-workflow';
import type { IGuard, GuardFn, GuardContext } from 'logic-workflow';
```


## IGuard interface

```ts
interface IGuard<TPayload = unknown> {
  evaluate(ctx: GuardContext<TPayload>): boolean | Promise<boolean>;
}
```


## GuardContext

```ts
interface GuardContext<TPayload> {
  payload:       TPayload;                 // the validated action payload
  instanceState: ReadonlyInstanceState;    // current status of all states
  resolveGuard:  (name: string) => IGuard; // internal; used by InjectedGuard
}
```


## Guard factory

All guards are constructed through the `Guard` namespace. Do not instantiate guard classes directly — the factory is the public API.


### `Guard.inject`

```ts
Guard.inject(name: string): InjectedGuard
```

Declares a named guard placeholder resolved at runtime from `inst.injectGuard()`.

```ts
Guard.inject('isManager')
```

**Throws** at evaluation time (not at build time) if the named guard has not been injected.


### `Guard.fn`

```ts
Guard.fn<TPayload>(
  fn: (ctx: GuardContext<TPayload>) => boolean | Promise<boolean>
): FnGuard<TPayload>
```

Wraps an inline function as a guard.

```ts
Guard.fn<{ role: string }>((ctx) => ctx.payload.role === 'admin')
```


### `Guard.stateCompleted`

```ts
Guard.stateCompleted(stateId: string): StateCompletedGuard
```

Returns `true` when the named state has status `'completed'`.

```ts
Guard.stateCompleted('legal-review')
```


### `Guard.stateActive`

```ts
Guard.stateActive(stateId: string): StateActiveGuard
```

Returns `true` when the named state has status `'active'`.


### `Guard.and`

```ts
Guard.and(guards: IGuard[]): AndGuard
```

Returns `true` only if **all** guards return `true`. Short-circuits on the first `false`.

```ts
Guard.and([Guard.inject('isManager'), Guard.stateCompleted('legal-review')])
```


### `Guard.or`

```ts
Guard.or(guards: IGuard[]): OrGuard
```

Returns `true` if **at least one** guard returns `true`. Short-circuits on the first `true`.

```ts
Guard.or([Guard.inject('isSupervisor'), Guard.inject('isAdmin')])
```


### `Guard.not`

```ts
Guard.not(guard: IGuard): NotGuard
```

Inverts the result of the wrapped guard.

```ts
Guard.not(Guard.inject('isBlocked'))
```


### `Guard.always`

```ts
Guard.always(): AlwaysGuard
```

Always returns `true`. Useful as a test double or explicit unconditional transition.


### `Guard.never`

```ts
Guard.never(): NeverGuard
```

Always returns `false`. Useful as a sentinel in test scenarios.


## Using a raw function as a guard

`addTransition` also accepts a raw arrow function directly — it is internally wrapped in `FnGuard`:

```ts
.addTransition({
  from: 'a', to: 'b', on: 'GO',
  guard: (ctx) => ctx.payload.approved === true,
})
```

The payload type is inferred from the action's declared Zod schema.
