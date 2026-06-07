import { createWorkflow, createDynamicWorkflow, Guard, StateKind, StateStatus } from 'flowyd';
import { z } from 'zod';
import type { WorkflowDefinition } from 'flowyd';
import type { AnyInstance } from './types';

type RunWorkflow = {
  getDefinition(): WorkflowDefinition;
  createInstance(id: string): AnyInstance;
};

type UserExports = { workflow: unknown; instance: unknown };

export type EvalResult =
  | {
      ok: true;
      workflow: RunWorkflow;
      definition: WorkflowDefinition;
      makeInstance: () => AnyInstance;
    }
  | { ok: false; error: string };

const FN_PARAMS = [
  'createWorkflow',
  'createDynamicWorkflow',
  'Guard',
  'z',
  'StateKind',
  'StateStatus',
] as const;
const FN_ARGS = [createWorkflow, createDynamicWorkflow, Guard, z, StateKind, StateStatus] as const;

/**
 * Strip TypeScript-only syntax so the output can be passed to `new Function()`.
 *
 * @param tsCode - TypeScript source from the Monaco editor.
 * @returns JavaScript-compatible source.
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
 * Execute stripped JS and capture the `workflow` and `instance` variables the
 * user defined. Library globals are injected as function parameters so the
 * user's code can reference them without real imports.
 *
 * @param js - Stripped JavaScript source.
 * @returns Object with whatever the user defined as `workflow` / `instance` (null if absent).
 */
function runUserCode(js: string): UserExports {
  const fn = new Function(
    ...FN_PARAMS,
    `${js}\n` +
      `return {\n` +
      `  workflow: typeof workflow !== 'undefined' ? workflow : null,\n` +
      `  instance: typeof instance !== 'undefined' ? instance : null,\n` +
      `};\n`,
  );
  return fn(...FN_ARGS) as UserExports;
}

/**
 * Build the instance factory that `SingleRunner` calls on mount and reset.
 *
 * When the user defined `instance`, the factory re-runs the user's code so
 * the context is re-applied on every reset. Otherwise it creates a plain
 * instance directly from the compiled workflow.
 *
 * @param js - Stripped JavaScript source (closed over for re-evaluation).
 * @param wf - Compiled workflow (used for the no-context fallback).
 * @param hasUserInstance - Whether the user defined `const instance = ...`.
 */
function buildMakeInstance(
  js: string,
  wf: RunWorkflow,
  hasUserInstance: boolean,
): () => AnyInstance {
  if (!hasUserInstance) {
    return () => wf.createInstance(`run-${Date.now()}`);
  }
  return () => runUserCode(js).instance as AnyInstance;
}

/**
 * Evaluate TypeScript workflow code without a build step.
 *
 * Looks for two top-level variables in the editor:
 * - `workflow` (required) — result of `.build()`.
 * - `instance` (optional) — `workflow.createInstance(id, context)`. Required
 *   when the workflow declares a context schema.
 *
 * @param tsCode - Raw TypeScript from the Monaco editor.
 * @returns Discriminated `EvalResult`; check `.ok` before accessing other fields.
 */
export async function evaluateWorkflowCode(tsCode: string): Promise<EvalResult> {
  try {
    const js = stripToJS(tsCode);
    const { workflow: rawWorkflow, instance: rawInstance } = runUserCode(js);

    if (!rawWorkflow || typeof rawWorkflow !== 'object') {
      return {
        ok: false,
        error: 'Define "const workflow = createWorkflow(...).build();" in the editor.',
      };
    }

    const wf = rawWorkflow as RunWorkflow;
    if (typeof wf.getDefinition !== 'function') {
      return { ok: false, error: '"workflow" exists but is not a compiled Workflow object.' };
    }

    const definition = wf.getDefinition();
    const hasUserInstance = rawInstance !== null;

    if (!hasUserInstance && definition.contextSchema) {
      return {
        ok: false,
        error:
          'This workflow declares a context schema — the runner needs an instance with context pre-loaded.\n\n' +
          'Add a variable named exactly "instance":\n\n' +
          'const instance = workflow.createInstance("run-1", { /* your context */ });',
      };
    }

    return {
      ok: true,
      workflow: wf,
      definition,
      makeInstance: buildMakeInstance(js, wf, hasUserInstance),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
