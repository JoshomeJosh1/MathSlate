import { addOutput, insertRowAfter, setCollapsed, type Doc } from './model';

/**
 * The documentation slate: shown on first visit and via the Documentation button. It is a working
 * document that demonstrates everything MathSlate can do. `documentation.test.ts` fails if a
 * built-in function, sequence, constant, command or calculus operator is missing from it, or if any
 * row has an error that is not intentional — so add an example whenever you add a feature.
 *
 * Each entry is a note (`# heading` or text), a math row, a math row with commands attached, or
 * the start of a folder: the entries after it go in the folder, up to the next folder. Folders
 * start collapsed unless `open`, so the slate reads as a table of contents.
 */
type Entry =
  | { note: string }
  | { folder: string; open?: boolean }
  | string
  /** A math row with commands attached: an id, or an id with arguments ({ unit: 'mi' }). */
  | [latex: string, ...commands: (string | [id: string, args: Record<string, string>])[]];

export const DOCUMENTATION: readonly Entry[] = [
  { note: '# MathSlate' },
  {
    note: 'A notebook for exact, symbolic math. Every row below is live: edit anything and the results update. Click New for an empty slate; this page comes back with the Documentation button.',
  },
  {
    note: 'Each section below is a folder: click ▸ beside its title to open it.',
  },

  { folder: 'Typing', open: true },
  {
    note: 'Type math as on paper: 2x, x^2 (type ^ for powers, → to leave them), / for fractions, sqrt, pi, theta. Enter adds a row, Backspace on an empty row deletes it, ↑/↓ move between rows, Esc leaves the row, and the number on the left drags a row.',
  },
  {
    note: 'Shortcuts: Greek letters by name (alpha, theta, Gamma), function names (sin, ln, lcm, erf, Si), sqrt, cbrt, nthroot, frac, binom, int, defint, sum, prod, lim, partial, infty, * for ·, times for ×, +- for ±, <= >= != for ≤ ≥ ≠, -> for →. Other letters stay letters: xy is x·y. If a word turns into a symbol you did not want, press Backspace straight away to get the letters back.',
  },
  {
    note: 'Type \\ for a menu of everything MathSlate understands — structures, symbols, Greek letters and every function, in groups (hover over one for its name and description). Keep typing to filter it (\\fr, \\root), use the arrow keys to choose, and Enter, Tab or Space to insert; Esc closes it.',
  },
  {
    note: 'Type " in an empty row to turn it into a note like this one, or # for a heading. Backspace in an empty note turns it back into math.',
  },
  {
    note: 'Results appear in tinted output rows. Under the row you are editing, suggested commands appear: click one to add it as an output row (labelled out₁, out₂, …). ↧ copies a result into a new row; × removes an output.',
  },

  { folder: 'Folders and notes' },
  {
    note: 'Folders group rows and notes. Make one with + Folder at the bottom of the slate, by typing @ in an empty row, or by Shift+clicking row numbers and choosing Group into folder.',
  },
  {
    note: 'Click the arrow beside a folder to collapse or expand it. Folders only organise: rows in a collapsed folder still compute, and their definitions are used everywhere.',
  },
  {
    note: 'Drag rows by their number. Dropped on a row in a folder, a row joins that folder; drag it left of the folder’s indent line to take it out. Dropped on a folder’s title, or on a row in no folder, past the first third of it, the row joins that folder or makes a new folder with that row. A dashed outline shows the group it will join, and a label by the pointer says what will happen. Dragging a folder moves everything in it; deleting a folder keeps its rows.',
  },
  '\\mathrm{side}=3',
  '\\mathrm{side}^2',
  { note: '## A heading (type # in an empty row)' },
  { note: 'Notes can be headings: ## for a smaller one, like the one above.' },

  { folder: 'Arithmetic is exact' },
  '\\frac13+\\frac16',
  '0.1+0.2',
  '\\sqrt{72}',
  '\\sqrt[3]{54}',
  '2^{100}',
  '30!',
  '\\binom{10}{3}',
  '\\left|3-8\\right|',
  '50\\%\\cdot 80',
  ['\\sqrt2+\\pi', 'numeric'],
  { note: 'Decimals like 0.1 are exact fractions; a ≈ decimal is shown alongside exact numbers.' },

  { folder: 'Constants' },
  {
    note: 'π, e and i are the constants, so they cannot be defined (results use them); the same goes for built-in function names, ans and out. As an index or a parameter they are fine: Σ_{i=1}^{n}, f(e).',
  },
  '\\pi',
  'e',
  'e^{i\\pi}+1',
  '\\sqrt{-4}',
  '\\lim_{x\\to\\infty}\\frac{1}{x}',

  { folder: 'Built-in functions' },
  {
    note: 'Every built-in function, with what it does, how to type it, and examples. Type a function name and it turns upright (sin → sin), becoming a single unit you delete in one go. Functions of two or more arguments (gcd, lcm, binomial) need brackets: keep typing letters after one and it turns back into ordinary letters. Brackets are optional for one argument: sin 2x means sin(2x), and the argument stops at the next function, so sin x cos x is sin(x)·cos(x). A function you define yourself with the same name replaces the built-in one.',
  },
  {
    note: 'Powers of functions: sin^2 x means (sin x)², and f^{-1} means the inverse function where there is one (sin^{-1} = arcsin, exp^{-1} = ln).',
  },

  { note: '## Trigonometric functions' },
  { note: 'Angles are in radians. Exact values come out for the standard angles.' },
  { note: 'sin(x) — sine. Type sin.' },
  '\\sin\\left(\\frac{\\pi}{6}\\right)',
  '\\sin\\left(\\frac{\\pi}{4}\\right)+\\sin\\left(\\frac{\\pi}{3}\\right)',
  '\\sin1',
  '\\frac{d}{dx}\\sin x',
  { note: 'cos(x) — cosine. Type cos.' },
  '\\cos\\left(\\frac{\\pi}{3}\\right)',
  '\\cos\\left(\\pi\\right)',
  '\\int_0^{\\frac{\\pi}{2}}\\cos x\\,dx',
  { note: 'tan(x) — tangent, sin x / cos x. Type tan.' },
  '\\tan\\left(\\frac{\\pi}{4}\\right)',
  '\\tan\\left(\\frac{\\pi}{3}\\right)',
  '\\frac{d}{dx}\\tan x',
  { note: 'cot(x) — cotangent, 1 / tan x. Type cot.' },
  '\\cot\\left(\\frac{\\pi}{4}\\right)',
  '\\cot\\left(\\frac{\\pi}{6}\\right)',
  { note: 'sec(x) — secant, 1 / cos x. Type sec.' },
  '\\sec\\left(0\\right)',
  '\\sec\\left(\\frac{\\pi}{3}\\right)',
  '\\int\\sec^2x\\,dx',
  { note: 'csc(x) — cosecant, 1 / sin x. Type csc.' },
  '\\csc\\left(\\frac{\\pi}{2}\\right)',
  '\\csc\\left(\\frac{\\pi}{6}\\right)',
  { note: 'Powers and identities:' },
  '\\sin^2\\left(\\frac{\\pi}{3}\\right)+\\cos^2\\left(\\frac{\\pi}{3}\\right)',
  ['\\sin^2x+\\cos^2x', 'simplify'],

  { note: '## Inverse trigonometric functions' },
  {
    note: 'Results are angles in radians. Type arcsin, or sin^{-1} (type sin, then ^-1).',
  },
  { note: 'arcsin(x) — inverse sine, for −1 ≤ x ≤ 1, giving −π/2 to π/2.' },
  '\\arcsin\\left(1\\right)',
  '\\arcsin\\left(\\frac{1}{2}\\right)',
  '\\sin^{-1}\\left(\\frac{\\sqrt{3}}{2}\\right)',
  '\\frac{d}{dx}\\arcsin x',
  { note: 'arccos(x) — inverse cosine, giving 0 to π.' },
  '\\arccos\\left(0\\right)',
  '\\arccos\\left(-1\\right)',
  '\\cos^{-1}\\left(\\frac{1}{2}\\right)',
  { note: 'arctan(x) — inverse tangent, giving −π/2 to π/2.' },
  '\\arctan\\left(1\\right)',
  '\\tan^{-1}\\left(\\sqrt{3}\\right)',
  '\\lim_{x\\to\\infty}\\arctan x',
  '\\int_0^1\\frac{1}{1+x^2}\\,dx',
  { note: 'arccot(x), arcsec(x), arccsc(x) — inverses of cot, sec and csc. Type the name.' },
  'arccot(1)',
  'arccot(\\sqrt{3})',
  'arcsec(2)',
  'arccsc(2)',
  '\\sec^{-1}\\left(1\\right)+\\csc^{-1}\\left(1\\right)+\\cot^{-1}\\left(1\\right)',

  { note: '## Hyperbolic functions' },
  { note: 'sinh(x) — hyperbolic sine, (eˣ − e⁻ˣ)/2. Type sinh.' },
  '\\sinh\\left(0\\right)',
  '\\sinh\\left(\\ln2\\right)',
  '\\frac{d}{dx}\\sinh x',
  { note: 'cosh(x) — hyperbolic cosine, (eˣ + e⁻ˣ)/2.' },
  '\\cosh\\left(0\\right)',
  '\\cosh\\left(\\ln2\\right)',
  ['\\cosh^2x-\\sinh^2x', 'simplify'],
  { note: 'tanh(x) — hyperbolic tangent, sinh x / cosh x.' },
  '\\tanh\\left(0\\right)',
  '\\lim_{x\\to\\infty}\\tanh x',
  { note: 'coth(x), sech(x), csch(x) — 1/tanh, 1/cosh and 1/sinh.' },
  '\\coth\\left(\\ln3\\right)',
  'sech(0)',
  'sech(\\ln2)',
  'csch(\\ln2)',

  { note: '## Inverse hyperbolic functions' },
  {
    note: 'Named with "ar" (area sine, …); the "arc" spellings arcsinh, arccosh, arctanh, arccoth, arcsech and arccsch work too.',
  },
  { note: 'arsinh(x) — inverse hyperbolic sine, ln(x + √(x² + 1)). Also sinh^{-1}.' },
  'arsinh(0)',
  'arsinh(1)',
  '\\sinh^{-1}\\left(\\frac{3}{4}\\right)',
  { note: 'arcosh(x) — inverse hyperbolic cosine, for x ≥ 1. Also cosh^{-1}.' },
  'arcosh(1)',
  '\\cosh^{-1}\\left(2\\right)',
  { note: 'artanh(x) — inverse hyperbolic tangent, for −1 < x < 1. Also tanh^{-1}.' },
  'artanh(0)',
  'artanh(\\frac{1}{2})',
  '\\frac{d}{dx}artanh(x)',
  'arctanh(\\frac{1}{2})',
  { note: 'arcoth(x) — inverse hyperbolic cotangent, for |x| > 1. Also coth^{-1}.' },
  'arcoth(2)',
  '\\coth^{-1}\\left(3\\right)',
  '\\frac{d}{dx}arcoth(x)',
  { note: 'arsech(x) — inverse hyperbolic secant, for 0 < x ≤ 1. Also sech^{-1}.' },
  'arsech(1)',
  'arsech(\\frac{1}{2})',
  'arcsech(\\frac{1}{2})',
  { note: 'arcsch(x) — inverse hyperbolic cosecant, for x ≠ 0. Also csch^{-1}.' },
  'arcsch(1)',
  'arccsch(1)',

  { note: '## Exponentials and logarithms' },
  { note: 'exp(x) — the exponential function eˣ. Type exp, or e^x.' },
  '\\exp\\left(0\\right)',
  '\\exp\\left(2\\right)',
  '\\exp\\left(\\ln5\\right)',
  '\\frac{d}{dx}\\exp\\left(x^2\\right)',
  { note: 'ln(x) — natural logarithm (base e). Type ln; exp^{-1} also means ln.' },
  '\\ln\\left(e^3\\right)',
  '\\ln\\left(1\\right)',
  '\\ln\\left(2\\right)',
  '\\ln\\left(-1\\right)',
  '\\int\\frac{1}{x}\\,dx',
  {
    note: 'log(x) — base-10 logarithm. log_b(x) or log(x, b) — base b: type log, then _ for the base.',
  },
  '\\log\\left(1000\\right)',
  '\\log_28',
  '\\log_{3}\\left(\\frac{1}{81}\\right)',
  '\\log\\left(32,2\\right)',
  ['\\log_{\\sqrt{2}}4', 'simplify'],

  { note: '## Rounding and sign' },
  { note: 'floor(x) — the greatest integer ≤ x (rounds down).' },
  'floor(2.7)',
  'floor(-2.7)',
  'floor(\\pi^2)',
  { note: 'ceil(x) — the least integer ≥ x (rounds up).' },
  'ceil(2.2)',
  'ceil(-2.2)',
  'ceil(\\sqrt{50})',
  { note: 'sign(x) — −1, 0 or 1 by the sign of x.' },
  'sign(-3)',
  'sign(0)',
  'sign(\\pi-3)',

  { note: '## Integers and combinatorics' },
  { note: 'gcd(a, b, …) — greatest common divisor, of two or more integers. Type gcd.' },
  '\\gcd\\left(12,18\\right)',
  '\\gcd\\left(84,126,210\\right)',
  { note: 'lcm(a, b, …) — least common multiple.' },
  'lcm(4,6)',
  'lcm(2,3,4,5,6)',
  {
    note: 'binomial(n, k) — the binomial coefficient, "n choose k". Type binomial(n, k), or binom for the stacked (n k) notation.',
  },
  '\\binom{5}{2}',
  '\\binom{52}{5}',
  '\\sum_{j=0}^{6}\\binom{6}{j}',
  'binomial(10,5)',
  { note: 'n! — factorial (an operator, not a function): type !.' },
  '10!',

  { note: '## Maximum and minimum' },
  { note: 'max(a, b, …) and min(a, b, …) — the largest and smallest of one or more values.' },
  '\\max\\left(3,7,5\\right)',
  '\\min\\left(3,7,5\\right)',
  '\\max\\left(\\pi,\\sqrt{10},\\frac{22}{7}\\right)',
  '\\min\\left(\\sin1,\\cos1\\right)',

  { folder: 'Special functions' },
  {
    note: 'Special functions appear in exact answers and can be typed by name (erf, Si, besselJ). Their names only count when followed by brackets, so 2ζ, Γ, or Si without brackets stay ordinary symbols (Si is S·i: typing anything but a bracket after the name turns it back into letters), and C(x+1) is still C times (x+1).',
  },

  { note: '## Error functions' },
  { note: 'erf(x) — the error function, (2/√π)∫₀ˣ e^(−t²) dt. Type erf.' },
  'erf(0)',
  'erf(1)',
  '\\lim_{x\\to\\infty}erf(x)',
  '\\frac{d}{dx}erf(x)',
  '\\int_0^1e^{-x^2}\\,dx',
  { note: 'erfc(x) — the complementary error function, 1 − erf(x).' },
  'erfc(1)',
  'erf(1)+erfc(1)',
  'erf(-x)+erf(x)',
  { note: 'erfi(x) — the imaginary error function, −i·erf(ix).' },
  'erfi(0)',
  'erfi(1)',
  '\\int e^{x^2}\\,dx',

  { note: '## Gamma, Beta and related functions' },
  {
    note: 'Γ(x) — the gamma function: Γ(n) = (n − 1)! for whole numbers. Type \\Gamma (or gamma(x)).',
  },
  '\\Gamma\\left(5\\right)',
  '\\Gamma\\left(\\frac{1}{2}\\right)',
  '\\Gamma\\left(\\frac{5}{2}\\right)',
  '\\int_0^{\\infty}x^4e^{-x}\\,dx',
  {
    note: 'Γ(s, x) and γ(s, x) — the upper and lower incomplete gamma functions; they add up to Γ(s). Type \\Gamma or \\gamma with two arguments (or lowergamma(s,x)).',
  },
  '\\Gamma\\left(2,1\\right)',
  '\\gamma\\left(2,1\\right)',
  '\\Gamma\\left(3,1\\right)+\\gamma\\left(3,1\\right)',
  { note: 'B(a, b) — the Beta function, Γ(a)Γ(b)/Γ(a + b). Type Beta(a,b).' },
  'Beta(2,3)',
  'Beta(\\frac{1}{2},\\frac{1}{2})',
  '\\int_0^1x^2\\left(1-x\\right)^3\\,dx',
  {
    note: 'ψ(x) — the digamma function, Γ′(x)/Γ(x); ψ(n, x) is its n-th derivative (polygamma). Type \\psi (or digamma).',
  },
  '\\psi\\left(1\\right)',
  '\\psi\\left(1,1\\right)',
  'digamma(\\frac{1}{2})',

  { note: '## Zeta function and polylogarithm' },
  {
    note: 'ζ(s) — the Riemann zeta function, Σ 1/nˢ; ζ(s, a) is the Hurwitz zeta function Σ 1/(n + a)ˢ. Type \\zeta.',
  },
  '\\zeta\\left(2\\right)',
  '\\zeta\\left(4\\right)',
  '\\zeta\\left(3\\right)',
  '\\zeta\\left(-1\\right)',
  '\\zeta\\left(3,1\\right)',
  '\\sum_{n=1}^{\\infty}\\frac{1}{n^4}',
  {
    note: 'Li_s(x) — the polylogarithm Σ xⁿ/nˢ; Li_2 is the dilogarithm. Type Li_2(x), or Li(s, x).',
  },
  'Li_2(1)',
  'Li_2(\\frac{1}{2})',
  'Li(3,1)',
  '\\int\\frac{\\ln\\left(1-x\\right)}{x}\\,dx',

  { note: '## Fresnel integrals' },
  {
    note: 'S(x) = ∫₀ˣ sin(πt²/2) dt and C(x) = ∫₀ˣ cos(πt²/2) dt. Type fresnelS(x) and fresnelC(x); results show as S(x) and C(x).',
  },
  'fresnelS(1)',
  'fresnelC(1)',
  '\\lim_{x\\to\\infty}fresnelS(x)',
  '\\int_0^1\\sin\\left(x^2\\right)\\,dx',
  '\\int\\cos\\left(x^2\\right)\\,dx',

  { note: '## Trigonometric and exponential integrals' },
  { note: 'Si(x) — the sine integral, ∫₀ˣ sin(t)/t dt.' },
  'Si(1)',
  '\\lim_{x\\to\\infty}Si(x)',
  '\\int\\frac{\\sin x}{x}\\,dx',
  { note: 'Ci(x) — the cosine integral, −∫ₓ^∞ cos(t)/t dt.' },
  'Ci(1)',
  '\\frac{d}{dx}Ci(x)',
  { note: 'Shi(x) and Chi(x) — the hyperbolic sine and cosine integrals.' },
  'Shi(1)',
  'Chi(1)',
  '\\int\\frac{\\sinh x}{x}\\,dx',
  { note: 'Ei(x) — the exponential integral, ∫ eᵗ/t dt.' },
  'Ei(1)',
  '\\int\\frac{e^{x}}{x}\\,dx',
  {
    note: 'li(x) — the logarithmic integral, ∫₀ˣ dt/ln t; it approximates the number of primes below x.',
  },
  'li(2)',
  'li(1000)',
  '\\int\\frac{1}{\\ln x}\\,dx',

  { note: '## Lambert W function' },
  {
    note: 'W(x) — the solution w of w·eʷ = x. LambertW(x) is the principal branch; LambertW(x, k) chooses branch k.',
  },
  'LambertW(0)',
  'LambertW(1)',
  'LambertW(e)',
  'LambertW(-\\frac{1}{e},-1)',
  ['xe^{x}=2', 'solve'],

  { note: '## Bessel functions' },
  {
    note: 'J_n(x) and Y_n(x) — Bessel functions of the first and second kind; I_n(x) and K_n(x) — the modified Bessel functions. Type besselJ(n,x), besselY(n,x), besselI(n,x) and besselK(n,x), or with the order as a subscript: besselJ_n(x). Results show as J_n(x), Y_n(x), I_n(x), K_n(x).',
  },
  'besselJ(0,1)',
  'besselJ_1(2)',
  '\\operatorname{J}_{0}\\left(0\\right)',
  'besselY(0,1)',
  'besselI(0,1)',
  'besselK(0,1)',
  '\\frac{d}{dx}besselJ(0,x)',

  { note: '## Airy functions' },
  { note: 'Ai(x) and Bi(x) — the two solutions of y″ = x·y.' },
  'Ai(0)',
  'Bi(0)',
  'Ai(1)+Bi(1)',
  '\\frac{d^2}{dx^2}Ai(x)',

  { note: '## Elliptic integrals' },
  {
    note: 'K(m) and E(m) — complete elliptic integrals of the first and second kind (parameter m = k²). E(φ, m) is the incomplete integral of the second kind. Type ellipticK(m) and ellipticE(m).',
  },
  'ellipticK(0)',
  'ellipticK(\\frac{1}{2})',
  'ellipticE(0)',
  'ellipticE(1)',
  'ellipticE(\\frac{\\pi}{4},\\frac{1}{2})',

  { note: '## Results beyond the built-ins' },
  {
    note: 'Some exact answers use functions or constants MathSlate does not model yet, like the hypergeometric ₂F₁ or Euler’s constant γ. They are shown in SymPy’s notation with a decimal, but cannot be copied back into a row.',
  },
  '\\int_0^1\\sqrt{1+x^3}\\,dx',

  { folder: 'Your own names and functions' },
  'r=5',
  'A_{circle}=\\pi r^2',
  'v_{max}=30',
  'speed=12',
  'time=3',
  'distance=speed\\cdot time',
  {
    note: 'Multi-letter names and subscripts turn upright once recognised: "speed" is one name, not s·p·e·e·d. Undefined letters next to each other multiply: 2xy is 2·x·y.',
  },
  'f\\left(x\\right)=x^2+1',
  'f\\left(3\\right)+f\\left(r\\right)',
  'g\\left(x,y\\right)=\\sqrt{x^2+y^2}',
  'g\\left(3,4\\right)',
  'f^{\\prime}\\left(2\\right)+f^{\\prime\\prime}\\left(2\\right)',
  {
    note: "Type f' for the derivative of your function f, f'' for the second derivative, and so on.",
  },

  { folder: 'Sequences' },
  { note: 'Define a sequence with a subscript; add base cases for recursion.' },
  'u_n=u_{n-1}+3',
  'u_1=2',
  'u_{10}',
  's_n=\\frac{1}{n^2}',
  's_4',
  {
    note: 'Built in: p_n is the n-th prime and F_n the n-th Fibonacci number (unless you define p or F).',
  },
  'p_{100}',
  'F_{30}',

  { folder: 'Algebra' },
  { note: 'These rows have commands attached. Click a row to see more suggestions.' },
  ['x^3-6x^2+11x-6', 'factor'],
  ['360', 'factor'],
  ['\\left(x+1\\right)^5', 'expand'],
  ['\\frac{x^2-1}{x-1}', 'simplify'],
  ['x^2-5x+6=0', 'solve'],
  ['x^3=2', 'solve'],
  ['\\sin x=\\frac12', 'solve'],
  ['x^2<4', 'solve'],

  { folder: 'Calculus' },
  {
    note: 'Write calculus directly. Indefinite integrals give an antiderivative. Definite integrals show a number straight away, then the exact value when one exists (like 1/3 ≈ 0.333); without a closed form the number stays.',
  },
  {
    note: 'Type int for ∫, then the integrand and dx. For a definite integral, type _ and ^ right after ∫ to add the bounds. Type d/dx for a derivative and lim for a limit. The d of dx turns upright once it is recognised as calculus; elsewhere d is an ordinary variable.',
  },
  '\\int x^2\\,dx',
  '\\int xe^{x}\\,dx',
  '\\int_0^1x^2\\,dx',
  '\\int_0^{\\infty}e^{-x^2}\\,dx',
  '\\frac{d}{dx}x^3\\sin x',
  '\\frac{d^2}{dx^2}e^{3x}',
  '\\frac{\\partial}{\\partial y}x^2y^3',
  '\\lim_{x\\to0}\\frac{\\sin x}{x}',
  '\\lim_{x\\to0^{+}}x\\ln x',
  '\\sum_{k=1}^{100}k',
  '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}',
  '\\prod_{k=1}^{6}k',
  {
    note: 'Or use commands on any expression: click a suggestion under the focused row, or press Ctrl+/ (or "/ more…") for the command palette. Commands take arguments — type them after the name ("diff y 2", "series x=1 4") or fill in the fields — and clicking an output\'s title changes them.',
  },
  ['x^2\\sin x', 'derivative', ['derivative', { order: '2' }]],
  ['h\\left(x\\right)=xe^{x}', 'derivative', 'integrate'],
  ['\\frac{1}{1+x^2}', 'integrate', ['integrate', { from: '0', to: '1' }]],
  ['\\frac{e^x-1}{x}', 'limit'],
  ['\\frac{1}{x}', ['limit', { at: 'x\\to0^{+}' }]],
  ['\\cos x', 'series', ['series', { at: 'x=\\pi', order: '3' }]],
  ['x^2+y^2', ['substitute', { at: 'x=3' }], ['solve', { variable: 'y' }]],
  ['\\pi', ['numeric', { digits: '30' }]],

  { folder: 'Matrices and vectors' },
  {
    note: 'Type mat for a matrix and vec for a column vector. Inside one, type it as you would write it: "," goes to the next entry and ";" to the next row, adding a column or row when you reach the edge (mat 1,2;3,4). Tab and the arrow keys move between entries, and Backspace in an empty entry removes its empty row or column. Or type it in one go in square brackets: [1, 2; 3, 4] is a matrix and [1, 2, 3] a column vector.',
  },
  'M=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}',
  'M^2',
  'M^{-1}',
  '2M+\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}',
  '\\begin{bmatrix}1&2&3\\end{bmatrix}\\begin{bmatrix}4\\\\5\\\\6\\end{bmatrix}',
  { note: '## Matrix functions' },
  { note: 'det(M) — determinant of a square matrix; |M| also works. Type det.' },
  '\\det M',
  '\\left|M\\right|',
  { note: 'transpose(M) — rows become columns; M^T also works. Type transpose.' },
  'M^{T}',
  '\\transpose\\left(M\\right)',
  { note: 'tr(M) — trace, the sum of the diagonal. Type tr.' },
  '\\tr M',
  { note: 'inverse(M) — the inverse of a square matrix; M^{-1} also works. Type inverse.' },
  '\\inverse\\left(M\\right)',
  {
    note: 'eigenvalues(M) — each eigenvalue as often as it occurs. eigenvectors(M) — the set of pairs (eigenvalue, eigenvector). Type eigenvalues, eigenvectors.',
  },
  '\\eigenvalues\\left(M\\right)',
  '\\eigenvectors\\left(\\begin{bmatrix}2&0\\\\0&3\\end{bmatrix}\\right)',
  {
    note: 'rref(M) — reduced row echelon form, by Gauss–Jordan elimination. nullspace(M) — a basis of the vectors v with Mv = 0. Type rref, nullspace.',
  },
  '\\rref\\left(\\begin{bmatrix}1&2&3\\\\4&5&6\\end{bmatrix}\\right)',
  '\\nullspace\\left(\\begin{bmatrix}1&2&3\\\\4&5&6\\end{bmatrix}\\right)',
  { note: 'rank(M) — the number of linearly independent rows. Type rank.' },
  '\\rank\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}',
  {
    note: 'Matrix commands: a row holding a matrix suggests these — det, inverse, transpose, eigenvalues, eigenvectors for a square one; rref, rank, nullspace for any.',
  },
  ['M', 'det', 'inverse', 'transpose', 'eigenvalues', 'eigenvectors', 'rref', 'rank', 'nullspace'],
  { note: '## Vectors' },
  'a=\\begin{bmatrix}1\\\\2\\\\3\\end{bmatrix}',
  'w=\\begin{bmatrix}4\\\\5\\\\6\\end{bmatrix}',
  { note: 'dot(a, w) — dot product; a·w (type *) also works. |a| is the length of a.' },
  'a\\cdot w',
  '\\dot\\left(a,w\\right)',
  '\\left|a\\right|',
  { note: 'cross(a, w) — cross product of vectors of length 3; a×w (type times) also works.' },
  'a\\times w',
  '\\cross\\left(a,w\\right)',
  'M\\begin{bmatrix}1\\\\1\\end{bmatrix}',

  { folder: 'Sets' },
  '\\left\\lbrace3,1,2,1\\right\\rbrace',

  { folder: 'Units' },
  {
    note: 'Type a unit in square brackets after a number: 5[km], 9.81[m/s^2]. Once you leave the row the unit is shown upright in faint brackets; click back into the row to edit it as typed. Units in brackets never clash with your own names: m is a variable, [m] is metres. Square brackets always hold a unit (with commas they make a list: [1, 2, 3]), so group with ( ). You can also pick units from the \\ menu.',
  },
  '5\\unit{km}+300\\unit{m}',
  '\\mathrm{mass}=70\\unit{kg}',
  '\\mathrm{mass}\\cdot9.81\\unit{m/s^{2}}',
  {
    note: 'Results are shown in a unit the row used for that kind of quantity, else a named unit (N, J, W, Pa, …) or base units. Type -> and a unit to convert.',
  },
  '60\\unit{mi}\\to\\unit{km}',
  { note: 'The convert command does the same as an output: choose the unit in its field.' },
  ['26.2\\unit{mi}', ['convert', { unit: 'km' }]],
  '\\mathrm{pace}=12\\unit{km/h}',
  '\\mathrm{pace}\\cdot90\\unit{min}\\to\\unit{mi}',
  '3\\unit{kWh}\\to\\unit{MJ}',
  { note: 'Adding different kinds of quantity is an error.' },
  '5\\unit{m}+2\\unit{s}',
  {
    note: 'Units: metre, gram, second, ampere, kelvin, mole, newton, joule, watt, pascal, hertz, coulomb, volt, ohm and litre with every SI prefix, quecto to quetta (km, mg, µs, pg, dam, GW, …); minute, hour, day, year; inch, foot, yard, mile; tonne, pound, ounce; mph; watt-hour, calorie, electronvolt; bar, atm, psi.',
  },

  { folder: 'Using results' },
  {
    note: 'ans is the nearest result above the row (type ans). Hidden results count too, so ans after x²+1 is x²+1.',
  },
  '\\frac13+\\frac16',
  'ans\\cdot4',
  {
    note: "Every command's output has a label in its gutter: out₁, out₂, … Use it anywhere in the slate as out_k (type out_ then the number). Rows that use a result update when it changes.",
  },
  ['x^3-2x', 'derivative'],
  '{OUT_PREVIOUS}+1',

  { folder: 'Live dependencies' },
  { note: 'Change k and watch every row that depends on it update.' },
  'k=2',
  'm=k^2+1',
  'q=m\\cdot k',
  'f\\left(q\\right)',

  { folder: 'Errors' },
  { note: 'Mistakes are reported on their row, with the problem highlighted.' },
  'b=c+1',
  'c=b+1',
  '\\frac{1}{\\placeholder{}}',
  '2^3^4',

  { folder: 'Computer algebra systems' },
  {
    note: 'Results come from SymPy, running in your browser. While it loads (a few seconds on first visit), Nerdamer answers instantly; those results are marked "via Nerdamer" and upgrade automatically. Choose the preferred system with the CAS menu.',
  },
];

/** In a documentation row: out_k for the output attached last. */
const OUT_PREVIOUS = '{OUT_PREVIOUS}';

export function documentationDoc(): Doc {
  let doc: Doc = { version: 1, rows: [], interpretations: {}, nextOutputLabel: 1 };
  // The last row added: inserting after it keeps later entries in the same folder.
  let last: string | null = null;
  const folders: { id: string; open: boolean }[] = [];
  const add = (text: string, kind?: 'note' | 'folder') => {
    const inserted = insertRowAfter(doc, kind === 'folder' ? null : last, text, kind);
    doc = inserted.doc;
    last = inserted.id;
    return inserted.id;
  };
  for (const entry of DOCUMENTATION) {
    if (typeof entry === 'object' && 'folder' in entry) {
      folders.push({ id: add(entry.folder, 'folder'), open: entry.open ?? false });
      continue;
    }
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      add(entry.note, 'note');
      continue;
    }
    const [written, ...commandIds] = Array.isArray(entry) ? entry : [entry];
    // OUT_PREVIOUS: the label of the output attached last (labels depend on everything before).
    const latex = written.replace(OUT_PREVIOUS, `out_{${doc.nextOutputLabel - 1}}`);
    const id = add(latex);
    for (const c of commandIds) {
      doc = typeof c === 'string' ? addOutput(doc, id, c) : addOutput(doc, id, c[0], c[1]);
    }
  }
  for (const f of folders) if (!f.open) doc = setCollapsed(doc, f.id, true);
  return doc;
}
