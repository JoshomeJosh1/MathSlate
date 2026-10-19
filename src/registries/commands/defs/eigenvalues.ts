import { matrixRelevance, runFunction, type Command } from '../types';

const eigenvalues: Command = {
  id: 'eigenvalues',
  title: () => 'eigenvalues',
  slash: 'eigenvalues',
  aliases: ['eigenvals', 'eig'],
  description: 'Eigenvalues of a square matrix',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.7, 0, 0.5),
  run: (ctx, cas) => runFunction(ctx, cas, 'eigenvalues'),
};

export default eigenvalues;
