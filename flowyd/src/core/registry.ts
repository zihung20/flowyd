import type { AnyState } from '../types/index.js';
import type { GuardFn } from '../types/index.js';

/**
 * Mutable state store owned by `WorkflowBuilder`, sealed into `WorkflowDefinition` at
 * `build()` via `snapshot()`.
 */
export class StateRegistry {
  private readonly states = new Map<string, AnyState>();

  /** @throws {Error} If a state with the same `id` is already registered. */
  register(state: AnyState): void {
    if (this.states.has(state.id)) {
      throw new Error(`State with id "${state.id}" is already registered`);
    }
    this.states.set(state.id, state);
  }

  /** @throws {Error} If no state with this ID has been registered. */
  get(id: string): AnyState {
    const state = this.states.get(id);
    if (!state) {
      throw new Error(`State "${id}" is not registered`);
    }
    return state;
  }

  has(id: string): boolean {
    return this.states.has(id);
  }

  snapshot(): ReadonlyMap<string, AnyState> {
    return new Map(this.states);
  }
}

/**
 * Per-instance guard-name registry, populated via `instance.injectGuard()` and read by
 * the engine when building `GuardContext`.
 */
export class GuardRegistry {
  private readonly guards = new Map<string, GuardFn<unknown>>();

  /** Overwrites any previously registered function for the same name. */
  register<TPayload, TCtx = unknown>(name: string, fn: GuardFn<TPayload, TCtx>): void {
    this.guards.set(name, fn as GuardFn<unknown>);
  }

  resolve(name: string): GuardFn<unknown> | undefined {
    return this.guards.get(name);
  }
}
