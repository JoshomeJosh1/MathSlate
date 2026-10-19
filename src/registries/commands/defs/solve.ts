import { printName } from '../../../parser/printLatex';
import { preferredVariableLatex, runOperation, variableArg, type Command } from '../types';

const solve: Command = {
  id: 'solve',
  title: (ctx, args) => `solve for ${printName(variableArg(ctx, args))}`,
  slash: 'solve',
  aliases: ['roots', 'zeros'],
  description: 'Solve an equation or inequality (an expression is solved for = 0)',
  params: [{ name: 'variable', label: 'for', kind: 'variable', default: preferredVariableLatex }],
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length === 0 || facts.isMatrix) return 0;
    if (facts.isEquation) return 1;
    if (facts.isRelation) return facts.freeVars.length === 1 ? 0.9 : 0;
    return facts.isPolynomial && facts.degree >= 1 ? 0.5 : 0.25;
  },
  run: (ctx, cas, args) =>
    runOperation(ctx, cas, { op: 'solve', variable: variableArg(ctx, args) }),
};

export default solve;
