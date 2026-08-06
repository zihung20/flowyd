import type { IGuard, GuardContext } from '../types/index.js';

/**
 * Named placeholder resolved at evaluation time via `instance.injectGuard(name, fn)`, so
 * the same workflow definition can swap guard implementations across prod/staging/tests
 * without recompiling. Payload type isn't enforced here — annotate the generic at the
 * `injectGuard` call site instead.
 */
export class InjectedGuard implements IGuard<unknown> {
  constructor(readonly name: string) {}

  async evaluate(ctx: GuardContext<unknown>): Promise<boolean> {
    const fn = ctx.resolveGuard(this.name);
    if (!fn) {
      throw new Error(
        `Guard "${this.name}" has not been injected. ` +
          `Call instance.injectGuard("${this.name}", fn) before dispatching.`,
      );
    }
    return fn(ctx);
  }
}
