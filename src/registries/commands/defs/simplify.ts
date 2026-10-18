import { runOperation, type Command } from '../types';

const simplify: Command = {
  id: 'simplify',
  title: () => 'simplify',
  slash: 'simplify',
  description: 'Rewrite in the simplest equivalent form',
  appliesTo: ({ facts }) => {
    if (facts.isRelation) return 0;
    if (facts.hasFunctions || (!facts.isPolynomial && facts.freeVars.length > 0)) return 0.6;
    return facts.freeVars.length > 0 ? 0.3 : 0.2;
  },
  run: (ctx, cas) => runOperation(ctx, cas, { op: 'simplify' }),
};

export default simplify;
