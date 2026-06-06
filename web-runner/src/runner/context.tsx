import { createContext, useContext } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';

export interface RunnerContextValue {
  definition: WorkflowDefinition;
  snapshot: InstanceSnapshot;
  availableActions: string[];
  dispatch: (action: string, payload: unknown) => Promise<void>;
  /** Destructively rewind the run to a past version, discarding later history. */
  rewindTo: (version: number) => Promise<void>;
  /** Move the read-only scrub playhead; `null` returns to the live head. */
  scrubTo: (version: number | null) => void;
  /** Current scrub position — `null` when following the live head. */
  previewVersion: number | null;
  /** The live instance's current version (rightmost point on the timeline). */
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
