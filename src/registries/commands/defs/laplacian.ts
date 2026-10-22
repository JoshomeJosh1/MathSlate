import { isScalarField, runVectorCalculus, type Command } from '../types';

const laplacian: Command = {
  id: 'laplacian',
  title: () => '∇²',
  slash: 'laplacian',
  description: 'Laplacian: the sum of the second partial derivatives',
  appliesTo: ({ facts }) => (isScalarField(facts) ? 0.3 : 0),
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'laplacian'),
};

export default laplacian;
