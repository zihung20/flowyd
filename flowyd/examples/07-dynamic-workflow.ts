/**
 * Example 07 — Workflows Defined at Runtime: `createDynamicWorkflow`
 *
 * Every other example hard-codes its states, so flowyd infers a precise union
 * of state-ID literals and catches typos at COMPILE time. But sometimes the
 * shape of a workflow isn't known until runtime — it comes from a database row,
 * a JSON config, or a no-code builder UI. For that, use `createDynamicWorkflow`:
 * `TStates` is pre-widened to `string`, so you can `addStep`/`addTransition` in
 * loops. You trade compile-time state-ID checking for runtime validation — and
 * `build()` still enforces every structural and graph invariant.
 *
 * This example:
 *   1. Defines a plain-data `WorkflowConfig` (the kind of thing you'd store).
 *   2. Compiles ANY such config into a runnable workflow with one function.
 *   3. Shows `build()` REJECTING a malformed config (unreachable state).
 *   4. Generates an N-level approval chain purely from an array — the workflow's
 *      size is data, not code.
 *
 * Run with:  npx tsx examples/07-dynamic-workflow.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createDynamicWorkflow } from '../src/index.js';
import { MermaidExporter } from '../src/visualization/index.js';

// #region example
// ─── The config shape — what a database / JSON file / builder UI would emit ──────

interface WorkflowConfig {
  name: string;
  actions: string[];
  stages: { id: string; label: string }[];
  initial: string;
  terminal: string[];
  arcs: { from: string; to: string; on: string }[];
}

// On a dynamic workflow `TActions` is `Record<string, unknown>`, so dispatch
// payloads are `unknown` and the only statically-safe payload is `{}`. That fits
// config/no-code engines, which key off state (and context) rather than typed
// action payloads. A richer per-action schema is possible — you'd just validate
// and narrow at the dispatch boundary.
const ActionSchema = z.object({});

/**
 * Compile a runtime config into an executable workflow. Note that nothing here
 * knows the concrete state IDs — they're just strings flowing from the config.
 */
function compile(config: WorkflowConfig) {
  const builder = createDynamicWorkflow({ name: config.name });

  for (const action of config.actions) {
    builder.defineAction(action, ActionSchema);
  }
  for (const stage of config.stages) {
    builder.addStep(stage.id, { label: stage.label });
  }
  builder.setInitial(config.initial).setTerminal(config.terminal);
  for (const arc of config.arcs) {
    builder.addTransition({ from: arc.from, to: arc.to, on: arc.on });
  }

  // build() validates everything at runtime: unknown IDs, unreachable states,
  // unterminating graphs, missing action schemas, etc.
  return builder.build();
}

// ─── 1 & 2. A config loaded "from the database", compiled and run ───────────────

const onboardingConfig: WorkflowConfig = {
  name: 'employee-onboarding',
  actions: ['SEND_OFFER', 'ACCEPT', 'PROVISION', 'COMPLETE'],
  stages: [
    { id: 'candidate', label: 'Candidate' },
    { id: 'offer-sent', label: 'Offer Sent' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'provisioning', label: 'Provisioning' },
    { id: 'onboarded', label: 'Onboarded' },
  ],
  initial: 'candidate',
  terminal: ['onboarded'],
  arcs: [
    { from: 'candidate', to: 'offer-sent', on: 'SEND_OFFER' },
    { from: 'offer-sent', to: 'accepted', on: 'ACCEPT' },
    { from: 'accepted', to: 'provisioning', on: 'PROVISION' },
    { from: 'provisioning', to: 'onboarded', on: 'COMPLETE' },
  ],
};

// The workflow compiled from the config above — exported so the docs can render
// its diagram (dynamic workflows have no compile-time state IDs, but the
// compiled graph is just as inspectable as any other).
export const onboardingWorkflow = compile(onboardingConfig);

async function runConfigDriven() {
  console.log('=== 1. Compiled from a runtime config ===\n');
  const onboarding = compile(onboardingConfig);
  console.log(MermaidExporter.export(onboarding.getDefinition()));

  console.log('\n  Running it:');
  const hire = onboarding.createInstance('hire-7788');
  for (const action of onboardingConfig.actions) {
    const result = await hire.dispatch(action, {});
    if (result.success) console.log(`    ${action.padEnd(12)} → ${hire.getCurrentStates()}`);
  }
  console.log(`    terminal: ${hire.isTerminal()}`);
}

// ─── 3. A broken config is caught by build(), not at dispatch time ──────────────

function runValidation() {
  console.log('\n=== 2. build() rejects a malformed config ===\n');
  const broken: WorkflowConfig = {
    name: 'broken',
    actions: ['GO'],
    stages: [
      { id: 'start', label: 'Start' },
      { id: 'end', label: 'End' },
      { id: 'orphan', label: 'Orphan' }, // nothing points here
    ],
    initial: 'start',
    terminal: ['end'],
    arcs: [{ from: 'start', to: 'end', on: 'GO' }],
  };

  try {
    compile(broken);
    console.log('  (unexpected: build succeeded)');
  } catch (err) {
    console.log(`  build() threw, as it should:\n    ${(err as Error).message.split('\n').join('\n    ')}`);
  }
}

// ─── 4. The workflow's SIZE is data: an N-level approval chain ───────────────────

/** Build a linear approval chain with one stage per approver level. */
function buildApprovalChain(levels: string[]): WorkflowConfig {
  const stages = [
    { id: 'submitted', label: 'Submitted' },
    ...levels.map((lvl) => ({ id: `approve-${lvl}`, label: `Awaiting ${lvl}` })),
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
  ];

  // Chain: submitted → approve-L0 → approve-L1 → ... → approved.
  const chainIds = ['submitted', ...levels.map((l) => `approve-${l}`), 'approved'];
  const arcs: WorkflowConfig['arcs'] = [];
  for (let i = 0; i < chainIds.length - 1; i++) {
    arcs.push({ from: chainIds[i]!, to: chainIds[i + 1]!, on: 'APPROVE' });
  }
  // Any pending approval level can also reject.
  for (const lvl of levels) {
    arcs.push({ from: `approve-${lvl}`, to: 'rejected', on: 'REJECT' });
  }

  return {
    name: `approval-chain-${levels.length}`,
    actions: ['APPROVE', 'REJECT'],
    stages,
    initial: 'submitted',
    terminal: ['approved', 'rejected'],
    arcs,
  };
}

async function runGeneratedChain() {
  console.log('\n=== 3. A 4-level approval chain generated from an array ===\n');
  const levels = ['team-lead', 'manager', 'director', 'vp'];
  const chain = compile(buildApprovalChain(levels));
  console.log(`  generated ${chain.getDefinition().states.size} states from ${levels.length} levels\n`);

  const request = chain.createInstance('req-2026-42');
  console.log(`  start → ${request.getCurrentStates()}`);
  // Approve all the way up the chain.
  for (let i = 0; i <= levels.length; i++) {
    const r = await request.dispatch('APPROVE', {});
    if (r.success) console.log(`  APPROVE → ${request.getCurrentStates()}`);
  }
  console.log(`  terminal: ${request.isTerminal()}`);
}

async function main() {
  await runConfigDriven();
  runValidation();
  await runGeneratedChain();
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
