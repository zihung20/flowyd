import { AlarmClock, FastForward } from 'lucide-react';
import { useRunner } from '../context';
import { Button } from '@/components/ui/button';

/**
 * Render the human-friendly gap between now and a future ISO instant
 * (`in 2d`, `in 5h`). Deadlines in a demo sit hours or days out, so a coarse
 * largest-unit form is enough.
 */
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) {
    return 'now';
  }
  const units: [string, number][] = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size) {
      return `in ${Math.round(ms / size)}${unit}`;
    }
  }
  return 'in <1s';
}

/**
 * Clock for time-triggered transitions (deadlines). Real wall-clock time never
 * reaches a 48h SLA inside a demo, so the host advances the clock explicitly:
 * one click jumps to the next armed deadline and fires its timed transition.
 * Hidden when no deadline is pending or while scrubbing a past version.
 */
export function ClockControl() {
  const { nextDueAt, advanceClock, isPreviewing } = useRunner();

  if (nextDueAt === null || isPreviewing) {
    return null;
  }

  return (
    <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
      <AlarmClock className="text-muted-foreground h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-xs font-medium">Deadline pending</p>
        <p className="text-muted-foreground text-[11px]">fires {untilLabel(nextDueAt)}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2 text-xs"
        onClick={() => void advanceClock()}
        title="Jump the clock to the next deadline and fire it"
      >
        <FastForward className="h-3.5 w-3.5" />
        Skip ahead
      </Button>
    </div>
  );
}
