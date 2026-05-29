import { useCallback, useRef, useState } from 'react';
import type { DispatchResult, InstanceSnapshot, WorkflowDefinition } from 'flowyd';
import { MermaidExporter, JsonGraphExporter } from 'flowyd/visualization';
import { RunnerContext } from '../context';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { DynamicForm } from '../components/DynamicForm';
import { HistoryPanel } from '../components/HistoryPanel';

async function openInMermaidLive(diagram: string): Promise<void> {
  const json = JSON.stringify({ code: diagram, mermaid: { theme: 'default' } });
  const data = new TextEncoder().encode(json);
  const cs   = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (value) chunks.push(value);
    if (done) break;
  }
  const len        = chunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(len);
  let offset = 0;
  for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }
  const b64 = btoa(String.fromCharCode(...compressed));
  window.open(`https://mermaid.live/edit#pako:${b64}`, '_blank');
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
  const [copied,    setCopied]    = useState(false);

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
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => {
                  const diagram = MermaidExporter.export(definition, snapshot);
                  void navigator.clipboard.writeText(diagram).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Mermaid'}
              </button>
              <span className="text-slate-200">|</span>
              <button
                onClick={() => {
                  const diagram = MermaidExporter.export(definition, snapshot);
                  downloadBlob(`${definition.name}.mmd`, diagram, 'text/plain');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Download .mmd
              </button>
              <span className="text-slate-200">|</span>
              <button
                onClick={() => {
                  const graph = JsonGraphExporter.export(definition, snapshot);
                  downloadBlob(`${definition.name}.json`, JSON.stringify(graph, null, 2), 'application/json');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Download JSON
              </button>
              <span className="text-slate-200">|</span>
              <button
                onClick={() => {
                  const diagram = MermaidExporter.export(definition, snapshot);
                  void openInMermaidLive(diagram);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Mermaid Live ↗
              </button>
              <span className="text-slate-200">|</span>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Reset
              </button>
            </div>
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
