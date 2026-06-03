import { useEffect } from 'react';
import { CodeEditor } from './CodeEditor';
import { generateCode } from './codeGenerator';
import type { DesignerWorkflow } from '../types';

interface Props {
  workflow: DesignerWorkflow;
  onClose(): void;
}

export function ShowCodeModal({ workflow, onClose }: Props) {
  const code = generateCode(workflow);

  function handleCopy() {
    navigator.clipboard.writeText(code);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center border-b border-[#3c3c3c] bg-[#252526] px-4">
          <span className="font-mono text-[12px] text-slate-400">workflow.ts</span>
          <span className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-600">TypeScript · flowyd</span>
            <button
              onClick={handleCopy}
              className="text-[11px] text-slate-400 transition-colors hover:text-slate-200"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="text-sm leading-none text-slate-400 transition-colors hover:text-slate-200"
              title="Close (Esc)"
            >
              ✕
            </button>
          </span>
        </div>

        {/* Editor */}
        <div className="min-h-0 flex-1 bg-[#1e1e1e]">
          <CodeEditor defaultValue={code} />
        </div>
      </div>
    </div>
  );
}
