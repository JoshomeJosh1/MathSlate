import { unitText } from '../../../parser/units';
import type { Command } from '../types';

const convert: Command = {
  id: 'convert',
  title: (_ctx, args) =>
    args.unit?.kind === 'unit'
      ? `in ${unitText(args.unit.factors).replace(/\\cdot /g, '·')}`
      : 'convert',
  slash: 'convert',
  aliases: ['to', 'in', 'units'],
  description: 'Show a quantity in another unit (the same as → [unit] in the row)',
  params: [{ name: 'unit', label: 'to', kind: 'unit', default: () => '' }],
  appliesTo: ({ facts }) => (facts.hasUnits && !facts.isRelation ? 0.5 : 0),
  run: (ctx, cas, args) => {
    const unit = args.unit;
    if (unit?.kind !== 'unit') {
      return Promise.resolve({ ok: false, error: 'Choose a unit to convert to', backend: '' });
    }
    const target = ctx.target.expr;
    const expr = target.kind === 'convert' ? target.expr : target;
    return cas.run({
      operation: { op: 'evaluate' },
      target: { kind: 'convert', expr, target: unit.factors, span: target.span },
      env: ctx.env,
      locals: ctx.target.locals,
    });
  },
};

export default convert;
