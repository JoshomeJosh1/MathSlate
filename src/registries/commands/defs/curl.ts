import { runVectorCalculus, vectorField, type Command } from '../types';

const curl: Command = {
  id: 'curl',
  title: () => '∇×',
  slash: 'curl',
  aliases: ['rot'],
  description: 'Curl of a vector field in 3D (in 2D, the scalar curl)',
  appliesTo: ({ facts }) => {
    const n = vectorField(facts);
    return n === undefined ? 0 : n === null || n === 2 || n === 3 ? 0.5 : 0;
  },
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'curl'),
};

export default curl;
