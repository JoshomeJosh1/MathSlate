import { printName } from '../../../parser/printLatex';
import { preferredVariableLatex, runOperation, variableArg, type Command } from '../types';

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const superscript = (n: number) => String(n).replace(/[0-9]/g, (d) => SUPERSCRIPT[Number(d)] ?? d);

const derivative: Command = {
  id: 'derivative',
  title: (ctx, args) => {
    const x = printName(variableArg(ctx, args));
    const n = args.order?.kind === 'count' ? args.order.value : 1;
    return n === 1 ? `d/d${x}` : `d${superscript(n)}/d${x}${superscript(n)}`;
  },
  slash: 'derivative',
  aliases: ['diff', 'differentiate', 'd/dx'],
  description: 'Differentiate (with respect to the main variable, once, unless you choose)',
  params: [
    { name: 'variable', label: 'by', kind: 'variable', default: preferredVariableLatex },
    { name: 'order', label: 'order', kind: 'count', default: () => '1' },
  ],
  appliesTo: ({ facts, statement }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return statement.kind === 'defFunc' ? 0.8 : 0.6;
  },
  run: (ctx, cas, args) =>
    runOperation(ctx, cas, {
      op: 'derivative',
      variable: variableArg(ctx, args),
      order: args.order?.kind === 'count' ? args.order.value : 1,
    }),
};

export default derivative;
