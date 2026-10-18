import type { Definition, Statement } from '../parser/ast';
import { displayName } from '../parser/resolve';
import type { RowAnalysis } from './analyze';

/**
 * Dependency graph between rows: row A depends on row B when A reads a symbol that B defines.
 * Gives each row the definitions it needs (in dependency order) and reports cycles.
 */
export interface DependencyInfo {
  /** Row index → error message for rows that are part of a cycle. */
  cycles: Map<number, string>;
  /** Row index → indices of rows it depends on directly. */
  edges: number[][];
  /** Definitions a row needs, transitively, definitions before their uses. */
  environment(row: number): Definition[];
  /** Indices of rows whose (transitive) dependencies include a row with an error. */
  blockedBy(row: number): number | null;
}

function isDefinition(s: Statement | null): s is Definition {
  return (
    s !== null &&
    (s.kind === 'defConst' ||
      s.kind === 'defFunc' ||
      s.kind === 'defSeq' ||
      s.kind === 'defSeqBase')
  );
}

export function buildDependencies(rows: readonly RowAnalysis[]): DependencyInfo {
  // Which rows define each symbol (a sequence's rule and its base cases share a key).
  const definers = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.defines === null) return;
    definers.set(r.defines, [...(definers.get(r.defines) ?? []), i]);
  });

  const edges = rows.map((r, i) => {
    const deps = new Set<number>();
    for (const key of r.refs) {
      for (const j of definers.get(key) ?? []) {
        // A sequence rule may refer to its own earlier terms (and so to its base cases).
        const selfSequence = r.statement?.kind === 'defSeq' && key === r.defines;
        if (j === i && selfSequence) continue;
        deps.add(j);
      }
    }
    return [...deps];
  });

  const cycles = findCycles(rows, edges);

  const environment = (row: number): Definition[] => {
    const out: Definition[] = [];
    const seen = new Set<number>();
    const visit = (i: number) => {
      if (seen.has(i)) return;
      seen.add(i);
      for (const j of edges[i] ?? []) visit(j);
      const s = rows[i]?.statement ?? null;
      if (i !== row && isDefinition(s)) out.push(s);
    };
    visit(row);
    // A sequence rule row also needs its own base cases (and they need the rule).
    const self = rows[row];
    if (self?.defines && isDefinition(self.statement ?? null)) {
      for (const j of definers.get(self.defines) ?? []) {
        const s = rows[j]?.statement ?? null;
        if (j !== row && !seen.has(j) && isDefinition(s)) {
          seen.add(j);
          for (const k of edges[j] ?? []) visit(k);
          out.push(s);
        }
      }
    }
    return out;
  };

  const blockedBy = (row: number): number | null => {
    const seen = new Set<number>();
    const stack = [...(edges[row] ?? [])];
    while (stack.length > 0) {
      const j = stack.pop();
      if (j === undefined || seen.has(j)) continue;
      seen.add(j);
      if (rows[j]?.error || cycles.has(j)) return j;
      stack.push(...(edges[j] ?? []));
    }
    return null;
  };

  return { cycles, edges, environment, blockedBy };
}

/** Tarjan's strongly connected components; every row in a component of size > 1 (or a
 * self-loop) gets a message naming the cycle. */
function findCycles(rows: readonly RowAnalysis[], edges: number[][]): Map<number, string> {
  let index = 0;
  const indices = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const result = new Map<number, string>();

  const strongConnect = (v: number) => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges[v] ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const component: number[] = [];
      let w: number | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      const selfLoop = component.length === 1 && (edges[v] ?? []).includes(v);
      if (component.length > 1 || selfLoop) {
        const names = component
          .sort((a, b) => a - b)
          .map((i) => rows[i]?.defines)
          .filter((n): n is string => !!n)
          .map(displayName);
        const message =
          names.length === 1
            ? `"${names[0] ?? ''}" is defined in terms of itself`
            : `Circular definition: ${[...names, names[0]].join(' → ')}`;
        for (const i of component) result.set(i, message);
      }
    }
  };

  for (let v = 0; v < rows.length; v++) if (!indices.has(v)) strongConnect(v);
  return result;
}
