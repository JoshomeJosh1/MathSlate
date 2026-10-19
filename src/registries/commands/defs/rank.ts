import { matrixRelevance, runFunction, type Command } from '../types';

const rank: Command = {
  id: 'rank',
  title: () => 'rank',
  slash: 'rank',
  description: 'Rank: the number of linearly independent rows',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.3, 0.6, 0.3),
  run: (ctx, cas) => runFunction(ctx, cas, 'rank'),
};

export default rank;
