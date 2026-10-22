# MathSlate

A web notebook for math: **input rows** (MathLive math fields, or plain-text notes) interleaved
with visually distinct **output rows**, backed by a hand-written LaTeX → AST parser and swappable
computer algebra systems (SymPy in Pyodide, Nerdamer), each in its own Web Worker. Deployed as a
static site to GitHub Pages at `https://joshomejosh1.github.io/MathSlate/` (repo
`JoshomeJosh1/MathSlate`, private for now — the deploy job skips itself until the repo is public).

Extensibility via registries ("add one file") is the top design goal. The **documentation slate**
(`src/document/documentation.ts`) is the user manual: it must demonstrate every feature, and
its test fails when a built-in, command or calculus operator is missing. Its function reference
gives every built-in function a note naming it (also tested) and several example rows; notes
starting `#` are headings, `##` subheadings.

## Status

| Milestone | Scope                                                                                     | State |
| --------- | ----------------------------------------------------------------------------------------- | ----- |
| 1         | Scaffold, MathLive rows (add/delete/reorder), LaTeX debug, localStorage, Pages deploy     | done  |
| 2         | Parser (lexer, Pratt CST, definitions, symbol table, resolver, printer) + tests           | done  |
| 3         | SymPy worker, CasBackend + router, engine, dependency graph, auto-eval, commands          | done  |
| 3b        | Nerdamer backend (instant, provisional while SymPy loads), per-document CAS choice        | done  |
| 3c        | Calculus notation: ∫ (indefinite → symbolic, definite → numeric), d/dx, ∂, lim, Σ, Π      | done  |
| —         | Upright recognised names and subscripts; notes (`"`); documentation slate                 | done  |
| —         | Folders (one level, organise only); `\` menu; curated shortcuts                           | done  |
| —         | Units and conversions (`5[km]`, `→ [mi]`), for every backend                              | done  |
| 4         | Command palette + arguments, `ans` / `out_k`, promote (↧ or drag a result into place)     | done  |
| 5         | Interpretation prompts + badges, for sequences (C_n, L_n, H_n, B_n ask; e, i, π reserved) | done  |
| 6         | Matrices: input, operations (det, eigen, rref, dot, cross, …) and commands                | done  |
| 7         | `out_k` as a sequence (sums over results); sums over sequences; integer sequences         | done  |
| 8         | URL share, error highlight inside the math field, perf (measured; see Performance)        | done  |
| 9         | Vector calculus: ∇ (grad, div, curl, ∇²), jacobian, hessian; functions by name, at points | done  |

### Ideas (not started — ask before implementing)

- **Converting to a unit system**: `5[km/h] → [SI]` (or a `\unitsystem{SI}` command; undecided)
  shows the result in a system's units: for the answer's dimension, the system's named unit if one
  fits exactly, else a product of its base units. Systems: SI (m, kg, s, A, K, mol; N, J, W, Pa,
  C, V, Ω, Hz), CGS for mechanics only (cm, g, s; dyn, erg, Ba, P, St — electrical CGS is
  ambiguous, so an error), imperial / US customary (ft, lb, s; lbf, psi, hp, BTU — needs those
  units and a choice of unit per dimension). Sketch: a unit-system registry (one file per system)
  consulted by `displayUnit` in `core/units.ts`; system names only special after `→`; `\` menu
  entries. Temperature stays out (offsets).

**More of SymPy** (suggested order: plotting, `dsolve` + `rsolve`, identify, integration steps):

- **Plotting**: a "Plot" command on any f(x) row, drawn in the browser by a small JS plotting
  library, evaluating locally (not SymPy's matplotlib plotting, too heavy in Pyodide).
- **Differential equations** (`dsolve`): `y'' + y = 0`, `f'(x) = 2f(x)` → general solution with
  C₁, C₂; initial values from rows like `f(0) = 1`.
- **Closed forms of recursive sequences** (`rsolve`): Fibonacci-style definitions → Binet's
  formula; a command on a sequence row.
- **Identify a number** (`nsimplify`): 1.41421356 → √2, 0.7853981 → π/4.
- **Integration steps** (`integral_steps` / `manualintegrate`): a "Show steps" output on integrals
  (substitution, by parts, partial fractions…).
- **Algebra commands**: `apart` (partial fractions), `together`, `cancel`, `trigsimp`,
  `expand_trig`, `rewrite` (e.g. sin as exponentials), polynomial `div` (quotient and remainder),
  `discriminant`, `resultant`, `roots` with multiplicities.
- **Inequalities and systems**: `reduce_inequalities` / `solveset` (`x^2 < 4` → (−2, 2)); solve
  selected equation rows together (`solve([eq1, eq2], [x, y])`).
- **Critical points** of f(x, y) with max / min / saddle (gradient and Hessian exist: see Vector
  calculus).
- **Transforms**: Laplace (and inverse), Fourier, Z.
- **Series analysis**: convergence (`Sum(...).is_convergent()`), asymptotic expansions at ∞,
  residues.
- **Probability** (`sympy.stats`): `X = Normal(0, 1)`, `P(X > 1)`, `E(X^2)`, `Var(X)`; binomial,
  Poisson, … (needs a syntax for random variables).
- **Number theory**: `isprime`, `nextprime`, modular inverse / `mod`, continued fractions,
  Diophantine equations (`diophantine`).
- **Matrices**: diagonalization, Jordan form, matrix exponential e^{At} (pairs with ODEs), LU / QR /
  SVD.
- **Complex numbers**: `re`, `im`, `arg`, `conjugate`, polar form.

## Commands

```sh
npm run dev               # dev server (http://localhost:5173/MathSlate/)
npm run check             # typecheck + lint + format check + unit tests — run before calling anything done
npm run test:integration  # end-to-end tests against real SymPy in Pyodide (downloads it once) + Nerdamer
npm run build             # production build into dist/
npm run preview           # serve dist/ to check the production build
npm run format            # apply Prettier
```

## Architecture

```
src/
  main.tsx, App.tsx (header: CAS status, New, Save, Share, Slates, Documentation, CAS picker,
                   Decimals, Debug), styles.css
  ui/
    editor/        MathEditor.ts (editor-agnostic contract), MathLiveEditor.tsx, MathLiveView.tsx
                   (read-only rendering for outputs), index.ts (picks the implementation),
                   errorRange.ts (an error's LaTeX span → field positions, via the top-level
                   prefixes; the editor underlines those atoms after a pause, only while the
                   field shows the LaTeX the error was found in)
    rows/          RowList.tsx (sortable list, focus/keyboard nav, upright-name decoration),
                   RowItem.tsx (input + outputs + chips, drags as a unit), OutputRow.tsx,
                   NoteEditor.tsx, SuggestionChips.tsx, RowDiagnostics.tsx, promote.ts,
                   resultDrop.ts (results dragged into the slate: native drag and drop, so they
                   also drop as LaTeX text into other apps; separate from dnd-kit reordering)
  app/services.ts  singletons: backends → CasRouter → Engine, fed by docStore; React hooks
  app/preferences.ts  per-browser display preferences (localStorage), e.g. Decimals: results show
                   only their decimal (`shownValue` in ui/rows/promote.ts; copy uses what is shown)
  document/        model.ts (Doc types + pure update functions), store.ts (tiny external store),
                   docStore.ts (app singleton + actions), persistence.ts (the main slate — no `?slate=` — is never saved and opens empty; Save / Ctrl+S gives it a localStorage slot named by `?slate=<id>`, which then autosaves every edit, with its last-edit time; New / Documentation / shared links always open an unsaved main slate, so a saved slate is never overwritten; replacing an edited unsaved slate asks "Save this slate?" (Save / Don’t save), and leaving the page asks too; the old fixed main slot is migrated to a slot on load), slates.ts (the Slates list: every saved slate, newest first; empty unused slots are removed),
                   documentation.ts (the documentation slate, opened with the Documentation button),
                   share.ts (Share: the whole doc packed, deflated (fflate) and base64url in the URL hash `#s=…`; a link
                   opens as an unsaved main slate; if it replaced an edited unsaved slate, the
                   banner offers "Back to my slate"; the hash is removed so reloads do not reopen it)
  parser/          errors.ts (MathError + Span), lexer.ts, cst.ts, parser.ts (Pratt, LaTeX → CST),
                   definitions.ts (LHS shapes), symbols.ts (SymbolTable), resolve.ts (CST → AST),
                   ast.ts, printLatex.ts (AST → LaTeX), sexpr.ts (debug/test rendering)
  core/            analyze.ts (whole-document analysis), builtinScope.ts, deps.ts (dependency graph,
                   cycles, per-row environments), shape.ts (static facts for commands),
                   decorate.ts (upright names), engine.ts (doc → row views; pure TS)
  registries/
    builtins/functions/defs/*.ts     built-in functions (auto-discovered)
    builtins/sequences/defs/*.ts     built-in sequences (auto-discovered)
    interpretations/defs/*.ts        meanings for undefined symbols: e, i, π, p_n, F_n
    commands/defs/*.ts               simplify, factor, expand, solve, derivative, integrate,
                                     limit, series, numeric
  cas/             types.ts (backend-neutral CasBackend/CasRequest/CasValue), router.ts,
                   runner.ts (ProgramRunner), inline.ts (substitutes definitions, for scopeless
                   backends)
    sympy/         serialize.ts (AST → Python program), python/runtime.py (helpers + result → JSON
                   tree), fromSympy.ts (JSON tree → AST), session.ts, worker.ts, SympyBackend.ts
    nerdamer/      serialize.ts (AST → Nerdamer string, renamed symbols), parseText.ts (Nerdamer
                   text → AST), run.ts, worker.ts, NerdamerBackend.ts
```

Registries use Vite's `import.meta.glob('./defs/*.ts', { eager: true })`, so a new file in a
`defs/` folder is picked up without editing any index.

### Pipeline (`core/analyze.ts`, runs synchronously on every edit)

1. **Parse** each row: `lexer` → `parser` gives a **CST**. Letter runs stay as separate letters,
   `f(x)` is an undecided juxtaposition, `a_n` an undecided subscript. Syntax errors are
   `MathError`s with a `Span` (offsets into the row's LaTeX).
2. **Definition shapes** (`definitions.ts`) from each row's top-level `lhs = rhs`, by shape only:
   `name =` constant, `f(x, y) =` function, `a_n =` sequence (if the RHS uses `n` or `a` has base
   cases, else a constant named `a_n`), `a_1 =` base case (if `a` is a sequence, else the name
   `a_1`). Duplicate definitions are errors on every row involved.
3. **SymbolTable** = built-in functions (root scope) + user definitions (child scope, shadows).
4. **Resolve** (`resolve.ts`) CST → AST: longest-match letter runs against defined names, else
   single letters multiplied; callable + `( … )` is a call, otherwise multiplication; `name_sub`
   is a defined subscripted name, else a sequence term, else a free subscripted variable.
   Undefined symbols consult the **interpretation** hook (e, i, π, p_n, F_n). A constant whose
   body refers to itself (`x = x + 1`) is treated as an equation. Calculus operators bind their
   variable (a document-level `x = 3` does not leak into `\int x^2\,dx`).
5. Output per row: `Statement` (or error), the symbol it `defines`, user symbols it `refs`,
   `interpretations` used, and multi-letter `names` with source spans (for upright display).

### Parsing conventions (see `parser.ts` header)

- Implicit multiplication binds tighter than explicit `\cdot`, `\times`, `/` (so letter runs stay
  together: `speed\cdot time` = speed·time), and `a/2b` = a/(2b), `-2x` = -(2x).
- `^`, `_`, `\frac`, `\sqrt` take one braced group or one character: `\frac23` = 2/3, `x^23` = x²·3.
- Functions: `\sin 2x` = sin(2x); the argument stops at the next function (`\sin x\cos x` =
  sin x · cos x); `\sin(x)^2` = (sin x)², `\sin^2 x` = (sin x)², `\sin^{-1} x` = arcsin x,
  `\log_2 8` = log(8, 2).
- Calculus operators take their whole operand, through functions and powers of brackets:
  `\lim_{x\to0} x\ln x`, `\lim_{x\to\infty}(1+1/x)^x`, `\sum_{k=1}^{n} k^2 + 1` = (Σk²) + 1.
  - `\int f\,dx` / `\int_a^b f\,dx`: the integrand ends at the differential (`dx`, `\mathrm{d}x`,
    `\differentialD x`); empty MathLive bound boxes mean indefinite.
  - `\frac{d}{dx} f`, `\frac{d^2}{dx^2} f`, `\frac{dy}{dx}`, `\frac{\partial}{\partial x} f`.
  - `\lim_{x\to a} f`, one-sided `a^{+}` / `a^{-}`; `\sum_{n=a}^{b} f`, `\prod_{n=a}^{b} f`.
- MathLive quirks handled: `\left(…\right)`, `\left\lbrack`, `v_{\max}` (typed "max"),
  `\log_{_2}`, `f^{\prime}`, `\placeholder{}` ("Fill in the empty box"), `\exponentialE`,
  `\imaginaryI`. SymPy's `\left[\begin{matrix}…\end{matrix}\right]` is accepted.
- `printLatex` round-trips (tested). Juxtaposition is printed only where it cannot be misread
  (`2x`, `x\sin x`, `x^{2}y`, and single letters `2xyz` unless they would spell a built-in name
  across the join, `l\cdot n`, or follow a d, `d\cdot x`: `setReservedLetterRuns`, fed by
  `core/builtinScope.ts`); otherwise `\cdot`. Multi-letter names print as `\mathrm{speed}`. A
  result like `xy` copied into a slate that defines the name `xy` reads as that name.

### Upright names (`core/decorate.ts`)

A recognised multi-letter name is spelled `\mathrm{speed}` in the row's LaTeX (rendered upright);
built-in functions typed as letters become `\operatorname{lcm}`; a `\mathrm{…}` name that is no
longer defined reverts to plain letters, so upright ⇔ recognised. Multi-letter subscripts of
names (`v_{max}`) are always upright; sequence indices (`a_{nk}`) are not. The resolver reports
occurrences with source spans (`RowAnalysis.names`); `decorateLatex` rewrites them. `RowList`
applies it to every row except the one being edited (no caret jumps), and passes defined names
to the editor as inline shortcuts so they turn upright while typing. `\mathrm{speed}y` on a
left-hand side defines `speedy`. The same mechanism makes the `d` of recognised calculus notation
upright (`\int x^2\,\mathrm{d}x`, `\frac{\mathrm{d}}{\mathrm{d}x}`; an integral's dx also gets a
thin space), while `d` elsewhere stays a variable.

**Inline shortcuts** replace MathLive's defaults entirely (`ui/editor/shortcuts.ts`): its ~260
included sets, logic, arrows and units that fired inside letter runs ("binom" → b∈om, "lt" → <).
Ours: Greek letters (short ones only after a non-letter), structures (sqrt, frac, binom…),
calculus (`int` → bare `\int`, `defint`, sum, prod, lim, partial; no `dx` → `\differentialD`,
the parser decides what is a differential), `''` → ordinary primes (not `\doubleprime`), and
operators/relations. Built-in function names come from the registry (`functionShortcuts` in
`core/decorate.ts`, special functions included, Greek-named ones excluded) and defined names
from `nameShortcuts`.

**Built-in functions in input rows are commands** (`\lcm`, `\artanh`, `\erf`): the editor
registers `functionMacros()` as MathLive macros with `captureSelection`, so a name is one unit
(no typing inside it; Backspace deletes it whole). The lexer reads any unknown `\word` as such a
name; the resolver rejects it unless it is defined (`Unknown command "\in"`). Decoration writes
recognised built-ins as `\name` and turns unrecognised upright names (`\mathrm`, `\operatorname`,
`\name`) back into letters. Results (`printLatex`) use `\cmd` only for commands LaTeX defines
(`LATEX_FUNCTION_COMMANDS`), otherwise portable `\operatorname{…}`. MathLive's
`\operatorname{\mathrm{lc}\mathrm{m}}` (typing inside an operator name) is unwrapped by the lexer.
Functions of two or more arguments (gcd, lcm, binomial) are call-only like special functions
(`needsBrackets` in `builtinScope.ts`).

Word shortcuts are provisional while typing (`MathLiveEditor.tsx`): Backspace right after one
fires undoes it (theta → Backspace → letters); another letter undoes it when the word goes on
to spell a longer shortcut (binom → binomial, tan → artanh, which then fires) or when it needs
brackets (`bracketOnly` — call-only functions: lcmab and Six stay letters; for these any typed
character but `(`, `_`, `^` or a space reverts too, so 2Ai+1 is 2·A·i+1). Symbol shortcuts (≤, ″) are not affected.

**Digits after a letter are subscripts** (`subscriptDigit` / `subscriptTarget` in
`MathLiveEditor.tsx`, using MathLive's internal model): x1 → x₁, out3 → out₃, θ2 → θ₂, after a
letter with no subscript/power yet, not inside a subscript, power or square brackets (units), and
not after a function command (sin2x). The caret stays after the subscript; a digit typed just
after an all-digit subscript is added to it (x12 → x₁₂), so anything else is simply typed after
it (x1+2). Backspace straight after the first digit makes it a plain digit again; otherwise
Backspace after such a subscript deletes its last digit (`deleteSubscriptDigit`). Works for the
math keyboard too.

**Touch screens** get MathLive's math keyboard (`mathVirtualKeyboardPolicy = 'auto'`, which
only applies on `pointer: coarse`); MathLive never raises the system keyboard (its input is
`inputmode=none`). The keyboard's keys arrive as commands, not key events, so its return
(`commit`) and delete on an empty row are mapped to Enter/Backspace through `beforeinput`, and
the page is padded by the keyboard's height so rows can scroll above it. `beforeinput` also gives
the keyboard's characters what physical keys get in `onKeyDown`: matrix `,` `;` and delete, and
the `\` menu's letters, delete and return; its `\` (which switches MathLive to LaTeX mode) is
caught on `mode-change`, switched back, and opens our menu. The layout is our own
(`ui/editor/keyboardLayouts.ts`). The main tab (**abc**) has an operator row on top, a digit row, every letter (shift for
capitals), and only the symbols and structures letters cannot produce ([ ] . + − × ÷ = xʸ ( )
\ , ; ! | √ < >); sin, pi, int, theta, -> are typed and the shortcuts make them (symbol
shortcuts like `->` and `<=` are applied for the math keyboard too, `applyShortcut`).
Shift and long-press give related keys (= → ≠, < → ≤, xʸ → xₙ / x² / x⁻¹, ( ) → { }, , → @, ; → # (a folder or heading in an empty row),
digits → xᵈ / x_d; [ and \ have none). Angle brackets `\langle` / `\rangle` are reserved (an error). Then **f(x)** (functions, inverses, ∫, ∫ₐᵇ, d/dx, ∂, Σ, Π, lim, ∞,
binomial, mat, vec, ans, out), **123** (a calculator numpad) and MathLive's **αβγ**. Labels are
plain text with Unicode super/subscripts: HTML `<sup>` and LaTeX templates render badly in
keycaps. Characters are typed keys (`key`), not inserted LaTeX, so shortcuts, subscript digits
and the matrix keys apply to them; `keyboardLayouts.test.ts` checks every inserted LaTeX parses.
The `|` key types a smart fence like `(` (no empty box). MathLive closes a long-press's variants
panel on the release that ends the press (it expects a slide onto a variant);
`keepVariantsOpen` in `MathLiveEditor.tsx` swallows that release so the panel stays to be
tapped, and the keyboard has `-webkit-touch-callout: none` against iOS's callout.

**The `\` menu** replaces MathLive's LaTeX mode, whose suggestions list every command MathLive
knows (`popoverPolicy = 'off'`). `core/completions.ts` builds the list from what the parser
understands — structures/operators (a static list there), Greek letters (`GREEK`) and every
built-in function from the registry (with brackets when it needs them) — and its test checks
each entry parses. `ui/editor/CommandMenu.tsx` renders it as a grid of tiles in groups (a
function's group is `BuiltinFunction.group`), name and description on hover; keys (typing
filters, arrows move in the grid) are handled in `MathLiveEditor.tsx` while the field keeps
focus; matching, layout and grid movement are in `matchCompletions.ts`.

### Commands, arguments and the palette

Commands (`registries/commands/defs/*.ts`) attach output rows (`OutputSpec`). They can take
arguments (`params`, `registries/commands/params.ts`): an attached command stores only the
arguments the user changed, as LaTeX (`OutputSpec.args`), so the rest keep following the row's
defaults. The engine reads them with `readArgs`, in the document's context
(`analyzeDocument(...).resolve`), and adds the definitions they use to the command's environment
(`deps.environment(row, refs)`); a bad argument is an error on that output only. The palette
(`ui/rows/CommandPalette.tsx`), opened with Ctrl+/ (editor action `palette`) or the "/ more…"
chip, searches commands (suggested for the row first), takes arguments typed after the name
(`diff y 2`, attached at once) or in fields pre-filled with the defaults (Tab moves between
them), and edits an attached command's arguments (click the output's title).

### Using results: `ans` and `out_k` (`core/outputRefs.ts`)

`ans` (the nearest result above, hidden automatic results included) and `out_k` (the output
labelled k) are symbols of the builtin scope (`ANS`, `OUT` in `builtinScope.ts`; reserved, see
below). The engine builds rows that use them (directly or through a definition) after
the others: each use is renamed to a private symbol (`@ans_{row}` — in a definition, ans is the
result above that definition's row — and `@out_{k}`) defined as the result's value
(`Engine.values`, every output's latest value). A row whose result is still being computed
shows pending and is recomputed once it is ready (`schedule(0)` after the jobs); results that
depend on the row itself, have no value, or have several solutions are errors on the row.
Hidden automatic results that finished for the current request are not recomputed
(`Engine.done`), so waiting rows do not loop. `out_k` with an index that is not a number
(`\sum_{k=1}^{3} out_k`, `out_{j+1}`) is the results as a sequence: renamed to `@out` (ref kind
`outs`), defined by one base case per output label with a single value, the row's own outputs
excluded (`Engine.outsValues`, `outsDefinitions`). The serializer emits such rule-less `@`
sequences as `_Sequence(name, None, terms)`; a missing term or a symbolic bound is an error.

**Sequences in sums**: a term with a symbolic index stays an unevaluated function (`p(k)`), which
`summation` expands term by term; the runtime's `_summation` / `_product` then evaluate those
terms (`_terms`, through `_SEQUENCES`: every `_Sequence` and `_prime` register themselves).
Sequences are emitted after their last rule/base case in dependency order, so a constant
defined from a term (`c = a_3`) finds it. Other integer sequences are call-only built-in functions
(`builtins/functions/defs/sequences.ts`: fibonacci, lucas, catalan, bell, partition, harmonic,
bernoulli, totient, primepi), not subscripted letters, which would claim names like `C_1`.

### Evaluation (`core/engine.ts`)

On each document change (debounced): analyse → dependency graph (`deps.ts`: cycles are errors on
every row involved; rows depending on an erroring row are "blocked") → jobs per row: automatic
evaluation (expressions and constant definitions) plus attached commands (`InputRow.outputs`).
Each job is a `CasRequest` whose `env` holds only the definitions the row needs, in dependency
order. Results for unchanged requests are reused, so editing one row only recomputes rows whose
inputs or dependencies changed. Auto results are hidden when they add nothing (same as input, or
symbolic and the row neither uses definitions nor contains calculus operators / sequence terms).

**Backends and routing** (`cas/router.ts`): backends are registered in `app/services.ts` in
preference order (SymPy, Nerdamer); a document can prefer one (`Doc.preferredBackend`, CAS menu).
Each request goes to the preferred backend if ready; while it loads, the best ready backend
answers **provisionally** (shown "via nerdamer", or "waiting for SymPy…" on failure) and the
engine recomputes when it becomes ready. If the ready preferred backend cannot do something, the
next one answers (**fallback**, shown "via sympy").

- **SymPy** turns each request into a self-contained Python program (`serialize.ts`): constants
  become variables, functions Python defs, sequences memoised `_Sequence` objects filled
  bottom-up (no recursion limit). Definite integrals are evaluated in **two passes**: the engine
  first sends `{ op: 'evaluate', numericIntegrals: true }` (`_defint_numeric`: quadrature,
  milliseconds; shown with "finding exact value…"), and only after every row's quick pass the
  full request (`_defint`: exact `integrate` under a 12 s soft time limit — a `sys.settrace` hook,
  since Pyodide cannot interrupt Python — kept only if it is elementary, i.e. our result tree can
  represent it; otherwise the number). Results return as a JSON tree shaped for display and become
  our AST. A request over 20 s kills and replaces the worker.
- **Nerdamer** (pure JS, instant): definitions are inlined (`cas/inline.ts`), symbols renamed to
  `sym0…`, results parsed from Nerdamer's text output (`parseText.ts`). No series, recursive
  sequences, built-in sequences, inequalities, one-sided limits or integer factorisation — those
  are declined so SymPy answers.

### Units (`core/units.ts`, `registries/units/`)

A unit is `\unit{km}` / `\unit{m/s^{2}}` in a row's LaTeX (AST `{ kind: 'unit', factors }`, text
read by `parser/units.ts`); typed as `5[km]` — square brackets around one thing always hold a unit
(they are not grouping; with commas they are a list), with specific errors otherwise
(`requiredUnit` in `resolve.ts`: "use ( ) to group" when nothing inside is a unit, numbers inside
with the fix, `+`, non-integer powers, unknown symbols with case/split suggestions). Decoration
rewrites units in brackets as `\unit{…}`. The editor
draws `\unit` as a macro (`ui/editor/unitLatex.ts`: upright, faint brackets); a focused row shows
its units as typed brackets again so they can be edited (`unitsToBrackets` in
`MathLiveEditor.tsx`, which keeps the caret, and puts it where a unit was clicked: the position inside its brackets as far across as the click was across the drawn unit, `pointOnUnit`). `expr \to [unit]`
(or a literal `->`) at the end of a row is a conversion (AST `convert`, only at the top; on a
definition it wraps the right-hand side). Backends know nothing about units: the engine wraps the
CAS in `withUnits`, which expands units into positive base-unit symbols (`km` → `1000·@m`), runs
the request, checks the answer's dimension (`Can't add m and s`) and shows it in the `→` target,
else the first unit the row (or its definitions) wrote with that dimension, else a named unit (N,
J, W, …), else base units — by asking the backend for answer ÷ unit (evaluate, then simplify if
base units remain). Rational amounts are shown as decimals (5.3 km). The registry
(`registries/units/defs/*.ts`, auto-discovered) lists each unit's symbol, name, dimension, exact
decimal factor and SI prefixes (`'all'`: quecto to quetta), and `menu`, the prefixed forms the `\`
menu offers; prefixed symbols are generated and must be unique (tested).

### Matrices and vectors

Input: `mat` / `vec` (shortcuts and `\` menu) insert a 2×2 matrix / 2-entry column vector of
boxes; inside a matrix (`matrixKey` in `MathLiveEditor.tsx`, using MathLive's internal model,
checked at runtime) `;` goes to the next row or adds one, `,` to the next entry or adds a
column (new entries get `\placeholder{}` boxes, `fillEmptyCells`), Backspace in an empty entry
removes its all-empty row or column; Enter is not special (it adds a slate row). Inline shorthand in
square brackets (parser `parseDelimited`): `[1, 2; 3, 4]` is a matrix, `[1, 2, 3]` a column vector
(one entry in square brackets is a unit), rewritten as a bmatrix by decoration (`Rewrite`s from
the resolver). Operations: `det`, `tr`, `rank`, `transpose`, `dot`, `cross`
(`builtins/functions/defs/matrices.ts`) and notation handled in the SymPy runtime, so it depends
on the values: `|M|` determinant / `|v|` length (`_abs`), `u\cdot v` dot and `u\times v` cross
product between vectors (`_cdot`, `_times`, else multiplication), `M^T` / `M^\top` transpose
unless `T` is defined (`_pow_T`). Also `inverse`, `eigenvalues` (with multiplicity),
`eigenvectors` ((value, vector) pairs), `rref`, `nullspace`. A 1×1 matrix is a number (`_scalar`:
products via `_mul`, constants, function results, answers). Matrix commands
(`commands/defs/det.ts`, …) apply those functions via `runFunction`; `shapeOf` knows whether a
row is a matrix and often its size (`matrixSize` follows names, products, transposes), and
`matrixRelevance` ranks commands by square / other / vector. SymPy's matrix errors are reworded
(`_ERRORS`; any other SymPy error becomes a sentence without Python class names, `_error_message` in `runtime.py`).
Nerdamer declines matrix functions.

### Vector calculus (`parser/vectorCalculus.ts`)

grad, div, curl, laplacian, jacobian, hessian are built-in functions
(`builtins/functions/defs/vectorCalculus.ts`) whose AST is a call `[operand]` or
`[operand, (variables)]`. The parser reads `\nabla` (a `fn` token) as grad, `\nabla\cdot` div,
`\nabla\times` curl, `\nabla^2` laplacian; a subscript lists variables (`\nabla_{x,y}`, kept in the
fnapp's `sub` as a group; one name alone is an error: a symbolic vector variable was tried with SymPy's matrix calculus
and dropped). `\grad`,
`\curl`, `\laplacian`, `\jacobian`, `\hessian` are `FUNCTION_COMMANDS`, so they work without
brackets; div is always `\operatorname{div}` (`OPERATORNAME_ONLY` in the lexer: `\div` is ÷), which
the lexer reads as a function too, and which decoration, shortcuts and macros keep. The resolver
(`vectorCalculus`) binds listed variables in the operand and accepts a defined function's bare
name as the operand (`bareFunction`). The SymPy serializer emits `_vector_calculus(op, f, vars,
at)`: listed variables; else a defined function's parameters, evaluated at its arguments when
called (`\nabla f(1,2)` is the gradient at (1, 2)); else `None`, the free variables in alphabetical
order (for div and curl of a 2- or 3-vector whose free variables are among x, y, z: x, y, z).
`printLatex` prints the ∇ forms. Commands: gradient, hessian, laplacian (scalar functions of ≥2
variables), jacobian, divergence, curl (vectors), via `runVectorCalculus` (a definition by its
parameters). Nerdamer declines them.

### Special functions

`registries/builtins/functions/defs/special.ts` (erf, Γ, ζ, Fresnel S/C, Si/Ci, Li_s, Lambert W,
Bessel J/Y/I/K, Airy, elliptic…) are `callOnly`: only functions when followed by brackets, so
`2\zeta`, `Si` (S·i) and `C(x+1)` keep their ordinary meaning. Conventional spellings
(`\Gamma`, `\operatorname{S}`, `\operatorname{J}_{n}`) live in `parser/functionNames.ts`; the
builtin scope adds alias symbols for them, and `printLatex` prints them, so results round-trip.
`\operatorname{X}` is always an operator name (even one letter); a subscript can be a function's
first argument (`subscriptArg: 'first'`). SymPy results are tidied (`_tidy`: `gammasimp`,
`exp_polar` removed); anything we do not model (₂F₁, Euler's γ) is shown with SymPy's LaTeX.
Definite integrals keep any closed form SymPy finds, special functions included.

### Key design decisions

- **The AST is CAS-agnostic.** Backend knowledge lives only in `src/cas/<backend>/`.
- **Constants and built-in sequences are interpretations, not symbols.** `e`, `i`, `π`, `p_n`,
  `F_n`, `C_n`, `L_n`, `H_n`, `B_n` apply to otherwise undefined names; the document stores
  choices per symbol (`Doc.interpretations`, `docActions.setInterpretation`). A bare `p` is a
  variable; only `p_5` uses primes. `p_n` / `F_n` are sequences by default; Catalan `C_n`, Lucas
  `L_n`, harmonic `H_n` and Bernoulli `B_n` start as plain names (`defaultOption: 'variable'`) and
  ask (`promptOnFirstUse`): the first visible row using an undecided letter shows the question
  (`ui/rows/SequencePrompt.tsx`, computed in `RowList`), and rows show a badge for a letter read
  as a sequence (or explicitly kept a variable) that reopens the choice. The analysis records
  every interpreted letter a row reads (`RowAnalysis.interpretations`), whichever meaning.
- **Reserved names** (`reservedNameError` in `core/analyze.ts`): a row cannot define a built-in
  function, `e`, `i`, `π` (exact results contain them, so a redefinition would change what results
  mean) or `ans` / `out` — an error on that row. They can still be bound (`\sum_{i=1}^n`, a
  parameter `f(e)`). A built-in function applied on the left (`sin(x) = 1/2`) is an equation, not
  a definition. `p_n = …` / `F_n = …` may still define sequences.
- **Results round-trip.** CAS results come back as our AST → `printLatex`, so "copy to input"
  always yields LaTeX our parser accepts.
- **Output rows are derived.** The document stores only `OutputSpec`s (command, stable label).
- **Folders are a flat list.** A folder is a row (`kind: 'folder'`, title in `latex`,
  `collapsed`); its rows carry `folder: <id>` and sit directly after it. One level only, and
  folders only organise (definitions stay global; collapsed rows still compute). Every model
  update ends with `normalizeFolders`, which drops a row's folder when it is no longer next to
  it. `moveRow(id, overId, into)` moves a folder with its rows and snaps a row headed outside
  folders to the nearer end of a folder it would land in. In the UI (`RowList`), the drop target
  comes from `ui/rows/dropTarget.ts`: on a row in a folder, right of the indent line (the row's
  left edge) → join, left of it → leave; on a folder title, past the first third → join; on a
  row in no folder, past the first third → `groupWith` (a new folder with both). Drop feedback
  never changes a row's size (that moved the drop zones under the pointer and made the target
  flicker): a dashed outline around the group to join (each row draws its piece) and a label
  that follows the pointer, recomputed on every pointer move. Typing `@` in an empty row makes a
  folder, `#` a heading note, `"` a note; Shift+click on row numbers selects rows to group.

### Performance (measured on the documentation slate, 285 math rows)

Analysis of the whole document takes ~2 ms and the engine's per-edit work ~5 ms, so there is no
incremental re-parsing; typing causes no long tasks. Showing every row at once (expanding all
folders) takes ~1.4 s: React rendering the rows (~0.7 s; dnd-kit's `useSortable` ~0.13 s of it)
and creating the MathLive fields (~2.6 ms each). Tried and rejected: static previews
(`convertLatexToMarkup`) until a field scrolls near the viewport — their markup costs more layout
than a field (whose content sits in a shadow root), so it was slower overall. Notes size
themselves with CSS (a hidden copy of the text in the same grid cell), not by measuring
`scrollHeight`, which forced a layout per note. Next step if needed: virtualize the row list.

## Conventions

- TypeScript strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`.
- `mathlive` may only be imported inside `src/ui/editor/` (ESLint enforces this).
- `parser/` must not import from `registries/` or `core/`; `core/` wires registries into the parser
  through hooks (`ResolveOptions.interpret`) and symbol tables.
- Keep document/parser/core/cas code free of React so it can be unit-tested in Node.
- Tests are colocated as `*.test.ts`. Table-driven parser/analysis tests in `core/analyze.test.ts`
  and `core/calculus.test.ts` (rows → S-expression or `!message`); round-trips in
  `parser/printLatex.test.ts`; Nerdamer end to end in `cas/nerdamer/nerdamer.test.ts` (fast);
  SymPy end to end in `cas/sympy/sympy.integration.test.ts` (including the whole documentation).
- Vitest's on-disk module cache is disabled (`fsModuleCache: false`): it does not notice new
  files matched by a registry's `import.meta.glob`, so new entries went missing in tests.
- Editing files: LaTeX is full of backslashes — use the Edit/Write tools, not shell/Python string
  replacement (escape sequences like `\t`, `\f`, `\p` get mangled).
- Prettier formats everything (single quotes, width 100). Commit after each working step.

## Deployment

`.github/workflows/deploy.yml` runs typecheck, lint, format check, tests and build on every push
and PR, and deploys `dist/` to Pages on pushes to `main` when the repo is public. One-time setup:
Settings → Pages → Source: **GitHub Actions**. Vite's `base` is `/MathSlate/`; change it in
`vite.config.ts` if the repo is renamed. Pushing workflow files needs a token with the `workflow`
scope (`gh auth refresh -h github.com -s workflow`).

## How to extend

Every new user-visible feature also gets an example in `src/document/documentation.ts`.

- **Add a built-in function**: add an entry to a file in
  `src/registries/builtins/functions/defs/` (or a new file default-exporting a `BuiltinFunction`
  or an array): `name`, `arity: [min, max]`, `description`, optional `inverse` (for `^{-1}`) and
  `subscriptArg` (for `\log_b`), and `group` (its heading in the `\` menu). It becomes callable as `name(…)`, `\operatorname{name}(…)`, and as
  `\name` if listed in `FUNCTION_COMMANDS` (`lexer.ts`). Map it in each backend: `FUNCTIONS` in
  `cas/sympy/serialize.ts` (+ `_FUNCTION_NAMES` in `runtime.py` if SymPy names it differently)
  and `FUNCTIONS` in `cas/nerdamer/serialize.ts` / `parseText.ts`. Add it to the documentation
  (a note describing it, under the right `##` group, plus example rows; the documentation test
  fails otherwise).
- **Add a unit**: an entry in a file in `src/registries/units/defs/` (`symbol`, `name`,
  `dimension` in base units m/kg/s/A/K/mol, exact decimal `factor` (times π^`piPower` if set:
  the parsec), optional `prefixes`, `group`
  for the `\` menu). Mention it in the documentation's Units folder.
- **Add a built-in sequence**: a file in `src/registries/builtins/sequences/defs/`, a file in
  `src/registries/interpretations/defs/` with `form: 'subscripted'` and an option whose meaning is
  `{ kind: 'sequence', sequence: '<name>' }` (see `primes.ts`), and its implementation in
  `SEQUENCES` in `cas/sympy/serialize.ts`. Document it.
- **Add a symbol interpretation**: a file in `src/registries/interpretations/defs/` exporting an
  `Interpretation`: `symbol` key (`'e'`, `'\\pi'`), `form` (`'bare'` or `'subscripted'`),
  `question`, `options` (each with a `Meaning`), `defaultOption`, `promptOnFirstUse`. New constant
  ids also need `ConstantId` in `parser/ast.ts`, `printLatex.ts`, and each backend.
- **Add a command**: one file in `src/registries/commands/defs/` default-exporting a `Command`:
  `id` (stored in documents — never rename), `title(ctx, args)`, `slash`, `aliases`,
  `description`, optional `params` (each: `name` — stored, never rename — `label`, `kind`
  variable/count/expr/point/unit, `optional`, `default(ctx)` as LaTeX), `appliesTo(ctx)` →
  relevance in [0, 1] from `ctx.facts` (`ShapeFacts`), and `run(ctx, cas, args)` — usually
  `runOperation(ctx, cas, { op: … })` or `runFunction(ctx, cas, 'det')`. Read a variable with
  `variableArg(ctx, args)` (falls back to the preferred variable). Attach it to a row in the
  documentation (with arguments: `['latex', ['series', { at: 'x=1' }]]`); add an end-to-end case.
- **Add a CAS operation**: add it to `CasOperation` in `src/cas/types.ts`, then per backend:
  SymPy → `SUPPORTED` in `SympyBackend.ts`, `Serializer.operation` in `serialize.ts` (+ a helper
  in `runtime.py` if needed); Nerdamer → `SUPPORTED` and `operationJob`, or leave it unsupported.
- **Add AST syntax** (like the calculus operators): CST node in `cst.ts` + parsing in
  `parser.ts`, AST node in `ast.ts`, resolution in `resolve.ts`, and every exhaustive switch the
  type checker then flags (`sexpr`, `printLatex`, `shape`, `inline`, both serializers,
  `definitions.children`). Add parse + round-trip tests and a documentation example.
- **Add a CAS backend**: implement `CasBackend` (`status`, `onStatusChange`, `init`, `supports`,
  `run`) in `src/cas/<name>/`, converting results to `CasValue` with our AST (decline what it
  cannot do with an error so the router falls back), and register it in `src/app/services.ts`.
