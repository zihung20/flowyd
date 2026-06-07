/**
 * Example 05 — Putting It All Together: Loan Origination
 *
 * A realistic, end-to-end workflow that uses nearly every flowyd feature, wired
 * up the way you'd actually wire it in a service:
 *
 *   • Typed context        — the applicant's facts drive the automated checks.
 *   • Guard composition     — `Guard.and` of an injected role + a payload check.
 *   • Fork / Join (all)     — credit, income, and fraud checks run in parallel
 *                             and must ALL clear before underwriting.
 *   • Wait state            — underwriting blocks on a human, resumed via
 *                             `resolveWait`.
 *   • Deadline              — an application auto-withdraws if docs never arrive.
 *   • Lifecycle hooks       — notifications/audit kept out of the graph logic.
 *   • Persistence           — `getSnapshot()` → store JSON → `restoreInstance()`
 *                             → RE-INJECT guards (guards are never serialised).
 *   • Time-travel / audit   — `rewind(version)` reconstructs any past state.
 *   • Visualisation         — Mermaid + JSON graph from the same definition.
 *
 *   received ─SUBMIT_DOCS─▶ (fork) ┬─ credit-check  ─CREDIT_OK─▶ credit-cleared ─┐
 *      │ (7d auto-withdraw)        ├─ income-check  ─INCOME_OK─▶ income-cleared ─┤ (join: all)
 *      ▼                           └─ fraud-check   ─FRAUD_OK ─▶ fraud-cleared  ─┘     │
 *   withdrawn ✓                                                              checks-complete
 *                                                                    SEND_TO_UW │
 *                                                                          underwriting ⟂
 *                                                          DECIDE[approve] │   │ DECIDE[decline]
 *                                                                 approved ✓   declined ✓
 *
 * Run with:  npx tsx examples/05-loan-origination.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  createWorkflow,
  Guard,
  type HookContext,
  type HistoryEntry,
  type WorkflowInstance,
} from '../src/index.js';
import { MermaidExporter, JsonGraphExporter } from '../src/visualization/index.js';

// #region example
// ─── Context: the facts about the applicant that policy guards read ──────────────

const ApplicationSchema = z.object({
  applicantName: z.string(),
  requestedAmount: z.number().positive(),
  creditScore: z.number().int().min(300).max(850),
  annualIncome: z.number().positive(),
});
type Application = z.infer<typeof ApplicationSchema>;

// ─── Action payloads ────────────────────────────────────────────────────────────

const SubmitDocsSchema = z.object({ documentIds: z.array(z.string()).min(1) });
const CheckSchema = z.object({ officerId: z.string(), reference: z.string() });
const SendToUwSchema = z.object({ requestedBy: z.string() });
const DecideSchema = z.object({
  underwriterId: z.string(),
  verdict: z.enum(['approve', 'decline']),
  notes: z.string().optional(),
});
type DecidePayload = z.infer<typeof DecideSchema>;

// ─── Reusable guards ─────────────────────────────────────────────────────────────

// Only a real underwriter may decide — resolved per instance via injectGuard.
const isUnderwriter = Guard.inject('isUnderwriter');

// Verdict-routing guards (mutually exclusive) composed with the role check.
const approves = Guard.and([
  isUnderwriter,
  Guard.fn<DecidePayload, Application>((ctx) => ctx.payload.verdict === 'approve'),
]);
const declines = Guard.and([
  isUnderwriter,
  Guard.fn<DecidePayload, Application>((ctx) => ctx.payload.verdict === 'decline'),
]);

// ─── Hooks: side effects (email, audit, paging) live here, not in the graph ─────

const log = (msg: string): void => console.log(`     ↳ ${msg}`);
const onUnderwriting = (c: HookContext<Application>): void =>
  log(`[hook] assigning underwriter for ${c.context.applicantName} ($${c.context.requestedAmount})`);
const onApproved = (c: HookContext<Application>): void =>
  log(`[hook] sending approval letter to ${c.context.applicantName}`);
const onDeclined = (c: HookContext<Application>): void =>
  log(`[hook] sending decline letter to ${c.context.applicantName}`);

// ─── Workflow definition ─────────────────────────────────────────────────────────

export const loan = createWorkflow({ name: 'loan-origination' })
  .setContext(ApplicationSchema)

  .defineAction('SUBMIT_DOCS', SubmitDocsSchema)
  .defineAction('CREDIT_OK', CheckSchema)
  .defineAction('INCOME_OK', CheckSchema)
  .defineAction('FRAUD_OK', CheckSchema)
  .defineAction('SEND_TO_UW', SendToUwSchema)
  .defineAction('DECIDE', DecideSchema)

  .addStep('received', { label: 'Application Received' })

  // "cleared" steps registered before the join (auto-complete on entry).
  .addStep('credit-cleared', { label: 'Credit Cleared' })
  .addStep('income-cleared', { label: 'Income Cleared' })
  .addStep('fraud-cleared', { label: 'Fraud Cleared' })
  // "check" steps registered before the fork (the parallel branches).
  .addStep('credit-check', { label: 'Credit Check' })
  .addStep('income-check', { label: 'Income Check' })
  .addStep('fraud-check', { label: 'Fraud Check' })

  .addFork('run-checks', {
    label: 'Run Checks',
    targets: ['credit-check', 'income-check', 'fraud-check'],
  })
  .addJoin('checks-complete', {
    label: 'All Checks Cleared',
    requires: ['credit-cleared', 'income-cleared', 'fraud-cleared'],
    mode: 'all',
  })

  .addWait('underwriting', {
    label: 'Underwriting',
    externalName: 'manual-underwriting',
    onEnter: onUnderwriting,
  })
  .addStep('approved', { label: 'Approved', onEnter: onApproved })
  .addStep('declined', { label: 'Declined', onEnter: onDeclined })
  .addStep('withdrawn', { label: 'Withdrawn' })

  .setInitial('received')
  .setTerminal(['approved', 'declined', 'withdrawn'])

  // Docs arrive → fan out to all three checks. Or, after 7 days of silence, the
  // application auto-withdraws (a deadline arc — no `on`).
  .addTransition({ from: 'received', to: 'run-checks', on: 'SUBMIT_DOCS' })
  .addTransition({ from: 'received', to: 'withdrawn', after: '7d' })

  // Each check clears only if the applicant's context satisfies policy.
  .addTransition({
    from: 'credit-check',
    to: 'credit-cleared',
    on: 'CREDIT_OK',
    guard: (ctx) => ctx.context.creditScore >= 650,
  })
  .addTransition({
    from: 'income-check',
    to: 'income-cleared',
    on: 'INCOME_OK',
    // Loan must be at most 4× annual income.
    guard: (ctx) => ctx.context.requestedAmount <= ctx.context.annualIncome * 4,
  })
  .addTransition({
    from: 'fraud-check',
    to: 'fraud-cleared',
    on: 'FRAUD_OK',
    guard: (ctx) => ctx.context.creditScore >= 600, // stand-in for a fraud model
  })

  .addTransition({ from: 'checks-complete', to: 'underwriting', on: 'SEND_TO_UW' })

  // Manual decision: role-gated AND verdict-routed.
  .addTransition({ from: 'underwriting', to: 'approved', on: 'DECIDE', guard: approves })
  .addTransition({ from: 'underwriting', to: 'declined', on: 'DECIDE', guard: declines })

  .build();

// ─── A tiny "service layer" around the workflow ─────────────────────────────────
//
// In a real app these would talk to your DB and auth. Guards are runtime
// behaviour, so they're injected on creation AND after every restore.

type LoanInstance = WorkflowInstance<
  {
    SUBMIT_DOCS: z.infer<typeof SubmitDocsSchema>;
    CREDIT_OK: z.infer<typeof CheckSchema>;
    INCOME_OK: z.infer<typeof CheckSchema>;
    FRAUD_OK: z.infer<typeof CheckSchema>;
    SEND_TO_UW: z.infer<typeof SendToUwSchema>;
    DECIDE: DecidePayload;
  },
  Application
>;

const underwriterStaff = new Set(['uw-100', 'uw-205']);

/** Re-attach all runtime guards. Must run on create and after every restore. */
function injectGuards(instance: LoanInstance): LoanInstance {
  return instance.injectGuard<DecidePayload>(
    'isUnderwriter',
    (ctx) => underwriterStaff.has(ctx.payload.underwriterId),
  );
}

function openApplication(id: string, app: Application): LoanInstance {
  return injectGuards(loan.createInstance(id, app));
}

/** Simulate persistence: snapshot → JSON string (what you'd store) and back. */
function persist(instance: LoanInstance): string {
  return JSON.stringify(instance.getSnapshot());
}
function load(json: string): LoanInstance {
  // Derive the exact snapshot type the definition expects (its state-ID union),
  // rather than the wider `string`-keyed shape a bare JSON.parse would infer.
  const snapshot = JSON.parse(json) as Parameters<typeof loan.restoreInstance>[0];
  return injectGuards(loan.restoreInstance(snapshot));
}

// ─── One-line audit label for a history entry (narrowing the discriminated kind) ─

function historyLabel(h: HistoryEntry): string {
  switch (h.kind) {
    case 'action':
      return h.action;
    case 'timeout':
      return `${h.from}→${h.to} (deadline)`;
    case 'resolve-wait':
      return `resolve:${h.stateId}`;
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== Loan Origination — State Diagram ===\n');
  console.log(MermaidExporter.export(loan.getDefinition()));

  console.log('\n=== A. Happy path, with a crash-and-restore in the middle ===\n');

  let app = openApplication('LN-001', {
    applicantName: 'Jordan Reyes',
    requestedAmount: 180_000,
    creditScore: 742,
    annualIncome: 95_000,
  });

  await app.dispatch('SUBMIT_DOCS', { documentIds: ['payslip.pdf', 'id.pdf', 'bank.pdf'] });
  console.log(`  docs in → parallel checks: ${app.getCurrentStates()}`);

  await app.dispatch('CREDIT_OK', { officerId: 'co-1', reference: 'CR-9' });
  await app.dispatch('INCOME_OK', { officerId: 'co-2', reference: 'IN-4' });
  console.log(`  2 of 3 cleared           : ${app.getCurrentStates()}`);

  // ---- The server restarts here. Persist, then rebuild from JSON. ----
  const stored = persist(app);
  console.log(`  [persisted ${stored.length} bytes to the "database"]`);
  app = load(stored);
  console.log(`  [restored — re-injected guards]`);

  await app.dispatch('FRAUD_OK', { officerId: 'co-3', reference: 'FR-2' });
  // The join fired automatically the moment the third check cleared.
  console.log(`  3rd cleared → join active : ${app.getCurrentStates()}`);

  await app.dispatch('SEND_TO_UW', { requestedBy: 'co-1' });
  console.log(`  sent to underwriting     : ${app.getCurrentStates()} (waiting on a human)`);

  // A junior staffer can't decide; the guard blocks them.
  const blocked = await app.dispatch('DECIDE', { underwriterId: 'intern-x', verdict: 'approve' });
  if (!blocked.success) console.log(`  intern tries to approve  → blocked: ${blocked.reason}`);

  // The underwriter finishes their manual review → resolve the wait, then decide.
  app.resolveWait('underwriting');
  await app.dispatch('DECIDE', {
    underwriterId: 'uw-205',
    verdict: 'approve',
    notes: 'Strong file; LTV within policy.',
  });
  console.log(`  underwriter approves     : ${app.getCurrentStates()}  terminal: ${app.isTerminal()}`);

  // ── Audit trail + time-travel ────────────────────────────────────────────────
  const snap = app.getSnapshot();
  console.log(`\n  Audit trail (${snap.history.length} entries):`);
  snap.history.forEach((h, i) => console.log(`    v${i + 1}: ${historyLabel(h)}`));

  // `rewind` reconstructs the EXACT state at an earlier version, non-destructively.
  const atUw = app.rewind(snap.history.findIndex((h) => historyLabel(h) === 'SEND_TO_UW') + 1);
  const waiting = Object.entries(atUw.stateStatuses)
    .filter(([, s]) => s === 'waiting')
    .map(([id]) => id);
  console.log(`  rewind to v${atUw.version}: waiting on → ${waiting.join(', ') || '—'}`);
  console.log(`  (live instance is untouched: still ${app.getCurrentStates()})`);

  // ── B. The deadline path: applicant never sends documents ─────────────────────
  console.log('\n=== B. No documents for 7 days → auto-withdrawn ===\n');
  const created = new Date('2026-06-01T00:00:00Z');
  // Pass an explicit creation time so the 7-day deadline is deterministic.
  const stale = injectGuards(
    loan.createInstance(
      'LN-002',
      { applicantName: 'Sam Carter', requestedAmount: 40_000, creditScore: 690, annualIncome: 60_000 },
      created,
    ),
  );
  console.log(`  created ${created.toISOString().slice(0, 10)} → ${stale.getCurrentStates()}`);
  console.log(`  withdraws at: ${stale.getNextDueAt()?.slice(0, 10)}`);

  // A scheduler sweeps 8 days later and ticks the idle instance.
  const fired = await stale.tick(new Date('2026-06-09T00:00:00Z'));
  console.log(`  tick(+8d) fired ${fired} deadline → ${stale.getCurrentStates()}  terminal: ${stale.isTerminal()}`);

  // ── JSON graph (e.g. to feed a dashboard renderer) ────────────────────────────
  console.log('\n=== JSON graph summary (for dashboards / Cytoscape / d3) ===\n');
  const graph = JsonGraphExporter.export(loan.getDefinition());
  console.log(`  nodes: ${graph.nodes.length}, edges: ${graph.edges.length}`);
  console.log(`  guarded transitions: ${graph.edges.filter((e) => e.hasGuard).length}`);
  console.log(`  timed transitions  : ${graph.edges.filter((e) => e.after !== undefined).length}`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
