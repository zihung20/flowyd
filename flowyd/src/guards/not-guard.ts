import type { IGuard, GuardContext } from '../types/index.js';

/** Inverts the result of its child guard. */
export class NotGuard<TPayload = unknown> implements IGuard<TPayload> {
  constructor(private readonly guard: IGuard<TPayload>) {}

  async evaluate(ctx: GuardContext<TPayload>): Promise<boolean> {
    return !(await this.guard.evaluate(ctx));
  }
}
