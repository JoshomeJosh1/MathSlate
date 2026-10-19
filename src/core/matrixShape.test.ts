import { describe, expect, it } from 'vitest';
import type { Definition } from '../parser/ast';
import { suggestCommands } from '../registries/commands';
import { analyzeRows } from './analyze';
import { shapeOf, targetOf } from './shape';

/** Facts and suggested commands for the last row, with the earlier rows as definitions. */
function last(...rows: string[]) {
  const analyses = analyzeRows(rows.map((latex, i) => ({ id: `r${i}`, latex })));
  const env: Definition[] = analyses
    .slice(0, -1)
    .flatMap((a) => (a.statement?.kind === 'defConst' ? [a.statement] : []));
  const statement = analyses.at(-1)?.statement;
  const target = statement && targetOf(statement);
  if (!statement || !target) throw new Error(rows.join(' | '));
  const facts = shapeOf(target.expr, env);
  const commands = suggestCommands({ statement, target, env, facts }).map((c) => c.id);
  return { size: facts.matrixSize, isMatrix: facts.isMatrix, commands };
}

const M = 'M=\\left\\lbrack1,2;3,4\\right\\rbrack';

describe('matrix size, without computing', () => {
  it.each([
    [[M, 'M'], { rows: 2, cols: 2 }],
    [['\\left\\lbrack1,2,3;4,5,6\\right\\rbrack'], { rows: 2, cols: 3 }],
    [['\\left\\lbrack1,2,3;4,5,6\\right\\rbrack^{T}'], { rows: 3, cols: 2 }],
    [[M, '2M+M^2'], { rows: 2, cols: 2 }],
    [[M, 'M\\left\\lbrack1,1\\right\\rbrack'], { rows: 2, cols: 1 }],
  ])('%j', (rows, size) => {
    expect(last(...rows).size).toEqual(size);
  });

  it('knows what is not a matrix', () => {
    expect(last('x^2+1').isMatrix).toBe(false);
    expect(last(M, '\\det M').isMatrix).toBe(false);
    // A row times a column is a number.
    expect(
      last('\\left\\lbrack1,2\\right\\rbrack^{T}\\left\\lbrack3,4\\right\\rbrack').isMatrix,
    ).toBe(false);
  });
});

describe('matrix commands are suggested by shape', () => {
  it('square: det, inverse, eigenvalues first', () => {
    expect(last(M, 'M').commands.slice(0, 3)).toEqual(['det', 'inverse', 'eigenvalues']);
  });

  it('not square: rref and rank, no det', () => {
    const { commands } = last('\\left\\lbrack1,2,3;4,5,6\\right\\rbrack');
    expect(commands[0]).toBe('rref');
    expect(commands).not.toContain('det');
  });

  it('a vector: of the matrix commands, transpose only', () => {
    const { commands } = last('\\left\\lbrack1,2,3\\right\\rbrack');
    expect(commands).toContain('transpose');
    for (const c of ['det', 'inverse', 'rref', 'rank', 'eigenvalues']) {
      expect(commands).not.toContain(c);
    }
  });

  it('not a matrix: no matrix commands', () => {
    expect(last('x^2-1').commands).not.toContain('det');
  });
});
