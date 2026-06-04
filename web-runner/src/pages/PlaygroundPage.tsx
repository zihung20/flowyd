import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';
import { CodeEditor } from '../designer/code/CodeEditor';
import { SingleRunner } from '../runner/SingleRunner';
import { evaluateWorkflowCode } from '../lib/evaluateWorkflowCode';
import type { EvalResult } from '../lib/evaluateWorkflowCode';

const STORAGE_KEY = 'flowyd-playground-code';

const STARTER = `import { createWorkflow } from 'flowyd';
import { z } from 'zod';

const workflow = createWorkflow({ name: 'my-workflow' })
  .defineAction('SUBMIT', z.object({ submittedBy: z.string() }))
  .defineAction('APPROVE', z.object({ approverId: z.string() }))
  .defineAction('REJECT', z.object({ reason: z.string() }))
  .addStep('draft', { label: 'Draft' })
  .addStep('review', { label: 'In Review' })
  .addStep('approved', { label: 'Approved' })
  .addStep('rejected', { label: 'Rejected' })
  .setInitial('draft')
  .setTerminal(['approved', 'rejected'])
  .addTransition({ from: 'draft', to: 'review', on: 'SUBMIT' })
  .addTransition({ from: 'review', to: 'approved', on: 'APPROVE' })
  .addTransition({ from: 'review', to: 'rejected', on: 'REJECT' })
  .build();`;

export default function PlaygroundPage() {
  const initialCode =
    (useLocation().state as { code?: string } | null)?.code ??
    localStorage.getItem(STORAGE_KEY) ??
    STARTER;

  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function evaluate(code: string) {
    const result = await evaluateWorkflowCode(code);
    setEvalResult(result);
    if (result.ok) {setRunKey((k) => k + 1);}
  }

  function handleChange(newCode: string) {
    localStorage.setItem(STORAGE_KEY, newCode);
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    debounceRef.current = setTimeout(() => evaluate(newCode), 600);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is after await, not synchronous
    evaluate(initialCode);
  }, [initialCode]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white font-sans">
      <SiteNav />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 flex-col border-r border-slate-200">
          <CodeEditor defaultValue={initialCode} onChange={handleChange} />
        </div>

        <div className="flex w-1/2 flex-col overflow-hidden">
          {evalResult === null && (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Evaluating…
            </div>
          )}
          {evalResult !== null && !evalResult.ok && (
            <div className="m-4 rounded-md bg-red-50 p-3 font-mono text-xs text-red-600">
              {evalResult.error}
            </div>
          )}
          {evalResult !== null && evalResult.ok && (
            <SingleRunner
              key={runKey}
              title={evalResult.definition.name}
              subtitle="Playground run"
              definition={evalResult.definition}
              makeInstance={() => evalResult.workflow.createInstance(`run-${Date.now()}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
