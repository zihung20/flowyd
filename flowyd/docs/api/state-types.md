# State Types

States are the nodes of the workflow graph. Each state has a unique `id`, a `kind` literal, and a `label` for visualization.

```ts
import type {
  IStepState,
  IForkState,
  IJoinState,
  IWaitState,
  StateStatus,
  StateKind,
} from 'flowyd';
```

You register states via the builder methods — you do not instantiate state classes directly.

## State statuses

Every state moves through a fixed progression:

| Status      | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `idle`      | Not yet entered                                         |
| `active`    | Currently active — awaiting a dispatch                  |
| `waiting`   | `WaitState` only — paused until `resolveWait` is called |
| `completed` | Exited; will not become active again                    |

States move forward only. The engine never reverses a status.

## StepState — `kind: 'step'`

Register with: `.addStep(id, options?)`

The fundamental building block. Becomes `active` on entry and waits for a dispatch to advance it.

```ts
.addStep('draft')
.addStep('pending-approval', { label: 'Pending Approval' })
```

**Options:**

| Option  | Type     | Default | Description                            |
| ------- | -------- | ------- | -------------------------------------- |
| `label` | `string` | `id`    | Human-readable label for visualization |

**Use when:** the workflow is paused at this node waiting for a human or system action.

## ForkState — `kind: 'fork'`

Register with: `.addFork(id, options)`

A routing node. On entry it immediately activates all `targets` and marks itself `completed`. It is never left in `active` status between dispatches — it is transient by design. `getCurrentStates()` will never return a `ForkState` ID.

```ts
.addFork('inspection-fork', {
  label: 'Inspection Fork',
  targets: ['mechanical', 'electrical', 'safety-systems'],
})
```

**Options:**

| Option    | Type        | Default  | Description                       |
| --------- | ----------- | -------- | --------------------------------- |
| `targets` | `TStates[]` | required | States to activate simultaneously |
| `label`   | `string`    | `id`     | Human-readable label              |

**Use when:** multiple steps must run concurrently and independently.

## JoinState — `kind: 'join'`

Register with: `.addJoin(id, options)`

Activates automatically when the `mode` threshold of `requires` states is satisfied. No extra dispatch is needed — the engine's fixed-point loop detects it.

```ts
.addJoin('review-complete', {
  requires: ['legal', 'finance', 'compliance'],
  mode: 'all',           // or 'any', or a number
  label: 'Review Complete',
})
```

**Options:**

| Option     | Type                       | Default  | Description                                 |
| ---------- | -------------------------- | -------- | ------------------------------------------- |
| `requires` | `TStates[]`                | required | States that must complete before activation |
| `mode`     | `'all' \| 'any' \| number` | required | Activation threshold                        |
| `label`    | `string`                   | `id`     | Human-readable label                        |

| `mode` value | Activates when                                  |
| ------------ | ----------------------------------------------- |
| `'all'`      | Every state in `requires` is `completed`        |
| `'any'`      | At least one state in `requires` is `completed` |
| `number N`   | At least N states in `requires` are `completed` |

**Use when:** re-synchronising parallel branches after a `ForkState`.

## WaitState — `kind: 'wait'`

Register with: `.addWait(id, options?)`

On entry its status becomes `waiting` (not `active`). The workflow is paused. Resume with `inst.resolveWait(id)` from your service layer.

```ts
.addWait('payment-processing', { externalName: 'stripe-payment' })
.addWait('kyc-check', { externalName: 'vendor-kyc-sop', label: 'KYC Verification' })
```

**Options:**

| Option         | Type     | Default | Description                                     |
| -------------- | -------- | ------- | ----------------------------------------------- |
| `externalName` | `string` | `id`    | Name of the external process (documentary only) |
| `label`        | `string` | `id`    | Human-readable label                            |

**Use when:** the workflow must wait for an external system — webhook, background job, human action in another system — before continuing.

## Advanced: inspecting a compiled workflow

> **Most users can skip this section.** You only need `StateKind` and `AnyState` if you walk a compiled workflow's graph yourself — writing a custom exporter, a graph linter, a dashboard, or similar tooling. If you're just building and running workflows, you'll never handle an `AnyState` value directly. (The built-in [`MermaidExporter` / `JsonGraphExporter`](./visualization) are written exactly this way.)

You meet `AnyState` when you iterate `workflow.getDefinition().states`, which is a `ReadonlyMap<string, AnyState>`:

```ts
for (const state of workflow.getDefinition().states.values()) {
  // state: AnyState — narrow on `state.kind` to read kind-specific fields
  // (targets / requires / externalName)
}
```

### StateKind enum

```ts
enum StateKind {
  Step = 'step',
  Fork = 'fork',
  Join = 'join',
  Wait = 'wait',
}
```

Narrow with `state.kind === StateKind.Fork`. Do not cast with `state as IForkState` — the discriminant makes a cast both unnecessary and unsafe.

### AnyState discriminated union

```ts
type AnyState = IStepState | IForkState | IJoinState | IWaitState;
```

`switch` on `kind` and TypeScript narrows each branch to the matching interface, so the kind-specific fields (`targets`, `requires`, `externalName`) are available with no cast:

```ts
function describeState(state: AnyState): string {
  switch (state.kind) {
    case StateKind.Step:
      return `step: ${state.id}`;
    case StateKind.Fork:
      return `fork → ${state.targets.join(', ')}`;
    case StateKind.Join:
      return `join (${state.mode}): ${state.requires.join(', ')}`;
    case StateKind.Wait:
      return `wait: ${state.externalName ?? state.id}`;
  }
}
```
