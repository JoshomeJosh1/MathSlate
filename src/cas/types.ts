import type { Definition, Expr, Name } from '../parser/ast';

/**
 * Backend-neutral CAS contract. Commands and the engine speak only this; each backend (SymPy in
 * Pyodide, Nerdamer, …) translates requests to its own language and results back to our AST.
 */

/** Operations a backend may support. Variables are chosen by the caller, never guessed by backends. */
export type CasOperation =
  | { op: 'evaluate' }
  | { op: 'simplify' }
  | { op: 'factor' }
  | { op: 'expand' }
  | { op: 'numeric'; digits?: number }
  | { op: 'solve'; variable: Name }
  | { op: 'derivative'; variable: Name; order: number }
  | { op: 'integrate'; variable: Name; lower?: Expr; upper?: Expr }
  | { op: 'limit'; variable: Name; point: Expr; direction?: '+' | '-' }
  | { op: 'series'; variable: Name; point: Expr; order: number };

export type CasOpName = CasOperation['op'];

export interface CasRequest {
  operation: CasOperation;
  target: Expr;
  /** User definitions the target depends on, in dependency order (definitions before uses). */
  env: readonly Definition[];
  /** Names that are bound locally in `target` (a function body's parameters): never substituted. */
  locals?: readonly string[];
}

/** A value rendered for display, with our AST when the backend result could be converted. */
export interface CasExpr {
  /** Null if the result contains something our AST cannot represent; `latex` is then the backend's. */
  expr: Expr | null;
  latex: string;
}

export type CasValue =
  | (CasExpr & {
      kind: 'expr';
      /** Decimal approximation for exact numeric results. */ numeric: CasExpr | null;
    })
  | { kind: 'solutions'; variable: Name; solutions: CasExpr[] }
  | { kind: 'boolean'; value: boolean };

export type CasResult =
  | {
      ok: true;
      value: CasValue;
      backend: string;
      /** From a fallback backend while the preferred one is still loading. */
      provisional?: boolean;
      /** The preferred backend could not do this; another backend answered. */
      fallback?: boolean;
    }
  | { ok: false; error: string; backend: string; provisional?: boolean };

export interface BackendStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  /** Progress or error detail for the UI. */
  message?: string;
}

export interface CasBackend {
  readonly id: string;
  readonly name: string;
  status(): BackendStatus;
  onStatusChange(listener: () => void): () => void;
  /** Starts loading; resolves when ready. Safe to call repeatedly. */
  init(): Promise<void>;
  supports(op: CasOpName): boolean;
  run(request: CasRequest): Promise<CasResult>;
}
