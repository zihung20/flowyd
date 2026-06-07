/**
 * Example 01 — The Basics: A Document Approval Workflow
 *
 * The smallest useful flowyd workflow. Start here. It introduces the four
 * things every workflow needs and nothing else:
 *
 *   1. Actions   — named events with a Zod-validated payload (`defineAction`).
 *   2. States    — the milestones a document moves through (`addStep`).
 *   3. The graph — entry point, exit points, and the arcs between states
 *                  (`setInitial` / `setTerminal` / `addTransition`).
 *   4. Running   — create an instance, `dispatch` actions, read the state.
 *
 * No guards, no context, no parallelism — those come in later examples.
 *
 *   draft ──SUBMIT──▶ in-review ──APPROVE──▶ published ✓
 *                        │
 *                        REJECT
 *                        ▼
 *                     rejected ──RESUBMIT──▶ in-review   (loops back)
 *
 * Run with:  npx tsx examples/01-document-approval-basics.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWorkflow } from '../src/index.js';
import { MermaidExporter } from '../src/visualization/index.js';

// #region example
// ─── 1. Action payloads — every action is a Zod schema (the single source of truth) ───

const SubmitSchema = z.object({
  authorId: z.string(),
  title: z.string().min(1),
});

const ApproveSchema = z.object({
  editorId: z.string(),
  comment: z.string().optional(),
});

const RejectSchema = z.object({
  editorId: z.string(),
  reason: z.string().min(1),
});

const ResubmitSchema = z.object({
  authorId: z.string(),
});

// ─── 2 & 3. Build the workflow ─────────────────────────────────────────────────
//
// The builder is fluent and type-accumulating: each `addStep` widens the set of
// valid state IDs, so `setInitial`, `setTerminal`, and `addTransition` only
// accept IDs that actually exist. A typo here is a compile-time error.

export const approval = createWorkflow({ name: 'document-approval' })
  .defineAction('SUBMIT', SubmitSchema)
  .defineAction('APPROVE', ApproveSchema)
  .defineAction('REJECT', RejectSchema)
  .defineAction('RESUBMIT', ResubmitSchema)

  .addStep('draft', { label: 'Draft' })
  .addStep('in-review', { label: 'In Review' })
  .addStep('published', { label: 'Published' })
  .addStep('rejected', { label: 'Rejected' })

  .setInitial('draft')
  .setTerminal(['published'])

  .addTransition({ from: 'draft', to: 'in-review', on: 'SUBMIT' })
  .addTransition({ from: 'in-review', to: 'published', on: 'APPROVE' })
  .addTransition({ from: 'in-review', to: 'rejected', on: 'REJECT' })
  .addTransition({ from: 'rejected', to: 'in-review', on: 'RESUBMIT' })

  .build();

// ─── 4. Run an instance ─────────────────────────────────────────────────────────

async function run() {
  // Print the state diagram (paste into any Mermaid renderer).
  console.log('=== Document Approval — State Diagram ===\n');
  console.log(MermaidExporter.export(approval.getDefinition()));

  console.log('\n=== Run: a post that gets rejected once, then approved ===\n');

  // An instance is one independent run of the workflow. The id is yours.
  const post = approval.createInstance('post-2026-06-07');
  console.log(`start            → ${post.getCurrentStates()}`); // [draft]

  // `getAvailableTransitions` tells the UI which buttons to show right now.
  console.log(`can do from draft: ${post.getAvailableTransitions()}\n`); // [SUBMIT]

  await post.dispatch('SUBMIT', { authorId: 'alice', title: 'Typed workflows in TS' });
  console.log(`after SUBMIT     → ${post.getCurrentStates()}`); // [in-review]

  await post.dispatch('REJECT', { editorId: 'bob', reason: 'Needs a benchmark section' });
  console.log(`after REJECT     → ${post.getCurrentStates()}`); // [rejected]

  await post.dispatch('RESUBMIT', { authorId: 'alice' });
  console.log(`after RESUBMIT   → ${post.getCurrentStates()}`); // [in-review]

  const result = await post.dispatch('APPROVE', { editorId: 'bob', comment: 'Much better' });
  console.log(`after APPROVE    → ${post.getCurrentStates()}`); // [published]

  // `dispatch` returns a discriminated result — narrow on `result.success`.
  if (result.success) {
    console.log(`\nentered states this step : ${result.enteredStates}`);
    console.log(`terminal?                : ${post.isTerminal()}`);
    console.log(`version (steps taken)    : ${post.getSnapshot().version}`);
  }

  // ─── What "blocked" looks like ────────────────────────────────────────────────
  //
  // dispatch never throws for ordinary domain failures — it returns a typed
  // `{ success: false, reason }`. Your business logic handles it.

  console.log('\n=== Blocked dispatches (the expected, non-throwing kind) ===\n');

  // (a) The workflow is already terminal.
  const afterDone = await post.dispatch('SUBMIT', { authorId: 'alice', title: 'again?' });
  if (!afterDone.success) console.log(`SUBMIT on a published post → blocked: ${afterDone.reason}`);

  // (b) An action that's valid in the workflow, but not from the current state.
  const fresh = approval.createInstance('post-fresh');
  const tooEarly = await fresh.dispatch('APPROVE', { editorId: 'bob' });
  if (!tooEarly.success) console.log(`APPROVE while still draft   → blocked: ${tooEarly.reason}`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
