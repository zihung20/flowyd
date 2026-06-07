import { useEffect, useState } from 'react';
import { Pause, Play, Radio, SkipBack, SkipForward } from 'lucide-react';
import type { HistoryEntry } from 'flowyd';
import { useRunner } from '../context';
import { Button } from '@/components/ui/button';

const FRAME_MS = 850;

/** Short caption for a history entry, narrowing on its discriminated kind. */
function entryLabel(entry: HistoryEntry): string {
  switch (entry.kind) {
    case 'action':
      return entry.action;
    case 'timeout':
      return 'deadline';
    case 'resolve-wait':
      return `resolve ${entry.stateId}`;
  }
}

/** Video-style scrubber: drag, step, or play through past versions of the run. */
export function TimelineBar() {
  const { snapshot, previewVersion, headVersion, isPreviewing, scrubTo } = useRunner();
  const [playing, setPlaying] = useState(false);

  const position = previewVersion ?? headVersion;

  // Advance one frame per tick while playing; stop and go live at the head.
  useEffect(() => {
    if (!playing || previewVersion === null) {
      return;
    }
    const timer = setTimeout(() => {
      const next = previewVersion + 1;
      if (next >= headVersion) {
        scrubTo(null);
        setPlaying(false);
      } else {
        scrubTo(next);
      }
    }, FRAME_MS);
    return () => clearTimeout(timer);
  }, [playing, previewVersion, headVersion, scrubTo]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!isPreviewing) {
      scrubTo(0);
    }
    setPlaying(true);
  }

  function stepPrev() {
    setPlaying(false);
    scrubTo(Math.max(0, position - 1));
  }

  function stepNext() {
    setPlaying(false);
    const next = position + 1;
    scrubTo(next >= headVersion ? null : next);
  }

  const atStart = position <= 0;
  const atLive = position >= headVersion;

  const lastEntry = snapshot.history[snapshot.history.length - 1];
  const frameLabel =
    position === 0 ? 'initial' : lastEntry ? entryLabel(lastEntry) : `v${position}`;

  return (
    <div className="border-border bg-background flex items-center gap-3 border-t px-4 py-2.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title="Previous step"
        onClick={stepPrev}
        disabled={atStart}
      >
        <SkipBack className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title={playing ? 'Pause' : 'Play the run'}
        onClick={togglePlay}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title="Next step"
        onClick={stepNext}
        disabled={atLive}
      >
        <SkipForward className="h-4 w-4" />
      </Button>

      <span className="text-muted-foreground/70 w-7 shrink-0 text-center font-mono text-[11px]">
        v{position}
      </span>

      <input
        type="range"
        min={0}
        max={headVersion}
        step={1}
        value={position}
        onChange={(e) => scrubTo(Number(e.target.value))}
        aria-label="Scrub run timeline"
        className="h-1 flex-1 cursor-pointer accent-blue-600"
      />

      <span className="text-muted-foreground hidden max-w-[10rem] shrink-0 truncate text-[11px] sm:block">
        {frameLabel}
      </span>

      {isPreviewing ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          onClick={() => {
            setPlaying(false);
            scrubTo(null);
          }}
        >
          Live
        </Button>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
          <Radio className="h-3.5 w-3.5" />
          Live
        </span>
      )}
    </div>
  );
}
