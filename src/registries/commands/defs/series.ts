import { printLatex, printName } from '../../../parser/printLatex';
import { preferredVariableLatex, runOperation, variableArg, type Command } from '../types';

const ZERO = { kind: 'num', value: '0', span: { start: 0, end: 0 } } as const;

const series: Command = {
  id: 'series',
  title: (ctx, args) => {
    const at = args.at;
    const point = at?.kind === 'point' ? printLatex(at.point) : '0';
    const order = args.order?.kind === 'count' ? args.order.value : 5;
    const about = point === '0' ? '' : ` about ${printName(variableArg(ctx, args, 'at'))}=${point}`;
    return `Taylor series${about}${order === 5 ? '' : `, up to power ${order}`}`;
  },
  slash: 'series',
  aliases: ['taylor', 'maclaurin'],
  description:
    'Taylor series about a point (0 unless you choose), up to a power (5 unless you choose)',
  params: [
    {
      name: 'at',
      label: 'about',
      kind: 'point',
      default: (ctx) => `${preferredVariableLatex(ctx)}=0`,
    },
    { name: 'order', label: 'up to power', kind: 'count', default: () => '5' },
  ],
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length !== 1 || facts.isRelation || facts.isMatrix) return 0;
    return facts.hasFunctions ? 0.45 : 0.1;
  },
  run: (ctx, cas, args) => {
    const at = args.at;
    return runOperation(ctx, cas, {
      op: 'series',
      variable: variableArg(ctx, args, 'at'),
      point: at?.kind === 'point' ? at.point : ZERO,
      // SymPy's order n gives the terms below x^n.
      order: (args.order?.kind === 'count' ? args.order.value : 5) + 1,
    });
  },
};

export default series;
