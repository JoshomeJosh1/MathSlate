import { runVectorCalculus, vectorField, type Command } from '../types';

const divergence: Command = {
  id: 'divergence',
  title: () => '∇·',
  slash: 'divergence',
  aliases: ['div'],
  description: 'Divergence of a vector field',
  appliesTo: ({ facts }) => {
    const n = vectorField(facts);
    return n === undefined ? 0 : n === null || n >= facts.freeVars.length ? 0.5 : 0;
  },
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'div'),
};

export default divergence;
