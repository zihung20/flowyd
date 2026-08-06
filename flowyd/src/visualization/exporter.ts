import type { WorkflowDefinition, InstanceSnapshot } from '../types/index.js';

/**
 * Common contract for all workflow visualisation exporters. An exporter is a pure,
 * stateless transformer — it must not execute workflows, mutate definitions, or hold
 * runtime state. The optional `snapshot` lets exporters overlay live instance state
 * (e.g. highlighting active or completed states).
 */
export interface IExporter<TResult> {
  export(definition: WorkflowDefinition, snapshot?: InstanceSnapshot): TResult;
}
