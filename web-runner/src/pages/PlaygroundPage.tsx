import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';
import { CodeEditor } from '../designer/code/CodeEditor';
import { SingleRunner } from '../runner/SingleRunner';
import { evaluateWorkflowCode } from '../lib/evaluateWorkflowCode';
import type { EvalResult } from '../lib/evaluateWorkflowCode';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import predepartureSource from '../workflows/predeparture.ts?raw';

const STORAGE_KEY = 'flowyd-playground-code';

// Rename the named export to `workflow` and append an instance with sample context.
const STARTER =
  predepartureSource.replace(/\bpredepartureWorkflow\b/g, 'workflow') +
  "\nconst instance = workflow.createInstance('run-1', { operatorId: 'ENG-001', depot: 'Central' });";

type PanelState = 'split' | 'code-only' | 'runner-only';

const LAYOUT_TABS: { state: PanelState; label: string }[] = [
  { state: 'code-only', label: 'Code' },
  { state: 'split', label: 'Split' },
  { state: 'runner-only', label: 'Preview' },
];

export default function PlaygroundPage() {
  const initialCode =
    (useLocation().state as { code?: string } | null)?.code ??
    localStorage.getItem(STORAGE_KEY) ??
    STARTER;

  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [panelState, setPanelState] = useState<PanelState>('split');
  const [splitPct, setSplitPct] = useState(38);
  const containerRef = useRef<HTMLDivElement>(null);

  async function evaluate(code: string) {
    const result = await evaluateWorkflowCode(code);
    setEvalResult(result);
    if (result.ok) {
      setRunKey((k) => k + 1);
    }
  }

  function handleChange(newCode: string) {
    localStorage.setItem(STORAGE_KEY, newCode);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => evaluate(newCode), 600);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is after await, not synchronous
    evaluate(initialCode);
  }, [initialCode]);

  function startDrag(e: React.MouseEvent) {
    if (panelState !== 'split') {
      return;
    }
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      const c = containerRef.current;
      if (!c) {
        return;
      }
      const rect = c.getBoundingClientRect();
      const raw = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(85, Math.max(15, raw)));
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const showCode = panelState !== 'runner-only';
  const showRunner = panelState !== 'code-only';

  const layoutToggle = (
    <ToggleGroup
      type="single"
      value={panelState}
      onValueChange={(v) => {
        if (v) {
          setPanelState(v as PanelState);
        }
      }}
      variant="outline"
      size="sm"
    >
      {LAYOUT_TABS.map(({ state, label }) => (
        <ToggleGroupItem key={state} value={state}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden font-sans">
      <SiteNav right={layoutToggle} />

      <div ref={containerRef} className="flex min-h-0 flex-1">
        {/* Code panel */}
        {showCode && (
          <div
            className="flex flex-col overflow-hidden"
            style={
              showRunner
                ? { flexBasis: `${splitPct}%`, flexShrink: 0, flexGrow: 0 }
                : { flex: '1 1 0%' }
            }
          >
            <CodeEditor defaultValue={initialCode} onChange={handleChange} />
          </div>
        )}

        {/* Drag handle — only visible in split mode */}
        {showCode && showRunner && (
          <div
            className="group bg-border relative z-10 w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-blue-400/50"
            onMouseDown={startDrag}
          >
            <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-[3px]">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="bg-muted-foreground/40 block h-[3px] w-[3px] rounded-full group-hover:bg-blue-500/70"
                />
              ))}
            </div>
          </div>
        )}

        {/* Runner panel */}
        {showRunner && (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {evalResult === null && (
              <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                Evaluating…
              </div>
            )}
            {evalResult !== null && !evalResult.ok && (
              <div className="bg-destructive/10 border-destructive/20 text-destructive m-4 rounded-md border p-3 font-mono text-xs">
                {evalResult.error}
              </div>
            )}
            {evalResult !== null && evalResult.ok && (
              <SingleRunner
                key={runKey}
                title={evalResult.definition.name}
                subtitle="Playground run"
                definition={evalResult.definition}
                makeInstance={evalResult.makeInstance}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
