import { matrixRelevance, runFunction, type Command } from '../types';

const det: Command = {
  id: 'det',
  title: () => 'det',
  slash: 'det',
  aliases: ['determinant'],
  description: 'Determinant of a square matrix',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.9, 0, 0.6),
  run: (ctx, cas) => runFunction(ctx, cas, 'det'),
};

export default det;
