# Scenarios

Task-based guides for common patterns. Each page answers "I want to…" directly with the minimal code needed.

| I want to…                                           | Guide                                          |
| ---------------------------------------------------- | ---------------------------------------------- |
| Define states and wire transitions in sequence       | [Define a sequential flow](./sequential-flow)  |
| Run multiple steps at the same time                  | [Run steps in parallel](./parallel-branches)   |
| Escalate or auto-cancel a step after a delay         | [Add deadlines and escalation](./timeouts)     |
| Pause the workflow until an external system responds | [Wait for an external signal](./external-wait) |
| Run a side effect when a state is entered or left    | [Run side effects on enter/exit](./hooks)      |
| Block a transition unless a business rule passes     | [Add guards to transitions](./guards)          |
| Persist a workflow instance and resume it later      | [Save and restore state](./persistence)        |

For complete runnable examples that combine multiple patterns, see [Examples](../examples/).
