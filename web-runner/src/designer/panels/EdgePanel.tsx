import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { SchemaEditor } from '../code/SchemaEditor';
import { GuardEditor } from '../code/GuardEditor';
import type { DesignerEdge, DesignerWorkflow } from '../types';

interface Props {
  edge: DesignerEdge;
  workflow: DesignerWorkflow;
  onChange: (updated: DesignerEdge) => void;
  onSchemaChange: (actionName: string, body: string) => void;
  onDelete: () => void;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-muted-foreground text-[10px]">{hint}</p>}
      {children}
    </div>
  );
}

export function EdgePanel({ edge, workflow, onChange, onSchemaChange, onDelete }: Props) {
  function set<K extends keyof DesignerEdge>(k: K, v: DesignerEdge[K]) {
    onChange({ ...edge, [k]: v });
  }

  const isAutoEdge = edge.kind === 'fork-target' || edge.kind === 'join-requires';
  const nodeIds = workflow.nodes.map((n) => n.id);
  const payloadZodBody = workflow.actionSchemas[edge.actionName] ?? '';
  const contextZodBody = workflow.contextSchemaBody;

  return (
    <div className="space-y-3 p-3">
      {/* Route header */}
      <div className="text-muted-foreground bg-muted/40 border-border flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs">
        <span className="text-foreground font-medium">{edge.fromNodeId}</span>
        <span className="opacity-50">→</span>
        <span className="text-foreground font-medium">{edge.toNodeId}</span>
      </div>

      {!isAutoEdge && (
        <>
          <Field
            label="Action name"
            hint="Convention: ALL_CAPS — must match a defineAction() call."
          >
            <Input
              value={edge.actionName}
              onChange={(e) => set('actionName', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              placeholder="SUBMIT"
            />
          </Field>

          <Field label="Payload schema" hint="Shared by all transitions using this action name.">
            <SchemaEditor
              id={`action-${edge.actionName}`}
              value={payloadZodBody}
              onChange={(body) => onSchemaChange(edge.actionName, body)}
            />
          </Field>

          <Field
            label="Guard (optional)"
            hint="ctx.payload, ctx.context, ctx.instanceState.isStateCompleted() are all typed."
          >
            <GuardEditor
              edgeId={edge.id}
              nodeIds={nodeIds}
              payloadZodBody={payloadZodBody}
              contextZodBody={contextZodBody}
              value={edge.guardBody}
              onChange={(body) => set('guardBody', body)}
            />
          </Field>
        </>
      )}

      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        Delete {isAutoEdge ? 'connection' : 'transition'}
      </Button>
    </div>
  );
}
