import { GRID_ROWS, GRID_COLS, getSectionId, getAdjacent } from '../workflows/ewcr';
import { useRunner } from '../context';

const STATE_COLORS: Record<string, string> = {
  'idle':                'bg-slate-200 text-slate-600',
  'isolation-requested': 'bg-yellow-200 text-yellow-800',
  'isolated':            'bg-orange-300 text-orange-900',
  'clearance-issued':    'bg-purple-200 text-purple-800',
  'work-in-progress':    'bg-blue-400 text-white',
  'work-completed':      'bg-green-300 text-green-900',
  'power-restored':      'bg-slate-100 text-slate-400',
};

const STATE_SHORT: Record<string, string> = {
  'idle':                'PWR',
  'isolation-requested': 'ISO?',
  'isolated':            'ISO',
  'clearance-issued':    'CLR',
  'work-in-progress':    'WORK',
  'work-completed':      'DONE',
  'power-restored':      'REST',
};

function getCurrentState(stateStatuses: Record<string, string>): string {
  for (const [id, status] of Object.entries(stateStatuses)) {
    if (status === 'active') return id;
  }
  return 'idle';
}

export function SectionGrid() {
  const { allSnapshots, selectedId, selectSection } = useRunner();

  return (
    <div className="shrink-0 bg-slate-900 p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
        40 Sections · 5 × 8 Grid
      </p>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
          const id = getSectionId(i);
          const snap = allSnapshots.get(id);
          const currentState = snap ? getCurrentState(snap.stateStatuses) : 'idle';
          const colorClass = STATE_COLORS[currentState] ?? 'bg-slate-200 text-slate-600';
          const label = STATE_SHORT[currentState] ?? '?';
          const isSelected = id === selectedId;
          const neighbors = getAdjacent(id);
          const isNeighborOfSelected = neighbors.includes(selectedId);

          return (
            <button
              key={id}
              onClick={() => selectSection(id)}
              title={`${id} — ${currentState}`}
              className={[
                'rounded text-center transition-all cursor-pointer select-none',
                'flex flex-col items-center justify-center',
                colorClass,
                isSelected
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105'
                  : isNeighborOfSelected
                  ? 'ring-1 ring-slate-400'
                  : 'opacity-90 hover:opacity-100',
              ].join(' ')}
              style={{ fontSize: '9px', lineHeight: 1.2, padding: '4px 2px', minHeight: '40px' }}
            >
              <span className="font-bold">{id}</span>
              <span className="opacity-80">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
        {Object.entries(STATE_SHORT).map(([state, abbr]) => (
          <div key={state} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm shrink-0 ${STATE_COLORS[state] ?? ''}`} />
            <span className="text-[9px] text-slate-400 truncate">{abbr} {state.replace(/-/g, ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
