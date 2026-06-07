/**
 * Render a millisecond duration as a compact whole-unit string (`172800000` →
 * `2d`). Mirrors flowyd's internal `formatDuration` so timed-edge labels in the
 * runner match the Mermaid export; the library does not export it.
 *
 * @param ms - Duration in milliseconds (a timed transition's `after` value).
 * @returns The largest unit that divides `ms` evenly, suffixed (`ms`/`s`/`m`/`h`/`d`/`w`).
 */
export function formatDuration(ms: number): string {
  const units: [string, number][] = [
    ['w', 604_800_000],
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
    ['ms', 1],
  ];
  for (const [unit, size] of units) {
    if (ms % size === 0) {
      return `${ms / size}${unit}`;
    }
  }
  return `${ms}ms`;
}
