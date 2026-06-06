import { useCallback, useMemo, useRef, useState } from 'react';
import type { DispatchResult, InstanceSnapshot, WorkflowDefinition } from 'flowyd';
import { RunnerContext } from './context';
import { WorkflowGraph } from './components/WorkflowGraph';
import { DynamicForm } from './components/DynamicForm';
import { HistoryPanel } from './components/HistoryPanel';
import { TimelineBar } from './components/TimelineBar';
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
  /** Pure read — returns a detached snapshot for any past version without mutating the instance. */
  rewind(version: number): InstanceSnapshot;
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
  const [liveSnapshot, setLiveSnapshot] = useState<InstanceSnapshot>(() =>
    instRef.current.getSnapshot(),
  );
  // `null` = following the live head; a number = scrubbed to that past version.
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const headVersion = liveSnapshot.version;
  const isPreviewing = previewVersion !== null && previewVersion < headVersion;

  // The snapshot the whole UI renders from. When scrubbing, this is a pure
  // `rewind()` read of a past version — the live instance is never touched.
  const snapshot = useMemo<InstanceSnapshot>(() => {
    if (previewVersion === null || previewVersion >= liveSnapshot.version) {
      return liveSnapshot;
    }
    // eslint-disable-next-line react-hooks/refs -- rewind() is a pure read; memo is keyed on previewVersion + liveSnapshot, which move with the instance
    return instRef.current.rewind(previewVersion);
  }, [previewVersion, liveSnapshot]);

  const availableActions = definition.transitions
    .filter((t) => snapshot.stateStatuses[t.from] === 'active')
    .map((t) => t.on)
    .filter((v, i, a) => a.indexOf(v) === i);

  // `rewind()` is a pure read, so to actually move the live run back we rebuild
  // from the factory (which re-injects guards) and replay the recorded
  // (action, payload) pairs up to `version`. The runner has no resolveWait UI,
  // so history only ever holds real dispatched actions. Returns a divergence
  // message if a replayed dispatch is unexpectedly blocked.
  const replayInto = useCallback(
    async (version: number): Promise<string | null> => {
      const history = instRef.current.getSnapshot().history.slice(0, version);
      const fresh = makeInstance();
      let divergedAt: string | null = null;
      for (const entry of history) {
        // Sequential, ordered replay — each dispatch depends on the prior state.
        const result = await fresh.dispatch(entry.action, entry.payload);
        if (!result.success) {
          divergedAt = `Rewind diverged at ${entry.action}: ${result.reason}`;
          break;
        }
      }
      instRef.current = fresh;
      return divergedAt;
    },
    [makeInstance],
  );

  // Non-destructive: move the scrub playhead. `null` (or the head) returns to live.
  const scrubTo = useCallback(
    (version: number | null) => {
      setPreviewVersion(version === null || version >= headVersion ? null : Math.max(0, version));
    },
    [headVersion],
  );

  const dispatch = useCallback(
    async (action: string, payload: unknown) => {
      // Dispatching while scrubbed into the past commits a branch from there,
      // discarding the versions after the playhead.
      if (previewVersion !== null && previewVersion < headVersion) {
        const divergedAt = await replayInto(previewVersion);
        setPreviewVersion(null);
        if (divergedAt !== null) {
          setLiveSnapshot(instRef.current.getSnapshot());
          setLastError(divergedAt);
          return;
        }
      }
      try {
        const result = await instRef.current.dispatch(action, payload);
        if (result.success) {
          setLiveSnapshot(instRef.current.getSnapshot());
          setLastError(null);
        } else {
          setLastError(result.reason);
        }
      } catch (err) {
        setLastError(formatDispatchError(err));
      }
    },
    [previewVersion, headVersion, replayInto],
  );

  // Destructive: rewind the live run to `version` without dispatching.
  const rewindTo = useCallback(
    async (version: number) => {
      const divergedAt = await replayInto(version);
      setPreviewVersion(null);
      setLiveSnapshot(instRef.current.getSnapshot());
      setLastError(divergedAt);
    },
    [replayInto],
  );

  const reset = useCallback(() => {
    instRef.current = makeInstance();
    setPreviewVersion(null);
    setLiveSnapshot(instRef.current.getSnapshot());
    setLastError(null);
  }, [makeInstance]);

  return (
    <RunnerContext.Provider
      value={{
        definition,
        snapshot,
        availableActions,
        dispatch,
        rewindTo,
        scrubTo,
        previewVersion,
        headVersion,
        isPreviewing,
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
          {headVersion > 0 && <TimelineBar />}
        </div>

        <div className="border-border bg-background flex w-72 shrink-0 flex-col overflow-hidden border-l">
          <DynamicForm />
          <HistoryPanel />
        </div>
      </div>
    </RunnerContext.Provider>
  );
}
