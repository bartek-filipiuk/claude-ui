/**
 * Returns a process-wide singleton regardless of how many times the module
 * that defines it gets re-evaluated. Required because our custom server
 * (`tsx server.ts`) and the Next.js route handlers (webpack bundle) end up
 * with *separate* module graphs: each would otherwise hold its own copy of
 * `new X()`, breaking singletons like ptyManager / persistentTabsRegistry
 * whose whole point is cross-layer state sharing.
 *
 * The stored value is keyed by a `Symbol.for(...)` handle so both graphs
 * land on the same slot on `globalThis`.
 */
export function getSingleton<T>(name: string, factory: () => T): T {
  const key = Symbol.for(`codehelm.singleton.${name}`);
  const g = globalThis as unknown as Record<symbol, unknown>;
  const existing = g[key];
  if (existing !== undefined) return existing as T;
  const instance = factory();
  g[key] = instance;
  return instance;
}
