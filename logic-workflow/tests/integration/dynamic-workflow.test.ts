import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { WorkflowBuilder } from '../../src/core/builder.js';

// ---------------------------------------------------------------------------
// Helpers — dynamic builders
//
// Without `as const`, TypeScript cannot infer a literal TStates union from a
// runtime string[]. Casting to [string, ...string[]] gives TStates = string,
// which accepts any string for state IDs — compile-time safety is intentionally
// absent. Runtime validation via build() is the only guard.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildLinearChain(stateIds: string[]) {
  if (stateIds.length < 2) throw new Error('need at least 2 states');

  // stateIds is a runtime value; cast to non-empty tuple so TStates = string.
  const builder = new WorkflowBuilder({ name: 'dynamic-linear', states: stateIds as [string, ...string[]] })
    .defineAction('NEXT', z.object({}));

  for (const id of stateIds) {
    builder.addStep(id);
  }

  // noUncheckedIndexedAccess: guard guarantees length >= 2, so these are safe.
  builder.setInitial(stateIds[0]!);
  builder.setTerminal([stateIds[stateIds.length - 1]!]);

  for (let i = 0; i < stateIds.length - 1; i++) {
    builder.addTransition({ from: stateIds[i]!, to: stateIds[i + 1]!, on: 'NEXT' });
  }

  return builder.build();
}

/**
 * Build a fan-out / fan-in workflow at runtime:
 *   start → fork → [branch-0 … branch-N] → join → end
 *
 * Each branch completes on its own `DONE_<i>` action. Because the action
 * names are computed in a loop, TypeScript cannot track the TActions
 * accumulation statically — the builder is cast to a wide type after the
 * statically-known actions are defined. The WorkflowDefinition returned has
 * TActions = Record<string, ZodTypeAny>, so dispatch() accepts any string.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildParallelBranches(branchCount: number) {
  const branches = Array.from({ length: branchCount }, (_, i) => `branch-${i}`);
  const allStates = ['start', 'fork', ...branches, 'join', 'end'];

  const initial = new WorkflowBuilder({ name: 'dynamic-parallel', states: allStates as [string, ...string[]] })
    .defineAction('START', z.object({}))
    .defineAction('COMPLETE_ALL', z.object({}));

  // After the statically-known actions, cast to a wide builder so that
  // loop-defined action names (`DONE_${i}`) are accepted by TypeScript.
  // At runtime defineAction always returns `this`, so no data is lost.
  const builder = initial as unknown as WorkflowBuilder<Record<string, unknown>, string>;

  for (let i = 0; i < branchCount; i++) {
    builder.defineAction(`DONE_${i}`, z.object({}));
  }

  builder
    .addStep('start')
    .addFork('fork', { targets: branches as [string, ...string[]] });

  for (const b of branches) {
    builder.addStep(b);
  }

  builder
    .addJoin('join', { requires: branches as [string, ...string[]], mode: 'all' })
    .addStep('end')
    .setInitial('start')
    .setTerminal(['end'])
    .addTransition({ from: 'start', to: 'fork', on: 'START' })
    .addTransition({ from: 'join', to: 'end', on: 'COMPLETE_ALL' });

  for (let i = 0; i < branchCount; i++) {
    builder.addTransition({ from: `branch-${i}`, to: 'join', on: `DONE_${i}` });
  }

  return builder.build();
}

// ---------------------------------------------------------------------------
// Linear chain tests
// ---------------------------------------------------------------------------

describe('Dynamic linear chain', () => {
  it('builds and traverses a 5-step chain end-to-end', async () => {
    const states = ['s0', 's1', 's2', 's3', 's4'];
    const wf = buildLinearChain(states);
    const inst = wf.createInstance('dyn-001');

    expect(inst.getCurrentStates()).toEqual(['s0']);

    for (let i = 0; i < states.length - 1; i++) {
      const result = await inst.dispatch('NEXT', {});
      expect(result.success).toBe(true);
    }

    expect(inst.getCurrentStates()).toEqual(['s4']);
    expect(inst.isTerminal()).toBe(true);
  });

  it('builds a 2-state (minimum) chain', async () => {
    const wf = buildLinearChain(['alpha', 'omega']);
    const inst = wf.createInstance('dyn-002');
    const result = await inst.dispatch('NEXT', {});
    expect(result.success).toBe(true);
    expect(inst.isTerminal()).toBe(true);
  });

  it('builds a 20-state chain without errors', () => {
    const states = Array.from({ length: 20 }, (_, i) => `step-${i}`);
    expect(() => buildLinearChain(states)).not.toThrow();
  });

  it('advances one step at a time', async () => {
    const wf = buildLinearChain(['a', 'b', 'c']);
    const inst = wf.createInstance('dyn-003');
    await inst.dispatch('NEXT', {}); // a → b
    expect(inst.getCurrentStates()).toEqual(['b']);
    await inst.dispatch('NEXT', {}); // b → c
    expect(inst.getCurrentStates()).toEqual(['c']);
  });

  it('rejects dispatch once the terminal state is reached', async () => {
    const wf = buildLinearChain(['start', 'end']);
    const inst = wf.createInstance('dyn-004');
    await inst.dispatch('NEXT', {});
    const result = await inst.dispatch('NEXT', {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('terminal-state');
  });

  it('snapshot round-trip preserves position mid-chain', async () => {
    const states = ['p0', 'p1', 'p2', 'p3'];
    const wf = buildLinearChain(states);
    const inst = wf.createInstance('dyn-005');
    await inst.dispatch('NEXT', {}); // p0 → p1
    await inst.dispatch('NEXT', {}); // p1 → p2

    const snap = inst.getSnapshot();
    const restored = wf.restoreInstance(snap);
    expect(restored.getCurrentStates()).toEqual(['p2']);

    const result = await restored.dispatch('NEXT', {});
    expect(result.success).toBe(true);
    expect(restored.getCurrentStates()).toEqual(['p3']);
    expect(restored.isTerminal()).toBe(true);
  });

  it('snapshot history length matches number of dispatches', async () => {
    const wf = buildLinearChain(['x', 'y', 'z']);
    const inst = wf.createInstance('dyn-006');
    await inst.dispatch('NEXT', {});
    await inst.dispatch('NEXT', {});
    expect(inst.getSnapshot().history).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Runtime validation — build() is the safety net for dynamic workflows
//
// With runtime string[] input, TypeScript cannot flag invalid state IDs at
// compile time. build() provides the only safety check for user-supplied data.
// ---------------------------------------------------------------------------

describe('Dynamic builder — runtime validation', () => {
  it('build() throws when a transition references a state not in the declared list', () => {
    // Use a runtime variable so TypeScript does not flag 'ghost' at compile time —
    // this is the exact scenario dynamic workflows face.
    const dynamicStates = ['a', 'b'] as string[];
    const builder = new WorkflowBuilder({ name: 'bad-transition', states: dynamicStates as [string, ...string[]] })
      .defineAction('GO', z.object({}))
      .addStep('a')
      .addStep('b')
      .setInitial('a')
      .setTerminal(['b'])
      .addTransition({ from: 'a', to: 'ghost', on: 'GO' });
    expect(() => builder.build()).toThrow('"ghost"');
  });

  it('build() throws when no initial state is set', () => {
    const dynamicStates = ['a', 'b'] as string[];
    const builder = new WorkflowBuilder({ name: 'no-initial', states: dynamicStates as [string, ...string[]] })
      .defineAction('GO', z.object({}))
      .addStep('a')
      .addStep('b')
      .setTerminal(['b'])
      .addTransition({ from: 'a', to: 'b', on: 'GO' });
    expect(() => builder.build()).toThrow('initial state');
  });

  it('build() throws when no terminal state is set', () => {
    const dynamicStates = ['a', 'b'] as string[];
    const builder = new WorkflowBuilder({ name: 'no-terminal', states: dynamicStates as [string, ...string[]] })
      .defineAction('GO', z.object({}))
      .addStep('a')
      .addStep('b')
      .setInitial('a')
      .addTransition({ from: 'a', to: 'b', on: 'GO' });
    expect(() => builder.build()).toThrow('terminal state');
  });

  it('build() throws when a fork target is not in the declared state list', () => {
    const dynamicStates = ['start', 'fork'] as string[];
    const builder = new WorkflowBuilder({ name: 'bad-fork', states: dynamicStates as [string, ...string[]] })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .addFork('fork', { targets: ['missing-branch'] as [string, ...string[]] })
      .setInitial('start')
      .setTerminal(['start'])
      .addTransition({ from: 'start', to: 'fork', on: 'GO' });
    expect(() => builder.build()).toThrow('"missing-branch"');
  });

  it('build() throws when a join requires a state not in the declared list', () => {
    const dynamicStates = ['start', 'join'] as string[];
    const builder = new WorkflowBuilder({ name: 'bad-join', states: dynamicStates as [string, ...string[]] })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .addJoin('join', { requires: ['phantom'] as [string, ...string[]] })
      .setInitial('start')
      .setTerminal(['join'])
      .addTransition({ from: 'start', to: 'join', on: 'GO' });
    expect(() => builder.build()).toThrow('"phantom"');
  });
});

// ---------------------------------------------------------------------------
// Dynamic parallel branches (fan-out / fan-in)
// ---------------------------------------------------------------------------

describe('Dynamic parallel branches', () => {
  it('builds a 3-branch parallel workflow without errors', () => {
    expect(() => buildParallelBranches(3)).not.toThrow();
  });

  it('starts in the initial state', () => {
    const wf = buildParallelBranches(3);
    const inst = wf.createInstance('par-001');
    expect(inst.getCurrentStates()).toEqual(['start']);
  });

  it('activates all branches after the fork', async () => {
    const wf = buildParallelBranches(3);
    const inst = wf.createInstance('par-002');
    const result = await inst.dispatch('START', {});
    expect(result.success).toBe(true);
    const active = inst.getCurrentStates().sort();
    expect(active).toEqual(['branch-0', 'branch-1', 'branch-2'].sort());
  });

  it('reaches terminal after all branches complete (all mode)', async () => {
    const branchCount = 4;
    const wf = buildParallelBranches(branchCount);
    const inst = wf.createInstance('par-003');

    await inst.dispatch('START', {});

    for (let i = 0; i < branchCount; i++) {
      const result = await inst.dispatch(`DONE_${i}`, {});
      expect(result.success).toBe(true);
    }

    await inst.dispatch('COMPLETE_ALL', {});
    expect(inst.isTerminal()).toBe(true);
  });

  it('does not reach join until every branch completes', async () => {
    const wf = buildParallelBranches(3);
    const inst = wf.createInstance('par-004');
    await inst.dispatch('START', {});

    // Complete only 2 of 3 branches
    await inst.dispatch('DONE_0', {});
    await inst.dispatch('DONE_1', {});

    // join is not active yet, so COMPLETE_ALL has no source
    const result = await inst.dispatch('COMPLETE_ALL', {});
    expect(result.success).toBe(false);
    expect(inst.isTerminal()).toBe(false);
  });

  it('snapshot round-trip works mid-parallel execution', async () => {
    const wf = buildParallelBranches(3);
    const inst = wf.createInstance('par-005');
    await inst.dispatch('START', {});
    await inst.dispatch('DONE_0', {});

    const snap = inst.getSnapshot();
    const restored = wf.restoreInstance(snap);

    await restored.dispatch('DONE_1', {});
    await restored.dispatch('DONE_2', {});
    const r = await restored.dispatch('COMPLETE_ALL', {});
    expect(r.success).toBe(true);
    expect(restored.isTerminal()).toBe(true);
  });

  it('builds a single-branch parallel workflow (degenerate case)', async () => {
    const wf = buildParallelBranches(1);
    const inst = wf.createInstance('par-006');
    await inst.dispatch('START', {});
    await inst.dispatch('DONE_0', {});
    const r = await inst.dispatch('COMPLETE_ALL', {});
    expect(r.success).toBe(true);
    expect(inst.isTerminal()).toBe(true);
  });
});
