import { runOperation, type Command } from '../types';

const numeric: Command = {
  id: 'numeric',
  title: () => 'decimal',
  slash: 'numeric',
  aliases: ['decimal', 'approximate', 'evalf'],
  description: 'Decimal approximation (15 significant digits)',
  appliesTo: ({ facts, target }) => {
    if (!facts.isConstant || facts.isRelation) return 0;
    return target.expr.kind === 'num' ? 0 : 0.5;
  },
  run: (ctx, cas) => runOperation(ctx, cas, { op: 'numeric', digits: 15 }),
};

export default numeric;
