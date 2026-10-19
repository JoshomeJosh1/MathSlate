import { runOperation, type Command } from '../types';

const numeric: Command = {
  id: 'numeric',
  title: (_ctx, args) => {
    const digits = args.digits?.kind === 'count' ? args.digits.value : 15;
    return digits === 15 ? 'decimal' : `decimal, ${digits} digits`;
  },
  slash: 'numeric',
  aliases: ['decimal', 'approximate', 'evalf'],
  description: 'Decimal approximation (15 significant digits unless you choose)',
  params: [{ name: 'digits', label: 'digits', kind: 'count', default: () => '15' }],
  appliesTo: ({ facts, target }) => {
    if (!facts.isConstant || facts.isRelation) return 0;
    return target.expr.kind === 'num' ? 0 : 0.5;
  },
  run: (ctx, cas, args) =>
    runOperation(ctx, cas, {
      op: 'numeric',
      digits: args.digits?.kind === 'count' ? Math.max(1, args.digits.value) : 15,
    }),
};

export default numeric;
