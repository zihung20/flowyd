import { createContext, useContext } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';

export interface RunnerContextValue {
  definition:       WorkflowDefinition;
  snapshot:         InstanceSnapshot;
  allSnapshots:     Map<string, InstanceSnapshot>;
  availableActions: string[];
  selectedId:       string;
  dispatch:         (action: string, payload: unknown) => Promise<void>;
  selectSection:    (id: string) => void;
  lastError:        string | null;
  reset:            () => void;
}

export const RunnerContext = createContext<RunnerContextValue | null>(null);

export function useRunner(): RunnerContextValue {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error('useRunner must be used inside a runner provider');
  return ctx;
}
