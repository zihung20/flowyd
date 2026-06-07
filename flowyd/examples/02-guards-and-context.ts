/**
 * Example 02 — Guards & Context: An Expense Reimbursement Policy
 *
 * Builds on example 01 by adding the two features that turn a state machine
 * into a *rules engine*:
 *
 *   • Context  — typed, per-instance data declared with `setContext(zodSchema)`.
 *                Set once at `createInstance`, readable by every guard, and
 *                updatable mid-run with `setContext`. Here it carries the
 *                department's policy (auto-approve limit) and live budget.
 *
 *   • Guards   — async predicates on a transition. A transition only fires when
 *                its guard returns true. This example shows all the ways to
 *                write one:
 *                  - an inline `(ctx) => boolean` reading `ctx.payload`/`ctx.context`
 *                  - `Guard.fn(...)`        — a reusable guard shared across arcs
 *                  - `Guard.and / or / not` — boolean composition
 *                  - `Guard.inject('name')` — a placeholder resolved at runtime
 *                                             via `instance.injectGuard('name', fn)`
 *
 * Routing by guard: two arcs leave `submitted` on the SAME action (`REVIEW`)
 * with mutually-exclusive guards, so the amount decides the destination.
 *
 *   submitted ──REVIEW [amount ≤ limit]──▶ approved ✓        (auto-approved)
 *       │
 *       └────REVIEW [amount > limit]──▶ manager-review
 *                                          │  APPROVE [is manager AND in budget]
 *                                          ├──────────────────────────▶ approved ✓
 *                                          │  REJECT
 *                                          └──────────────────────────▶ rejected ✓
 *
 * Run with:  npx tsx examples/02-guards-and-context.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWorkflow, Guard } from '../src/index.js';

// #region example
// ─── Context — declared as a Zod schema, so `ctx.context` is fully typed ────────

const PolicySchema = z.object({
  department: z.string(),
  autoApproveLimit: z.number().positive(),
  budgetRemaining: z.number(),
});
type Policy = z.infer<typeof PolicySchema>;

// ─── Action payloads ────────────────────────────────────────────────────────────

const ReviewSchema = z.object({
  claimantId: z.string(),
  amount: z.number().positive(),
  category: z.enum(['travel', 'meals', 'equipment', 'training']),
});
type ReviewPayload = z.infer<typeof ReviewSchema>;

const DecisionSchema = z.object({
  managerId: z.string(),
});

// ─── A reusable guard: "this claim fits within the remaining budget" ────────────
//
// `Guard.fn` wraps a typed predicate so the same logic can be attached to
// several transitions. Both the payload and the context types flow through.

const withinBudget = Guard.fn<ReviewPayload, Policy>(
  (ctx) => ctx.payload.amount <= ctx.context.budgetRemaining,
);

// `Guard.inject` is a named placeholder — the actual check is supplied per
// instance (e.g. from an auth token) via `injectGuard`. The graph stays
// independent of how "is this person a manager?" is answered.
const isManager = Guard.inject('isManager');

// ─── Workflow ────────────────────────────────────────────────────────────────────

export const reimbursement = createWorkflow({ name: 'expense-reimbursement' })
  .setContext(PolicySchema)

  .defineAction('REVIEW', ReviewSchema)
  .defineAction('APPROVE', DecisionSchema)
  .defineAction('REJECT', DecisionSchema)

  .addStep('submitted', { label: 'Submitted' })
  .addStep('manager-review', { label: 'Manager Review' })
  .addStep('approved', { label: 'Approved' })
  .addStep('rejected', { label: 'Rejected' })

  .setInitial('submitted')
  .setTerminal(['approved', 'rejected'])

  // Two arcs, same action, mutually-exclusive inline guards → the amount routes.
  // `ctx.payload` is typed as ReviewPayload, `ctx.context` as Policy.
  .addTransition({
    from: 'submitted',
    to: 'approved',
    on: 'REVIEW',
    guard: (ctx) => ctx.payload.amount <= ctx.context.autoApproveLimit,
  })
  .addTransition({
    from: 'submitted',
    to: 'manager-review',
    on: 'REVIEW',
    guard: (ctx) => ctx.payload.amount > ctx.context.autoApproveLimit,
  })

  // Composition: a manager may approve only if it ALSO fits the budget.
  .addTransition({
    from: 'manager-review',
    to: 'approved',
    on: 'APPROVE',
    guard: Guard.and([isManager, withinBudget]),
  })
  .addTransition({ from: 'manager-review', to: 'rejected', on: 'REJECT' })

  .build();

// ─── Run ─────────────────────────────────────────────────────────────────────────

async function run() {
  // Context is REQUIRED at creation because we declared a schema.
  const dept: Policy = { department: 'Engineering', autoApproveLimit: 100, budgetRemaining: 5_000 };

  // ── Scenario A: a small claim auto-approves (no manager needed) ───────────────
  console.log('=== A. Small claim ($80, limit $100) → auto-approved ===\n');
  const small = reimbursement.createInstance('exp-001', dept);
  await small.dispatch('REVIEW', { claimantId: 'carol', amount: 80, category: 'meals' });
  console.log(`  state: ${small.getCurrentStates()}  terminal: ${small.isTerminal()}`);

  // ── Scenario B: a large claim needs a manager; injected role decides ──────────
  console.log('\n=== B. Large claim ($1,200) → manager review ===\n');
  const big = reimbursement.createInstance('exp-002', dept);

  // Supply the runtime answer to `Guard.inject('isManager')`. In production this
  // reads the caller's role from a session/JWT; here a mutable variable stands in.
  let actorRole: 'manager' | 'employee' = 'employee';
  big.injectGuard('isManager', () => actorRole === 'manager');

  await big.dispatch('REVIEW', { claimantId: 'dave', amount: 1_200, category: 'equipment' });
  console.log(`  routed to: ${big.getCurrentStates()}`); // [manager-review]

  // `canExecute` runs the guards as a dry run WITHOUT changing state — perfect
  // for deciding whether to even show an "Approve" button.
  console.log(`  can an EMPLOYEE approve? ${await big.canExecute('APPROVE', { managerId: 'x' })}`);
  actorRole = 'manager';
  console.log(`  can a  MANAGER  approve? ${await big.canExecute('APPROVE', { managerId: 'm-7' })}`);
  console.log(`  (state still unchanged): ${big.getCurrentStates()}\n`);

  await big.dispatch('APPROVE', { managerId: 'm-7' });
  console.log(`  after manager approves: ${big.getCurrentStates()}  terminal: ${big.isTerminal()}`);

  // ── Scenario C: guard composition blocks an over-budget claim ─────────────────
  console.log('\n=== C. Manager approval blocked when over budget ===\n');
  const tight: Policy = { department: 'Design', autoApproveLimit: 100, budgetRemaining: 300 };
  const claim = reimbursement.createInstance('exp-003', tight);
  claim.injectGuard('isManager', () => true); // caller really is a manager

  await claim.dispatch('REVIEW', { claimantId: 'erin', amount: 900, category: 'training' });
  const blocked = await claim.dispatch('APPROVE', { managerId: 'm-9' });
  if (!blocked.success) {
    // `Guard.and` short-circuited: isManager passed, withinBudget ($900 > $300) failed.
    console.log(`  $900 claim vs $300 budget → blocked: ${blocked.reason}`);
  }

  // Top up the budget mid-run with `setContext`, then the same action passes.
  console.log(`  ...finance tops up the budget via setContext()...`);
  claim.setContext({ ...claim.getContext()!, budgetRemaining: 2_000 });
  await claim.dispatch('APPROVE', { managerId: 'm-9' });
  console.log(`  after top-up: ${claim.getCurrentStates()}  terminal: ${claim.isTerminal()}`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
