import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createWorkflow } from './builder.js';

function minimalBuilder() {
  return createWorkflow({ name: 'test' })
    .defineAction('GO', z.object({}))
    .addStep('start')
    .addStep('end')
    .setInitial('start')
    .setTerminal(['end'])
    .addTransition({ from: 'start', to: 'end', on: 'GO' });
}

describe('WorkflowBuilder', () => {
  it('builds a valid workflow without throwing', () => {
    expect(() => minimalBuilder().build()).not.toThrow();
  });

  it('throws when no initial state is declared', () => {
    const b = createWorkflow({ name: 'test' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .setTerminal(['start']);
    expect(() => b.build()).toThrow('initial state');
  });

  it('throws when no terminal state is declared', () => {
    const b = createWorkflow({ name: 'test' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .setInitial('start');
    expect(() => b.build()).toThrow('terminal state');
  });

  it('throws when a transition references an unregistered state', () => {
    const b = createWorkflow({ name: 'test' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .setInitial('start')
      .setTerminal(['start'])
      // @ts-expect-error — intentional: verifying runtime fallback for a type-bypassed invalid state ID
      .addTransition({ from: 'start', to: 'ghost', on: 'GO' });
    expect(() => b.build()).toThrow('"ghost"');
  });

  it('throws when a transition uses an undeclared action', () => {
    const b = createWorkflow({ name: 'test' })
      .addStep('start')
      .addStep('end')
      .setInitial('start')
      .setTerminal(['end'])
      // @ts-expect-error — intentional: verifying runtime fallback for a type-bypassed undeclared action
      .addTransition({ from: 'start', to: 'end', on: 'UNDECLARED' });
    expect(() => b.build()).toThrow('UNDECLARED');
  });

  it('throws when a ForkState target is unregistered', () => {
    const b = createWorkflow({ name: 'test' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      // @ts-expect-error — intentional: 'ghost' is not in TStates; verifies build() runtime check
      .addFork('fork', { targets: ['ghost'] })
      .setInitial('start')
      .setTerminal(['start'])
      .addTransition({ from: 'start', to: 'fork', on: 'GO' });
    expect(() => b.build()).toThrow('"ghost"');
  });

  it('throws when a JoinState requires an unregistered state', () => {
    const b = createWorkflow({ name: 'test' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      // @ts-expect-error — intentional: 'ghost' is not in TStates; verifies build() runtime check
      .addJoin('join', { requires: ['ghost'] })
      .setInitial('start')
      .setTerminal(['join'])
      .addTransition({ from: 'start', to: 'join', on: 'GO' });
    expect(() => b.build()).toThrow('"ghost"');
  });

  it('accumulates TActions generics correctly', () => {
    const workflow = createWorkflow({ name: 'typed' })
      .defineAction('SUBMIT', z.object({ submitterId: z.string() }))
      .defineAction('APPROVE', z.object({ reason: z.string() }))
      .addStep('draft')
      .addStep('done')
      .setInitial('draft')
      .setTerminal(['done'])
      .addTransition({ from: 'draft', to: 'done', on: 'SUBMIT' })
      .build();

    // If TActions inference is broken this line won't compile
    const instance = workflow.createInstance('i1');
    expect(instance).toBeDefined();
  });

  it('declared states constrain setInitial/setTerminal/addTransition', () => {
    // Compile-time proof: if TStates is not correctly inferred from the constructor,
    // the calls below produce TypeScript errors because the literal IDs are unknown.
    const workflow = createWorkflow({ name: 'typed-states' })
      .defineAction('GO', z.object({}))
      .addStep('alpha')
      .addStep('beta')
      .setInitial('alpha')
      .setTerminal(['beta'])
      .addTransition({ from: 'alpha', to: 'beta', on: 'GO' })
      .build();

    expect(workflow).toBeDefined();
  });

  it('addFork constrains targets to declared state IDs', () => {
    const workflow = createWorkflow({ name: 'fork-typed' })
      .defineAction('GO', z.object({}))
      .addStep('start')
      .addStep('branch-a')
      .addStep('branch-b')
      .addFork('fork', { targets: ['branch-a', 'branch-b'] })
      .addJoin('joined', { requires: ['branch-a', 'branch-b'] })
      .addStep('done')
      .setInitial('start')
      .setTerminal(['done'])
      .addTransition({ from: 'start', to: 'fork', on: 'GO' })
      .addTransition({ from: 'joined', to: 'done', on: 'GO' })
      .build();

    expect(workflow).toBeDefined();
  });

  it('addJoin constrains requires to declared state IDs', () => {
    const workflow = createWorkflow({ name: 'join-typed' })
      .defineAction('START', z.object({}))
      .defineAction('MECH_OK', z.object({}))
      .defineAction('ELEC_OK', z.object({}))
      .defineAction('SAFETY_OK', z.object({}))
      .defineAction('SIGN_OFF', z.object({}))
      .addStep('start')
      .addStep('mechanical')
      .addStep('electrical')
      .addStep('safety-systems')
      .addFork('fork', { targets: ['mechanical', 'electrical', 'safety-systems'] })
      // requires autocompletes to the accumulated TStates union:
      .addJoin('all-clear', {
        requires: ['mechanical', 'electrical', 'safety-systems'],
        mode: 'all',
      })
      .addStep('done')
      .setInitial('start')
      .setTerminal(['done'])
      .addTransition({ from: 'start', to: 'fork', on: 'START' })
      .addTransition({ from: 'mechanical', to: 'all-clear', on: 'MECH_OK' })
      .addTransition({ from: 'electrical', to: 'all-clear', on: 'ELEC_OK' })
      .addTransition({ from: 'safety-systems', to: 'all-clear', on: 'SAFETY_OK' })
      .addTransition({ from: 'all-clear', to: 'done', on: 'SIGN_OFF' })
      .build();

    expect(workflow).toBeDefined();
  });

  describe('graph validation', () => {
    it('throws on unreachable state', () => {
      const b = createWorkflow({ name: 'unreachable' })
        .defineAction('GO', z.object({}))
        .addStep('start')
        .addStep('end')
        .addStep('orphan') // no incoming transitions
        .setInitial('start')
        .setTerminal(['end'])
        .addTransition({ from: 'start', to: 'end', on: 'GO' });
      expect(() => b.build()).toThrow('unreachable');
    });

    it('throws when no terminal state is reachable', () => {
      const b = createWorkflow({ name: 'no-exit' })
        .defineAction('GO', z.object({}))
        .addStep('start')
        .addStep('loop')
        .addStep('done')
        .setInitial('start')
        .setTerminal(['done'])
        .addTransition({ from: 'start', to: 'loop', on: 'GO' })
        .addTransition({ from: 'loop', to: 'start', on: 'GO' }); // done is unreachable
      expect(() => b.build()).toThrow('never complete');
    });

    it('throws on non-terminal WaitState with no outgoing transitions', () => {
      // 'done' is reachable via ABORT so there are no extra errors — only the dead-end WaitState.
      const b = createWorkflow({ name: 'dead-wait' })
        .defineAction('GO', z.object({}))
        .defineAction('ABORT', z.object({}))
        .addStep('start')
        .addWait('blocked', { externalName: 'ext' })
        .addStep('done')
        .setInitial('start')
        .setTerminal(['done'])
        .addTransition({ from: 'start', to: 'blocked', on: 'GO' })
        .addTransition({ from: 'start', to: 'done', on: 'ABORT' });
      expect(() => b.build()).toThrow('WaitState');
    });

    it('throws on non-terminal JoinState with no outgoing transitions', () => {
      // 'done' is reachable via ABORT so there are no extra errors — only the dead-end JoinState.
      const b = createWorkflow({ name: 'dead-join' })
        .defineAction('GO', z.object({}))
        .defineAction('ABORT', z.object({}))
        .addStep('start')
        .addStep('branch-a')
        .addStep('branch-b')
        .addFork('fork', { targets: ['branch-a', 'branch-b'] })
        .addJoin('joined', { requires: ['branch-a', 'branch-b'] })
        .addStep('done')
        .setInitial('start')
        .setTerminal(['done'])
        .addTransition({ from: 'start', to: 'fork', on: 'GO' })
        .addTransition({ from: 'start', to: 'done', on: 'ABORT' });
      expect(() => b.build()).toThrow('JoinState');
    });

    it('collects multiple graph errors in one throw', () => {
      const b = createWorkflow({ name: 'multi-error' })
        .defineAction('GO', z.object({}))
        .addStep('start')
        .addStep('orphan')
        .addWait('dead-wait', { externalName: 'ext' })
        .addStep('done')
        .setInitial('start')
        .setTerminal(['done'])
        .addTransition({ from: 'start', to: 'dead-wait', on: 'GO' })
        .addTransition({ from: 'start', to: 'done', on: 'GO' });
      let msg = '';
      try {
        b.build();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toContain('orphan');
      expect(msg).toContain('WaitState');
    });

    it('accepts a WaitState that is itself terminal', () => {
      const b = createWorkflow({ name: 'wait-terminal' })
        .defineAction('GO', z.object({}))
        .addStep('start')
        .addWait('final', { externalName: 'ext' })
        .setInitial('start')
        .setTerminal(['final'])
        .addTransition({ from: 'start', to: 'final', on: 'GO' });
      expect(() => b.build()).not.toThrow();
    });
  });

  it('infers guard payload type from the action schema', () => {
    // Compile-time proof: ctx.payload is typed as { score: number } without annotation.
    const workflow = createWorkflow({ name: 'guard-inference' })
      .defineAction('SCORE', z.object({ score: z.number() }))
      .addStep('pending')
      .addStep('passed')
      .setInitial('pending')
      .setTerminal(['passed'])
      .addTransition({
        from: 'pending',
        to: 'passed',
        on: 'SCORE',
        guard: (ctx) => ctx.payload.score >= 80,
      })
      .build();

    expect(workflow).toBeDefined();
  });
});
