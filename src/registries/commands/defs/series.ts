import { preferredVariable } from '../../../core/shape';
import { runOperation, type Command } from '../types';

const ZERO = { kind: 'num', value: '0', span: { start: 0, end: 0 } } as const;

const series: Command = {
  id: 'series',
  title: () => 'Taylor series',
  slash: 'series',
  aliases: ['taylor', 'maclaurin'],
  description: 'Taylor series about 0, up to order 5',
  appliesTo: ({ facts }) => {
    if (facts.freeVars.length !== 1 || facts.isRelation || facts.isMatrix) return 0;
    return facts.hasFunctions ? 0.45 : 0.1;
  },
  run: (ctx, cas) =>
    runOperation(ctx, cas, {
      op: 'series',
      variable: preferredVariable(ctx.facts),
      point: ZERO,
      order: 6,
    }),
};

export default series;
