import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

export type FlowNodeData = {
  label: string;
  kind: 'step' | 'fork' | 'join' | 'wait';
  isInitial: boolean;
  isTerminal: boolean;
  /** Secondary line below the label (designer uses it to show the state ID). */
  sublabel?: string;
  /** Runtime execution status — when set and not "idle", overrides kind colours. */
  status?: 'active' | 'waiting' | 'completed' | 'idle';
  /** Handle axis: vertical = top/bottom (designer), horizontal = left/right (runner). */
  handles?: 'vertical' | 'horizontal';
};

export type FlowNodeType = Node<FlowNodeData, 'flowNode'>;

// ── Kind colours (idle / no status) ──────────────────────────────────────────
const KIND_CONTAINER: Record<string, string> = {
  step: 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
  fork: 'border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-950/60',
  join: 'border-cyan-400 bg-cyan-50 dark:border-cyan-600 dark:bg-cyan-950/60',
  wait: 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/60',
};

const KIND_BADGE: Record<string, { cls: string; icon: string; text: string }> = {
  fork: { cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300', icon: '⑂', text: 'fork' },
  join: { cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300', icon: '⑁', text: 'join' },
  wait: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300', icon: '⏸', text: 'wait' },
};

// ── Status colours (override kind when not idle) ──────────────────────────────
const STATUS_CONTAINER: Record<string, string> = {
  active:    'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/60',
  waiting:   'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/60',
  completed: 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-950/60',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'text-blue-700 dark:text-blue-300',
  waiting:   'text-amber-700 dark:text-amber-300',
  completed: 'text-green-700 dark:text-green-300',
  idle:      'text-slate-400 dark:text-slate-500',
};

export function FlowNode({ data, selected }: NodeProps<FlowNodeType>) {
  const status = data.status;
  const hasStatusOverride = status !== undefined && status !== 'idle';
  const containerCls = hasStatusOverride
    ? (STATUS_CONTAINER[status] ?? KIND_CONTAINER[data.kind] ?? KIND_CONTAINER.step)
    : (KIND_CONTAINER[data.kind] ?? KIND_CONTAINER.step);

  const badge = KIND_BADGE[data.kind];
  const horizontal = data.handles === 'horizontal';

  const handleCls =
    '!border-slate-300 !bg-slate-400 dark:!border-slate-600 dark:!bg-slate-500';

  return (
    <div
      className={[
        'min-w-[130px] overflow-hidden rounded-lg border-2 shadow-sm dark:shadow-none',
        containerCls,
        selected ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : '',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        className={handleCls}
      />

      <div className="px-3 py-2.5 text-center">
        <p className="mx-auto max-w-[150px] truncate text-xs leading-tight font-semibold text-slate-900 dark:text-slate-100">
          {data.label}
        </p>

        {data.sublabel !== undefined && data.sublabel !== data.label && (
          <p className="mx-auto mt-0.5 max-w-[150px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {data.sublabel}
          </p>
        )}

        {status !== undefined && (
          <p className={`mt-0.5 text-[10px] capitalize ${STATUS_LABEL[status] ?? STATUS_LABEL.idle}`}>
            {status}
          </p>
        )}
      </div>

      {(badge !== undefined || data.isInitial || data.isTerminal) && (
        <div className="flex flex-wrap items-center justify-center gap-1 px-2 pb-2">
          {badge !== undefined && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${badge.cls}`}>
              {badge.icon} {badge.text}
            </span>
          )}
          {data.isInitial && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-700 dark:bg-green-900/60 dark:text-green-400">
              ▶ initial
            </span>
          )}
          {data.isTerminal && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-700 dark:bg-rose-900/60 dark:text-rose-400">
              ■ terminal
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        className={handleCls}
      />
    </div>
  );
}
