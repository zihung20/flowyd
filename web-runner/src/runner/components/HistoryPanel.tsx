import { useRunner } from '../context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export function HistoryPanel() {
  const { snapshot } = useRunner();
  const entries = [...snapshot.history].reverse();

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
        No dispatches yet
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        History
      </p>
      <ul className="divide-y divide-border">
        {entries.map((entry, i) => (
          <li key={i} className="px-4 py-2 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-foreground">{entry.action}</span>
              <span className="ml-2 shrink-0 text-muted-foreground/50 text-[10px]">
                v{snapshot.history.length - i}
              </span>
            </div>

            {entry.enteredStates.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {entry.enteredStates.map((s) => (
                  <Badge key={s} variant="green" className="text-[10px] px-1.5 py-0">
                    +{s}
                  </Badge>
                ))}
              </div>
            )}

            {entry.exitedStates.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.exitedStates.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                    −{s}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
