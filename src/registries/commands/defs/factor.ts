import { runOperation, type Command } from '../types';

const factor: Command = {
  id: 'factor',
  title: () => 'factor',
  slash: 'factor',
  aliases: ['factorise', 'factorize'],
  description: 'Factor a polynomial, or an integer into primes',
  appliesTo: ({ facts, target }) => {
    if (facts.isRelation || facts.isMatrix) return 0;
    const e = target.expr;
    if (e.kind === 'num' && /^[0-9]+$/.test(e.value) && Number(e.value) > 3) return 0.8;
    if (facts.isPolynomial && facts.freeVars.length > 0 && facts.degree >= 2) return 0.9;
    return facts.freeVars.length > 0 ? 0.2 : 0;
  },
  run: (ctx, cas) => runOperation(ctx, cas, { op: 'factor' }),
};

export default factor;
