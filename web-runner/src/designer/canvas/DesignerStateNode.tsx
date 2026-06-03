import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { DesignerNode, NodeKind } from '../types';

const KIND_STYLES: Record<
  NodeKind,
  { border: string; bg: string; badge: string; badgeText: string; icon: string }
> = {
  step: { border: '#475569', bg: '#1e293b', badge: '', badgeText: '', icon: '' },
  fork: {
    border: '#7c3aed',
    bg: '#2e1065',
    badge: 'bg-violet-900/60 text-violet-300',
    badgeText: 'fork',
    icon: '⑂',
  },
  join: {
    border: '#0e7490',
    bg: '#083344',
    badge: 'bg-cyan-900/60 text-cyan-300',
    badgeText: 'join',
    icon: '⑁',
  },
  wait: {
    border: '#92400e',
    bg: '#1c1917',
    badge: 'bg-amber-900/60 text-amber-300',
    badgeText: 'wait',
    icon: '⏸',
  },
};

export function DesignerStateNode({ data, selected }: NodeProps) {
  // ReactFlow boundary cast: this node type always carries DesignerNode data
  const node = data as unknown as DesignerNode;
  const s = KIND_STYLES[node.kind] ?? KIND_STYLES.step;

  return (
    <div
      style={{
        borderColor: selected ? '#3b82f6' : s.border,
        backgroundColor: s.bg,
        boxShadow: selected
          ? `0 0 0 2px #3b82f6, 0 4px 12px rgba(0,0,0,0.5)`
          : '0 2px 8px rgba(0,0,0,0.4)',
      }}
      className="min-w-[130px] overflow-hidden rounded-lg border-2 transition-shadow"
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#475569', width: 8, height: 8 }}
      />

      <div className="px-3 py-2.5 text-center">
        <p className="mx-auto max-w-[150px] truncate text-xs leading-tight font-semibold text-slate-100">
          {node.label || node.id}
        </p>
        {node.id !== node.label && (
          <p className="mx-auto mt-0.5 max-w-[150px] truncate font-mono text-[10px] text-slate-500">
            {node.id}
          </p>
        )}
      </div>

      {(node.kind !== 'step' || node.isInitial || node.isTerminal) && (
        <div className="flex flex-wrap items-center justify-center gap-1 px-2 pb-2">
          {node.kind !== 'step' && s.badge && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.badge}`}>
              {s.icon} {s.badgeText}
            </span>
          )}
          {node.isInitial && (
            <span className="rounded bg-green-900/60 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
              ▶ initial
            </span>
          )}
          {node.isTerminal && (
            <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-[9px] font-medium text-rose-400">
              ■ terminal
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#475569', width: 8, height: 8 }}
      />
    </div>
  );
}
