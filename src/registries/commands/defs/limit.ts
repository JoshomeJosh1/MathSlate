import { printLatex, printName } from '../../../parser/printLatex';
import { runOperation, variableArg, type Command } from '../types';
import { preferredVariableLatex } from '../types';

const ZERO = { kind: 'num', value: '0', span: { start: 0, end: 0 } } as const;

const limit: Command = {
  id: 'limit',
  title: (ctx, args) => {
    const at = args.at;
    const point = at?.kind === 'point' ? printLatex(at.point) : '0';
    const side = at?.kind === 'point' && at.side ? at.side : '';
    return `lim ${printName(variableArg(ctx, args, 'at'))}→${point}${side}`;
  },
  slash: 'limit',
  aliases: ['lim'],
  description:
    'Limit as the main variable approaches a point (0 unless you choose); x→0+ for one side',
  params: [
    {
      name: 'at',
      label: 'as',
      kind: 'point',
      default: (ctx) => `${preferredVariableLatex(ctx)}\\to0`,
    },
  ],
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length === 0 || facts.isRelation || facts.isMatrix) return 0;
    return facts.isPolynomial ? 0.1 : 0.4;
  },
  run: (ctx, cas, args) => {
    const at = args.at;
    return runOperation(ctx, cas, {
      op: 'limit',
      variable: variableArg(ctx, args, 'at'),
      point: at?.kind === 'point' ? at.point : ZERO,
      ...(at?.kind === 'point' && at.side ? { direction: at.side } : {}),
    });
  },
};

export default limit;
