# MathSlate SymPy runtime. Loaded once into Pyodide; each request runs a generated program
# (see serialize.ts) in a fresh namespace that starts from this module's globals, then calls
# _run_program(), which returns a JSON string.
import json
import sys
import time
from functools import reduce

from mpmath.libmp import prec_to_dps
from sympy import *  # noqa: F401,F403  (generated programs use SymPy names directly)
from sympy.core.function import Application, AppliedUndef
from sympy.core.relational import Relational
from sympy.matrices import MatrixBase
from sympy.sets.sets import EmptySet as _EmptySetClass


class MathSlateError(Exception):
    """User-facing error with a message meant to be shown on the row."""


_SEQUENCE_LIMIT = 100000


def _gcd(*args):
    return reduce(gcd, args)


def _lcm(*args):
    return reduce(lcm, args)


def _prime(n):
    n = sympify(n)
    if n.is_Integer:
        if n < 1:
            raise MathSlateError("p_n needs n ≥ 1")
        return prime(int(n))
    return Function("p")(n)


# Sequences by name: a term with a symbolic index stays an unevaluated function (p(k)), which
# summation then expands term by term (p(1) + p(2) + …); _terms evaluates those terms.
_SEQUENCES = {"p": _prime}


def _terms(e):
    """Evaluates sequence terms left with a number for an index (p(3) → 5)."""
    if not isinstance(e, Basic):
        return e
    return e.replace(
        lambda x: isinstance(x, AppliedUndef)
        and x.func.__name__ in _SEQUENCES
        and len(x.args) == 1
        and x.args[0].is_Integer,
        lambda x: _SEQUENCES[x.func.__name__](x.args[0]),
    )


def _summation(body, limits):
    return _terms(summation(body, limits))


def _product(body, limits):
    return _terms(product(body, limits))


# ----------------------------------------------------------------------------- matrices and vectors


def _scalar(x):
    """A 1×1 matrix is the number in it (vᵀw, a row times a column, is a number)."""
    if isinstance(x, MatrixBase) and x.rows == 1 and x.cols == 1:
        return x[0, 0]
    return x


def _mul(a, b):
    return _scalar(a * b)


def _is_vector(m):
    return isinstance(m, MatrixBase) and (m.rows == 1 or m.cols == 1)


def _square(m, what):
    if not isinstance(m, MatrixBase):
        raise MathSlateError(f"The {what} needs a matrix")
    if m.rows != m.cols:
        raise MathSlateError(f"The {what} needs a square matrix, not {m.rows}×{m.cols}")
    return m


def _det(m):
    return _square(m, "determinant").det()


def _trace(m):
    return _square(m, "trace").trace()


def _rank(m):
    if not isinstance(m, MatrixBase):
        raise MathSlateError("The rank needs a matrix")
    return Integer(m.rank())


def _inverse(m):
    return _square(m, "inverse").inv()


def _eigenvalues(m):
    """Each eigenvalue as often as its multiplicity, in order."""
    values = _square(m, "eigenvalues").eigenvals()
    return Tuple(*[v for v in sorted(values, key=default_sort_key) for _ in range(values[v])])


def _eigenvectors(m):
    """(eigenvalue, eigenvector) pairs, one for each independent eigenvector, as a set (like the
    null space: the vectors are a basis of each eigenspace)."""
    pairs = []
    for value, _, vectors in _square(m, "eigenvectors").eigenvects():
        pairs.extend(Tuple(value, ImmutableMatrix(v)) for v in vectors)
    return FiniteSet(*pairs)


def _rref(m):
    if not isinstance(m, MatrixBase):
        raise MathSlateError("Row reduction needs a matrix")
    return m.rref()[0]


def _nullspace(m):
    if not isinstance(m, MatrixBase):
        raise MathSlateError("The null space needs a matrix")
    # A basis, written as a set either way: {v1, v2}, or {} when only 0 maps to 0.
    return FiniteSet(*[ImmutableMatrix(v) for v in m.nullspace()])


def _transpose(m):
    return m.T if isinstance(m, MatrixBase) else m


def _dot(a, b):
    if not (_is_vector(a) and _is_vector(b)):
        raise MathSlateError("The dot product needs two vectors")
    if len(a) != len(b):
        raise MathSlateError(f"The vectors have different lengths ({len(a)} and {len(b)})")
    return expand(sum(x * y for x, y in zip(a, b)))


def _cross(a, b):
    if not (_is_vector(a) and _is_vector(b)) or len(a) != 3 or len(b) != 3:
        raise MathSlateError("The cross product needs two vectors of length 3")
    return Matrix(list(a)).cross(Matrix(list(b)))


def _cdot(a, b):
    """u·v: the dot product of two vectors, otherwise multiplication."""
    return _dot(a, b) if _is_vector(a) and _is_vector(b) else _mul(a, b)


def _times(a, b):
    """u×v: the cross product of two vectors, otherwise multiplication."""
    return _cross(a, b) if _is_vector(a) and _is_vector(b) else _mul(a, b)


def _abs(x):
    """|v|: a vector's length; |M|: a determinant; |x|: absolute value."""
    if _is_vector(x):
        return sqrt(sum(v**2 for v in x))
    if isinstance(x, MatrixBase):
        return _det(x)
    return Abs(x)


def _pow_T(a, t):
    """M^T: the transpose of a matrix, otherwise a power of T."""
    return a.T if isinstance(a, MatrixBase) else a**t


class _Sequence:
    """A user sequence: rule(n) with optional base cases, memoised and filled bottom-up so deep
    recursion (a_{1000}) does not hit Python's recursion limit."""

    def __init__(self, name, rule, bases):
        self.name, self.rule, self.bases, self.cache = name, rule, dict(bases), {}
        _SEQUENCES[name] = self

    def __call__(self, n):
        n = sympify(n)
        if not n.is_Integer:
            # Symbolic index: closed forms evaluate, recursive ones stay unevaluated.
            return Function(self.name)(n) if self.bases or self.rule is None else self.rule(n)
        k = int(n)
        if k in self.bases:
            return self.bases[k]
        if self.rule is None:
            # Only the listed terms exist (the results, out_k).
            shown = self.name.lstrip("@")
            raise MathSlateError(f"There is no {shown}_{k} with a single value to use")
        if k in self.cache:
            return self.cache[k]
        if self.bases:
            lo = min(self.bases)
            if k < lo:
                raise MathSlateError(f"{self.name}_{{{k}}} is before the first term {self.name}_{{{lo}}}")
            if k - lo > _SEQUENCE_LIMIT:
                raise MathSlateError(f"{self.name}_{{{k}}} is too far from the base case")
            for j in range(lo, k):
                if j not in self.bases and j not in self.cache:
                    self.cache[j] = self.rule(Integer(j))
        value = self.rule(Integer(k))
        self.cache[k] = value
        return value


def _derivative(fn, order, *args):
    if len(args) != 1:
        raise MathSlateError("Prime notation needs a function of one variable")
    t = Dummy("t")
    return diff(fn(t), t, order).subs(t, args[0])


class _Timeout(Exception):
    pass


def _with_time_limit(seconds, fn):
    """Runs fn, raising _Timeout once `seconds` have passed. Pyodide cannot interrupt Python from
    outside, so a trace hook checks the clock on every function call (SymPy is pure Python, so
    long computations make plenty of calls); line-level tracing stays off to keep it cheap."""
    deadline = time.monotonic() + seconds

    def tracer(frame, event, arg):
        if time.monotonic() > deadline:
            raise _Timeout()
        return None

    sys.settrace(tracer)
    try:
        return fn()
    finally:
        sys.settrace(None)


# The quick numeric answer is already on screen (see _defint_numeric), so the exact attempt can
# take a while; it stays under the worker's 20 s request timeout.
_EXACT_INTEGRAL_SECONDS = 12.0


def _defint_numeric(f, x, a, b):
    """Fast first pass for definite integrals: numerical quadrature only (exact when there are
    free parameters, as no number exists then)."""
    params = (sympify(f).free_symbols - {x}) | sympify(a).free_symbols | sympify(b).free_symbols
    if params:
        return integrate(f, (x, a, b))
    value = Integral(f, (x, a, b)).evalf(15)
    if value.has(Integral):
        raise MathSlateError("Could not evaluate this integral numerically")
    return value


def _defint(f, x, a, b):
    """Definite integral. The exact value when SymPy finds one in elementary terms (shown with a
    decimal approximation); otherwise a number by numerical quadrature, which works even without a
    closed form (sin(x^2)) where the exact form would be special functions. With free parameters
    in the integrand or bounds the result can only be exact."""
    params = (sympify(f).free_symbols - {x}) | sympify(a).free_symbols | sympify(b).free_symbols
    if params:
        return integrate(f, (x, a, b))
    try:
        exact = _with_time_limit(_EXACT_INTEGRAL_SECONDS, lambda: integrate(f, (x, a, b)))
    except Exception:  # noqa: BLE001 - _Timeout, or SymPy giving up: fall back to numbers
        exact = None
    # Any closed form counts, special functions included (Fresnel, erf, hypergeometric…); only an
    # unevaluated integral means there is none.
    if exact is not None and not exact.has(Integral):
        return exact
    value = Integral(f, (x, a, b)).evalf(15)
    if value.has(Integral):
        raise MathSlateError("Could not evaluate this integral numerically")
    return value


def _evaluate(e):
    return e.doit() if isinstance(e, Basic) else e


def _factor(e):
    if isinstance(e, Integer) and abs(e) > 1:
        return ("factorint", e)
    return factor(e)


def _numeric(e, digits):
    return N(e, digits)


def _solve(e, var):
    if isinstance(e, Relational) and not isinstance(e, Eq) and not isinstance(e, Ne):
        return ("inequality", reduce_inequalities(e, var))
    solutions = solve(e, var, dict=False)
    return ("solutions", var, solutions)


# ----------------------------------------------------------------------------- result → JSON

_FUNCTION_NAMES = {
    "asin": "arcsin", "acos": "arccos", "atan": "arctan", "acot": "arccot", "asec": "arcsec",
    "acsc": "arccsc", "asinh": "arsinh", "acosh": "arcosh", "atanh": "artanh", "acoth": "arcoth",
    "asech": "arsech", "acsch": "arcsch", "log": "ln",
    "ceiling": "ceil", "Max": "max", "Min": "min",
    # Special functions (MathSlate names are in registries/builtins/functions/defs/special.ts).
    "uppergamma": "gamma", "beta": "Beta", "polygamma": "digamma", "fresnels": "fresnelS",
    "fresnelc": "fresnelC", "polylog": "Li", "besselj": "besselJ", "bessely": "besselY",
    "besseli": "besselI", "besselk": "besselK", "airyai": "Ai", "airybi": "Bi",
    "elliptic_k": "ellipticK", "elliptic_e": "ellipticE",
}
_KNOWN_FUNCTIONS = {
    "sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "coth", "sech", "csch",
    "floor", "sign", "binomial", "exp", "gcd", "lcm",
    "erf", "erfc", "erfi", "gamma", "lowergamma", "zeta", "digamma", "Si", "Ci", "Shi", "Chi",
    "Ei", "li", "LambertW",
    "fibonacci", "lucas", "catalan", "bell", "partition", "harmonic", "bernoulli", "totient",
    "primepi",
}
_RELATIONS = {"==": "=", "<": "<", ">": ">", "<=": "<=", ">=": ">=", "!=": "!="}


def _tree(e):
    if isinstance(e, bool) or e is S.true or e is S.false:
        return {"t": "bool", "v": bool(e)}
    if isinstance(e, int):
        e = Integer(e)
    if isinstance(e, (list, tuple)) or isinstance(e, Tuple):
        return {"t": "list", "delim": "paren", "items": [_tree(a) for a in e]}
    if isinstance(e, MatrixBase):
        return {"t": "matrix", "rows": [[_tree(e[i, j]) for j in range(e.cols)] for i in range(e.rows)]}
    if isinstance(e, FiniteSet):
        return {"t": "list", "delim": "set", "items": [_tree(a) for a in e.args]}
    if isinstance(e, _EmptySetClass):
        return {"t": "list", "delim": "set", "items": []}
    if not isinstance(e, Basic):
        return {"t": "unknown"}
    if e.is_Integer:
        return {"t": "int", "v": str(e)} if e >= 0 else {"t": "neg", "a": {"t": "int", "v": str(-e)}}
    if e.is_Rational:
        frac = {"t": "div", "l": {"t": "int", "v": str(abs(e.p))}, "r": {"t": "int", "v": str(e.q)}}
        return frac if e > 0 else {"t": "neg", "a": frac}
    if e.is_Float:
        s = _float_str(e)
        return {"t": "neg", "a": {"t": "float", "v": s[1:]}} if s.startswith("-") else {"t": "float", "v": s}
    if e is S.Pi:
        return {"t": "const", "id": "pi"}
    if e is S.Exp1:
        return {"t": "const", "id": "e"}
    if e is S.ImaginaryUnit:
        return {"t": "const", "id": "i"}
    if e is S.Infinity:
        return {"t": "const", "id": "infinity"}
    if e is S.NegativeInfinity:
        return {"t": "neg", "a": {"t": "const", "id": "infinity"}}
    if e.is_Symbol:
        return {"t": "sym", "name": e.name}
    if isinstance(e, exp):
        return {"t": "pow", "l": {"t": "const", "id": "e"}, "r": _tree(e.args[0])}
    if isinstance(e, Add):
        terms = e.as_ordered_terms()
        node = _tree(terms[0])
        for term in terms[1:]:
            if term.could_extract_minus_sign():
                node = {"t": "sub", "l": node, "r": _tree(-term)}
            else:
                node = {"t": "add", "l": node, "r": _tree(term)}
        return node
    if isinstance(e, Mul):
        if e.could_extract_minus_sign():
            return {"t": "neg", "a": _tree(-e)}
        num, den = fraction(e)
        if den != 1:
            return {"t": "div", "l": _tree(num), "r": _tree(den)}
        factors = e.as_ordered_factors()
        node = _tree(factors[0])
        for f in factors[1:]:
            node = {"t": "mul", "l": node, "r": _tree(f)}
        return node
    if isinstance(e, Pow):
        base, ex = e.args
        if ex == S.Half:
            return {"t": "sqrt", "a": _tree(base)}
        if ex.is_Rational and ex.p == 1 and ex.q > 1:
            return {"t": "root", "a": _tree(base), "n": _tree(Integer(ex.q))}
        if ex.is_number and ex.is_negative:
            return {"t": "div", "l": {"t": "int", "v": "1"}, "r": _tree(Pow(base, -ex))}
        return {"t": "pow", "l": _tree(base), "r": _tree(ex)}
    if isinstance(e, Abs):
        return {"t": "abs", "a": _tree(e.args[0])}
    if isinstance(e, factorial):
        return {"t": "factorial", "a": _tree(e.args[0])}
    if isinstance(e, Relational) and e.rel_op in _RELATIONS:
        return {"t": "rel", "op": _RELATIONS[e.rel_op], "l": _tree(e.lhs), "r": _tree(e.rhs)}
    if isinstance(e, And):
        return {"t": "and", "items": [_tree(a) for a in e.args]}
    if isinstance(e, AppliedUndef) and len(e.args) == 1:
        return {"t": "index", "seq": e.func.__name__, "i": _tree(e.args[0])}
    if isinstance(e, polygamma) and e.args[0] == 0:
        # SymPy writes digamma(x) as polygamma(0, x).
        return {"t": "call", "fn": "digamma", "args": [_tree(e.args[1])]}
    if isinstance(e, Function) or isinstance(e, Application):
        name = type(e).__name__
        name = _FUNCTION_NAMES.get(name, name)
        if name in _KNOWN_FUNCTIONS or name in _FUNCTION_NAMES.values():
            return {"t": "call", "fn": name, "args": [_tree(a) for a in e.args]}
    return {"t": "unknown"}


def _float_str(f, digits=15):
    """A decimal with 15 significant digits, or more if it was computed to more (N(e, 30))."""
    precision = prec_to_dps(f._prec) if isinstance(f, Float) else digits
    if precision > digits:
        return str(Float(f, precision))
    s = format(float(f), f".{digits}g") if abs(float(f)) < 1e16 else str(f)
    return s


def _has_unknown(tree):
    if isinstance(tree, dict):
        if tree.get("t") == "unknown":
            return True
        return any(_has_unknown(v) for v in tree.values())
    if isinstance(tree, list):
        return any(_has_unknown(v) for v in tree)
    return False


def _value(e):
    tree = _tree(e)
    return {"tree": None if _has_unknown(tree) else tree, "latex": latex(e)}


def _numeric_value(e):
    """Decimal approximation for exact, non-integer numbers (shown as ≈ …)."""
    try:
        # free_symbols, not is_number: SymPy says hyper(...) is not a number though it evaluates.
        if not isinstance(e, Basic) or isinstance(e, MatrixBase) or e.free_symbols:
            return None
        if e.is_Integer or e.is_Float:
            return None
        if e.has(S.Infinity, S.NegativeInfinity, S.ComplexInfinity, S.NaN):
            return None
        n = N(e, 15)
        if not n.is_number or n.has(S.NaN):
            return None
        return _value(n)
    except Exception:  # noqa: BLE001 - approximation is best-effort
        return None


def _tidy(e):
    """Presentation clean-ups that keep the value: drop SymPy's internal polar numbers
    (polylog(2, x*exp_polar(2*I*pi)) → polylog(2, x)) and cancel gamma ratios
    (Γ(3/4)/Γ(7/4) → 4/3), which special-function results are full of."""
    if not isinstance(e, Basic):
        return e
    try:
        if e.has(exp_polar):
            # exp_polar(2πi) is SymPy's branch bookkeeping; as an ordinary number it is 1.
            e = unpolarify(e).replace(exp_polar, exp)
        if e.has(gamma):
            e = _with_time_limit(2.0, lambda: gammasimp(e))
    except Exception:  # noqa: BLE001 - tidying is optional
        pass
    return e


def _describe(result):
    result = _scalar(result)
    if isinstance(result, Basic) and any(
        x.func.__name__.startswith("@") for x in result.atoms(AppliedUndef)
    ):
        # A term of the results (out_k) whose k is not a number, e.g. a sum up to n.
        raise MathSlateError("out_k needs a number for k (a sum over results needs number bounds)")
    if isinstance(result, tuple) and result and result[0] == "solutions":
        _, var, sols = result
        return {
            "kind": "solutions",
            "variable": var.name,
            "solutions": [
                {**_value(_tidy(s)), "numeric": _numeric_value(s)} for s in sols
            ],
        }
    if isinstance(result, tuple) and result and result[0] == "inequality":
        return {"kind": "expr", **_value(result[1]), "numeric": None}
    if isinstance(result, tuple) and result and result[0] == "factorint":
        n = result[1]
        sign = n < 0
        parts = sorted(factorint(abs(n)).items())
        node = None
        latex_parts = []
        for p, k in parts:
            f = {"t": "int", "v": str(p)} if k == 1 else {"t": "pow", "l": {"t": "int", "v": str(p)}, "r": {"t": "int", "v": str(k)}}
            node = f if node is None else {"t": "mul", "form": "cdot", "l": node, "r": f}
            latex_parts.append(str(p) if k == 1 else f"{p}^{{{k}}}")
        if sign:
            node = {"t": "neg", "a": node}
        text = ("-" if sign else "") + " \\cdot ".join(latex_parts)
        return {"kind": "expr", "tree": node, "latex": text, "numeric": None}
    if result is S.true or result is S.false or isinstance(result, bool):
        return {"kind": "boolean", "value": bool(result)}
    result = _tidy(result)
    return {"kind": "expr", **_value(result), "numeric": _numeric_value(result)}


def _run_program(code):
    namespace = dict(globals())
    try:
        exec(code, namespace)
        return json.dumps({"ok": True, "value": _describe(namespace["_result"])})
    except MathSlateError as err:
        return json.dumps({"ok": False, "error": str(err)})
    except RecursionError:
        return json.dumps({"ok": False, "error": "Too much recursion"})
    except ZeroDivisionError:
        return json.dumps({"ok": False, "error": "Division by zero"})
    except Exception as err:  # noqa: BLE001 - report anything else to the row
        return json.dumps({"ok": False, "error": _MATRIX_ERRORS.get(type(err).__name__, f"{type(err).__name__}: {err}")})


# SymPy's matrix errors, in words (matched by class name: their module moved between versions).
_MATRIX_ERRORS = {
    "ShapeError": "The matrix sizes do not fit: a product needs as many columns on the left as rows on the right, a sum the same size",
    "NonSquareMatrixError": "This needs a square matrix",
    "NonInvertibleMatrixError": "The matrix is not invertible (its determinant is 0)",
}
