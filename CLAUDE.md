# MathSlate

A web notebook for math: **input rows** (MathLive math fields) interleaved with visually distinct
**output rows** (MATLAB-style), backed by a hand-written LaTeX → AST parser and a swappable
computer algebra system (SymPy in Pyodide, in a Web Worker). Deployed as a static site to
GitHub Pages at `https://joshomejosh1.github.io/MathSlate/` (repo `JoshomeJosh1/MathSlate`,
private for now — the deploy job skips itself until the repo is public).

Extensibility via registries ("add one file") is the top design goal.

## Status

| Milestone | Scope                                                                                        | State   |
| --------- | -------------------------------------------------------------------------------------------- | ------- |
| 1         | Scaffold, MathLive rows (add/delete/reorder), LaTeX debug, localStorage, Pages deploy        | done    |
| 2         | Parser (lexer, Pratt CST, definitions, symbol table, resolver, printer) + tests              | done    |
| 3         | Pyodide worker, CasBackend + router, engine, dependency graph, auto-eval, commands, examples | done    |
| 3b        | Nerdamer backend (instant, routed fallback while SymPy loads); compare backends              | planned |
| 3c        | Calculus notation: d/dx, ∫ (indefinite → symbolic, definite → numeric), lim, Σ, Π            | planned |
| 4         | Output rows UX (promote, `ans`, `out_k`), suggestion chips, `/` palette                      | planned |
| 5         | Symbol interpretation prompts + row badges (registry + resolution already done in M2)        | planned |
| 6         | Matrix commands (det, inverse, transpose, eigenvalues, dot, cross)                           | planned |
| 7         | Built-in sequence evaluation (p_n, F_n, out_k), recursive sequences                          | planned |
| 8         | URL share, error highlight inside the math field, perf                                       | planned |

## Commands

```sh
npm run dev          # dev server (http://localhost:5173/MathSlate/)
npm run check        # typecheck + lint + format check + tests — run before calling anything done
npm run test:integration  # end-to-end tests against real SymPy in Pyodide (downloads it once)
npm run build        # production build into dist/
npm run preview      # serve dist/ to check the production build
npm run format       # apply Prettier
```

## Architecture

```
src/
  main.tsx, App.tsx, styles.css
  ui/
    editor/        MathEditor.ts (editor-agnostic contract), MathLiveEditor.tsx, index.ts (picks impl)
    editor/        … MathLiveView.tsx (read-only rendering for output rows)
    rows/          RowList.tsx (sortable list, focus/keyboard nav), RowItem.tsx (input + outputs +
                   chips, drags as a unit), OutputRow.tsx, NoteEditor.tsx, SuggestionChips.tsx,
                   RowDiagnostics.tsx (errors with highlighted LaTeX, debug AST view), promote.ts
  app/services.ts  singletons: backends → CasRouter → Engine, fed by docStore; React hooks
  document/        model.ts (Doc types + pure update functions), store.ts (tiny external store),
                   docStore.ts (app singleton + actions), persistence.ts (localStorage autosave),
                   examples.ts (the example slate: first visit + Examples button; tested)
  parser/          errors.ts (MathError + Span), lexer.ts, cst.ts, parser.ts (Pratt, LaTeX → CST),
                   definitions.ts (LHS shapes), symbols.ts (SymbolTable), resolve.ts (CST → AST),
                   ast.ts, printLatex.ts (AST → LaTeX), sexpr.ts (debug/test rendering)
  core/            analyze.ts (whole-document analysis), builtinScope.ts, deps.ts (dependency graph,
                   cycles, per-row environments), shape.ts (static facts for commands),
                   engine.ts (doc → row views with outputs and suggestions; pure TS)
  registries/
    builtins/functions/defs/*.ts     built-in functions (auto-discovered)
    builtins/sequences/defs/*.ts     built-in sequences (auto-discovered)
    interpretations/defs/*.ts        meanings for undefined symbols (auto-discovered)
    commands/defs/*.ts               commands: simplify, factor, expand, solve, derivative,
                                     integrate, limit, series, numeric (auto-discovered)
  cas/             types.ts (backend-neutral CasBackend/CasRequest/CasValue), router.ts (routes ops
                   to the preferred ready backend; provisional results)
    sympy/         serialize.ts (AST → Python program), python/runtime.py (helpers + result → JSON
                   tree), fromSympy.ts (JSON tree → AST), session.ts, worker.ts (Pyodide in a Web
                   Worker via Comlink), SympyBackend.ts (queue, timeout + worker restart, cache)
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
   body refers to itself (`x = x + 1`) is treated as an equation.
5. Output per row: `Statement` (or error), symbol it `defines`, user symbols it `refs` (for the
   upcoming dependency graph), and `interpretations` used (symbol → option id).

### Parsing conventions (see `parser.ts` header)

- Implicit multiplication binds tighter than explicit `\cdot`, `\times`, `/` (so letter runs stay
  together: `speed\cdot time` = speed·time), and `a/2b` = a/(2b), `-2x` = -(2x).
- `^`, `_`, `\frac`, `\sqrt` take one braced group or one character: `\frac23` = 2/3, `x^23` = x²·3.
- `\sin 2x` = sin(2x); the argument stops at the next function: `\sin x\cos x` = sin x · cos x.
  `\sin^2 x` = (sin x)², `\sin^{-1} x` = arcsin x, `\log_2 8` = log(8, 2), `\sin(x)^2` = (sin x)².
- MathLive quirks handled: `\left(…\right)`, `\left\lbrack`, `v_{\max}` (typed "max"),
  `\log_{_2}`, `f^{\prime}`, `\placeholder{}` (reported as "Fill in the empty box"),
  `\exponentialE`/`\imaginaryI`. SymPy's `\left[\begin{matrix}…\end{matrix}\right]` is accepted.
- Juxtaposed `xy` prints back as `x\cdot y` (so it cannot merge into a defined `xy`); multi-letter
  names print as `\operatorname{speed}`. `printLatex` round-trips (tested).

### Upright names (`core/decorate.ts`)

A recognised multi-letter name is spelled `\mathrm{speed}` in the row's LaTeX (rendered upright);
built-in functions typed as letters become `\operatorname{lcm}`; a `\mathrm{…}` name that is no
longer defined reverts to plain letters. So upright ⇔ recognised. The resolver reports every
multi-letter name occurrence with its source span (`RowAnalysis.names`); `decorateLatex` rewrites
those spans. `RowList` applies it to every row except the one being edited (no caret jumps), and
passes defined names to the editor as inline shortcuts so they turn upright while typing.
`\mathrm{speed}y` on a left-hand side defines `speedy`.

### Evaluation (`core/engine.ts`)

On each document change (debounced): analyse → dependency graph (`deps.ts`: cycles are errors on
every row involved; rows depending on an erroring row are "blocked") → for each row build jobs:
automatic evaluation (expressions and constant definitions) plus attached commands
(`InputRow.outputs`). Each job is a `CasRequest` whose `env` holds only the definitions the row
needs, in dependency order. Backends cache by request, so editing one row only recomputes rows
whose inputs or dependencies changed. Auto results are hidden when they add nothing (same as
input, or symbolic and the row uses no definitions). Stale requests are dropped by generation.

The SymPy backend turns each request into a self-contained Python program (`serialize.ts`): user
constants become variables, functions become Python defs, sequences become memoised `_Sequence`
objects filled bottom-up (no recursion limit for a_{1000}). Results return as a JSON tree shaped
for display (ordered terms, fractions, roots) and become our AST, so outputs can be promoted
(copied to an input row) and re-parsed. A request over 20 s kills and replaces the worker.

### Key design decisions

- **The AST is CAS-agnostic.** All SymPy knowledge will live in `src/cas/sympy/`.
- **Constants and built-in sequences are interpretations, not reserved symbols.** `e`, `i`, `π`,
  `p_n`, `F_n` only apply when the user has not defined that symbol, and the document stores the
  user's choice per symbol (`Doc.interpretations`). A bare `p` is a variable; only `p_5` uses primes.
- **Results round-trip.** CAS results will come back as an expression tree → AST → `printLatex`,
  so "promote output to input" always yields LaTeX our parser accepts.
- **Output rows are derived.** The document stores only `OutputSpec`s (which command, stable label);
  values are recomputed whenever inputs or dependencies change.

## Conventions

- TypeScript strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`.
- `mathlive` may only be imported inside `src/ui/editor/` (ESLint enforces this).
- `parser/` must not import from `registries/` or `core/`; `core/` wires registries into the parser
  through hooks (`ResolveOptions.interpret`) and symbol tables.
- Keep document/parser/core code free of React so it can be unit-tested in Node.
- Tests are colocated as `*.test.ts`. Parser/analysis tests are table-driven in
  `core/analyze.test.ts` (rows → S-expression or `!message @start-end`); round-trip tests in
  `parser/printLatex.test.ts`.
- Prettier formats everything (single quotes, width 100). Commit after each working step.

## Deployment

`.github/workflows/deploy.yml` runs typecheck, lint, format check, tests and build on every push
and PR, and deploys `dist/` to Pages on pushes to `main` when the repo is public. One-time setup:
Settings → Pages → Source: **GitHub Actions**. Vite's `base` is `/MathSlate/`; change it in
`vite.config.ts` if the repo is renamed. Pushing workflow files needs a token with the `workflow`
scope (`gh auth refresh -h github.com -s workflow`).

## How to extend

- **Add a built-in function**: add an entry to a file in
  `src/registries/builtins/functions/defs/` (or a new file default-exporting a `BuiltinFunction`
  or an array): `name`, `arity: [min, max]`, `description`, optional `inverse` (for `^{-1}`) and
  `subscriptArg` (for `\log_b`). It becomes callable as `name(…)`, `\operatorname{name}(…)`, and as
  `\name` if LaTeX defines that command (`FUNCTION_COMMANDS` in `lexer.ts`). Add a case to
  `core/analyze.test.ts`. (Evaluation mapping in the CAS backend lands in milestone 3.)
- **Add a built-in sequence**: a file in `src/registries/builtins/sequences/defs/` describing it,
  plus a file in `src/registries/interpretations/defs/` with `form: 'subscripted'` and an option
  whose meaning is `{ kind: 'sequence', sequence: '<name>' }` (see `primes.ts`).
- **Add a symbol interpretation**: a file in `src/registries/interpretations/defs/` exporting an
  `Interpretation`: `symbol` key (`'e'`, `'\\pi'`), `form` (`'bare'` or `'subscripted'`),
  `question`, `options` (each with a `Meaning`), `defaultOption`, `promptOnFirstUse`. New constant
  ids also need adding to `ConstantId` in `parser/ast.ts` and to `printLatex.ts`.
- **Add a command**: one file in `src/registries/commands/defs/` default-exporting a `Command`:
  `id` (stored in documents — never rename), `title(ctx)` (chip/output label, may mention the
  variable), `slash`, `aliases`, `description`, `appliesTo(ctx)` → relevance in [0, 1] using
  `ctx.facts` (`ShapeFacts`: free variables, polynomial degree, relation, matrix…), and
  `run(ctx, cas)` — usually `runOperation(ctx, cas, { op: … })`. Pick the variable with
  `preferredVariable(ctx.facts)`. Add a case to `src/cas/sympy/sympy.integration.test.ts`.
- **Add a CAS operation**: add it to `CasOperation` in `src/cas/types.ts`, then in each backend:
  SymPy → `SUPPORTED` in `SympyBackend.ts`, `Serializer.operation` in `serialize.ts`, and a Python
  helper in `runtime.py` if needed.
- **Add a CAS backend**: implement `CasBackend` (`status`, `onStatusChange`, `init`, `supports`,
  `run`) in `src/cas/<name>/`, converting results to `CasValue` with our AST, and register it in
  `src/app/services.ts` (order = preference).
- **Add an example**: append to `EXAMPLES` in `src/document/examples.ts`; `examples.test.ts`
  fails if any example row has an unintended error.
