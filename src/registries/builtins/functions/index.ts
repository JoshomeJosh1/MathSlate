import type { BuiltinFunction } from './types';

export type { BuiltinFunction } from './types';

// Every module in defs/ is picked up automatically (Vite resolves this glob at build time).
const modules = import.meta.glob<{ default: BuiltinFunction | BuiltinFunction[] }>('./defs/*.ts', {
  eager: true,
});

export const builtinFunctions: ReadonlyMap<string, BuiltinFunction> = new Map(
  Object.values(modules)
    .flatMap((m) => (Array.isArray(m.default) ? m.default : [m.default]))
    .map((f) => [f.name, f]),
);
