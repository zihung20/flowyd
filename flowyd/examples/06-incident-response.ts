/**
 * Example 06 — A Real Operational Runbook: On-Call Incident Response
 *
 * The same "everything together" weight as example 05, but a different shape:
 * an operations runbook driven by ROLES and SLAs rather than by applicant data.
 * It highlights things the loan example doesn't:
 *
 *   • Role-based guards    — `Guard.inject` resolved from "who is acting", the
 *                            way you'd resolve a role from a session/JWT.
 *   • Multiple SLAs        — deadlines that escalate when humans are too slow,
 *                            INCLUDING a deadline that fires from a WAITING
 *                            state (the vendor SLA) — a wait state can time out.
 *   • Parallel mobilisation — page on-call + post status page + notify
 *                            stakeholders, joined with `mode: 'all'`.
 *   • Persistence pattern   — snapshot → restore → RE-INJECT the role guards.
 *   • Dashboard export      — `JsonGraphExporter` grouped by node kind.
 *
 *   detected ─ACK─▶ triaged ─MOBILISE─▶ (fork) ──▶ [page/status/notify] ──▶ (join all)
 *      │ (15m)        ▲                                                          │
 *   escalated ─ACK────┘                                          START_MITIGATION│
 *                                                                          mitigating ◀─┐
 *                                              ENGAGE_VENDOR │      │ MITIGATED         │
 *                                                awaiting-vendor ⟂  ▼                   │
 *                                                  │  (2h SLA, fires    monitoring      │
 *                                                  │   from WAITING) ───────┘ RESOLVE   │
 *                                       VENDOR_PATCHED ─────────────────────────────────┘
 *                                                                       resolved ✓
 *
 * Run with:  npx tsx examples/06-incident-response.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWorkflow, Guard, type HookContext, type HistoryEntry, type WorkflowInstance } from '../src/index.js';
import { JsonGraphExporter } from '../src/visualization/index.js';
import { StateKind } from '../src/index.js';

// #region example
// ─── "Who is acting", resolved by the injected role guards ──────────────────────

type Role = 'on-call' | 'commander' | 'observer';
let currentResponder: Role = 'observer';

// ─── Action payloads ────────────────────────────────────────────────────────────

const AckSchema = z.object({ responder: z.string(), severity: z.enum(['sev1', 'sev2', 'sev3']) });
const MobiliseSchema = z.object({ commander: z.string() });
const TaskDoneSchema = z.object({ by: z.string() });
const VendorSchema = z.object({ vendor: z.string(), caseRef: z.string() });
const PatchSchema = z.object({ summary: z.string() });
const ResolveSchema = z.object({ commander: z.string(), rootCause: z.string() });

// ─── Hooks (paging / docs) — deliberately separate from transition logic ────────

const log = (m: string): void => console.log(`     ↳ ${m}`);
const pageCommander = (c: HookContext): void => log(`[hook ${c.stateId}] auto-paging incident commander (SLA breach)`);
const openPostmortem = (c: HookContext): void => log(`[hook ${c.stateId}] opening post-mortem document`);

// ─── Role guards (placeholders; resolved per instance) ──────────────────────────

const isOnCall = Guard.inject('isOnCall');
const isCommander = Guard.inject('isCommander');

// ─── Workflow ────────────────────────────────────────────────────────────────────

export const incident = createWorkflow({ name: 'incident-response' })
  .defineAction('ACK', AckSchema)
  .defineAction('MOBILISE', MobiliseSchema)
  .defineAction('PAGED', TaskDoneSchema)
  .defineAction('STATUS_POSTED', TaskDoneSchema)
  .defineAction('STAKEHOLDERS_INFORMED', TaskDoneSchema)
  .defineAction('START_MITIGATION', MobiliseSchema)
  .defineAction('ENGAGE_VENDOR', VendorSchema)
  .defineAction('VENDOR_PATCHED', PatchSchema)
  .defineAction('MITIGATED', TaskDoneSchema)
  .defineAction('RESOLVE', ResolveSchema)

  .addStep('detected', { label: 'Detected' })
  .addStep('escalated', { label: 'Escalated', onEnter: pageCommander })
  .addStep('triaged', { label: 'Triaged' })

  // done states (registered before the join)
  .addStep('oncall-paged', { label: 'On-call Paged' })
  .addStep('statuspage-updated', { label: 'Status Page Updated' })
  .addStep('stakeholders-notified', { label: 'Stakeholders Notified' })
  // in-progress states (registered before the fork)
  .addStep('page-oncall', { label: 'Page On-call' })
  .addStep('update-statuspage', { label: 'Update Status Page' })
  .addStep('notify-stakeholders', { label: 'Notify Stakeholders' })

  .addFork('respond', {
    label: 'Mobilise Response',
    targets: ['page-oncall', 'update-statuspage', 'notify-stakeholders'],
  })
  .addJoin('response-ready', {
    label: 'Response Mobilised',
    requires: ['oncall-paged', 'statuspage-updated', 'stakeholders-notified'],
    mode: 'all',
  })

  .addStep('mitigating', { label: 'Mitigating' })
  .addWait('awaiting-vendor', { label: 'Awaiting Vendor', externalName: 'vendor-escalation' })
  .addStep('monitoring', { label: 'Monitoring' })
  .addStep('resolved', { label: 'Resolved', onEnter: openPostmortem })

  .setInitial('detected')
  .setTerminal(['resolved'])

  // Acknowledge within 15 minutes or the incident auto-escalates.
  .addTransition({ from: 'detected', to: 'triaged', on: 'ACK', guard: isOnCall })
  .addTransition({ from: 'detected', to: 'escalated', after: '15m' })
  .addTransition({ from: 'escalated', to: 'triaged', on: 'ACK', guard: isOnCall })

  .addTransition({ from: 'triaged', to: 'respond', on: 'MOBILISE', guard: isCommander })

  // Parallel response tasks.
  .addTransition({ from: 'page-oncall', to: 'oncall-paged', on: 'PAGED' })
  .addTransition({ from: 'update-statuspage', to: 'statuspage-updated', on: 'STATUS_POSTED' })
  .addTransition({ from: 'notify-stakeholders', to: 'stakeholders-notified', on: 'STAKEHOLDERS_INFORMED' })

  .addTransition({ from: 'response-ready', to: 'mitigating', on: 'START_MITIGATION', guard: isCommander })

  // Vendor escalation is a wait state WITH its own deadline: if the vendor goes
  // quiet for 2 hours, fall back to mitigating internally (a timed edge can fire
  // from a `waiting` state, not just an `active` one).
  .addTransition({ from: 'mitigating', to: 'awaiting-vendor', on: 'ENGAGE_VENDOR' })
  .addTransition({ from: 'awaiting-vendor', to: 'mitigating', on: 'VENDOR_PATCHED' })
  .addTransition({ from: 'awaiting-vendor', to: 'mitigating', after: '2h' })

  .addTransition({ from: 'mitigating', to: 'monitoring', on: 'MITIGATED' })
  .addTransition({ from: 'monitoring', to: 'resolved', on: 'RESOLVE', guard: isCommander })

  .build();

// ─── Service helpers: inject the role guards on create AND after restore ─────────

type IncidentInstance = WorkflowInstance<{
  ACK: z.infer<typeof AckSchema>;
  MOBILISE: z.infer<typeof MobiliseSchema>;
  PAGED: z.infer<typeof TaskDoneSchema>;
  STATUS_POSTED: z.infer<typeof TaskDoneSchema>;
  STAKEHOLDERS_INFORMED: z.infer<typeof TaskDoneSchema>;
  START_MITIGATION: z.infer<typeof MobiliseSchema>;
  ENGAGE_VENDOR: z.infer<typeof VendorSchema>;
  VENDOR_PATCHED: z.infer<typeof PatchSchema>;
  MITIGATED: z.infer<typeof TaskDoneSchema>;
  RESOLVE: z.infer<typeof ResolveSchema>;
}>;

function injectRoles(inst: IncidentInstance): IncidentInstance {
  return inst
    .injectGuard('isOnCall', () => currentResponder === 'on-call')
    .injectGuard('isCommander', () => currentResponder === 'commander');
}

const T0 = new Date('2026-06-07T03:00:00.000Z');
const at = (mins: number): Date => new Date(T0.getTime() + mins * 60_000);
const hhmm = (iso: string): string => iso.slice(11, 16);

function historyLabel(h: HistoryEntry): string {
  if (h.kind === 'action') return h.action;
  if (h.kind === 'timeout') return `${h.from}→${h.to} (SLA)`;
  return `resolve:${h.stateId}`;
}

// ─── Run ─────────────────────────────────────────────────────────────────────────

async function run() {
  // ── A. Smooth response (with a mid-incident persistence round-trip) ───────────
  console.log('=== A. A well-run incident ===\n');
  let inc = injectRoles(incident.createInstance('INC-911', undefined, T0));

  currentResponder = 'on-call';
  await inc.dispatch('ACK', { responder: 'rae', severity: 'sev2' }, { now: at(3) });
  console.log(`  03:03 ACK (on-call)      → ${inc.getCurrentStates()}`);

  currentResponder = 'commander';
  await inc.dispatch('MOBILISE', { commander: 'kim' }, { now: at(5) });
  console.log(`  03:05 MOBILISE           → ${inc.getCurrentStates()}`);
  console.log(`  buttons available now    → ${inc.getAvailableTransitions().sort().join(', ')}`);

  await inc.dispatch('PAGED', { by: 'rae' }, { now: at(6) });
  await inc.dispatch('STATUS_POSTED', { by: 'comms' }, { now: at(7) });

  // Persist mid-incident (handing off to the next shift), then rebuild.
  const stored = JSON.stringify(inc.getSnapshot());
  inc = injectRoles(incident.restoreInstance(JSON.parse(stored) as Parameters<typeof incident.restoreInstance>[0]));
  console.log(`  [handover: persisted + restored, roles re-injected]`);

  await inc.dispatch('STAKEHOLDERS_INFORMED', { by: 'comms' }, { now: at(9) });
  console.log(`  03:09 all tasks done→join → ${inc.getCurrentStates()}`);

  currentResponder = 'commander';
  await inc.dispatch('START_MITIGATION', { commander: 'kim' }, { now: at(10) });
  await inc.dispatch('MITIGATED', { by: 'kim' }, { now: at(35) });
  await inc.dispatch('RESOLVE', { commander: 'kim', rootCause: 'bad deploy rolled back' }, { now: at(70) });
  console.log(`  04:10 RESOLVE            → ${inc.getCurrentStates()}  terminal: ${inc.isTerminal()}`);
  console.log(`  timeline: ${inc.getSnapshot().history.map(historyLabel).join(' → ')}`);

  // ── B. Nobody acknowledges → 15m SLA auto-escalates ───────────────────────────
  console.log('\n=== B. Acknowledgement SLA breached ===\n');
  const slow = injectRoles(incident.createInstance('INC-912', undefined, T0));
  console.log(`  03:00 detected           → next SLA at ${hhmm(slow.getNextDueAt()!)}`);
  const fired = await slow.tick(at(18)); // scheduler sweeps at 03:18
  console.log(`  03:18 tick → ${fired} fired → ${slow.getCurrentStates()}`);

  // ── C. Vendor goes silent → the WAITING state itself times out ────────────────
  console.log('\n=== C. A deadline that fires from a waiting state ===\n');
  const v = injectRoles(incident.createInstance('INC-913', undefined, T0));
  currentResponder = 'on-call';
  await v.dispatch('ACK', { responder: 'rae', severity: 'sev1' }, { now: at(1) });
  currentResponder = 'commander';
  await v.dispatch('MOBILISE', { commander: 'kim' }, { now: at(2) });
  await v.dispatch('PAGED', { by: 'rae' }, { now: at(3) });
  await v.dispatch('STATUS_POSTED', { by: 'comms' }, { now: at(3) });
  await v.dispatch('STAKEHOLDERS_INFORMED', { by: 'comms' }, { now: at(3) });
  await v.dispatch('START_MITIGATION', { commander: 'kim' }, { now: at(4) });
  await v.dispatch('ENGAGE_VENDOR', { vendor: 'CloudCo', caseRef: 'CC-42' }, { now: at(5) });
  console.log(`  vendor engaged           → ${v.getCurrentStates()} (waiting)`);
  // Unlike a plain wait, this one is on the clock:
  console.log(`  vendor SLA due at        → ${hhmm(v.getNextDueAt()!)} (2h)`);
  const vf = await v.tick(at(126)); // 2h+ later, vendor never replied
  console.log(`  +2h tick → ${vf} fired   → ${v.getCurrentStates()} (fell back to internal mitigation)`);

  // ── Dashboard export, grouped by node kind ────────────────────────────────────
  console.log('\n=== Workflow shape (JsonGraphExporter, for an ops dashboard) ===\n');
  const graph = JsonGraphExporter.export(incident.getDefinition());
  for (const kind of Object.values(StateKind)) {
    const ids = graph.nodes.filter((n) => n.kind === kind).map((n) => n.id);
    console.log(`  ${kind.padEnd(5)}: ${ids.join(', ')}`);
  }
  console.log(`  edges: ${graph.edges.length} total, ` +
    `${graph.edges.filter((e) => e.hasGuard).length} guarded, ` +
    `${graph.edges.filter((e) => e.after !== undefined).length} timed`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
