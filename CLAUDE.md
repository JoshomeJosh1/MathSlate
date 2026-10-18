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

| Milestone | Scope                                                                                 | State   |
| --------- | ------------------------------------------------------------------------------------- | ------- |
| 1         | Scaffold, MathLive rows (add/delete/reorder), LaTeX debug, localStorage, Pages deploy | done    |
| 2         | Parser (lexer, Pratt CST, definitions, symbol table, resolver, printer) + tests       | done    |
| 3         | SymPy worker, CasBackend + router, engine, dependency graph, auto-eval, commands      | done    |
| 3b        | Nerdamer backend (instant, provisional while SymPy loads), per-document CAS choice    | done    |
| 3c        | Calculus notation: ∫ (indefinite → symbolic, definite → numeric), d/dx, ∂, lim, Σ, Π  | done    |
| —         | Upright recognised names and subscripts; notes (`"`); documentation slate             | done    |
| 4         | `/` command palette, `ans` / `out_k` references, promote by drag                      | planned |
| 5         | Symbol interpretation prompts + row badges (registry + resolution already done)       | planned |
| 6         | Matrix commands (det, inverse, transpose, eigenvalues, dot, cross)                    | planned |
| 7         | `out_k` built-in sequence; more built-in sequences                                    | planned |
| 8         | URL share, error highlight inside the math field, perf                                | planned |

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
  main.tsx, App.tsx (header: CAS status, New, Documentation, CAS picker, Debug), styles.css
  ui/
    editor/        MathEditor.ts (editor-agnostic contract), MathLiveEditor.tsx, MathLiveView.tsx
                   (read-only rendering for outputs), index.ts (picks the implementation)
    rows/          RowList.tsx (sortable list, focus/keyboard nav, upright-name decoration),
                   RowItem.tsx (input + outputs + chips, drags as a unit), OutputRow.tsx,
                   NoteEditor.tsx, SuggestionChips.tsx, RowDiagnostics.tsx, promote.ts
  app/services.ts  singletons: backends → CasRouter → Engine, fed by docStore; React hooks
  document/        model.ts (Doc types + pure update functions), store.ts (tiny external store),
                   docStore.ts (app singleton + actions), persistence.ts (localStorage autosave),
                   documentation.ts (the documentation slate: first visit + Documentation button)
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
  (`2x`, `x\sin x`, `x^{2}y`); otherwise `\cdot`. Multi-letter names print as `\mathrm{speed}`.

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
`core/decorate.ts`, call-only ones excluded) and defined names from `nameShortcuts`.

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
brackets (`bracketOnly`: lcmab stays letters). Symbol shortcuts (≤, ″) are not affected.

**The `\` menu** replaces MathLive's LaTeX mode, whose suggestions list every command MathLive
knows (`popoverPolicy = 'off'`). `core/completions.ts` builds the list from what the parser
understands — structures/operators (a static list there), Greek letters (`GREEK`) and every
built-in function from the registry (with brackets when it needs them) — and its test checks
each entry parses. `ui/editor/CommandMenu.tsx` renders it; keys are handled in
`MathLiveEditor.tsx` while the field keeps focus; matching is in `matchCompletions.ts`.

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
- **Constants and built-in sequences are interpretations, not reserved symbols.** `e`, `i`, `π`,
  `p_n`, `F_n` only apply when the user has not defined that symbol; the document stores choices
  per symbol (`Doc.interpretations`). A bare `p` is a variable; only `p_5` uses primes.
- **Results round-trip.** CAS results come back as our AST → `printLatex`, so "copy to input"
  always yields LaTeX our parser accepts.
- **Output rows are derived.** The document stores only `OutputSpec`s (command, stable label).

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
  `subscriptArg` (for `\log_b`). It becomes callable as `name(…)`, `\operatorname{name}(…)`, and as
  `\name` if listed in `FUNCTION_COMMANDS` (`lexer.ts`). Map it in each backend: `FUNCTIONS` in
  `cas/sympy/serialize.ts` (+ `_FUNCTION_NAMES` in `runtime.py` if SymPy names it differently)
  and `FUNCTIONS` in `cas/nerdamer/serialize.ts` / `parseText.ts`. Add it to the documentation
  (a note describing it, under the right `##` group, plus example rows; the documentation test
  fails otherwise).
- **Add a built-in sequence**: a file in `src/registries/builtins/sequences/defs/`, a file in
  `src/registries/interpretations/defs/` with `form: 'subscripted'` and an option whose meaning is
  `{ kind: 'sequence', sequence: '<name>' }` (see `primes.ts`), and its implementation in
  `SEQUENCES` in `cas/sympy/serialize.ts`. Document it.
- **Add a symbol interpretation**: a file in `src/registries/interpretations/defs/` exporting an
  `Interpretation`: `symbol` key (`'e'`, `'\\pi'`), `form` (`'bare'` or `'subscripted'`),
  `question`, `options` (each with a `Meaning`), `defaultOption`, `promptOnFirstUse`. New constant
  ids also need `ConstantId` in `parser/ast.ts`, `printLatex.ts`, and each backend.
- **Add a command**: one file in `src/registries/commands/defs/` default-exporting a `Command`:
  `id` (stored in documents — never rename), `title(ctx)`, `slash`, `aliases`, `description`,
  `appliesTo(ctx)` → relevance in [0, 1] from `ctx.facts` (`ShapeFacts`), and `run(ctx, cas)` —
  usually `runOperation(ctx, cas, { op: … })`. Pick the variable with
  `preferredVariable(ctx.facts)`. Attach it to a row in the documentation; add an end-to-end case.
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
