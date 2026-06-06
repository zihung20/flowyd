import { createContext, useContext } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';

export interface RunnerContextValue {
  definition: WorkflowDefinition;
  snapshot: InstanceSnapshot;
  availableActions: string[];
  dispatch: (action: string, payload: unknown) => Promise<void>;
  /**
   * Rewind the run to a past version: rebuilds the instance and replays the
   * first `version` history entries, discarding everything after. Lets the user
   * branch off and dispatch different actions from an earlier point.
   */
  rewindTo: (version: number) => Promise<void>;
  /**
   * Move the scrub playhead for non-destructive time-travel. Pass a past version
   * to preview it read-only (the live run is untouched), or `null` to return to
   * the live head. `snapshot` reflects the playhead position.
   */
  scrubTo: (version: number | null) => void;
  /** Current scrub position — `null` when following the live head. */
  previewVersion: number | null;
  /** The live instance's current version (the rightmost point on the timeline). */
  headVersion: number;
  /** True while `snapshot` is a past version rather than the live head. */
  isPreviewing: boolean;
  lastError: string | null;
  reset: () => void;
}

export const RunnerContext = createContext<RunnerContextValue | null>(null);

/**
 * Access the nearest runner context.
 *
 * Throws rather than returning `null` so every consumer gets a typed value
 * without optional-chaining guards, and mis-use (rendering outside a provider)
 * surfaces immediately with an actionable error instead of a silent crash.
 *
 * @returns The current `RunnerContextValue`.
 * @throws {Error} When called outside a `RunnerContext.Provider`.
 */
export function useRunner(): RunnerContextValue {
  const ctx = useContext(RunnerContext);
  if (!ctx) {
    throw new Error('useRunner must be used inside a runner provider');
  }
  return ctx;
}
