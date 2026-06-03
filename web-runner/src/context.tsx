import { createContext, useContext } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';

export interface RunnerContextValue {
  definition: WorkflowDefinition;
  snapshot: InstanceSnapshot;
  availableActions: string[];
  dispatch: (action: string, payload: unknown) => Promise<void>;
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
  if (!ctx) throw new Error('useRunner must be used inside a runner provider');
  return ctx;
}
