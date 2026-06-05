// Guards the hand-written file maps against the real `src/` tree so they cannot
// silently drift. Two failure modes are detected:
//
//   1. Stale reference — a `*.ts` filename appears in a map but no such file
//      exists under `src/` (e.g. a rename left `primitives.ts` behind).
//   2. Missing file — a real source file is absent from the *exhaustive*
//      architecture map (a new file was added but never documented).
//
// CLAUDE.md's §2 map is intentionally abbreviated (it omits individual guard
// files), so it is checked for stale references only — not completeness.
//
// Run with Node ≥24 (native TypeScript type-stripping — no build step):
//   node scripts/check-file-map.ts          verify; exits 1 on drift
//   node scripts/check-file-map.ts --print   print the canonical tree

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOWYD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(FLOWYD_ROOT, 'src');

/** A map document and whether its tree is required to list every source file. */
interface MapTarget {
  readonly label: string;
  readonly path: string;
  readonly exhaustive: boolean;
}

const TARGETS: readonly MapTarget[] = [
  { label: 'CLAUDE.md §2', path: resolve(FLOWYD_ROOT, '..', 'CLAUDE.md'), exhaustive: false },
  {
    label: 'docs/dev/architecture.md',
    path: join(FLOWYD_ROOT, 'docs/dev/architecture.md'),
    exhaustive: true,
  },
];

/** Recursively collect `*.ts` source files under `dir`, excluding co-located tests. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The final path segment of a slash-separated token. */
function basename(token: string): string {
  const parts = token.split('/');
  return parts[parts.length - 1] ?? token;
}

/** Extract `*.ts` basenames mentioned inside tree-shaped fenced code blocks. */
function mentionedBasenames(markdown: string): Set<string> {
  const found = new Set<string>();
  const fences = markdown.split('```');
  // Odd-indexed segments are inside fences; a tree fence draws box characters.
  for (let i = 1; i < fences.length; i += 2) {
    const body = fences[i];
    if (body === undefined || !/[├└│]/.test(body)) continue;
    for (const token of body.match(/[\w.\/-]*\.ts\b/g) ?? []) {
      if (token.includes('*')) continue; // skip globs like *.test.ts
      if (token.endsWith('.test.ts')) continue; // co-located tests are not tracked
      found.add(basename(token));
    }
  }
  return found;
}

function printTree(): void {
  const files = collectSourceFiles(SRC_DIR)
    .map((f) => relative(SRC_DIR, f))
    .sort();
  console.log('src/');
  for (const f of files) console.log(`  ${f}`);
}

function check(): void {
  const realBasenames = new Set(collectSourceFiles(SRC_DIR).map(basename));
  const problems: string[] = [];

  for (const target of TARGETS) {
    if (!existsSync(target.path)) {
      console.warn(`⚠ skipped ${target.label} — not found at ${target.path}`);
      continue;
    }
    const mentioned = mentionedBasenames(readFileSync(target.path, 'utf8'));

    for (const name of mentioned) {
      if (!realBasenames.has(name)) {
        problems.push(`${target.label}: references "${name}", which does not exist under src/`);
      }
    }
    if (target.exhaustive) {
      for (const name of realBasenames) {
        if (!mentioned.has(name)) {
          problems.push(`${target.label}: missing "${name}" — a real source file is undocumented`);
        }
      }
    }
  }

  if (problems.length > 0) {
    console.error('✗ File map is out of sync with src/:\n');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nFix the map(s) above, or run with --print to see the canonical tree.');
    process.exit(1);
  }
  console.log('✓ File maps match src/.');
}

if (process.argv.includes('--print')) {
  printTree();
} else {
  check();
}
