import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createWorkflow } from '../../src/core/builder.js';

const Empty = z.object({});

/**
 * Vendor onboarding SOP:
 *   draft ──SUBMIT──▶ kyc-check(WaitState) ──KYC_PASSED──▶ approved
 *                                            └──KYC_FAILED──▶ rejected
 *
 * The kyc-check state blocks until the service layer calls resolveWait.
 */
const vendorOnboarding = createWorkflow({
  name: 'vendor-onboarding',
})
  .defineAction('SUBMIT', Empty)
  .defineAction('KYC_PASSED', Empty)
  .defineAction('KYC_FAILED', Empty)
  .addStep('draft')
  .addWait('kyc-check', { externalName: 'vendor-kyc' })
  .addStep('approved')
  .addStep('rejected')
  .setInitial('draft')
  .setTerminal(['approved', 'rejected'])
  .addTransition({ from: 'draft', to: 'kyc-check', on: 'SUBMIT' })
  .addTransition({ from: 'kyc-check', to: 'approved', on: 'KYC_PASSED' })
  .addTransition({ from: 'kyc-check', to: 'rejected', on: 'KYC_FAILED' })
  .build();

describe('WaitState SOP — vendor onboarding', () => {
  it('enters waiting status when the wait state is reached', async () => {
    const inst = vendorOnboarding.createInstance('vo-001');
    await inst.dispatch('SUBMIT', {});
    expect(inst.getStateStatus('kyc-check')).toBe('waiting');
  });

  it('includes waiting states in getCurrentStates()', async () => {
    const inst = vendorOnboarding.createInstance('vo-002');
    await inst.dispatch('SUBMIT', {});
    expect(inst.getCurrentStates()).toContain('kyc-check');
  });

  it('blocks dispatch while wait state is still waiting', async () => {
    const inst = vendorOnboarding.createInstance('vo-003');
    await inst.dispatch('SUBMIT', {});
    // kyc-check is waiting, not active — no active source for KYC_PASSED
    const result = await inst.dispatch('KYC_PASSED', {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('no-active-source');
    }
  });

  it('promotes the state to active after resolveWait is called', async () => {
    const inst = vendorOnboarding.createInstance('vo-004');
    await inst.dispatch('SUBMIT', {});
    inst.resolveWait('kyc-check');
    expect(inst.getStateStatus('kyc-check')).toBe('active');
  });

  it('allows dispatch after resolveWait — happy path', async () => {
    const inst = vendorOnboarding.createInstance('vo-005');
    await inst.dispatch('SUBMIT', {});
    inst.resolveWait('kyc-check');
    const result = await inst.dispatch('KYC_PASSED', {});
    expect(result.success).toBe(true);
    expect(inst.getCurrentStates()).toEqual(['approved']);
    expect(inst.isTerminal()).toBe(true);
  });

  it('allows dispatch after resolveWait — failure path', async () => {
    const inst = vendorOnboarding.createInstance('vo-006');
    await inst.dispatch('SUBMIT', {});
    inst.resolveWait('kyc-check');
    const result = await inst.dispatch('KYC_FAILED', {});
    expect(result.success).toBe(true);
    expect(inst.getCurrentStates()).toEqual(['rejected']);
    expect(inst.isTerminal()).toBe(true);
  });

  it('increments version on resolveWait', async () => {
    const inst = vendorOnboarding.createInstance('vo-007');
    await inst.dispatch('SUBMIT', {});
    const vBefore = inst.getSnapshot().version;
    inst.resolveWait('kyc-check');
    expect(inst.getSnapshot().version).toBe(vBefore + 1);
  });

  it('records resolveWait in history', async () => {
    const inst = vendorOnboarding.createInstance('vo-008');
    await inst.dispatch('SUBMIT', {});
    inst.resolveWait('kyc-check');
    const history = inst.getSnapshot().history;
    const resolveEntry = history.find((e) => e.kind === 'resolve-wait');
    expect(resolveEntry).toBeDefined();
    if (resolveEntry?.kind === 'resolve-wait') {
      expect(resolveEntry.stateId).toBe('kyc-check');
    }
  });

  it('stamps the resolve history entry with an injected now', async () => {
    const inst = vendorOnboarding.createInstance('vo-008b');
    await inst.dispatch('SUBMIT', {});
    const at = new Date('2026-06-06T08:30:00.000Z');
    inst.resolveWait('kyc-check', { now: at });
    const snap = inst.getSnapshot();
    const resolveEntry = snap.history.find((e) => e.kind === 'resolve-wait');
    expect(resolveEntry?.at).toBe('2026-06-06T08:30:00.000Z');
    expect(snap.updatedAt).toBe('2026-06-06T08:30:00.000Z');
  });

  it('throws when resolveWait is called on a non-WaitState', () => {
    const inst = vendorOnboarding.createInstance('vo-010');
    expect(() => inst.resolveWait('draft')).toThrow('WaitState');
  });

  it('throws when resolveWait is called while state is not waiting', () => {
    const inst = vendorOnboarding.createInstance('vo-011');
    // Never submitted — kyc-check is still idle
    expect(() => inst.resolveWait('kyc-check')).toThrow('not waiting');
  });

  it('snapshot can be restored and continues after resolveWait', async () => {
    const inst = vendorOnboarding.createInstance('vo-012');
    await inst.dispatch('SUBMIT', {});
    inst.resolveWait('kyc-check');
    const snap = inst.getSnapshot();

    const restored = vendorOnboarding.restoreInstance(snap);
    const result = await restored.dispatch('KYC_PASSED', {});
    expect(result.success).toBe(true);
    expect(restored.isTerminal()).toBe(true);
  });
});
