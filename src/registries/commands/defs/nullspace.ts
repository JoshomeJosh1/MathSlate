import { matrixRelevance, runFunction, type Command } from '../types';

const nullspace: Command = {
  id: 'nullspace',
  title: () => 'nullspace',
  slash: 'nullspace',
  aliases: ['kernel', 'null'],
  description: 'Null space: the vectors v with Mv = 0',
  appliesTo: ({ facts }) => matrixRelevance(facts, 0.3, 0.5, 0.3),
  run: (ctx, cas) => runFunction(ctx, cas, 'nullspace'),
};

export default nullspace;
