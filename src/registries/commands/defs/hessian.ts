import { isScalarField, runVectorCalculus, type Command } from '../types';

const hessian: Command = {
  id: 'hessian',
  title: () => 'Hessian',
  slash: 'hessian',
  description: 'Hessian matrix: the second partial derivatives',
  appliesTo: ({ facts }) => (isScalarField(facts) ? 0.4 : 0),
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'hessian'),
};

export default hessian;
