# Pause for an external process

`SubWorkflowState` lets a parent workflow pause and wait for a separately-driven external process — a third-party API, a background job, or a child `WorkflowInstance` — before continuing.


## How it works

When the engine enters a `SubWorkflowState`:

1. The state's status becomes `waiting` (not `active`).
2. The parent workflow is effectively paused — `dispatch` calls that require this state to be `active` will return `{ success: false, reason: 'no-active-source' }`.
3. Your service layer creates and drives the external process independently.
4. When the external process finishes, your service calls `inst.resolveSubWorkflow(stateId)`.
5. Status becomes `active` — normal transitions can now advance past it.

The engine has **no polling, no callbacks, no I/O**. The `subWorkflowName` string is purely documentary.


## Code

```ts
import { z } from 'zod';
import { WorkflowBuilder, StepState, SubWorkflowState } from 'logic-workflow';

const vendorOnboarding = new WorkflowBuilder('vendor-onboarding')
  .defineAction('SUBMIT',     z.object({ vendorId: z.string() }))
  .defineAction('KYC_PASSED', z.object({}))
  .defineAction('KYC_FAILED', z.object({ reason: z.string() }))

  .addState(new StepState('draft'))
  .addState(new SubWorkflowState('kyc-check', { subWorkflowName: 'vendor-kyc' }))
  .addState(new StepState('approved'))
  .addState(new StepState('rejected'))

  .setInitial('draft')
  .setTerminal(['approved', 'rejected'])
  .addTransition({ from: 'draft',     to: 'kyc-check', on: 'SUBMIT' })
  .addTransition({ from: 'kyc-check', to: 'approved',  on: 'KYC_PASSED' })
  .addTransition({ from: 'kyc-check', to: 'rejected',  on: 'KYC_FAILED' })
  .build();
```


## Service-layer pattern

Your service is responsible for orchestrating the external process and signalling the parent workflow when it completes:

```ts
// Called when the external KYC service posts a webhook
async function onKycComplete(
  parentInstanceId: string,
  passed: boolean,
  kycSnapshot: InstanceSnapshot,  // optional — stored for audit
) {
  // 1. Load the parent instance
  const row = await db.workflowSnapshots.findUnique({ where: { id: parentInstanceId } });
  const inst = vendorOnboarding.restoreInstance(row.data);

  // 2. Promote waiting → active, optionally attaching the external snapshot for audit
  inst.resolveSubWorkflow('kyc-check', kycSnapshot);

  // 3. Dispatch the appropriate transition
  const action = passed ? 'KYC_PASSED' : 'KYC_FAILED';
  const payload = passed ? {} : { reason: 'Failed identity check' };
  const result = await inst.dispatch(action, payload);

  // 4. Persist
  if (result.success) {
    await db.workflowSnapshots.update({
      where: { id: parentInstanceId },
      data:  { snapshot: inst.getSnapshot() },
    });
  }
}
```


## `resolveSubWorkflow` signature

```ts
inst.resolveSubWorkflow(
  stateId: string,
  externalSnapshot?: InstanceSnapshot,
): void
```

- Promotes the named state from `waiting` → `active`.
- Increments `snapshot.version`.
- Appends a `__resolve_sub_workflow:<stateId>` entry to the audit history.
- Optionally stores `externalSnapshot` in the history for auditability.

**Throws** if:
- `stateId` is not a `SubWorkflowState`.
- The state is not currently `waiting`.


## Querying the paused position

```ts
inst.getCurrentStates()
// Returns IDs of all states with status 'active' OR 'waiting'.
// 'waiting' states are included because they represent where the workflow is.
```

Use `inst.getStateStatus('kyc-check')` to distinguish `active` from `waiting`.
