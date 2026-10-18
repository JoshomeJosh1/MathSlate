# MathSlate

A web notebook for math: **input rows** (MathLive math fields) interleaved with visually distinct
**output rows** (MATLAB-style), backed by a hand-written LaTeX → AST parser and a swappable
computer algebra system (SymPy in Pyodide, in a Web Worker). Deployed as a static site to
GitHub Pages at `https://joshomejosh1.github.io/MathSlate/`.

Extensibility via registries ("add one file") is the top design goal.

## Status

| Milestone | Scope                                                                                         | State   |
| --------- | --------------------------------------------------------------------------------------------- | ------- |
| 1         | Scaffold, MathLive rows (add/delete/reorder), LaTeX debug, localStorage, Pages deploy         | done    |
| 2         | Parser (lexer, Pratt CST, definitions, symbol table, resolver, printer) + tests               | planned |
| 3         | Pyodide worker, CasBackend, engine, dependency graph, auto-eval, simplify/factor/expand/solve | planned |
| 4         | Output rows UX (promote, `ans`, `out_k`), suggestion chips, `/` palette                       | planned |
| 5         | Symbol interpretations (i, e, π) with first-use prompts                                       | planned |
| 6         | Matrix commands (det, inverse, transpose, eigenvalues, dot, cross)                            | planned |
| 7         | Built-in sequences (p_n, F_n, out_k), recursive sequences                                     | planned |
| 8         | URL share, error highlight mapping, perf                                                      | planned |

## Commands

```sh
npm run dev          # dev server (http://localhost:5173/MathSlate/)
npm run check        # typecheck + lint + format check + tests — run before calling anything done
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
    rows/          RowList.tsx (dnd-kit sortable list, focus/keyboard nav), InputRow.tsx
  document/        model.ts (Doc types + pure update functions), store.ts (tiny external store),
                   docStore.ts (app singleton + actions), persistence.ts (localStorage autosave)
  -- planned --
  parser/          lexer, Pratt parser (LaTeX → CST), resolver (CST + symbol table → AST), printLatex
  core/            symbol table, definition extraction, shape analysis, dependency graph, engine
  registries/      commands/, interpretations/, builtins/{functions,sequences}/ — one file per entry
  cas/             CasBackend interface; sympy/ (worker, AST → Python serializer, SymPy JSON → AST)
```

### Data flow (target)

`edit row → docStore → engine (debounced)`: parse rows → extract definitions from top-level `=`
LHS → build SymbolTable → resolve CST → AST → dependency graph (cycles reported on each row in the
cycle) → evaluate dirty rows in topo order via `CasBackend` → per-row results (outputs, errors with
spans, interpretations used, suggested commands) → UI.

### Key design decisions

- **Two-phase parsing.** How to read `xy`, `a_n` or `f(x)` depends on other rows, so the Pratt
  parser produces a CST with raw letter runs and ambiguous juxtapositions. A resolver then turns it
  into the AST using the symbol table: longest-match defined names first, else single letters with
  implicit multiplication. Subscripts are part of a name unless the base is a known sequence.
- **The AST is CAS-agnostic.** All SymPy knowledge lives in `src/cas/sympy/`.
- **Results round-trip.** CAS results come back as an expression tree → our AST → `printLatex`,
  so "promote output to input" always yields LaTeX our parser accepts.
- **Output rows are derived.** The document stores only `OutputSpec`s (which command, stable label);
  values are recomputed whenever inputs or dependencies change.

## Conventions

- TypeScript strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`.
- `mathlive` may only be imported inside `src/ui/editor/` (ESLint enforces this). The rest of the
  app uses the `MathEditor` contract from `src/ui/editor`.
- Keep document/model/engine/parser code free of React so it can be unit-tested in Node.
- Tests are colocated as `*.test.ts`. Parser tests are table-driven.
- Prettier formats everything (single quotes, width 100). Commit after each working step.

## Deployment

`.github/workflows/deploy.yml` runs typecheck, lint, format check, tests and build on every push
and PR, and deploys `dist/` to Pages on pushes to `main`. One-time setup: in the GitHub repo,
Settings → Pages → Source: **GitHub Actions**. Vite's `base` is `/MathSlate/`; change it in
`vite.config.ts` if the repo is renamed.

## How to extend

Recipes below will be filled in as the registries land (milestones 3–7):

- **Add a command**: one file in `src/registries/commands/` exporting a `Command` (id, title,
  slash name, `appliesTo` relevance score, `run`), register it in `registry.ts`, and add a test.
- **Add a symbol interpretation**: one file in `src/registries/interpretations/`.
- **Add a built-in sequence/function**: one file in `src/registries/builtins/`.
- **Add a CAS operation**: extend the `CasOp` union and map it in each backend.
- **Add a CAS backend**: implement `CasBackend` in `src/cas/<name>/`.
