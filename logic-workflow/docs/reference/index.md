# Reference

The reference section is **information-oriented**. Every exported API is documented with its exact signature, parameters, return values, and error conditions. Use it when you need to look something up.


## Contents

| Page | Covers |
|------|--------|
| [WorkflowBuilder](./workflow-builder) | Fluent builder — `defineAction`, `addState`, `setInitial`, `setTerminal`, `addTransition`, `build` |
| [WorkflowInstance](./workflow-instance) | Runtime instance — `dispatch`, `canExecute`, `getSnapshot`, `restoreInstance`, `resolveSubWorkflow`, guard injection, state queries |
| [State Types](./state-types) | `StepState`, `ForkState`, `JoinState`, `SubWorkflowState` — constructors and properties |
| [Guards](./guards) | `Guard` factory namespace — all built-in guard constructors and the `IGuard` interface |
| [DispatchResult](./dispatch-result) | `TransitionSuccess` and `TransitionBlocked` discriminated union |
| [Visualization](./visualization) | `MermaidExporter`, `JsonGraphExporter`, `JsonGraph`, `JsonGraphNode`, `JsonGraphEdge` |
