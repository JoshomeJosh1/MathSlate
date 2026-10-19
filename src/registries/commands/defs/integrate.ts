import { printLatex, printName } from '../../../parser/printLatex';
import { preferredVariableLatex, runOperation, variableArg, type Command } from '../types';

const integrate: Command = {
  id: 'integrate',
  title: (ctx, args) => {
    const x = printName(variableArg(ctx, args));
    const { from, to } = args;
    return from?.kind === 'expr' && to?.kind === 'expr'
      ? `∫ from ${printLatex(from.expr)} to ${printLatex(to.expr)} d${x}`
      : `∫ d${x}`;
  },
  slash: 'integrate',
  aliases: ['antiderivative', 'integral'],
  description: 'Integral: indefinite, or between two bounds if you give them',
  params: [
    { name: 'variable', label: 'by', kind: 'variable', default: preferredVariableLatex },
    { name: 'from', label: 'from', kind: 'expr', optional: true, default: () => '' },
    { name: 'to', label: 'to', kind: 'expr', optional: true, default: () => '' },
  ],
  appliesTo: ({ facts, statement }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return statement.kind === 'defFunc' ? 0.75 : 0.55;
  },
  run: (ctx, cas, args) => {
    const { from, to } = args;
    const variable = variableArg(ctx, args);
    if (from?.kind === 'expr' && to?.kind === 'expr') {
      return runOperation(ctx, cas, {
        op: 'integrate',
        variable,
        lower: from.expr,
        upper: to.expr,
      });
    }
    if (from?.kind === 'expr' || to?.kind === 'expr') {
      return Promise.resolve({
        ok: false,
        error: 'Give both bounds for a definite integral, or neither',
        backend: '',
      });
    }
    return runOperation(ctx, cas, { op: 'integrate', variable });
  },
};

export default integrate;
