import { runOperation, type Command } from '../types';

const expand: Command = {
  id: 'expand',
  title: () => 'expand',
  slash: 'expand',
  description: 'Multiply out products and powers',
  appliesTo: ({ facts }) => {
    if (facts.isRelation) return 0;
    if (facts.hasExpandableProduct) return 0.85;
    return facts.freeVars.length > 0 ? 0.15 : 0;
  },
  run: (ctx, cas) => runOperation(ctx, cas, { op: 'expand' }),
};

export default expand;
