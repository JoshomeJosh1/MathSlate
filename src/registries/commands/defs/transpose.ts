import { matrixRelevance, runFunction, type Command } from '../types';

const transpose: Command = {
  id: 'transpose',
  title: () => 'transpose',
  slash: 'transpose',
  aliases: ['T'],
  description: 'Transpose: rows become columns',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.4, 0.5, 0.4, 0.4),
  run: (ctx, cas) => runFunction(ctx, cas, 'transpose'),
};

export default transpose;
