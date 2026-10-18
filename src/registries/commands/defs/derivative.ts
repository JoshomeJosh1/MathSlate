import { preferredVariable } from '../../../core/shape';
import { printName } from '../../../parser/printLatex';
import { runOperation, type Command } from '../types';

const derivative: Command = {
  id: 'derivative',
  title: ({ facts }) => `d/d${printName(preferredVariable(facts))}`,
  slash: 'derivative',
  aliases: ['diff', 'differentiate', 'd/dx'],
  description: 'Differentiate with respect to the main variable',
  appliesTo: ({ facts, statement }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return statement.kind === 'defFunc' ? 0.8 : 0.6;
  },
  run: (ctx, cas) =>
    runOperation(ctx, cas, { op: 'derivative', variable: preferredVariable(ctx.facts), order: 1 }),
};

export default derivative;
