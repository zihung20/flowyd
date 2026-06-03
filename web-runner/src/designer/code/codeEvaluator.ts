import { createWorkflow, createDynamicWorkflow, Guard, StateKind, StateStatus } from 'flowyd';
import { z } from 'zod';
import type { WorkflowDefinition } from 'flowyd';

type RunWorkflow = {
  getDefinition(): WorkflowDefinition;
  createInstance(id: string): {
    dispatch(a: string, p: unknown): Promise<unknown>;
    getSnapshot(): unknown;
    injectGuard(n: string, fn: () => boolean | Promise<boolean>): unknown;
  };
};

export type EvalResult =
  | { ok: true; workflow: RunWorkflow; definition: WorkflowDefinition }
  | { ok: false; error: string };

/**
 * Remove TypeScript-only syntax so the output can be fed to `new Function()`.
 *
 * Transforms applied in order:
 * 1. Strip named imports (`import { … } from '…'` and `import type { … } from '…'`).
 * 2. Strip bare side-effect imports (`import '…'`).
 * 3. Strip `export` modifier from declarations (`export const` → `const`).
 * 4. Rewrite `export default` as an assignment so the value is in scope.
 * 5. Strip re-export blocks (`export { … }`).
 * 6. Strip `"use strict"` directives (inserted by some TS compilers).
 *
 * @param tsCode - TypeScript source as typed in the Monaco editor.
 * @returns JavaScript-compatible source ready for `new Function()`.
 */
function stripToJS(tsCode: string): string {
  return tsCode
    .replace(/^\s*import\s+(?:type\s+)?.*?from\s+['"][^'"]+['"].*?;?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"].*?;?\s*$/gm, '')
    .replace(/^\s*export\s+(const|let|var|function|class|async\s+function)\s+/gm, '$1 ')
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*["']use strict["'];?\s*$/gm, '');
}

/**
 * Evaluate TypeScript workflow code without a build step.
 *
 * Uses `new Function()` to avoid a Babel/SWC runtime dependency; flowyd and
 * zod are injected as parameters so the stripped code can reference them by
 * name. Three distinct failure paths are mapped to `ok:false`:
 * - Syntax errors / runtime exceptions during evaluation.
 * - The code ran but exported no `workflow` variable.
 * - A `workflow` variable exists but lacks `getDefinition()` (wrong shape).
 *
 * @param tsCode - Raw TypeScript from the Monaco editor (may include imports and `export` keywords).
 * @returns A discriminated `EvalResult`; callers must check `.ok` before using `.workflow`.
 */
export async function evaluateWorkflowCode(tsCode: string): Promise<EvalResult> {
  try {
    const js = stripToJS(tsCode);

    const fn = new Function(
      'createWorkflow',
      'createDynamicWorkflow',
      'Guard',
      'z',
      'StateKind',
      'StateStatus',
      `${js}\n` + `if (typeof workflow !== 'undefined') return workflow;\n` + `return null;`,
    );

    const result: unknown = fn(
      createWorkflow,
      createDynamicWorkflow,
      Guard,
      z,
      StateKind,
      StateStatus,
    );

    if (!result || typeof result !== 'object') {
      return {
        ok: false,
        error: 'Define "const workflow = createWorkflow(...).build();" in the editor.',
      };
    }

    const wf = result as RunWorkflow;
    if (typeof wf.getDefinition !== 'function') {
      return { ok: false, error: '"workflow" exists but is not a compiled Workflow object.' };
    }

    return { ok: true, workflow: wf, definition: wf.getDefinition() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
