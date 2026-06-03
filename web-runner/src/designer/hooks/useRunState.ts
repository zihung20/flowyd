import { useCallback, useState } from 'react';
import { evaluateWorkflowCode } from '../code/codeEvaluator';
import { generateCode } from '../code/codeGenerator';
import type { WorkflowDefinition, DispatchResult, InstanceSnapshot } from 'flowyd';
import type { DesignerWorkflow } from '../types';

type AnyInstance = {
  dispatch(action: string, payload: unknown): Promise<DispatchResult>;
  getSnapshot(): InstanceSnapshot;
  injectGuard(name: string, fn: () => boolean | Promise<boolean>): unknown;
};

export type AnyWorkflow = {
  createInstance(id: string): AnyInstance;
  getDefinition(): WorkflowDefinition;
};

/**
 * Discriminated union describing the live-run panel state:
 * - `idle`    — no workflow compiled yet; run button is available.
 * - `error`   — last compile/eval attempt failed; `message` shown inline.
 * - `running` — a compiled workflow is active; dispatch panel is visible.
 */
export type RunState =
  | { mode: 'idle' }
  | { mode: 'error'; message: string }
  | { mode: 'running'; definition: WorkflowDefinition; workflow: AnyWorkflow };

export interface RunStateHandles {
  runState: RunState;
  setRunState: React.Dispatch<React.SetStateAction<RunState>>;
  handleRun(workflow: DesignerWorkflow): Promise<void>;
}

export function useRunState(): RunStateHandles {
  const [runState, setRunState] = useState<RunState>({ mode: 'idle' });

  /**
   * Compile the designer workflow to TypeScript, evaluate it, and transition
   * `runState` to `running` or `error`.
   *
   * Errors from code generation or evaluation are caught and surfaced as
   * `mode:'error'` rather than thrown — the run panel owns their display.
   *
   * @param workflow - Current designer workflow model to compile and run.
   */
  const handleRun = useCallback(async (workflow: DesignerWorkflow) => {
    const code = generateCode(workflow);
    const result = await evaluateWorkflowCode(code);
    if (!result.ok) {
      setRunState({ mode: 'error', message: result.error });
      return;
    }
    setRunState({
      mode: 'running',
      definition: result.definition,
      workflow: result.workflow as AnyWorkflow,
    });
  }, []);

  return { runState, setRunState, handleRun };
}
