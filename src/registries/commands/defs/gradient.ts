import { isScalarField, runVectorCalculus, type Command } from '../types';

const gradient: Command = {
  id: 'gradient',
  title: () => '∇',
  slash: 'gradient',
  aliases: ['grad', 'nabla'],
  description: 'Gradient: the vector of partial derivatives (of a function, by its parameters)',
  appliesTo: ({ facts, statement }) =>
    isScalarField(facts) ? (statement.kind === 'defFunc' ? 0.7 : 0.5) : 0,
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'grad'),
};

export default gradient;
