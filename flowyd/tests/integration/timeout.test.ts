import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createWorkflow, createDynamicWorkflow, Guard } from '../../src/index.js';

/**
 * Builds a purchase-order approval that escalates 48h after entering
 * `pending-approval`, unless approved or rejected first.
 */
function makeApproval() {
  return createWorkflow({ name: 'po-timeout' })
    .defineAction('SUBMIT', z.object({ by: z.string() }))
    .defineAction('APPROVE', z.object({ by: z.string() }))
    .addStep('draft')
    .addStep('pending-approval')
    .addStep('escalated')
    .addStep('approved')
    .setInitial('draft')
    .setTerminal(['approved', 'escalated'])
    .addTransition({ from: 'draft', to: 'pending-approval', on: 'SUBMIT' })
    .addTransition({ from: 'pending-approval', to: 'approved', on: 'APPROVE' })
    .addTransition({ from: 'pending-approval', to: 'escalated', after: '48h' })
    .build();
}

const HOUR = 3_600_000;

describe('time-triggered transitions (timeouts)', () => {
  it('arms a deadline and reports the next due time after entering the source state', async () => {
    const inst = makeApproval().createInstance('po-1');
    expect(inst.getNextDueAt()).toBeNull(); // draft has no deadline

    await inst.dispatch('SUBMIT', { by: 'alice' });
    const due = inst.getNextDueAt();
    expect(due).not.toBeNull();
    // 48h after the SUBMIT history entry.
    const entered = Date.parse(inst.getSnapshot().history.at(-1)!.at);
    expect(Date.parse(due!)).toBe(entered + 48 * HOUR);
  });

  it('tick before the deadline does nothing; tick after it fires the timeout', async () => {
    const inst = makeApproval().createInstance('po-2');
    await inst.dispatch('SUBMIT', { by: 'alice' });
    const enteredAt = Date.parse(inst.getSnapshot().history.at(-1)!.at);

    expect(await inst.tick(new Date(enteredAt + 47 * HOUR))).toBe(0);
    expect(inst.getCurrentStates()).toEqual(['pending-approval']);

    expect(await inst.tick(new Date(enteredAt + 48 * HOUR))).toBe(1);
    expect(inst.getCurrentStates()).toEqual(['escalated']);
    expect(inst.isTerminal()).toBe(true);
    expect(inst.getNextDueAt()).toBeNull();
  });

  it('records a synthetic timeout action stamped with the logical due time', async () => {
    const inst = makeApproval().createInstance('po-3');
    await inst.dispatch('SUBMIT', { by: 'alice' });
    const enteredAt = Date.parse(inst.getSnapshot().history.at(-1)!.at);

    await inst.tick(new Date(enteredAt + 50 * HOUR)); // late sweep
    const entry = inst.getSnapshot().history.at(-1)!;
    expect(entry.kind).toBe('timeout');
    if (entry.kind === 'timeout') {
      expect(entry.from).toBe('pending-approval');
      expect(entry.to).toBe('escalated');
    }
    expect(entry.exitedStates).toEqual(['pending-approval']);
    expect(entry.enteredStates).toEqual(['escalated']);
    // Stamped with dueAt (48h), not the wall-clock sweep time (50h).
    expect(Date.parse(entry.at)).toBe(enteredAt + 48 * HOUR);
  });

  it('does not fire when the action wins before the deadline', async () => {
    const inst = makeApproval().createInstance('po-4');
    await inst.dispatch('SUBMIT', { by: 'alice' });
    await inst.dispatch('APPROVE', { by: 'mgr' });
    expect(inst.getCurrentStates()).toEqual(['approved']);
    expect(inst.getNextDueAt()).toBeNull();
  });

  it('dispatch auto-advances overdue deadlines first, blocking a stale action', async () => {
    const wf = makeApproval();
    const inst = wf.createInstance('po-5');
    await inst.dispatch('SUBMIT', { by: 'alice' });

    // Persist, then restore far in the future (server was offline past the SLA).
    const snap = inst.getSnapshot();
    const enteredAt = Date.parse(snap.history.at(-1)!.at);
    const restored = wf.restoreInstance(snap);

    // restore is faithful — the deadline has not fired yet.
    expect(restored.getCurrentStates()).toEqual(['pending-approval']);

    // A late APPROVE: dispatch advances to the injected `now` first, the timeout
    // already fired, so the source is gone and APPROVE is blocked. No clock
    // mocking — the host owns the time.
    const lateNow = new Date(enteredAt + 60 * HOUR);
    const result = await restored.dispatch('APPROVE', { by: 'mgr' }, { now: lateNow });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('terminal-state');
    }
    expect(restored.getCurrentStates()).toEqual(['escalated']);
  });

  it('counts the initial-state deadline from an injected creation time', async () => {
    const wf = createWorkflow({ name: 'injected-clock' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .addStep('expired')
      .setInitial('start')
      .setTerminal(['expired'])
      .addTransition({ from: 'start', to: 'expired', after: '1h' })
      .build();

    const created = new Date('2026-06-06T00:00:00.000Z');
    // No-context workflow: context is the 2nd arg, injected `now` the 3rd.
    const inst = wf.createInstance('clk-1', undefined, created);
    // Deterministic: due exactly 1h after the injected createdAt, no real clock.
    expect(inst.getNextDueAt()).toBe('2026-06-06T01:00:00.000Z');

    expect(await inst.tick(new Date('2026-06-06T00:59:00.000Z'))).toBe(0);
    expect(await inst.tick(new Date('2026-06-06T01:00:00.000Z'))).toBe(1);
    expect(inst.getCurrentStates()).toEqual(['expired']);
  });

  it('stamps the dispatch history entry with an injected now', async () => {
    const inst = makeApproval().createInstance('po-now');
    const at = new Date('2026-06-06T09:15:00.000Z');
    await inst.dispatch('SUBMIT', { by: 'alice' }, { now: at });
    const snap = inst.getSnapshot();
    // Deterministic timestamp — the engine is handed the time, it never reads a clock.
    expect(snap.history.at(-1)!.at).toBe('2026-06-06T09:15:00.000Z');
    expect(snap.updatedAt).toBe('2026-06-06T09:15:00.000Z');
    // And that injected time anchors the next deadline.
    expect(inst.getNextDueAt()).toBe('2026-06-08T09:15:00.000Z'); // +48h
  });

  it('catches up through chained deadlines in one tick, in due-time order', async () => {
    const wf = createWorkflow({ name: 'chained' })
      .defineAction('GO', z.object({}))
      .addStep('a')
      .addStep('b')
      .addStep('c')
      .setInitial('a')
      .setTerminal(['c'])
      .addTransition({ from: 'a', to: 'b', after: '1h' })
      .addTransition({ from: 'b', to: 'c', after: '1h' })
      .build();
    const inst = wf.createInstance('chain-1');
    const start = Date.parse(inst.getSnapshot().createdAt);

    // Sweep long after both deadlines passed — both fire in one tick.
    const fired = await inst.tick(new Date(start + 10 * HOUR));
    expect(fired).toBe(2);
    expect(inst.getCurrentStates()).toEqual(['c']);

    const history = inst.getSnapshot().history;
    expect(Date.parse(history[0]!.at)).toBe(start + 1 * HOUR); // a→b at +1h
    expect(Date.parse(history[1]!.at)).toBe(start + 2 * HOUR); // b→c at +2h (logical, chained)
  });

  it('lets a parallel branch give up via a deadline so the join proceeds', async () => {
    const wf = createWorkflow({ name: 'incident' })
      .defineAction('REPORT', z.object({}))
      .defineAction('CLEAR_ENG', z.object({}))
      .defineAction('CLOSE', z.object({}))
      .addStep('start')
      .addStep('eng-review')
      .addStep('sec-review')
      .addStep('sec-skipped') // dead-end → auto-completes on entry
      .addStep('eng-done') // dead-end → auto-completes on entry
      .addFork('investigate', { targets: ['eng-review', 'sec-review'] })
      .addJoin('resolved', { requires: ['eng-review', 'sec-review'], mode: 'all' })
      .addStep('closed')
      .setInitial('start')
      .setTerminal(['closed'])
      .addTransition({ from: 'start', to: 'investigate', on: 'REPORT' })
      .addTransition({ from: 'eng-review', to: 'eng-done', on: 'CLEAR_ENG' })
      .addTransition({ from: 'sec-review', to: 'sec-skipped', after: '1h' })
      .addTransition({ from: 'resolved', to: 'closed', on: 'CLOSE' })
      .build();

    const inst = wf.createInstance('inc-1');
    await inst.dispatch('REPORT', {}); // fork fans out
    const forkedAt = Date.parse(inst.getSnapshot().history.at(-1)!.at);
    expect(inst.getCurrentStates().sort()).toEqual(['eng-review', 'sec-review']);

    // Security stalls; after 1h its branch gives up and the join needs eng only.
    await inst.tick(new Date(forkedAt + 1 * HOUR));
    expect(inst.getStateStatus('sec-review')).toBe('completed');

    await inst.dispatch('CLEAR_ENG', {});
    expect(inst.getCurrentStates()).toEqual(['resolved']);
  });

  it('re-evaluates a guarded deadline on each tick until it passes', async () => {
    const wf = createWorkflow({ name: 'guarded-timeout' })
      .defineAction('NOOP', z.object({}))
      .setContext(z.object({ allowEscalation: z.boolean() }))
      .addStep('waiting-room')
      .addStep('escalated')
      .addStep('done')
      .setInitial('waiting-room')
      .setTerminal(['escalated', 'done'])
      .addTransition({
        from: 'waiting-room',
        to: 'escalated',
        after: '1h',
        guard: (ctx) => ctx.context.allowEscalation,
      })
      .addTransition({ from: 'waiting-room', to: 'done', on: 'NOOP' })
      .build();

    const inst = wf.createInstance('g-1', { allowEscalation: false });
    const start = Date.parse(inst.getSnapshot().createdAt);

    // Overdue, but the guard blocks — nothing fires, source stays put.
    expect(await inst.tick(new Date(start + 2 * HOUR))).toBe(0);
    expect(inst.getCurrentStates()).toEqual(['waiting-room']);

    // Flip the guard; a later tick now fires the (still-overdue) deadline.
    inst.setContext({ allowEscalation: true });
    expect(await inst.tick(new Date(start + 3 * HOUR))).toBe(1);
    expect(inst.getCurrentStates()).toEqual(['escalated']);
  });

  it('rewind reconstructs state across a fired timeout', async () => {
    const inst = makeApproval().createInstance('po-rw');
    await inst.dispatch('SUBMIT', { by: 'alice' });
    const enteredAt = Date.parse(inst.getSnapshot().history.at(-1)!.at);
    await inst.tick(new Date(enteredAt + 48 * HOUR));

    expect(inst.getSnapshot().version).toBe(2);
    const atV1 = inst.rewind(1);
    expect(atV1.stateStatuses['pending-approval']).toBe('active');
    expect(atV1.stateStatuses['escalated']).toBe('idle');
    expect(atV1.isTerminal).toBe(false);
  });

  describe('duration parsing & build validation', () => {
    it('accepts unit strings and raw millisecond numbers', () => {
      const wf = createWorkflow({ name: 'durations' })
        .defineAction('X', z.object({}))
        .addStep('s')
        .addStep('t')
        .setInitial('s')
        .setTerminal(['t'])
        .addTransition({ from: 's', to: 't', after: 1500 })
        .build();
      const inst = wf.createInstance('d-1');
      const start = Date.parse(inst.getSnapshot().createdAt);
      expect(Date.parse(inst.getNextDueAt()!)).toBe(start + 1500);
    });

    it('rejects an invalid duration string at addTransition time', () => {
      expect(() =>
        createDynamicWorkflow({ name: 'bad' }).addTransition({
          from: 'a',
          to: 'b',
          after: 'soon',
        }),
      ).toThrow(/Invalid duration/);
    });
  });

  describe('visualization', () => {
    it('labels a timed edge with its duration in Mermaid output', async () => {
      const { MermaidExporter } = await import('../../src/visualization/index.js');
      const mermaid = MermaidExporter.export(makeApproval().getDefinition());
      // 48h normalises to its most compact whole-unit form (2 days).
      expect(mermaid).toContain('pending_approval --> escalated : after 2d');
    });

    it('carries `after` instead of `action` on a timed edge in the JSON graph', async () => {
      const { JsonGraphExporter } = await import('../../src/visualization/index.js');
      const graph = JsonGraphExporter.export(makeApproval().getDefinition());
      const timed = graph.edges.find((e) => e.from === 'pending-approval' && e.to === 'escalated');
      expect(timed?.after).toBe(48 * HOUR);
      expect(timed?.action).toBeUndefined();
    });
  });

  it('composes a guarded timed edge with Guard combinators', async () => {
    const wf = createWorkflow({ name: 'guard-combinator' })
      .defineAction('DONE', z.object({}))
      .addStep('start')
      .addStep('timed-out')
      .addStep('finished')
      .setInitial('start')
      .setTerminal(['timed-out', 'finished'])
      .addTransition({ from: 'start', to: 'finished', on: 'DONE' })
      .addTransition({ from: 'start', to: 'timed-out', after: '1h', guard: Guard.always() })
      .build();
    const inst = wf.createInstance('gc-1');
    const start = Date.parse(inst.getSnapshot().createdAt);
    expect(await inst.tick(new Date(start + 1 * HOUR))).toBe(1);
    expect(inst.getCurrentStates()).toEqual(['timed-out']);
  });
});
