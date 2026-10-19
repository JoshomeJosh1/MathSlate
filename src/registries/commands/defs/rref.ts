import { matrixRelevance, runFunction, type Command } from '../types';

const rref: Command = {
  id: 'rref',
  title: () => 'rref',
  slash: 'rref',
  aliases: ['rowreduce', 'gauss'],
  description: 'Reduced row echelon form (Gauss–Jordan elimination)',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.5, 0.8, 0.5),
  run: (ctx, cas) => runFunction(ctx, cas, 'rref'),
};

export default rref;
