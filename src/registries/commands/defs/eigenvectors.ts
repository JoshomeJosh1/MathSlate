import { matrixRelevance, runFunction, type Command } from '../types';

const eigenvectors: Command = {
  id: 'eigenvectors',
  title: () => 'eigenvectors',
  slash: 'eigenvectors',
  aliases: ['eigenvects'],
  description: 'Eigenvectors of a square matrix, with their eigenvalues',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.5, 0, 0.4),
  run: (ctx, cas) => runFunction(ctx, cas, 'eigenvectors'),
};

export default eigenvectors;
