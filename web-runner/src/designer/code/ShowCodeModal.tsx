import { CodeEditor } from './CodeEditor';
import { generateCode } from './codeGenerator';
import type { DesignerWorkflow } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  workflow: DesignerWorkflow;
  onClose(): void;
}

export function ShowCodeModal({ workflow, onClose }: Props) {
  const code = generateCode(workflow);

  function handleCopy() {
    navigator.clipboard.writeText(code);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <DialogContent
        className="flex h-[80vh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-4 py-2.5">
          <DialogTitle className="font-mono text-[12px] font-normal text-slate-400">
            workflow.ts
          </DialogTitle>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-600">TypeScript · flowyd</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 px-2 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-transparent"
            >
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-200 hover:bg-transparent"
              title="Close (Esc)"
            >
              ✕
            </Button>
          </div>
        </DialogHeader>

        {/* Editor */}
        <div className="min-h-0 flex-1 bg-[#1e1e1e]">
          <CodeEditor defaultValue={code} readOnly={true} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
