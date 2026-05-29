import { useCallback, useRef, useState } from 'react';
import type { DispatchResult, InstanceSnapshot } from 'flowyd';
import { StateStatus } from 'flowyd';
import { RunnerContext } from '../context';
import {
  ewcrWorkflow, makeAllInstances, SECTION_IDS,
} from '../workflows/ewcr';
import type { EwcrInstance } from '../workflows/ewcr';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { DynamicForm } from '../components/DynamicForm';
import { HistoryPanel } from '../components/HistoryPanel';
import { SectionGrid } from '../components/SectionGrid';

function buildAllSnapshots(instances: Map<string, EwcrInstance>): Map<string, InstanceSnapshot> {
  const map = new Map<string, InstanceSnapshot>();
  for (const [id, inst] of instances) {
    map.set(id, (inst as unknown as { getSnapshot(): InstanceSnapshot }).getSnapshot());
  }
  return map;
}

const definition = ewcrWorkflow.getDefinition();

function getAvailableActions(snapshot: InstanceSnapshot): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of definition.transitions) {
    if (snapshot.stateStatuses[t.from] === 'active' && !seen.has(t.on)) {
      seen.add(t.on);
      out.push(t.on);
    }
  }
  return out;
}

export function EwcrRunner() {
  const instancesRef = useRef<Map<string, EwcrInstance>>(makeAllInstances());

  const [selectedId,   setSelectedId]   = useState<string>(SECTION_IDS[0] ?? 'S01');
  const [allSnapshots, setAllSnapshots] = useState<Map<string, InstanceSnapshot>>(
    () => buildAllSnapshots(instancesRef.current),
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const selectedSnap: InstanceSnapshot = allSnapshots.get(selectedId) ?? {
    instanceId: selectedId, workflowName: 'ewcr-section', version: 0,
    stateStatuses: { idle: StateStatus.Active } as Record<string, StateStatus>,
    isTerminal: false, history: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const availableActions = getAvailableActions(selectedSnap);

  const dispatch = useCallback(async (action: string, payload: unknown) => {
    const inst = instancesRef.current.get(selectedId);
    if (!inst) return;
    type U = { dispatch(a: string, p: unknown): Promise<DispatchResult> };
    const result = await (inst as unknown as U).dispatch(action, payload);
    if (result.success) {
      setAllSnapshots(buildAllSnapshots(instancesRef.current));
      setLastError(null);
    } else {
      setLastError(result.reason);
    }
  }, [selectedId]);

  const selectSection = useCallback((id: string) => {
    setSelectedId(id);
    setLastError(null);
  }, []);

  const reset = useCallback(() => {
    instancesRef.current = makeAllInstances();
    setAllSnapshots(buildAllSnapshots(instancesRef.current));
    setSelectedId(SECTION_IDS[0] ?? 'S01');
    setLastError(null);
  }, []);

  return (
    <RunnerContext.Provider value={{
      definition,
      snapshot:         selectedSnap,
      allSnapshots,
      availableActions,
      selectedId,
      dispatch,
      selectSection,
      lastError,
      reset,
    }}>
      <div className="flex h-full overflow-hidden">
        <SectionGrid />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3">
            <span className="text-sm font-bold text-slate-800">Section {selectedId}</span>
            <span className="text-xs text-slate-400">
              {selectedSnap.isTerminal ? 'complete' : `v${selectedSnap.version} · in progress`}
            </span>
            <button onClick={reset} className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors">
              Reset All
            </button>
          </div>
          <WorkflowGraph />
        </div>

        <div className="w-72 shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <p className="text-xs font-semibold text-slate-800">EWCR · {selectedId}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Electrical Work Clearance Request</p>
          </div>
          <DynamicForm />
          <HistoryPanel />
        </div>
      </div>
    </RunnerContext.Provider>
  );
}
