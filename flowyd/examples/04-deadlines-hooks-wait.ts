/**
 * Example 04 — Time & Side-Effects: Deadlines, Hooks, and Waiting
 *
 * Three features that make a workflow feel alive:
 *
 *   • Deadlines (`addTransition({ ..., after: '15m' })`) — a transition that
 *     fires on its own once enough time passes in the `from` state. The engine
 *     stays pure: it never reads a clock. The HOST supplies the time, via
 *     `createInstance(id, ctx, now)`, `dispatch(action, payload, { now })`, and
 *     `instance.tick(now)`. `getNextDueAt()` tells your scheduler when to wake.
 *
 *   • Lifecycle hooks (`onEnter` / `onExit`) — run a side effect when a state is
 *     entered or exited (notify on-call, write an audit row, send a survey).
 *     They fire AFTER the transition is committed.
 *
 *   • Wait states (`addWait` + `resolveWait`) — pause until an external system
 *     reports back (a vendor, a webhook, another workflow).
 *
 * A support ticket with SLAs:
 *
 *   triage ──ASSIGN──▶ in-progress ──RESOLVE──▶ resolved ✓
 *     │  (15m SLA)         │  (4h SLA)   │
 *     ▼                    ▼             └─ESCALATE_TO_VENDOR─▶ awaiting-vendor ⟂
 *   escalated ◀───────────┘                                          │ VENDOR_REPLIED
 *     │ RESOLVE                                                       ▼
 *     └──────────────────────────────────────────────────────▶ (back to in-progress)
 *
 * Run with:  npx tsx examples/04-deadlines-hooks-wait.ts
 */

import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWorkflow, type HookContext } from '../src/index.js';

// #region example
// ─── A clock we control, so the example is fully deterministic ──────────────────

const T0 = new Date('2026-06-07T09:00:00.000Z');
const at = (mins: number): Date => new Date(T0.getTime() + mins * 60_000);
const clock = (d: Date): string => d.toISOString().slice(11, 16); // HH:MM

// ─── Hooks: side effects, kept out of the transition logic itself ───────────────

const notifyOnCall = (ctx: HookContext): void => {
  console.log(`     ↳ [hook onEnter ${ctx.stateId}] paging on-call engineer`);
};
const stampTriaged = (ctx: HookContext): void => {
  console.log(`     ↳ [hook onExit ${ctx.stateId}] recording triage completion`);
};
const sendSurvey = (ctx: HookContext): void => {
  console.log(`     ↳ [hook onEnter ${ctx.stateId}] emailing satisfaction survey`);
};

// ─── Action payloads ────────────────────────────────────────────────────────────

const AssignSchema = z.object({ agentId: z.string() });
const VendorSchema = z.object({ vendorTicket: z.string() });
const ReplySchema = z.object({ summary: z.string() });
const ResolveSchema = z.object({ agentId: z.string(), resolution: z.string() });

// ─── Workflow ────────────────────────────────────────────────────────────────────

export const ticket = createWorkflow({ name: 'support-ticket' })
  .defineAction('ASSIGN', AssignSchema)
  .defineAction('ESCALATE_TO_VENDOR', VendorSchema)
  .defineAction('VENDOR_REPLIED', ReplySchema)
  .defineAction('RESOLVE', ResolveSchema)

  .addStep('triage', { label: 'Triage', onExit: stampTriaged })
  .addStep('in-progress', { label: 'In Progress' })
  .addWait('awaiting-vendor', { label: 'Awaiting Vendor', externalName: 'vendor-support' })
  .addStep('escalated', { label: 'Escalated', onEnter: notifyOnCall })
  .addStep('resolved', { label: 'Resolved', onEnter: sendSurvey })

  .setInitial('triage')
  .setTerminal(['resolved'])

  // Action-triggered arcs:
  .addTransition({ from: 'triage', to: 'in-progress', on: 'ASSIGN' })
  .addTransition({ from: 'in-progress', to: 'awaiting-vendor', on: 'ESCALATE_TO_VENDOR' })
  .addTransition({ from: 'awaiting-vendor', to: 'in-progress', on: 'VENDOR_REPLIED' })
  .addTransition({ from: 'in-progress', to: 'resolved', on: 'RESOLVE' })
  .addTransition({ from: 'escalated', to: 'resolved', on: 'RESOLVE' })

  // Time-triggered arcs (deadlines). Exactly one of `on` / `after` per arc.
  // The clock for each is anchored to when its `from` state is entered.
  .addTransition({ from: 'triage', to: 'escalated', after: '15m' }) // breach if not assigned
  .addTransition({ from: 'in-progress', to: 'escalated', after: '4h' }) // breach if not resolved

  .build();

// ─── Run ─────────────────────────────────────────────────────────────────────────

async function run() {
  // ── A. Handled within SLA — the deadline never fires ──────────────────────────
  console.log('=== A. Resolved inside the SLA window ===\n');
  const a = ticket.createInstance('TKT-A', undefined, T0); // created at 09:00
  console.log(`  09:00 created            → ${a.getCurrentStates()}`);
  console.log(`  next deadline armed at   → ${clock(new Date(a.getNextDueAt()!))} (15m triage SLA)`);

  await a.dispatch('ASSIGN', { agentId: 'sam' }, { now: at(5) }); // 09:05
  console.log(`  09:05 ASSIGN             → ${a.getCurrentStates()}`);
  await a.dispatch('RESOLVE', { agentId: 'sam', resolution: 'restarted the node' }, { now: at(40) });
  console.log(`  09:40 RESOLVE            → ${a.getCurrentStates()}  terminal: ${a.isTerminal()}`);

  // ── B. SLA breach — a scheduler ticks an idle instance and the deadline fires ──
  console.log('\n=== B. Nobody picks it up → 15m deadline auto-escalates ===\n');
  const b = ticket.createInstance('TKT-B', undefined, T0);
  console.log(`  09:00 created            → ${b.getCurrentStates()}`);

  // Your scheduler stores getNextDueAt() and wakes up at that time to call tick().
  const due = b.getNextDueAt()!;
  console.log(`  deadline due at          → ${clock(new Date(due))}`);

  const fired = await b.tick(at(20)); // scheduler wakes at 09:20, past the 15m SLA
  console.log(`  09:20 tick()             → ${fired} deadline(s) fired → ${b.getCurrentStates()}`);

  // The escalated ticket can still be resolved by the on-call engineer.
  await b.dispatch('RESOLVE', { agentId: 'on-call', resolution: 'mitigated' }, { now: at(25) });
  console.log(`  09:25 RESOLVE            → ${b.getCurrentStates()}  terminal: ${b.isTerminal()}`);

  // ── C. Waiting on an external system, then resuming ───────────────────────────
  console.log('\n=== C. Escalate to a vendor (wait), then resume on their reply ===\n');
  const c = ticket.createInstance('TKT-C', undefined, T0);
  await c.dispatch('ASSIGN', { agentId: 'pat' }, { now: at(2) });
  await c.dispatch('ESCALATE_TO_VENDOR', { vendorTicket: 'V-7781' }, { now: at(10) });
  console.log(`  09:10 to vendor          → ${c.getCurrentStates()} (status: waiting)`);
  console.log(`  any deadline armed?      → ${c.getNextDueAt() ?? 'none (paused on the vendor)'}`);

  // ...hours later the vendor replies. The host promotes the wait state, then a
  // normal dispatch carries the vendor's payload into the audit trail.
  c.resolveWait('awaiting-vendor', { now: at(180) });
  await c.dispatch('VENDOR_REPLIED', { summary: 'firmware patch shipped' }, { now: at(181) });
  console.log(`  12:01 vendor replied     → ${c.getCurrentStates()}`);
  await c.dispatch('RESOLVE', { agentId: 'pat', resolution: 'applied vendor patch' }, { now: at(190) });
  console.log(`  12:10 RESOLVE            → ${c.getCurrentStates()}  terminal: ${c.isTerminal()}`);
}

// #endregion example

// Run the demo only when this file is executed directly (not when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(console.error);
}
