import type { BuiltinSequence } from './types';

export type { BuiltinSequence } from './types';

// Every module in defs/ is picked up automatically (Vite resolves this glob at build time).
const modules = import.meta.glob<{ default: BuiltinSequence }>('./defs/*.ts', { eager: true });

export const builtinSequences: ReadonlyMap<string, BuiltinSequence> = new Map(
  Object.values(modules).map((m) => [m.default.name, m.default]),
);
