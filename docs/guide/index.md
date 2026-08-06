# Introduction

`flowyd` is a TypeScript library for building typed, auditable workflow state machines. You describe a process as a graph of states and transitions, the engine executes it, and you persist the result as plain JSON.

It is designed for Standard Operating Procedures (SOPs) — real-world processes where the sequence matters, roles matter, and every step must be auditable.

**[Try it in the playground →](https://zihung20.github.io/flowyd/playground/)**  ·  **[Install →](./installation)**

## The selling point: compile-time safety on everything

Most workflow libraries take strings everywhere — so a typo in a state ID becomes silent dead code, a wrong action name fails at runtime, and a mismatched payload blows up in production. `flowyd` catches all three at compile time.

### State IDs accumulate as you register them

Each `addStep` / `addFork` / `addJoin` / `addWait` call adds its ID to the `TStates` union. Everything downstream — `setInitial`, `setTerminal`, `addTransition`, fork `targets`, join `requires` — is then constrained to exactly that set.

```ts
const wf = createWorkflow({ name: 'approval' })
  .addStep('draft')
  .addStep('review')
  .addStep('approved')
  .addStep('rejected')
  .setInitial('drft'); // TS2345: Argument of type '"drft"' is not assignable
// to parameter of type '"draft" | "review" | "approved" | "rejected"'
```

IDEs autocomplete state IDs throughout the chain.

### Action names are locked at dispatch

`defineAction` registers an action and binds a Zod schema to its payload. `dispatch` only accepts names you defined.

```ts
const wf = createWorkflow({ name: 'approval' })
  .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string() }))
  // ...
  .build();

const inst = wf.createInstance('po-001');

await inst.dispatch('APPROV', { approverId: 'x' });
//                  ^^^^^^
// TS2345: Argument of type '"APPROV"' is not assignable to
// parameter of type '"SUBMIT" | "APPROVE"'
```

### Payload shapes are checked twice — at compile time and at runtime

The payload type comes from the Zod schema. TypeScript rejects the wrong shape; if one slips through at runtime (an untyped API boundary), Zod throws before any state changes.

```ts
await inst.dispatch('APPROVE', { approver: 'x' });
//                               ^^^^^^^^
// TS2345: Object literal may only specify known properties,
// and 'approver' does not exist in type '{ approverId: string }'
```

### Fork targets and join requires are autocompleted

`addFork` and `addJoin` constrain `targets`/`requires` to states already in `TStates` — register branch states before the fork that targets them:

```ts
createWorkflow({ name: 'proc' })
  .addStep('start')
  .addStep('a')
  .addStep('b')
  .addFork('fork', { targets: ['a', 'b'] }) // autocompletes to accumulated TStates
  .addJoin('join', { requires: ['a', 'b'], mode: 'all' }) // same
  // But a typo at the point of registration:
  .addFork('fork2', { targets: ['a', 'missspelled'] });
//                                ^^^^^^^^^^^^ compile error — 'missspelled' not in TStates
```

## What it is not

- **Not a visual designer.** You define workflows in TypeScript code. The companion [web-runner](../dev/contributing#web-runner) provides a browser UI, but code is the source of truth.
- **Not an orchestration server.** There is no hosted runtime, no queue, no scheduler. `flowyd` is a pure library — you provide the storage, the transport, and the trigger mechanism.
- **Not opinionated about storage.** Snapshots are plain JSON objects. Write them to Postgres, Redis, a file, or in memory — the library does not care.

## Next steps

- [Core Concepts](./concepts) — understand states, transitions, guards, and snapshots
- [Installation](./installation) — get up and running in five minutes
- [Examples](../examples/) — see complete, runnable workflows
