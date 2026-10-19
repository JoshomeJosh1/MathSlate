import { replaceVars } from '../../../cas/inline';
import { nameKey } from '../../../parser/ast';
import { printLatex, printName } from '../../../parser/printLatex';
import { preferredVariableLatex, variableArg, type Command } from '../types';

const substitute: Command = {
  id: 'substitute',
  title: (ctx, args) =>
    args.at?.kind === 'point'
      ? `at ${printName(variableArg(ctx, args, 'at'))}=${printLatex(args.at.point)}`
      : 'substitute',
  slash: 'substitute',
  aliases: ['at', 'evaluate', 'subs', 'plug'],
  description: 'Evaluate with a variable set to a value: x=2',
  params: [
    {
      name: 'at',
      label: 'with',
      kind: 'point',
      default: (ctx) => `${preferredVariableLatex(ctx)}=1`,
    },
  ],
  appliesTo: ({ facts }) => (facts.freeVars.length === 0 || facts.isMatrix ? 0 : 0.3),
  run: (ctx, cas, args) => {
    const at = args.at;
    if (at?.kind !== 'point') {
      return Promise.resolve({ ok: false, error: 'Choose a value: x=2', backend: '' });
    }
    const target = replaceVars(ctx.target.expr, new Map([[nameKey(at.variable), at.point]]));
    return cas.run({
      operation: { op: 'evaluate' },
      target,
      env: ctx.env,
      locals: ctx.target.locals.filter((l) => l !== nameKey(at.variable)),
    });
  },
};

export default substitute;
