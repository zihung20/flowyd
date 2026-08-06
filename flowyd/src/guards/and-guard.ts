import type { IGuard, GuardContext } from '../types/index.js';

/** Passes only when every child guard passes; short-circuits on the first failure. */
export class AndGuard<TPayload = unknown> implements IGuard<TPayload> {
  /** @throws {Error} If fewer than two guards are provided. */
  constructor(private readonly guards: ReadonlyArray<IGuard<TPayload>>) {
    if (guards.length < 2) {
      throw new Error('AndGuard requires at least two child guards');
    }
  }

  async evaluate(ctx: GuardContext<TPayload>): Promise<boolean> {
    for (const guard of this.guards) {
      if (!(await guard.evaluate(ctx))) {
        return false;
      }
    }
    return true;
  }
}
