import { preferredVariable } from '../../../core/shape';
import { printName } from '../../../parser/printLatex';
import { runOperation, type Command } from '../types';

const ZERO = { kind: 'num', value: '0', span: { start: 0, end: 0 } } as const;

const limit: Command = {
  id: 'limit',
  title: ({ facts }) => `lim ${printName(preferredVariable(facts))}→0`,
  slash: 'limit',
  aliases: ['lim'],
  description: 'Limit as the main variable approaches 0',
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return facts.isPolynomial ? 0.1 : 0.4;
  },
  run: (ctx, cas) =>
    runOperation(ctx, cas, { op: 'limit', variable: preferredVariable(ctx.facts), point: ZERO }),
};

export default limit;
