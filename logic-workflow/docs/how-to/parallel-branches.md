# Run steps in parallel

Use `ForkState` to split a workflow into concurrent branches, and `JoinState` to synchronise them back before advancing.

## The pattern

```
start ──START──▶ fork ⑂
                  /     \
              legal   finance
                  \     /
               join ⑁ (all)
                   │ FINALIZE
               approved ✓
```

The fork fires the moment `START` is dispatched — no extra action is needed. Both `legal` and `finance` become `active` in the same engine tick. The join activates automatically once both have `completed`.

## Code

```ts
import { z } from 'zod';
import { WorkflowBuilder } from 'logic-workflow';

const procurement = new WorkflowBuilder({
  name: 'procurement',
  states: ['start', 'fork', 'legal', 'finance', 'join', 'approved'] as const,
})
  .defineAction('START', z.object({}))
  .defineAction('LEGAL_DONE', z.object({ reviewedBy: z.string() }))
  .defineAction('FINANCE_DONE', z.object({ reviewedBy: z.string() }))
  .defineAction('FINALIZE', z.object({}))

  .addStep('start')
  .addFork('fork', { targets: ['legal', 'finance'] })
  .addStep('legal', { label: 'Legal Review' })
  .addStep('finance', { label: 'Finance Review' })
  .addJoin('join', { requires: ['legal', 'finance'], mode: 'all' })
  .addStep('approved')

  .setInitial('start')
  .setTerminal(['approved'])
  .addTransition({ from: 'start', to: 'fork', on: 'START' })
  .addTransition({ from: 'legal', to: 'join', on: 'LEGAL_DONE' })
  .addTransition({ from: 'finance', to: 'join', on: 'FINANCE_DONE' })
  .addTransition({ from: 'join', to: 'approved', on: 'FINALIZE' })
  .build();
```

## Execution trace

```ts
const inst = procurement.createInstance('prc-001');

await inst.dispatch('START', {});
// fork: completed  (transient — never stays active)
// legal: active
// finance: active

await inst.dispatch('LEGAL_DONE', { reviewedBy: 'alice' });
// legal: completed
// finance: still active
// join: idle (threshold not yet met)

await inst.dispatch('FINANCE_DONE', { reviewedBy: 'bob' });
// finance: completed
// join: active  ← auto-activated by the fixed-point loop
// No extra dispatch was needed.

await inst.dispatch('FINALIZE', {});
// approved: active, isTerminal = true
```

## Join modes

`JoinState` supports three threshold modes:

| `mode` value        | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `'all'` (default)   | Every state in `requires` must complete                |
| `'any'`             | At least one state in `requires` must complete         |
| `number` (e.g. `2`) | At least N states in `requires` must complete (quorum) |

```ts
// Quorum: 2 of 3 reviewers are enough
builder.addJoin('quorum-join', {
  requires: ['legal', 'finance', 'compliance'],
  mode: 2,
});
```

## Nested fork/join

The engine runs a **fixed-point loop** after each dispatch. It keeps re-evaluating all `JoinState`s until no new activations occur, so nested forks resolve correctly in a single tick without extra dispatches.

See [Fixed-point engine](/explanation/fixed-point-engine) for a detailed explanation.

## Validation at build time

`WorkflowBuilder.build()` verifies that every `ForkState` target and every `JoinState` required state is registered. Referencing an unknown ID throws immediately:

```
Error: ForkState "fork" references unregistered target "typo"
```
