import { preferredVariable } from '../../../core/shape';
import { printName } from '../../../parser/printLatex';
import { runOperation, type Command } from '../types';

const integrate: Command = {
  id: 'integrate',
  title: ({ facts }) => `∫ d${printName(preferredVariable(facts))}`,
  slash: 'integrate',
  aliases: ['antiderivative', 'integral'],
  description: 'Indefinite integral with respect to the main variable',
  appliesTo: ({ facts, statement }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return statement.kind === 'defFunc' ? 0.75 : 0.55;
  },
  run: (ctx, cas) =>
    runOperation(ctx, cas, { op: 'integrate', variable: preferredVariable(ctx.facts) }),
};

export default integrate;
