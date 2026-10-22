/**
 * Vector calculus: functions of an operand and, optionally, the variables to differentiate by.
 * Written as functions (`\grad f`, `\operatorname{div} F`, `\hessian(f)`, `\jacobian(F, (u, v))`)
 * or with ∇: `\nabla f` (grad), `\nabla\cdot F` (div), `\nabla\times F` (curl), `\nabla^2 f`
 * (laplacian); a subscript lists the variables, `\nabla_{x,y} f`.
 *
 * In the AST each is a call: `[operand]`, or `[operand, (variables)]` with the variables bound in
 * the operand. Without variables a backend uses a function's own parameters (`\nabla f`,
 * `\nabla f(1,2)`: the gradient at (1, 2)), else the operand's free variables in alphabetical
 * order. The operand may be a defined function's bare name.
 */
export const VECTOR_CALCULUS = new Set(['grad', 'div', 'curl', 'laplacian', 'jacobian', 'hessian']);

/** How ∇ writes the operations it can stand for. */
export const NABLA_FORMS: Partial<Record<string, string>> = {
  grad: '\\nabla',
  div: '\\nabla\\cdot',
  curl: '\\nabla\\times',
  laplacian: '\\nabla^{2}',
};
