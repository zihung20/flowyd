/**
 * `Object.entries` always returns `[string, V][]`; this narrows the key to `K` in one
 * audited place so call sites stay cast-free. Safe because any `Record<K, V>` we construct
 * exclusively from registered keys satisfies the invariant at runtime — TypeScript's
 * structural types just can't express a "closed" object type.
 */
export function typedEntries<K extends string, V>(obj: Readonly<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

/** Same cast-safety rationale as `typedEntries`, for the `Object.fromEntries` direction. */
export function typedFromEntries<K extends string, V>(
  entries: Iterable<readonly [K, V]>,
): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

/**
 * Supported duration units, **smallest first**, each expressed as a multiple of
 * the unit before it (`s` is 1000 `ms`, `m` is 60 `s`, `h` is 60 `m`, …).
 *
 * This relative table is the single source of truth for duration handling:
 * {@link UNIT_TO_MS} derives the absolute factors, {@link DURATION_PATTERN}
 * derives the accepted suffixes, and both `parseDuration` and `formatDuration`
 * read from it. The base unit is the first entry (`ms`, factor 1) — to change
 * precision (e.g. to nanoseconds) prepend finer units here and nothing else
 * needs to know the absolute numbers.
 */
const DURATION_UNITS = [
  ['ms', 1],
  ['s', 1_000],
  ['m', 60],
  ['h', 60],
  ['d', 24],
  ['w', 7],
] as const satisfies ReadonlyArray<readonly [string, number]>;

/** Absolute base-units (ms) per unit, accumulated once from {@link DURATION_UNITS}. */
const UNIT_TO_MS: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  let size = 1;
  for (const [unit, factor] of DURATION_UNITS) {
    size *= factor;
    map.set(unit, size);
  }
  return map;
})();

/** `<number><unit>` matcher, suffixes longest-first so `ms` wins over `s`. */
const DURATION_PATTERN = new RegExp(
  `^(\\d+(?:\\.\\d+)?)(${[...UNIT_TO_MS.keys()].sort((a, b) => b.length - a.length).join('|')})$`,
);

/**
 * Accepts a raw millisecond count or a unit-suffixed string — `'500ms'`, `'90s'`, `'15m'`,
 * `'48h'`, `'7d'`, `'2w'` (decimals allowed, e.g. `'1.5h'`). Used by `addTransition` to
 * store time-triggered transitions as millisecond deltas in `TransitionDefinition.after`.
 *
 * @throws {Error} If the value is not positive, or the string is malformed or uses an
 *                 unrecognised unit.
 */
export function parseDuration(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      throw new Error(`Duration must be a positive number of milliseconds, got ${input}`);
    }
    return Math.round(input);
  }

  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${input}". Use a positive number of milliseconds or a string like ` +
        `"500ms", "90s", "15m", "48h", "7d", "2w".`,
    );
  }
  const [, value, unit] = match;
  const size = unit === undefined ? undefined : UNIT_TO_MS.get(unit);
  if (value === undefined || size === undefined) {
    throw new Error(`Invalid duration "${input}".`);
  }
  const ms = Number(value) * size;
  if (ms <= 0) {
    throw new Error(`Duration must be positive, got "${input}"`);
  }
  return Math.round(ms);
}

/**
 * Renders a millisecond duration back into the most compact whole-unit string
 * (e.g. `3_600_000` → `'1h'`). Used by visualisation exporters to label
 * time-triggered transitions.
 */
export function formatDuration(ms: number): string {
  // Largest unit first; return the first whose size divides evenly.
  for (const [unit, size] of [...UNIT_TO_MS].reverse()) {
    if (ms % size === 0) {
      return `${ms / size}${unit}`;
    }
  }
  // Unreachable: the base unit (size 1) always divides — kept for type totality.
  return `${ms}ms`;
}
