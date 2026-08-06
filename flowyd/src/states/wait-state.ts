import { StateKind } from '../types/index.js';
import type { IWaitState } from '../types/index.js';
import { BaseState } from './base.js';

/**
 * Sets the state's status to `waiting` on entry, pausing the parent workflow. The service
 * layer must call `parentInstance.resolveWait(stateId)` once the external process completes
 * (promoting `waiting` → `active`), then `dispatch` the transition out. The engine itself
 * never polls or touches I/O.
 */
export class WaitState<TId extends string = string> extends BaseState<TId> implements IWaitState {
  readonly kind = StateKind.Wait;
  readonly externalName: string;

  constructor(id: TId, options: { label?: string; externalName: string }) {
    super(id, options.label ?? id);
    this.externalName = options.externalName;
  }
}
