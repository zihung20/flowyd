import { Square, GitFork, GitMerge, Pause } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NodeKind } from '../types';

interface Props {
  onAddNode: (kind: NodeKind) => void;
}

const BUTTONS: { kind: NodeKind; label: string; icon: LucideIcon; title: string; color: string }[] =
  [
    {
      kind: 'step',
      label: 'Step',
      icon: Square,
      title: 'Add a step state (waits for an action)',
      color: 'border-border text-foreground hover:bg-accent hover:text-accent-foreground',
    },
    {
      kind: 'fork',
      label: 'Fork',
      icon: GitFork,
      title: 'Add a fork — splits into parallel branches',
      color:
        'border-violet-400 text-violet-600 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/40',
    },
    {
      kind: 'join',
      label: 'Join',
      icon: GitMerge,
      title: 'Add a join — synchronises parallel branches',
      color:
        'border-cyan-400 text-cyan-600 hover:bg-cyan-100 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-900/40',
    },
    {
      kind: 'wait',
      label: 'Wait',
      icon: Pause,
      title: 'Add a wait state — pauses for an external signal',
      color:
        'border-amber-400 text-amber-600 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/40',
    },
  ];

export function DesignerToolbar({ onAddNode }: Props) {
  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-[10px] select-none">add:</span>
      {BUTTONS.map(({ kind, label, icon: Icon, title, color }) => (
        <button
          key={kind}
          title={title}
          onClick={() => onAddNode(kind)}
          className={`bg-background/80 flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium backdrop-blur transition-colors ${color}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
      <span className="text-muted-foreground/70 ml-3 hidden text-[10px] select-none sm:block">
        drag to connect · backspace to delete
      </span>
    </div>
  );
}
