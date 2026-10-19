import type { Command, CommandContext } from './types';

export type { Command, CommandContext } from './types';
export {
  ArgError,
  defaultArgs,
  readArgs,
  type Args,
  type ArgValue,
  type CommandParam,
  type Resolve,
} from './params';

// Every module in defs/ is picked up automatically (Vite resolves this glob at build time).
const modules = import.meta.glob<{ default: Command }>('./defs/*.ts', { eager: true });

export const commands: ReadonlyMap<string, Command> = new Map(
  Object.values(modules).map((m) => [m.default.id, m.default]),
);

/** Commands relevant to a row, most relevant first. */
export function suggestCommands(ctx: CommandContext, limit = Infinity): Command[] {
  return [...commands.values()]
    .map((command) => ({ command, score: command.appliesTo(ctx) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.command.slash.localeCompare(b.command.slash))
    .slice(0, limit)
    .map((s) => s.command);
}
