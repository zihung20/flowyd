import { useCallback, useRef, useState } from 'react';
import type { DispatchResult, InstanceSnapshot, WorkflowDefinition } from 'logic-workflow';
import { RunnerContext } from '../context';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { DynamicForm } from '../components/DynamicForm';
import { HistoryPanel } from '../components/HistoryPanel';

type AnyInstance = {
  dispatch(action: string, payload: unknown): Promise<DispatchResult>;
  getSnapshot(): InstanceSnapshot;
  injectGuard(name: string, fn: () => boolean | Promise<boolean>): unknown;
};

interface Props {
  title:       string;
  subtitle:    string;
  definition:  WorkflowDefinition;
  makeInstance: () => AnyInstance;
}

export function SingleRunner({ title, subtitle, definition, makeInstance }: Props) {
  const instRef = useRef<AnyInstance>(makeInstance());
  const [snapshot,  setSnapshot]  = useState<InstanceSnapshot>(() => instRef.current.getSnapshot());
  const [lastError, setLastError] = useState<string | null>(null);

  const availableActions = definition.transitions
    .filter((t) => snapshot.stateStatuses[t.from] === 'active')
    .map((t) => t.on)
    .filter((v, i, a) => a.indexOf(v) === i);

  const dispatch = useCallback(async (action: string, payload: unknown) => {
    const result = await instRef.current.dispatch(action, payload);
    if (result.success) {
      setSnapshot(instRef.current.getSnapshot());
      setLastError(null);
    } else {
      setLastError(result.reason);
    }
  }, []);

  const reset = useCallback(() => {
    instRef.current = makeInstance();
    setSnapshot(instRef.current.getSnapshot());
    setLastError(null);
  }, [makeInstance]);

  const noopSelect = useCallback((_id: string) => {}, []);
  const emptyMap   = new Map<string, InstanceSnapshot>();

  return (
    <RunnerContext.Provider value={{
      definition,
      snapshot,
      allSnapshots:     emptyMap,
      availableActions,
      selectedId:       snapshot.instanceId,
      dispatch,
      selectSection:    noopSelect,
      lastError,
      reset,
    }}>
      <div className="flex h-full overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3">
            <span className="text-sm font-bold text-slate-800">{title}</span>
            <span className="text-xs text-slate-400">{subtitle}</span>
            <span className="ml-auto text-xs text-slate-400">
              v{snapshot.version} · {snapshot.isTerminal ? 'complete' : 'in progress'}
            </span>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-2">
              Reset
            </button>
          </div>
          <WorkflowGraph />
        </div>

        <div className="w-72 shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
          <DynamicForm />
          <HistoryPanel />
        </div>
      </div>
    </RunnerContext.Provider>
  );
}
