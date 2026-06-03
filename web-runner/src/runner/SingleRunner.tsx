import { useCallback, useRef, useState } from 'react';
import type { DispatchResult, InstanceSnapshot, WorkflowDefinition } from 'flowyd';
import { RunnerContext } from './context';
import { WorkflowGraph } from './components/WorkflowGraph';
import { DynamicForm } from './components/DynamicForm';
import { HistoryPanel } from './components/HistoryPanel';
import { RunnerToolbar } from './RunnerToolbar';

type ZodIssue = { path: (string | number)[]; message: string };

function isZodError(err: unknown): err is Error & { issues: ZodIssue[] } {
  return (
    err instanceof Error &&
    'issues' in err &&
    Array.isArray((err as Record<string, unknown>).issues)
  );
}

function formatDispatchError(err: unknown): string {
  if (isZodError(err)) {
    return err.issues
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ` : '') + issue.message)
      .join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}

type AnyInstance = {
  dispatch(action: string, payload: unknown): Promise<DispatchResult>;
  getSnapshot(): InstanceSnapshot;
  injectGuard(name: string, fn: () => boolean | Promise<boolean>): unknown;
};

interface Props {
  title: string;
  subtitle: string;
  definition: WorkflowDefinition;
  makeInstance: () => AnyInstance;
}

/**
 * Self-contained workflow runner that owns one `WorkflowInstance`.
 *
 * The instance is held in a `ref` (not state) so that dispatching actions
 * does not trigger an extra render cycle — only the resulting snapshot update
 * causes a re-render. `makeInstance` is a factory prop so callers can inject
 * guards or custom instance IDs without this component knowing about them.
 *
 * `availableActions` derives from `definition.transitions` filtered to those
 * whose `from` state is currently `active`, de-duplicated so each action name
 * appears once regardless of how many transitions carry it.
 */
export function SingleRunner({ title, subtitle, definition, makeInstance }: Props) {
  const instRef = useRef<AnyInstance>(makeInstance());
  // eslint-disable-next-line react-hooks/refs -- instRef is guaranteed initialized by useRef above; lazy initializer runs once
  const [snapshot, setSnapshot] = useState<InstanceSnapshot>(() => instRef.current.getSnapshot());
  const [lastError, setLastError] = useState<string | null>(null);

  const availableActions = definition.transitions
    .filter((t) => snapshot.stateStatuses[t.from] === 'active')
    .map((t) => t.on)
    .filter((v, i, a) => a.indexOf(v) === i);

  const dispatch = useCallback(async (action: string, payload: unknown) => {
    try {
      const result = await instRef.current.dispatch(action, payload);
      if (result.success) {
        setSnapshot(instRef.current.getSnapshot());
        setLastError(null);
      } else {
        setLastError(result.reason);
      }
    } catch (err) {
      setLastError(formatDispatchError(err));
    }
  }, []);

  const reset = useCallback(() => {
    instRef.current = makeInstance();
    setSnapshot(instRef.current.getSnapshot());
    setLastError(null);
  }, [makeInstance]);

  return (
    <RunnerContext.Provider
      value={{
        definition,
        snapshot,
        availableActions,
        dispatch,
        lastError,
        reset,
      }}
    >
      <div className="flex h-full overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <RunnerToolbar
            title={title}
            subtitle={subtitle}
            definition={definition}
            snapshot={snapshot}
            onReset={reset}
          />
          <WorkflowGraph />
        </div>

        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
          <DynamicForm />
          <HistoryPanel />
        </div>
      </div>
    </RunnerContext.Provider>
  );
}
