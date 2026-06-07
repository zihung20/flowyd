/**
 * Example 03 — Parallel Work: Fork, Join, and Join Modes
 *
 * Real processes rarely run in a straight line — several things happen at once,
 * then the flow waits for "enough" of them to finish. flowyd models this with
 * two special state kinds:
 *
 *   • Fork  (`addFork`) — when entered it immediately completes itself and
 *                         activates ALL its `targets` in parallel.
 *   • Join  (`addJoin`) — a barrier that activates automatically once its
 *                         `requires` states reach `completed`, according to its
 *                         `mode`:
 *                            'all'   — every required state (default)
 *                            'any'   — at least one
 *                            number  — a quorum of N   ← used here (2 of 3)
 *
 * This models peer review: a paper goes to three reviewers, but an editorial
 * decision can be made as soon as TWO have reported back.
 *
 * The "two-state branch" pattern: each fork target is an *in-progress* step
 * (`reviewer-a`) with an outgoing action that leads to a *done* step
 * (`a-done`). A done step is a dead-end non-terminal, so flowyd auto-completes
 * it the instant it's entered — which is exactly what the join counts.
 *
 *                         ┌─▶ reviewer-a ─SUBMIT_A─▶ a-done ─┐
 *   submitted ─ASSIGN─▶ (fork) reviewer-b ─SUBMIT_B─▶ b-done ─┤ (join: 2 of 3)
 *                         └─▶ reviewer-c ─SUBMIT_C─▶ c-done ─┘        │
 *                                                                decision-ready
 *                                                          ACCEPT ┄┄┄┄┤┄┄┄┄ REJECT
 *                                                          accepted ✓   rejected ✓
 *
 * Run with:  npx tsx examples/03-parallel-fork-join.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWorkflow, Guard, StateStatus } from '../src/index.js';
import { MermaidExporter } from '../src/visualization/index.js';

// #region example
// ─── Action payloads ────────────────────────────────────────────────────────────

const AssignSchema = z.object({ handlingEditor: z.string() });

const ReviewSchema = z.object({
  reviewer: z.string(),
  verdict: z.enum(['accept', 'minor-revisions', 'major-revisions', 'reject']),
  score: z.number().int().min(1).max(5),
});

const DecisionSchema = z.object({ editor: z.string() });

// ─── Workflow ────────────────────────────────────────────────────────────────────
//
// Ordering rule: a fork's `targets` and a join's `requires` may only reference
// states already registered. So register the branch states first, THEN the
// fork/join that points at them.

export const peerReview = createWorkflow({ name: 'peer-review' })
  .defineAction('ASSIGN', AssignSchema)
  .defineAction('SUBMIT_A', ReviewSchema)
  .defineAction('SUBMIT_B', ReviewSchema)
  .defineAction('SUBMIT_C', ReviewSchema)
  .defineAction('ACCEPT', DecisionSchema)
  .defineAction('REJECT', DecisionSchema)

  .addStep('submitted', { label: 'Submitted' })

  // "done" steps — registered before the join; auto-complete on entry.
  .addStep('a-done', { label: 'Review A In' })
  .addStep('b-done', { label: 'Review B In' })
  .addStep('c-done', { label: 'Review C In' })

  // "in-progress" steps — registered before the fork; the parallel branches.
  .addStep('reviewer-a', { label: 'Reviewer A' })
  .addStep('reviewer-b', { label: 'Reviewer B' })
  .addStep('reviewer-c', { label: 'Reviewer C' })

  .addFork('assign-reviewers', {
    label: 'Assign Reviewers',
    targets: ['reviewer-a', 'reviewer-b', 'reviewer-c'],
  })
  .addJoin('decision-ready', {
    label: 'Decision Ready',
    requires: ['a-done', 'b-done', 'c-done'],
    // Change to 'all' to wait for every reviewer, or 'any' for the first one.
    mode: 2, // quorum: a decision can be made once 2 of 3 reviews are in.
  })

  .addStep('accepted', { label: 'Accepted' })
  .addStep('rejected', { label: 'Rejected' })

  .setInitial('submitted')
  .setTerminal(['accepted', 'rejected'])

  .addTransition({ from: 'submitted', to: 'assign-reviewers', on: 'ASSIGN' })

  // Each reviewer reports independently; order doesn't matter.
  .addTransition({ from: 'reviewer-a', to: 'a-done', on: 'SUBMIT_A' })
  .addTransition({ from: 'reviewer-b', to: 'b-done', on: 'SUBMIT_B' })
  .addTransition({ from: 'reviewer-c', to: 'c-done', on: 'SUBMIT_C' })

  // A state-aware guard: only let the editor accept once a review is actually in.
  // (Trivially true here once the join is active, but shows `Guard.stateCompleted`
  // / `Guard.or` reading the live status of OTHER states — not the payload.)
  .addTransition({
    from: 'decision-ready',
    to: 'accepted',
    on: 'ACCEPT',
    guard: Guard.or([Guard.stateCompleted('a-done'), Guard.stateCompleted('b-done')]),
  })
  .addTransition({ from: 'decision-ready', to: 'rejected', on: 'REJECT' })

  .build();

// ─── Run ─────────────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== Peer Review — State Diagram ===\n');
  console.log(MermaidExporter.export(peerReview.getDefinition()));

  console.log('\n=== Run: quorum of 2 — a decision before the 3rd review arrives ===\n');
  const paper = peerReview.createInstance('paper-flowyd-2026');

  await paper.dispatch('ASSIGN', { handlingEditor: 'dr-ng' });
  // The fork fanned out: all three reviewers are active at once.
  console.log(`after ASSIGN     → active: ${paper.getCurrentStates()}`);

  await paper.dispatch('SUBMIT_A', { reviewer: 'A', verdict: 'accept', score: 5 });
  console.log(`after review A   → active: ${paper.getCurrentStates()}`); // join not yet (1/2)

  await paper.dispatch('SUBMIT_B', { reviewer: 'B', verdict: 'minor-revisions', score: 4 });
  // Quorum (2) reached → the join activates automatically, no dispatch needed.
  console.log(`after review B   → active: ${paper.getCurrentStates()}`);

  // Reviewer C never reported — and didn't need to. Inspect any state directly:
  console.log(`  reviewer-c is still: ${paper.getStateStatus('reviewer-c')}`); // active
  console.log(`  c-done is still    : ${paper.getStateStatus('c-done')}`); // idle
  console.log(`  decision-ready is  : ${paper.getStateStatus('decision-ready')}`); // active

  const done = await paper.dispatch('ACCEPT', { editor: 'dr-ng' });
  console.log(`\nafter ACCEPT     → ${paper.getCurrentStates()}  terminal: ${paper.isTerminal()}`);
  if (done.success) console.log(`exited (completed) on accept: ${done.exitedStates}`);

  // Sanity check on the auto-completed done-states using the snapshot status map.
  const statuses = paper.getSnapshot().stateStatuses;
  const completed = Object.entries(statuses)
    .filter(([, s]) => s === StateStatus.Completed)
    .map(([id]) => id);
  console.log(`\nall completed states: ${completed.join(', ')}`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
