import { useState } from 'react';
import type { HistoryEntry } from 'flowyd';
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { useRunner } from '../context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

/** True when an entry carries a payload worth showing (not empty / not nullish). */
function hasPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) {
    return false;
  }
  if (typeof payload === 'object') {
    return Object.keys(payload as object).length > 0;
  }
  return true;
}

interface RowProps {
  entry: HistoryEntry;
  version: number;
  /** The current (head) version — the head row cannot be rewound to. */
  isHead: boolean;
}

function HistoryRow({ entry, version, isHead }: RowProps) {
  const { rewindTo } = useRunner();
  const [expanded, setExpanded] = useState(false);
  const showPayload = hasPayload(entry.payload);

  return (
    <li className="group px-4 py-2 text-xs">
      <div className="flex items-baseline gap-1.5">
        {showPayload ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground/60 hover:text-foreground -ml-1 shrink-0 self-center"
            title={expanded ? 'Hide payload' : 'Show payload'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-2 shrink-0" />
        )}

        <span className="text-foreground font-semibold">{entry.action}</span>

        <span className="text-muted-foreground/50 ml-auto shrink-0 text-[10px]">v{version}</span>

        {!isHead && (
          <button
            type="button"
            onClick={() => void rewindTo(version)}
            className="text-muted-foreground/50 hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            title={`Rewind run to v${version}`}
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {entry.enteredStates.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
          {entry.enteredStates.map((s) => (
            <Badge key={s} variant="green" className="px-1.5 py-0 text-[10px]">
              +{s}
            </Badge>
          ))}
        </div>
      )}

      {entry.exitedStates.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-3.5">
          {entry.exitedStates.map((s) => (
            <Badge key={s} variant="secondary" className="px-1.5 py-0 text-[10px]">
              −{s}
            </Badge>
          ))}
        </div>
      )}

      {showPayload && expanded && (
        <pre className="bg-muted/60 text-muted-foreground mt-1.5 ml-3.5 overflow-x-auto rounded p-2 font-mono text-[10px] leading-relaxed">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function HistoryPanel() {
  const { snapshot } = useRunner();
  const total = snapshot.history.length;
  const entries = [...snapshot.history].reverse();

  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-4 text-xs">
        No dispatches yet
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase">
        History
      </p>
      <ul className="divide-border divide-y">
        {entries.map((entry, i) => {
          const version = total - i;
          return <HistoryRow key={version} entry={entry} version={version} isHead={i === 0} />;
        })}
      </ul>
    </ScrollArea>
  );
}
