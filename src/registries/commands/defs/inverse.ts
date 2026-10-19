import { matrixRelevance, runFunction, type Command } from '../types';

const inverse: Command = {
  id: 'inverse',
  title: () => 'inverse',
  slash: 'inverse',
  aliases: ['inv', 'invert'],
  description: 'Inverse of a square matrix',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.8, 0, 0.5),
  run: (ctx, cas) => runFunction(ctx, cas, 'inverse'),
};

export default inverse;
