# MathSlate SymPy runtime. Loaded once into Pyodide; each request runs a generated program
# (see serialize.ts) in a fresh namespace that starts from this module's globals, then calls
# _run_program(), which returns a JSON string.
import json
import sys
import time
from functools import reduce

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


class _Sequence:
    """A user sequence: rule(n) with optional base cases, memoised and filled bottom-up so deep
    recursion (a_{1000}) does not hit Python's recursion limit."""

    def __init__(self, name, rule, bases):
        self.name, self.rule, self.bases, self.cache = name, rule, dict(bases), {}

    def __call__(self, n):
        n = sympify(n)
        if not n.is_Integer:
            # Symbolic index: closed forms evaluate, recursive ones stay unevaluated.
            return Function(self.name)(n) if self.bases else self.rule(n)
        k = int(n)
        if k in self.bases:
            return self.bases[k]
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
    if isinstance(result, tuple) and result and result[0] == "solutions":
        _, var, sols = result
        return {
            "kind": "solutions",
            "variable": var.name,
            "solutions": [_value(_tidy(s)) for s in sols],
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
        return json.dumps({"ok": False, "error": f"{type(err).__name__}: {err}"})
