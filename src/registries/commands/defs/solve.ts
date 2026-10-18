import { preferredVariable } from '../../../core/shape';
import { printName } from '../../../parser/printLatex';
import { runOperation, type Command } from '../types';

const solve: Command = {
  id: 'solve',
  title: ({ facts }) => `solve for ${printName(preferredVariable(facts))}`,
  slash: 'solve',
  aliases: ['roots', 'zeros'],
  description: 'Solve an equation or inequality (an expression is solved for = 0)',
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length === 0 || facts.isMatrix) return 0;
    if (facts.isEquation) return 1;
    if (facts.isRelation) return facts.freeVars.length === 1 ? 0.9 : 0;
    return facts.isPolynomial && facts.degree >= 1 ? 0.5 : 0.25;
  },
  run: (ctx, cas) =>
    runOperation(ctx, cas, { op: 'solve', variable: preferredVariable(ctx.facts) }),
};

export default solve;
