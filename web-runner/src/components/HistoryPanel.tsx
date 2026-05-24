import { useRunner } from '../context';

export function HistoryPanel() {
  const { snapshot } = useRunner();
  const entries = [...snapshot.history].reverse();

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-300 p-4">
        No dispatches yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <p className="px-4 pt-3 pb-1 text-xs font-medium text-slate-400 uppercase tracking-wide">
        History
      </p>
      <ul className="divide-y divide-slate-50">
        {entries.map((entry, i) => (
          <li key={i} className="px-4 py-2 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-slate-700">{entry.action}</span>
              <span className="text-slate-300 ml-2 shrink-0">v{snapshot.history.length - i}</span>
            </div>

            {entry.enteredStates.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.enteredStates.map((s) => (
                  <span key={s} className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px]">
                    +{s}
                  </span>
                ))}
              </div>
            )}

            {entry.exitedStates.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {entry.exitedStates.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 text-slate-400 px-1.5 py-0.5 text-[10px]">
                    -{s}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
